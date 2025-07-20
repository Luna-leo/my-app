import * as duckdb from '@duckdb/duckdb-wasm';
import { TimeSeriesData } from '@/lib/db/schema';
import { duckDBSchemaTracker } from './duckdbSchemaTracker';
import { duckDBParquetService, ParquetReadOptions } from './duckdbParquetService';
import { duckDBQueryCache } from './duckdbQueryCache';
import { parseDuckDBTimestamp } from '@/lib/utils/duckdbTimestamp';
import { createLogger } from './logger';

interface DuckDBInstance {
  connection: duckdb.AsyncDuckDBConnection;
  db: duckdb.AsyncDuckDB;
  worker: Worker;
}

interface DataLoadStats {
  totalRows: number;
  loadedRows: number;
  duration: number;
  tablesCreated: string[];
}

/**
 * Hybrid data service that combines IndexedDB persistence with DuckDB analytics
 * - IndexedDB: Primary storage, persistence, offline support
 * - DuckDB: Fast analytical queries, complex aggregations, SQL-based sampling
 */
export class HybridDataService {
  private static instance: HybridDataService;
  private duckDBInstance: DuckDBInstance | null = null;
  private loadedMetadataIds = new Set<number>();
  private initializationPromise: Promise<void> | null = null;
  private logger = createLogger('HybridDataService');

  private constructor() {}

  static getInstance(): HybridDataService {
    if (!HybridDataService.instance) {
      HybridDataService.instance = new HybridDataService();
    }
    return HybridDataService.instance;
  }

  /**
   * Initialize DuckDB with WebAssembly
   */
  async initialize(): Promise<void> {
    if (this.initializationPromise) {
      return this.initializationPromise;
    }

    this.initializationPromise = this._initialize();
    return this.initializationPromise;
  }

  /**
   * Get DuckDB connection for direct queries
   */
  async getConnection(): Promise<duckdb.AsyncDuckDBConnection | null> {
    if (!this.duckDBInstance) {
      await this.initialize();
    }
    return this.duckDBInstance?.connection || null;
  }

  private async _initialize(): Promise<void> {
    if (this.duckDBInstance) {
      this.logger.debug('Already initialized');
      return;
    }

    this.logger.info('Initializing DuckDB-Wasm...');
    const endTimer = this.logger.startTimer('DuckDB initialization');

    try {
      // Bundle configuration for DuckDB WASM files
      const DUCKDB_CONFIG = await duckdb.selectBundle({
        mvp: {
          mainModule: '/duckdb-mvp.wasm',
          mainWorker: '/duckdb-browser-mvp.worker.js'
        },
        eh: {
          mainModule: '/duckdb-eh.wasm',
          mainWorker: '/duckdb-browser-eh.worker.js'
        }
      });

      // Create a new DuckDB worker
      const logger = new duckdb.ConsoleLogger();
      const worker = new Worker(DUCKDB_CONFIG.mainWorker!);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      
      await db.instantiate(DUCKDB_CONFIG.mainModule, DUCKDB_CONFIG.pthreadWorker);
      
      // Open database and create connection
      await db.open({
        path: ':memory:', // In-memory database for performance
        query: {
          castBigIntToDouble: true // For JavaScript number compatibility
        }
      });

      const connection = await db.connect();

      this.duckDBInstance = { db, connection, worker };
      
      // Initialize parquet service with connection
      duckDBParquetService.setConnection(connection);

      endTimer();
      this.logger.info('DuckDB initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize DuckDB', error);
      throw error;
    }
  }

  /**
   * Load time series data from IndexedDB into DuckDB for a specific metadata ID
   */
  async loadTimeSeriesData(
    metadataId: number,
    data: TimeSeriesData[],
    parameterIds: string[],
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!this.duckDBInstance) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

    const tableName = `timeseries_${metadataId}`;
    
    // Extract all available parameter IDs from the data
    const allParameterIds = new Set<string>();
    data.forEach(row => {
      Object.keys(row.data).forEach(id => allParameterIds.add(id));
    });
    const availableParameterIds = Array.from(allParameterIds);
    
    this.logger.debug('Available parameter IDs in data', {
      sample: availableParameterIds.slice(0, 10),
      total: availableParameterIds.length
    });
    this.logger.debug('Requested parameter IDs', parameterIds);
    
