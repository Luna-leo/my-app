import * as duckdb from '@duckdb/duckdb-wasm';
import { TimeSeriesData } from '@/lib/db';

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

  private async _initialize(): Promise<void> {
    if (this.duckDBInstance) {
      console.log('[HybridDataService] Already initialized');
      return;
    }

    console.log('[HybridDataService] Initializing DuckDB-Wasm...');
    const startTime = performance.now();

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

      const duration = performance.now() - startTime;
      console.log(`[HybridDataService] DuckDB initialized in ${duration.toFixed(2)}ms`);
    } catch (error) {
      console.error('[HybridDataService] Failed to initialize DuckDB:', error);
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

    if (this.loadedMetadataIds.has(metadataId)) {
      console.log(`[HybridDataService] Data for metadataId ${metadataId} already loaded, dropping existing table`);
      // Drop existing table to recreate with new schema
      const tableName = `timeseries_${metadataId}`;
      try {
        await this.duckDBInstance.connection.query(`DROP TABLE IF EXISTS ${tableName}`);
        this.loadedMetadataIds.delete(metadataId);
      } catch (error) {
        console.error(`[HybridDataService] Failed to drop table ${tableName}:`, error);
      }
    }

    const tableName = `timeseries_${metadataId}`;
    const startTime = performance.now();

    try {
      // Extract all available parameter IDs from the data
      const allParameterIds = new Set<string>();
      data.forEach(row => {
        Object.keys(row.data).forEach(id => allParameterIds.add(id));
      });
      const availableParameterIds = Array.from(allParameterIds);
      
      // Create table with columns for all available parameters
      const columnDefs = availableParameterIds.map(id => `"${id}" DOUBLE`).join(', ');
      const createTableSQL = `
        CREATE TABLE IF NOT EXISTS ${tableName} (
          metadata_id INTEGER,
          timestamp TIMESTAMP,
          ${columnDefs}
        )
      `;
      
      await this.duckDBInstance.connection.query(createTableSQL);
      console.log(`[HybridDataService] Created table ${tableName} with columns: ${availableParameterIds.join(', ')}`);

      // Prepare data for bulk insert
      const batchSize = 10000;
      let processedRows = 0;

      for (let i = 0; i < data.length; i += batchSize) {
        const batch = data.slice(i, i + batchSize);
        
        // Convert batch to columnar format for efficient insertion
        const timestamps: Date[] = [];
        const columnData: { [key: string]: (number | null)[] } = {};
        
        availableParameterIds.forEach(id => {
          columnData[id] = [];
        });

        batch.forEach(row => {
          timestamps.push(row.timestamp);
          availableParameterIds.forEach(id => {
            columnData[id].push(row.data[id] ?? null);
          });
        });

        // Build INSERT statement
        const values = batch.map(row => {
          const params = availableParameterIds.map(id => row.data[id] ?? 'NULL').join(', ');
          return `(${metadataId}, TIMESTAMP '${row.timestamp.toISOString()}', ${params})`;
        }).join(', ');

        const columnNames = ['metadata_id', 'timestamp', ...availableParameterIds.map(id => `"${id}"`)].join(', ');
        const insertSQL = `
          INSERT INTO ${tableName} (${columnNames}) VALUES ${values}
        `;

        await this.duckDBInstance.connection.query(insertSQL);
        
        processedRows += batch.length;
        if (onProgress) {
          onProgress((processedRows / data.length) * 100);
        }
      }

      this.loadedMetadataIds.add(metadataId);
      
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
      method?: 'nth' | 'random' | 'lttb';
    }
  ): Promise<TimeSeriesData[]> {
    if (!this.duckDBInstance) {
      throw new Error('DuckDB not initialized. Call initialize() first.');
    }

    const startTime = performance.now();
    const method = options?.method || 'nth';

    try {
      // Build UNION query for multiple metadata IDs
      const queries = metadataIds.map(metadataId => {
        const tableName = `timeseries_${metadataId}`;
        const columns = parameterIds.map(id => `"${id}"`).join(', ');
        
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
            (SELECT metadata_id, timestamp, ${columns}
             FROM ${tableName}
             ${whereClause}
             USING SAMPLE ${targetPoints} ROWS)
          `;
        } else if (method === 'nth') {
          // Nth-point sampling using row numbers
          return `
            (WITH numbered AS (
              SELECT metadata_id, timestamp, ${columns},
                     ROW_NUMBER() OVER (ORDER BY timestamp) as rn,
                     COUNT(*) OVER () as total_count
              FROM ${tableName}
              ${whereClause}
            )
            SELECT metadata_id, timestamp, ${columns}
            FROM numbered
            WHERE MOD(rn, GREATEST(1, CAST(total_count / ${targetPoints} AS INTEGER))) = 0
            LIMIT ${targetPoints})
          `;
        } else {
          // For LTTB, we'll need a more complex implementation
          // For now, fall back to nth-point sampling
          return `
            (SELECT metadata_id, timestamp, ${columns}
             FROM ${tableName}
             ${whereClause}
             ORDER BY timestamp
             LIMIT ${targetPoints})
          `;
        }
      });

      const unionQuery = queries.join(' UNION ALL ');
      const finalQuery = `
        SELECT * FROM (${unionQuery})
        ORDER BY metadata_id, timestamp
      `;

      console.log(`[HybridDataService] Executing sampling query for ${metadataIds.length} tables`);
      console.log(`[HybridDataService] Query: ${finalQuery}`);
      const result = await this.duckDBInstance.connection.query(finalQuery);
      
      // Convert DuckDB result to TimeSeriesData format
      const data: TimeSeriesData[] = [];
      const resultArray = result.toArray();

      resultArray.forEach((row: Record<string, unknown>) => {
        const dataPoint: TimeSeriesData = {
          metadataId: row.metadata_id as number,
          timestamp: new Date(row.timestamp as string | number),
          data: {}
        };

        parameterIds.forEach(id => {
          if (row[id] !== null && typeof row[id] === 'number') {
            dataPoint.data[id] = row[id] as number;
          }
        });

        data.push(dataPoint);
      });

      const duration = performance.now() - startTime;
      console.log(`[HybridDataService] Sampled ${data.length} points in ${duration.toFixed(2)}ms`);

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
      console.log('[HybridDataService] DuckDB disposed');
    }
  }
}

// Export singleton instance getter
export const hybridDataService = HybridDataService.getInstance();