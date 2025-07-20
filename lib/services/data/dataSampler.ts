import * as duckdb from '@duckdb/duckdb-wasm';
import { TimeSeriesData } from '@/lib/db/schema';
import { duckDBQueryCache } from '../duckdbQueryCache';
import { parseDuckDBTimestamp } from '@/lib/utils/duckdbTimestamp';
import { createLogger } from '../logger';

export interface SamplingOptions {
  startTime?: Date;
  endTime?: Date;
  method?: 'nth' | 'nth-fast' | 'random' | 'lttb';
  useCache?: boolean;
}

export interface SampleDataParams {
  metadataIds: number[];
  parameterIds: string[];
  targetPoints: number;
  options?: SamplingOptions;
}

/**
 * Service for sampling time series data using DuckDB
 */
export class DataSampler {
  private logger = createLogger('DataSampler');

  constructor(private connection: duckdb.AsyncDuckDBConnection) {}

  /**
   * Perform fast SQL-based sampling on loaded data
   */
  async sampleData(params: SampleDataParams): Promise<TimeSeriesData[]> {
    const { metadataIds, parameterIds, targetPoints, options } = params;
    const startTime = performance.now();
    const method = options?.method || 'nth';
    const useCache = options?.useCache !== false; // Cache enabled by default

    // Generate cache key
    const cacheKey = JSON.stringify({
      metadataIds,
      parameterIds,
      targetPoints,
      options
    });

    // Check cache first
    if (useCache) {
      const cachedResult = duckDBQueryCache.get<TimeSeriesData[]>(cacheKey);
      if (cachedResult) {
        const duration = performance.now() - startTime;
        this.logger.info(`Cache hit! Returned ${cachedResult.length} points in ${duration.toFixed(2)}ms`);
        return cachedResult;
      }
    }

    try {
      // First check which columns actually exist in each table
      const tableColumnMap = await this.getTableColumnMap(metadataIds);
      
      // Build UNION query for multiple metadata IDs
      const queries = this.buildSamplingQueries({
        metadataIds,
        parameterIds,
        targetPoints,
        tableColumnMap,
        options
      });
      
      if (queries.length === 0) {
        this.logger.warn('No tables contain any of the requested parameter IDs');
        return [];
      }

      const unionQuery = queries.join(' UNION ALL ');
      const finalQuery = `
        SELECT * FROM (${unionQuery})
        ORDER BY metadata_id, timestamp
      `;

      this.logger.debug(`Executing sampling query for ${metadataIds.length} tables`);
      this.logger.debug(`Requested parameter IDs:`, parameterIds);
      this.logger.debug(`Target points per dataset:`, targetPoints);
      this.logger.debug(`Sampling method:`, method);
      
      const result = await this.connection.query(finalQuery);
      
      // Convert DuckDB result to TimeSeriesData format
      const data = this.convertResultToTimeSeriesData(result, parameterIds);

      const duration = performance.now() - startTime;
      this.logger.info(`Sampled ${data.length} points in ${duration.toFixed(2)}ms`);
      
      // Log sampling results
      this.logSamplingResults(data, targetPoints, parameterIds);

      // Cache the result
      if (useCache && data.length > 0) {
        duckDBQueryCache.set(cacheKey, data);
      }

      return data;

    } catch (error) {
      this.logger.error('Sampling query failed:', error);
      throw error;
    }
  }

  /**
   * Get column information for each table
   */
  private async getTableColumnMap(metadataIds: number[]): Promise<Map<number, Set<string>>> {
    const tableColumnMap = new Map<number, Set<string>>();
    
    for (const metadataId of metadataIds) {
      const tableName = `timeseries_${metadataId}`;
      try {
        const schemaQuery = `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name NOT IN ('metadata_id', 'timestamp')`;
        const schemaResult = await this.connection.query(schemaQuery);
        const columns = new Set(schemaResult.toArray().map((row: Record<string, unknown>) => row.column_name as string));
        tableColumnMap.set(metadataId, columns);
      } catch (err) {
        this.logger.warn(`Failed to get schema for table ${tableName}:`, err);
      }
    }
    
    return tableColumnMap;
  }

  /**
   * Build sampling queries for each metadata ID
   */
  private buildSamplingQueries(params: {
    metadataIds: number[];
    parameterIds: string[];
    targetPoints: number;
    tableColumnMap: Map<number, Set<string>>;
    options?: SamplingOptions;
  }): string[] {
    const { metadataIds, parameterIds, targetPoints, tableColumnMap, options } = params;
    
    return metadataIds.map(metadataId => {
      const tableName = `timeseries_${metadataId}`;
      
      // Get available columns for this table
      const availableColumns = tableColumnMap.get(metadataId) || new Set<string>();
      
      // Filter parameterIds to only include columns that exist in the table
      const existingParameterIds = parameterIds.filter(id => availableColumns.has(id));
      const missingParameterIds = parameterIds.filter(id => !availableColumns.has(id));
      
      this.logger.debug(`Column analysis for table ${tableName}:`, {
        requested: parameterIds,
        existing: existingParameterIds,
        missing: missingParameterIds,
        availableInTable: Array.from(availableColumns).slice(0, 10),
        totalAvailable: availableColumns.size
      });
      
      if (existingParameterIds.length === 0) {
        this.logger.warn(`No requested parameter IDs exist in table ${tableName}`);
      }
      
      // Build WHERE clause
      const whereClause = this.buildWhereClause(options);
      
      // Build sampling query based on method
      return this.buildSamplingQuery({
        tableName,
        existingParameterIds,
        parameterIds,
        targetPoints,
        whereClause,
        method: options?.method || 'nth'
      });
    }).filter(q => q !== null);
  }