    // IMPORTANT: Always ensure the table has ALL requested parameters, not just available ones
    // This ensures consistent column structure regardless of what data is currently available
    const requiredParameterIds = [...new Set([...availableParameterIds, ...parameterIds])];
    this.logger.debug(`Combined required parameter IDs: ${requiredParameterIds.length}`);
    
    // Check if table exists in DuckDB
    let tableExistsInDB = false;
    try {
      const checkTableSQL = `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '${tableName}'`;
      const result = await this.duckDBInstance.connection.query(checkTableSQL);
      tableExistsInDB = result.toArray()[0]['count_star()'] > 0;
    } catch {
      this.logger.debug('Table existence check failed, assuming not exists');
    }

    // Sync schema tracker with actual DB state
    if (tableExistsInDB && !duckDBSchemaTracker.hasTable(metadataId)) {
      // Table exists in DB but not in tracker - sync it
      const schemaQuery = `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name NOT IN ('metadata_id', 'timestamp')`;
      const schemaResult = await this.duckDBInstance.connection.query(schemaQuery);
      const columns = schemaResult.toArray().map((row: Record<string, unknown>) => row.column_name as string);
      duckDBSchemaTracker.registerTable(metadataId, columns, 0);
      console.log(`[HybridDataService] Synced schema tracker for existing table ${tableName}`);
    } else if (!tableExistsInDB && duckDBSchemaTracker.hasTable(metadataId)) {
      // Table doesn't exist in DB but exists in tracker - remove from tracker
      duckDBSchemaTracker.removeTable(metadataId);
      console.log(`[HybridDataService] Removed non-existent table from tracker: ${tableName}`);
    }

    // Check if table exists and has all required columns
    const tableExists = tableExistsInDB;
    const missingColumns = tableExists 
      ? duckDBSchemaTracker.getMissingColumns(metadataId, requiredParameterIds)
      : requiredParameterIds;
    
    if (tableExists && missingColumns.length === 0) {
      console.log(`[HybridDataService] Table ${tableName} already has all required columns, skipping load`);
      console.log(`[HybridDataService] Required parameters: ${parameterIds.join(', ')}`);
      console.log(`[HybridDataService] Available parameters: ${availableParameterIds.join(', ')}`);
      return;
    }

    const startTime = performance.now();

    try {
      if (tableExists && missingColumns.length > 0) {
        // Table exists but needs new columns
        console.log(`[HybridDataService] Adding ${missingColumns.length} new columns to ${tableName}`);
        
        for (const columnId of missingColumns) {
          const alterSQL = `ALTER TABLE ${tableName} ADD COLUMN "${columnId}" DOUBLE`;
          try {
            await this.duckDBInstance.connection.query(alterSQL);
          } catch (err) {
            console.warn(`[HybridDataService] Failed to add column ${columnId}:`, err);
          }
        }
        
        // Update schema tracker
        duckDBSchemaTracker.addColumns(metadataId, missingColumns);
        
        // Insert only new data (simplified approach: clear and reload for now)
        // TODO: Implement incremental data loading in the future
        await this.duckDBInstance.connection.query(`DELETE FROM ${tableName}`);
      } else if (!tableExists) {
        // Create new table (with IF NOT EXISTS for safety)
        const columnDefs = requiredParameterIds.map(id => `"${id}" DOUBLE`).join(', ');
        const createTableSQL = `
          CREATE TABLE IF NOT EXISTS ${tableName} (
            metadata_id INTEGER,
            timestamp TIMESTAMP,
            ${columnDefs}
          )
        `;
        
        await this.duckDBInstance.connection.query(createTableSQL);
        console.log(`[HybridDataService] Created table ${tableName} with ${requiredParameterIds.length} columns`);
        
        // Register table in schema tracker
        duckDBSchemaTracker.registerTable(metadataId, requiredParameterIds, data.length);
      }

      // Prepare data for bulk insert
      const batchSize = 10000;
      let processedRows = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        // Build INSERT statement with proper NULL handling
        const values = batch.map(row => {
          const params = requiredParameterIds.map(id => 
            row.data[id] !== null && row.data[id] !== undefined 
              ? row.data[id] 
              : 'NULL'
          ).join(', ');
          return `(${metadataId}, TIMESTAMP '${row.timestamp.toISOString()}', ${params})`;
        }).join(', ');

        const columnNames = ['metadata_id', 'timestamp', ...requiredParameterIds.map(id => `"${id}"`)].join(', ');
        const insertSQL = `INSERT INTO ${tableName} (${columnNames}) VALUES ${values}`;

        await this.duckDBInstance.connection.query(insertSQL);
        
        processedRows += batch.length;
        if (onProgress) {
          onProgress((processedRows / data.length) * 100);
        }
      }

