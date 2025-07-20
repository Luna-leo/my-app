/**
 * Hybrid Data Service - Refactored Version
 * 
 * Orchestrates modular services for hybrid data operations
 * Combines IndexedDB persistence with DuckDB analytics
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { TimeSeriesData } from '@/lib/db/schema';
import { duckDBParquetService, ParquetReadOptions } from './duckdbParquetService';
import { duckDBSchemaTracker } from './duckdbSchemaTracker';
import { createLogger } from './logger';

// Import modular services
import { duckDBInitializer } from './data/duckdbInitializer';
import { DataLoader, DataLoadOptions } from './data/dataLoader';
import { DataSampler, SampleDataParams } from './data/dataSampler';
import { QueryExecutor } from './data/queryExecutor';
import { HybridQueryBuilder } from './data/hybridQueryBuilder';

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
  private dataLoader: DataLoader | null = null;
  private dataSampler: DataSampler | null = null;
  private queryExecutor: QueryExecutor | null = null;
  private queryBuilder: HybridQueryBuilder | null = null;
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
    const instance = await duckDBInitializer.initialize();
    
    // Initialize services with the connection
    this.dataLoader = new DataLoader(instance.connection);
    this.dataSampler = new DataSampler(instance.connection);
    this.queryExecutor = new QueryExecutor(instance.connection);
    this.queryBuilder = new HybridQueryBuilder();
    
    // Initialize parquet service
    duckDBParquetService.setConnection(instance.connection);
    
    this.logger.info('HybridDataService initialized with modular services');
  }

  /**
   * Get DuckDB connection for direct queries
   */
  async getConnection(): Promise<duckdb.AsyncDuckDBConnection | null> {
    return duckDBInitializer.getConnection();
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return duckDBInitializer.isInitialized() && 
           this.dataLoader !== null && 
           this.dataSampler !== null;
  }

  /**
   * Ensure service is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.isInitialized()) {
      await this.initialize();
    }
  }

  /**
   * Load time series data from IndexedDB into DuckDB
   */
  async loadTimeSeriesData(
    metadataId: number,
    data: TimeSeriesData[],
    parameterIds: string[],
    onProgress?: (progress: number) => void
  ): Promise<void> {
    await this.ensureInitialized();
    
    const options: DataLoadOptions = {
      onProgress,
      batchSize: 10000
    };
    
    await this.dataLoader!.loadTimeSeriesData(
      metadataId,
      data,
      parameterIds,
      options
    );
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
    await this.ensureInitialized();
    
    const params: SampleDataParams = {
      metadataIds,
      parameterIds,
      targetPoints,
      options
    };
    
    return this.dataSampler!.sampleData(params);
  }

  /**
   * Execute custom SQL query for advanced analytics
   */
  async query(sql: string): Promise<Record<string, unknown>[]> {
    await this.ensureInitialized();
    return this.queryExecutor!.query(sql);
  }

  /**
   * Clear loaded data for specific metadata IDs
   */
  async clearData(metadataIds?: number[]): Promise<void> {
    await this.ensureInitialized();
    
    const idsToClean = metadataIds || this.dataLoader!.getLoadedMetadataIds();
    
    for (const metadataId of idsToClean) {
      const tableName = `timeseries_${metadataId}`;
      try {
        await this.queryExecutor!.query(`DROP TABLE IF EXISTS ${tableName}`);
        this.logger.info(`Dropped table ${tableName}`);
      } catch (error) {
        this.logger.error(`Failed to drop table ${tableName}`, error);
      }
    }
    
    // Clear tracking
    this.dataLoader!.clearLoadedTracking();
  }

  /**
   * Get statistics about loaded data
   */
  async getLoadedDataStats(): Promise<DataLoadStats> {
    if (!this.isInitialized()) {
      return {
        totalRows: 0,
        loadedRows: 0,
        duration: 0,
        tablesCreated: []
      };
    }

    const loadedIds = this.dataLoader!.getLoadedMetadataIds();
    const tables = loadedIds.map(id => `timeseries_${id}`);
    let totalRows = 0;

    for (const table of tables) {
      try {
        const result = await this.queryExecutor!.query(`SELECT COUNT(*) as count FROM ${table}`);
        const count = result[0]?.count as number || 0;
        totalRows += count;
      } catch (error) {
        this.logger.error(`Failed to get row count for ${table}`, error);
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
    await this.ensureInitialized();
    
    return duckDBParquetService.readTimeSeriesFromParquet(
      parquetPath,
      metadataId,
      options
    );
  }

  /**
   * Sample data from Parquet files
   */
  async sampleDataFromParquet(
    parquetPaths: Map<number, string>,
    parameterIds: string[],
    targetPoints: number,
    options?: {
      startTime?: Date;
      endTime?: Date;
      method?: 'nth' | 'random' | 'reservoir';
    }
  ): Promise<TimeSeriesData[]> {
    await this.ensureInitialized();
    
    const allData: TimeSeriesData[] = [];
    const pointsPerMetadata = Math.ceil(targetPoints / parquetPaths.size);

    // Build filters
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
        this.logger.warn(`Failed to sample from ${parquetPath}`, err);
      }
    }

    this.logger.info(`Sampled ${allData.length} points from ${parquetPaths.size} parquet files`);
    return allData;
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
    await this.ensureInitialized();
    await duckDBParquetService.exportToParquet(query, outputPath, options);
  }

  /**
   * Execute a hybrid query combining memory tables and parquet files
   */
  async executeHybridQuery(
    memoryTableIds: number[],
    parquetPaths: Map<number, string>,
    query: string
  ): Promise<Record<string, unknown>[]> {
    await this.ensureInitialized();

    // Build hybrid query
    const { viewName, createViewSQL, cleanupSQL } = this.queryBuilder!.buildHybridUnionQuery({
      memoryTableIds,
      parquetPaths
    });

    if (!createViewSQL) {
      return [];
    }

    try {
      // Create temporary view
      await this.queryExecutor!.query(createViewSQL);

      // Execute query on unified view
      const result = await this.queryExecutor!.query(
        query.replace(/FROM\s+\$table/gi, `FROM ${viewName}`)
      );

      // Clean up
      await this.queryExecutor!.query(cleanupSQL);

      return result;

    } catch (error) {
      // Attempt cleanup even if query failed
      try {
        await this.queryExecutor!.query(cleanupSQL);
      } catch (cleanupError) {
        this.logger.warn('Failed to clean up view', cleanupError);
      }
      
      throw error;
    }
  }

  /**
   * Cleanup and close DuckDB connection
   */
  async dispose(): Promise<void> {
    await this.clearData();
    await duckDBInitializer.shutdown();
    
    // Clear service references
    this.dataLoader = null;
    this.dataSampler = null;
    this.queryExecutor = null;
    this.queryBuilder = null;
    
    // Clear schema tracker
    duckDBSchemaTracker.clear();
    
    this.logger.info('HybridDataService disposed');
  }
}

// Export singleton instance
export const hybridDataService = HybridDataService.getInstance();