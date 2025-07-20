/**
 * DuckDB Initializer Service
 * 
 * Handles DuckDB WebAssembly initialization and configuration
 * Extracted from hybridDataService.ts
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { createLogger } from '@/lib/services/logger';

export interface DuckDBInstance {
  connection: duckdb.AsyncDuckDBConnection;
  db: duckdb.AsyncDuckDB;
  worker: Worker;
}

export interface DuckDBConfig {
  path?: string;
  castBigIntToDouble?: boolean;
  logLevel?: 'silent' | 'info' | 'debug';
}

export class DuckDBInitializer {
  private static instance: DuckDBInitializer;
  private duckDBInstance: DuckDBInstance | null = null;
  private initializationPromise: Promise<DuckDBInstance> | null = null;
  private logger = createLogger('DuckDBInitializer');

  private constructor() {}

  static getInstance(): DuckDBInitializer {
    if (!DuckDBInitializer.instance) {
      DuckDBInitializer.instance = new DuckDBInitializer();
    }
    return DuckDBInitializer.instance;
  }

  /**
   * Initialize DuckDB with WebAssembly
   */
  async initialize(config: DuckDBConfig = {}): Promise<DuckDBInstance> {
    // Return existing instance if already initialized
    if (this.duckDBInstance) {
      this.logger.debug('Returning existing DuckDB instance');
      return this.duckDBInstance;
    }

    // Return ongoing initialization if in progress
    if (this.initializationPromise) {
      this.logger.debug('Waiting for ongoing initialization');
      return this.initializationPromise;
    }

    // Start new initialization
    this.initializationPromise = this._initialize(config);
    
    try {
      this.duckDBInstance = await this.initializationPromise;
      return this.duckDBInstance;
    } catch (error) {
      // Reset on failure to allow retry
      this.initializationPromise = null;
      throw error;
    }
  }

  /**
   * Internal initialization logic
   */
  private async _initialize(config: DuckDBConfig): Promise<DuckDBInstance> {
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

      // Create logger based on config
      const logger = config.logLevel === 'silent' 
        ? new duckdb.VoidLogger()
        : new duckdb.ConsoleLogger();

      // Create a new DuckDB worker
      // Note: This will generate Turbopack TP1001 warnings, but the functionality works correctly.
      // DuckDB dynamically selects the appropriate worker based on browser capabilities.
      const worker = new Worker(DUCKDB_CONFIG.mainWorker!);
      const db = new duckdb.AsyncDuckDB(logger, worker);
      
      await db.instantiate(DUCKDB_CONFIG.mainModule, DUCKDB_CONFIG.pthreadWorker);
      
      // Open database with configuration
      await db.open({
        path: config.path || ':memory:', // Default to in-memory database
        query: {
          castBigIntToDouble: config.castBigIntToDouble ?? true // Default true for JS compatibility
        }
      });

      const connection = await db.connect();

      const instance: DuckDBInstance = { db, connection, worker };

      // Configure connection settings
      await this.configureConnection(connection);

      endTimer();
      this.logger.info('DuckDB initialized successfully');

      return instance;
    } catch (error) {
      this.logger.error('Failed to initialize DuckDB', error);
      throw error;
    }
  }

  /**
   * Configure DuckDB connection with optimal settings
   */
  private async configureConnection(connection: duckdb.AsyncDuckDBConnection): Promise<void> {
    try {
      // Set memory limit (optional)
      // await connection.query("SET memory_limit='2GB'");
      
      // Enable parallel execution
      await connection.query("SET threads=4");
      
      // Enable progress bar for long queries (useful for debugging)
      await connection.query("SET enable_progress_bar=true");
      
      this.logger.debug('DuckDB connection configured');
    } catch (error) {
      this.logger.warn('Failed to configure some DuckDB settings', error);
      // Non-critical, continue anyway
    }
  }

  /**
   * Get the current DuckDB instance
   */
  getInstance(): DuckDBInstance | null {
    return this.duckDBInstance;
  }

  /**
   * Get DuckDB connection
   */
  async getConnection(): Promise<duckdb.AsyncDuckDBConnection | null> {
    const instance = await this.initialize();
    return instance?.connection || null;
  }

  /**
   * Check if DuckDB is initialized
   */
  isInitialized(): boolean {
    return this.duckDBInstance !== null;
  }

  /**
   * Shutdown DuckDB and cleanup resources
   */
  async shutdown(): Promise<void> {
    if (!this.duckDBInstance) {
      return;
    }

    this.logger.info('Shutting down DuckDB...');

    try {
      // Close connection
      await this.duckDBInstance.connection.close();
      
      // Terminate worker
      this.duckDBInstance.worker.terminate();
      
      // Reset state
      this.duckDBInstance = null;
      this.initializationPromise = null;
      
      this.logger.info('DuckDB shutdown complete');
    } catch (error) {
      this.logger.error('Error during DuckDB shutdown', error);
      throw error;
    }
  }

  /**
   * Reset DuckDB (shutdown and allow re-initialization)
   */
  async reset(): Promise<void> {
    await this.shutdown();
  }
}

// Export singleton instance
export const duckDBInitializer = DuckDBInitializer.getInstance();