  /**
   * Build WHERE clause from time range options
   */
  private buildWhereClause(options?: SamplingOptions): string {
    if (!options?.startTime && !options?.endTime) {
      return '';
    }

    const conditions: string[] = [];
    if (options.startTime) {
      conditions.push(`timestamp >= TIMESTAMP '${options.startTime.toISOString()}'`);
    }
    if (options.endTime) {
      conditions.push(`timestamp <= TIMESTAMP '${options.endTime.toISOString()}'`);
    }
    
    return `WHERE ${conditions.join(' AND ')}`;
  }

  /**
   * Build sampling query based on method
   */
  private buildSamplingQuery(params: {
    tableName: string;
    existingParameterIds: string[];
    parameterIds: string[];
    targetPoints: number;
    whereClause: string;
    method: string;
  }): string {
    const { tableName, existingParameterIds, parameterIds, targetPoints, whereClause, method } = params;
    
    // Build column selections
    const existingColumns = existingParameterIds.length > 0 
      ? ', ' + existingParameterIds.map(id => `"${id}"`).join(', ') 
      : '';
    
    const missingColumns = parameterIds
      .filter(id => !existingParameterIds.includes(id))
      .map(id => `, NULL AS "${id}"`)
      .join('');

    switch (method) {
      case 'random':
        return `
          (SELECT metadata_id, timestamp${existingColumns}${missingColumns}
           FROM ${tableName}
           ${whereClause}
           USING SAMPLE ${targetPoints} ROWS)
        `;
      
      case 'nth-fast':
        // Fast nth-point sampling (less accurate)
        return `
          (WITH numbered AS (
            SELECT metadata_id, timestamp${existingColumns},
                   ROW_NUMBER() OVER (ORDER BY timestamp) as rn,
                   COUNT(*) OVER () as total_count
            FROM ${tableName}
            ${whereClause}
          )
          SELECT metadata_id, timestamp${existingColumns}${missingColumns}
          FROM numbered
          WHERE MOD(rn, GREATEST(1, CAST(total_count / ${targetPoints} AS INTEGER))) = 0
          LIMIT ${targetPoints})
        `;
      
      case 'nth':
        // Accurate nth-point sampling using systematic selection
        return `
          (WITH numbered AS (
            SELECT metadata_id, timestamp${existingColumns},
                   ROW_NUMBER() OVER (ORDER BY timestamp) as rn,
                   COUNT(*) OVER () as total_count
            FROM ${tableName}
            ${whereClause}
          )
          SELECT metadata_id, timestamp${existingColumns}${missingColumns}
          FROM numbered
          WHERE 
            -- Select exactly targetPoints rows with even distribution
            rn IN (
              SELECT CAST(1 + (i - 1) * (total_count - 1.0) / (${targetPoints} - 1) AS INTEGER) as selected_rn
              FROM generate_series(1, ${targetPoints}) AS s(i)
            )
          ORDER BY timestamp)
        `;
      
      default:
        // For LTTB or unknown methods, fall back to simple limit
        return `
          (SELECT metadata_id, timestamp${existingColumns}${missingColumns}
           FROM ${tableName}
           ${whereClause}
           ORDER BY timestamp
           LIMIT ${targetPoints})
        `;
    }
  }

  /**
   * Convert DuckDB result to TimeSeriesData format
   */
  private convertResultToTimeSeriesData(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result: any,
    parameterIds: string[]
  ): TimeSeriesData[] {
    const data: TimeSeriesData[] = [];
    const resultArray = result.toArray();
    
    this.logger.debug(`Query returned ${resultArray.length} rows`);

    resultArray.forEach((row: Record<string, unknown>, index: number) => {
      // Debug: Log the first row
      if (index === 0) {
        this.logger.debug(`First row keys:`, Object.keys(row));
        this.logger.debug(`Expected parameter IDs:`, parameterIds);
      }

      const dataPoint: TimeSeriesData = {
        metadataId: row.metadata_id as number,
        timestamp: parseDuckDBTimestamp(row.timestamp as string),
        data: {}
      };

      parameterIds.forEach(id => {
        const value = row[id];
        
        // Convert to number if it's not null/undefined
        if (value !== null && value !== undefined) {
          const numValue = typeof value === 'number' ? value : Number(value);
          if (!isNaN(numValue)) {
            dataPoint.data[id] = numValue;
          }
        }
      });

      data.push(dataPoint);
    });

    return data;
  }

  /**
   * Log detailed sampling results
   */
  private logSamplingResults(
    data: TimeSeriesData[],
    targetPoints: number,
    parameterIds: string[]
  ): void {
    // Points per metadata
    const pointsPerMetadata: { [key: number]: number } = {};
    data.forEach(point => {
      pointsPerMetadata[point.metadataId] = (pointsPerMetadata[point.metadataId] || 0) + 1;
    });
    
    this.logger.info(`Target: ${targetPoints} points per dataset`);
    this.logger.info(`Actual points per metadata:`, pointsPerMetadata);
    
    // Parameter coverage analysis
    if (data.length > 0) {
      const parameterCoverage: { [key: string]: number } = {};
      parameterIds.forEach(id => {
        parameterCoverage[id] = 0;
      });
      
      data.forEach(point => {
        parameterIds.forEach(id => {
          if (point.data[id] !== null && point.data[id] !== undefined) {
            parameterCoverage[id]++;
          }
        });
      });
      
      this.logger.info('Parameter coverage in sampled data:', parameterCoverage);
    }
  }
}