      this.loadedMetadataIds.add(metadataId);
      
      // Update row count in schema tracker
      duckDBSchemaTracker.updateRowCount(metadataId, data.length);
      
      // Invalidate cache entries for this metadata
      duckDBQueryCache.invalidate(`"metadataIds":\\[.*${metadataId}.*\\]`);
      
      const duration = performance.now() - startTime;
      console.log(`[HybridDataService] Loaded ${data.length} rows into ${tableName} in ${duration.toFixed(2)}ms`);

    } catch (error) {
      console.error(`[HybridDataService] Failed to load data for metadataId ${metadataId}:`, error);
      throw error;
    }
  }

  /**
   * Perform fast SQL-based sampling on loaded data
   */
  async sampleData(
    metadataIds: number[],
    parameterIds: string[],
    targetPoints: number,
    options?: {
      startTime?: Date;
      endTime?: Date;
      method?: 'nth' | 'nth-fast' | 'random' | 'lttb';
      useCache?: boolean;
    }
  ): Promise<TimeSeriesData[]> {
    if (!this.duckDBInstance) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

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
        console.log(`[HybridDataService] Cache hit! Returned ${cachedResult.length} points in ${duration.toFixed(2)}ms`);
        return cachedResult;
      }
    }

    try {
      // First check which columns actually exist in each table
      const tableColumnMap = new Map<number, Set<string>>();
      for (const metadataId of metadataIds) {
        const tableName = `timeseries_${metadataId}`;
        try {
          const schemaQuery = `SELECT column_name FROM information_schema.columns WHERE table_name = '${tableName}' AND column_name NOT IN ('metadata_id', 'timestamp')`;
          const schemaResult = await this.duckDBInstance.connection.query(schemaQuery);
          const columns = new Set(schemaResult.toArray().map((row: Record<string, unknown>) => row.column_name as string));
          tableColumnMap.set(metadataId, columns);
        } catch (err) {
          console.warn(`[HybridDataService] Failed to get schema for table ${tableName}:`, err);
        }
      }
      
      // Build UNION query for multiple metadata IDs
      const queries = metadataIds.map(metadataId => {
        const tableName = `timeseries_${metadataId}`;
        
        // Get available columns for this table
        const availableColumns = tableColumnMap.get(metadataId) || new Set<string>();
        
        // Filter parameterIds to only include columns that exist in the table
        const existingParameterIds = parameterIds.filter(id => availableColumns.has(id));
        const missingParameterIds = parameterIds.filter(id => !availableColumns.has(id));
        
        console.log(`[HybridDataService] Column analysis for table ${tableName}:`, {
          requested: parameterIds,
          existing: existingParameterIds,
          missing: missingParameterIds,
          availableInTable: Array.from(availableColumns).slice(0, 10),
          totalAvailable: availableColumns.size
        });
        
        if (existingParameterIds.length === 0) {
          console.warn(`[HybridDataService] No requested parameter IDs exist in table ${tableName}. Requested: [${parameterIds.join(', ')}], Available: [${Array.from(availableColumns).join(', ')}]`);
          // Still return data with NULL values for all requested parameters
          // This allows charts to display time axis even when parameters are missing
        } else if (missingParameterIds.length > 0) {
          console.warn(`[HybridDataService] Some requested parameters are missing in table ${tableName}:`, {
            requested: parameterIds,
            existing: existingParameterIds,
            missing: missingParameterIds,
            available: Array.from(availableColumns).slice(0, 10)
          });
        }
        
        // DuckDB requires double quotes for identifiers, especially numeric column names
        const rawColumns = existingParameterIds.length > 0 
          ? existingParameterIds.map(id => `"${id}"`).join(', ')
          : ''; // Empty when no columns exist, but WITH clause will still work
        
        // Add NULL values for missing columns to ensure consistent result set structure
        
        let whereClause = '';
        if (options?.startTime || options?.endTime) {
          const conditions: string[] = [];
          if (options.startTime) {
            conditions.push(`timestamp >= TIMESTAMP '${options.startTime.toISOString()}'`);
          }
          if (options.endTime) {
            conditions.push(`timestamp <= TIMESTAMP '${options.endTime.toISOString()}'`);
          }
          whereClause = `WHERE ${conditions.join(' AND ')}`;
        }

        // Different sampling strategies
        if (method === 'random') {
          return `
            (SELECT metadata_id, timestamp${existingParameterIds.length > 0 ? ', ' + existingParameterIds.map(id => `"${id}"`).join(', ') : ''}${parameterIds.filter(id => !existingParameterIds.includes(id)).map(id => `, NULL AS "${id}"`).join('')}
             FROM ${tableName}
             ${whereClause}
             USING SAMPLE ${targetPoints} ROWS)
          `;
        } else if (method === 'nth-fast') {
          // Fast nth-point sampling (original method, less accurate)
          return `
            (WITH numbered AS (
              SELECT metadata_id, timestamp${rawColumns ? ', ' + rawColumns : ''},
                     ROW_NUMBER() OVER (ORDER BY timestamp) as rn,
                     COUNT(*) OVER () as total_count
              FROM ${tableName}
              ${whereClause}
            )
            SELECT metadata_id, timestamp${existingParameterIds.length > 0 ? ', ' + existingParameterIds.map(id => `"${id}"`).join(', ') : ''}${parameterIds.filter(id => !existingParameterIds.includes(id)).map(id => `, NULL AS "${id}"`).join('')}
            FROM numbered
            WHERE MOD(rn, GREATEST(1, CAST(total_count / ${targetPoints} AS INTEGER))) = 0
            LIMIT ${targetPoints})
          `;
        } else if (method === 'nth') {
          // Accurate nth-point sampling using systematic selection
          return `
            (WITH numbered AS (
              SELECT metadata_id, timestamp${rawColumns ? ', ' + rawColumns : ''},
                     ROW_NUMBER() OVER (ORDER BY timestamp) as rn,
                     COUNT(*) OVER () as total_count
              FROM ${tableName}
              ${whereClause}
            )
            SELECT metadata_id, timestamp${existingParameterIds.length > 0 ? ', ' + existingParameterIds.map(id => `"${id}"`).join(', ') : ''}${parameterIds.filter(id => !existingParameterIds.includes(id)).map(id => `, NULL AS "${id}"`).join('')}
            FROM numbered
            WHERE 
              -- Select exactly targetPoints rows with even distribution
              rn IN (
                SELECT CAST(1 + (i - 1) * (total_count - 1.0) / (${targetPoints} - 1) AS INTEGER) as selected_rn
                FROM generate_series(1, ${targetPoints}) AS s(i)
              )
            ORDER BY timestamp)
          `;
        } else {
          // For LTTB, we'll need a more complex implementation
          // For now, fall back to nth-point sampling
          return `
            (SELECT metadata_id, timestamp${existingParameterIds.length > 0 ? ', ' + existingParameterIds.map(id => `"${id}"`).join(', ') : ''}${parameterIds.filter(id => !existingParameterIds.includes(id)).map(id => `, NULL AS "${id}"`).join('')}
             FROM ${tableName}
             ${whereClause}
             ORDER BY timestamp
             LIMIT ${targetPoints})
          `;
        }
      }).filter(q => q !== null);
      
      if (queries.length === 0) {
        console.warn('[HybridDataService] No tables contain any of the requested parameter IDs');
        return [];
      }

      const unionQuery = queries.join(' UNION ALL ');
      const finalQuery = `
        SELECT * FROM (${unionQuery})
        ORDER BY metadata_id, timestamp
      `;

      console.log(`[HybridDataService] Executing sampling query for ${metadataIds.length} tables`);
      console.log(`[HybridDataService] Requested parameter IDs:`, parameterIds);
      console.log(`[HybridDataService] Target points per dataset:`, targetPoints);
      console.log(`[HybridDataService] Sampling method:`, method);
      
      // Log detailed query info
      console.log('[HybridDataService] Query details:');
      queries.forEach((query, index) => {
        if (query && index === 0) { // Log first query only to avoid spam
          console.log(`[HybridDataService] Sample query for metadata ${metadataIds[index]}:`);
          console.log(query.substring(0, 500) + '...');
        }
      });
      
      const result = await this.duckDBInstance.connection.query(finalQuery);
      
      // Convert DuckDB result to TimeSeriesData format
      const data: TimeSeriesData[] = [];
      const resultArray = result.toArray();
      console.log(`[HybridDataService] Query returned ${resultArray.length} rows`);

      resultArray.forEach((row: Record<string, unknown>, index: number) => {
        // Debug: Log the first row to see actual column names
        if (index === 0) {
          console.log(`[HybridDataService] First row keys:`, Object.keys(row));
          console.log(`[HybridDataService] Expected parameter IDs:`, parameterIds);
          console.log(`[HybridDataService] First row data:`, row);
        }

        const dataPoint: TimeSeriesData = {
          metadataId: row.metadata_id as number,
          timestamp: parseDuckDBTimestamp(row.timestamp as string),
          data: {}
        };

        parameterIds.forEach(id => {
          // Access using the column name directly
          const value = row[id];
          
          if (index === 0) {
            console.log(`[HybridDataService] Parameter ${id}: value = ${value}, type = ${typeof value}`);
          }
          
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

      const duration = performance.now() - startTime;
      
      // Log detailed sampling results
      const pointsPerMetadata: { [key: number]: number } = {};
      data.forEach(point => {
        pointsPerMetadata[point.metadataId] = (pointsPerMetadata[point.metadataId] || 0) + 1;
      });
      
      console.log(`[HybridDataService] Sampled ${data.length} points in ${duration.toFixed(2)}ms`);
      console.log(`[HybridDataService] Target: ${targetPoints} points per dataset`);
      console.log(`[HybridDataService] Actual points per metadata:`, pointsPerMetadata);
      
      // Log parameter coverage analysis
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
        
        console.log('[HybridDataService] Parameter coverage in sampled data:', parameterCoverage);
      }

      // Cache the result
      if (useCache && data.length > 0) {
        duckDBQueryCache.set(cacheKey, data);
      }

      return data;

    } catch (error) {
      console.error('[HybridDataService] Sampling query failed:', error);
      throw error;
    }
  }

  /**
   * Execute custom SQL query for advanced analytics
   */
  async query(sql: string): Promise<Record<string, unknown>[]> {
    if (!this.duckDBInstance) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

    try {
      const result = await this.duckDBInstance.connection.query(sql);
      return result.toArray();
    } catch (error) {
      console.error('[HybridDataService] Query failed:', error);
      throw error;
    }
  }

  /**
   * Clear loaded data for specific metadata IDs
   */
  async clearData(metadataIds?: number[]): Promise<void> {
    if (!this.duckDBInstance) return;

    const idsToClean = metadataIds || Array.from(this.loadedMetadataIds);

    for (const metadataId of idsToClean) {
      const tableName = `timeseries_${metadataId}`;
      try {
        await this.duckDBInstance.connection.query(`DROP TABLE IF EXISTS ${tableName}`);
        this.loadedMetadataIds.delete(metadataId);
        console.log(`[HybridDataService] Dropped table ${tableName}`);
      } catch {
        console.error(`[HybridDataService] Failed to drop table ${tableName}`);
      }
    }
  }

  /**
   * Get statistics about loaded data
   */
  async getLoadedDataStats(): Promise<DataLoadStats> {
    if (!this.duckDBInstance) {
      return {
        totalRows: 0,
        loadedRows: 0,
        duration: 0,
        tablesCreated: []
      };
    }

    const tables = Array.from(this.loadedMetadataIds).map(id => `timeseries_${id}`);
    let totalRows = 0;

    for (const table of tables) {
      try {
        const result = await this.duckDBInstance.connection.query(
          `SELECT COUNT(*) as count FROM ${table}`
        );
        const count = result.toArray()[0]?.count || 0;
        totalRows += count;
      } catch {
        console.error(`[HybridDataService] Failed to get row count for ${table}`);
      }
    }

    return {
      totalRows,
      loadedRows: totalRows,
      duration: 0,
      tablesCreated: tables
    };
  }

  /**
   * Load time series data from Parquet file
   */
  async loadTimeSeriesFromParquet(
    parquetPath: string,
    metadataId: number,
    options?: ParquetReadOptions
  ): Promise<TimeSeriesData[]> {
    if (!this.duckDBInstance) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

    try {
      return await duckDBParquetService.readTimeSeriesFromParquet(
        parquetPath,
        metadataId,
        options
      );
    } catch (error) {
      console.error('[HybridDataService] Failed to load from parquet:', error);
      throw error;
    }
  }

  /**
   * Sample data from Parquet files
   */
  async sampleDataFromParquet(
    parquetPaths: Map<number, string>, // metadataId -> parquet file path
    parameterIds: string[],
    targetPoints: number,
    options?: {
      startTime?: Date;
      endTime?: Date;
      method?: 'nth' | 'random' | 'reservoir';
    }
  ): Promise<TimeSeriesData[]> {
    if (!this.duckDBInstance) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

    const startTime = performance.now();
    const allData: TimeSeriesData[] = [];

    try {
      // Build filters from time range
      const filters = [];
      if (options?.startTime) {
        filters.push({
          column: 'timestamp',
          operator: '>=' as const,
          value: options.startTime
        });
      }
      if (options?.endTime) {
        filters.push({
          column: 'timestamp',
          operator: '<=' as const,
          value: options.endTime
        });
      }

      // Calculate target points per metadata
      const pointsPerMetadata = Math.ceil(targetPoints / parquetPaths.size);

      // Process each parquet file
      for (const [metadataId, parquetPath] of parquetPaths) {
        try {
          const sampledData = await duckDBParquetService.readTimeSeriesFromParquet(
            parquetPath,
            metadataId,
            {
              columns: parameterIds,
              filters,
              limit: pointsPerMetadata
            }
          );
          allData.push(...sampledData);
        } catch (err) {
          console.warn(`[HybridDataService] Failed to sample from ${parquetPath}:`, err);
        }
      }

      const duration = performance.now() - startTime;
      console.log(`[HybridDataService] Sampled ${allData.length} points from ${parquetPaths.size} parquet files in ${duration.toFixed(2)}ms`);

      return allData;

    } catch (error) {
      console.error('[HybridDataService] Parquet sampling failed:', error);
      throw error;
    }
  }

  /**
   * Export query results to Parquet file
   */
  async exportToParquet(
    query: string,
    outputPath: string,
    options?: {
      compression?: 'snappy' | 'gzip' | 'zstd' | 'lz4' | 'brotli' | 'none';
      rowGroupSize?: number;
    }
  ): Promise<void> {
    if (!this.duckDBInstance) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

    try {
      await duckDBParquetService.exportToParquet(query, outputPath, options);
    } catch (error) {
      console.error('[HybridDataService] Failed to export to parquet:', error);
      throw error;
    }
  }

  /**
   * Create a hybrid query that combines in-memory tables and parquet files
   */
  async executeHybridQuery(
    memoryTableIds: number[],
    parquetPaths: Map<number, string>,
    query: string
  ): Promise<Record<string, unknown>[]> {
    if (!this.duckDBInstance) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

    try {
      // Create a unified view combining memory tables and parquet files
      const viewName = `hybrid_view_${Date.now()}`;
      const unionParts: string[] = [];

      // Add memory tables
      for (const metadataId of memoryTableIds) {
        const tableName = `timeseries_${metadataId}`;
        if (this.loadedMetadataIds.has(metadataId)) {
          unionParts.push(`SELECT * FROM ${tableName}`);
        }
      }

      // Add parquet files
      for (const [metadataId, parquetPath] of parquetPaths) {
        unionParts.push(`
          SELECT ${metadataId} as metadata_id, * 
          FROM read_parquet('${parquetPath}')
        `);
      }

      if (unionParts.length === 0) {
        return [];
      }

      // Create temporary view
      const createViewSQL = `
        CREATE TEMPORARY VIEW ${viewName} AS
        ${unionParts.join(' UNION ALL ')}
      `;
      await this.duckDBInstance.connection.query(createViewSQL);

      // Execute query on unified view
      const result = await this.duckDBInstance.connection.query(
        query.replace(/FROM\s+\$table/gi, `FROM ${viewName}`)
      );

      // Clean up
      await this.duckDBInstance.connection.query(`DROP VIEW ${viewName}`);

      return result.toArray();

    } catch (error) {
      console.error('[HybridDataService] Hybrid query failed:', error);
      throw error;
    }
  }

  /**
   * Cleanup and close DuckDB connection
   */
  async dispose(): Promise<void> {
    if (this.duckDBInstance) {
      await this.clearData();
      await this.duckDBInstance.connection.close();
      await this.duckDBInstance.db.terminate();
      this.duckDBInstance.worker.terminate();
      this.duckDBInstance = null;
      this.loadedMetadataIds.clear();
      duckDBSchemaTracker.clear();
      console.log('[HybridDataService] DuckDB disposed');
    }
  }
}

// Export singleton instance getter
export const hybridDataService = HybridDataService.getInstance();