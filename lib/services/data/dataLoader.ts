/**
 * Data Loader Service
 * 
 * Handles loading time series data from IndexedDB into DuckDB
 * Extracted from hybridDataService.ts
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { TimeSeriesData } from '@/lib/db/schema';
import { duckDBSchemaTracker } from '@/lib/services/duckdbSchemaTracker';
import { duckDBQueryCache } from '@/lib/services/duckdbQueryCache';
import { createLogger } from '@/lib/services/logger';
import { 
  buildTableName,
  buildCreateTableStatement,
  TableColumn,
  escapeColumnName
} from '@/lib/utils/sqlBuilder';

export interface DataLoadOptions {
  onProgress?: (progress: number) => void;
  batchSize?: number;
  clearExisting?: boolean;
}

export interface DataLoadResult {
  tableName: string;
  rowsLoaded: number;
  duration: number;
  columnsAdded?: string[];
}

export class DataLoader {
  private connection: duckdb.AsyncDuckDBConnection;
  private logger = createLogger('DataLoader');
  private loadedMetadataIds = new Set<number>();

  constructor(connection: duckdb.AsyncDuckDBConnection) {
    this.connection = connection;
  }

  /**
   * Load time series data for a specific metadata ID
   */
  async loadTimeSeriesData(
    metadataId: number,
    data: TimeSeriesData[],
    parameterIds: string[],
    options: DataLoadOptions = {}
  ): Promise<DataLoadResult> {
    const startTime = performance.now();
    const tableName = buildTableName(metadataId, 'timeseries');
    
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
    
    // Combine required parameter IDs
    const requiredParameterIds = [...new Set([...availableParameterIds, ...parameterIds])];
    
    // Check current table state
    const tableState = await this.checkTableState(tableName, metadataId);
    
    // Sync schema tracker if needed
    await this.syncSchemaTracker(tableName, metadataId, tableState);
    
    // Determine missing columns
    const missingColumns = tableState.exists 
      ? duckDBSchemaTracker.getMissingColumns(metadataId, requiredParameterIds)
      : requiredParameterIds;
    
    if (tableState.exists && missingColumns.length === 0 && !options.clearExisting) {
      this.logger.info(`Table ${tableName} already has all required columns, skipping load`);
      return {
        tableName,
        rowsLoaded: 0,
        duration: performance.now() - startTime
      };
    }

    try {
      // Handle table creation or modification
      let columnsAdded: string[] = [];
      
      if (tableState.exists && missingColumns.length > 0) {
        // Add missing columns
        columnsAdded = await this.addMissingColumns(tableName, metadataId, missingColumns);
      } else if (!tableState.exists) {
        // Create new table
        await this.createTable(tableName, metadataId, requiredParameterIds);
        columnsAdded = requiredParameterIds;
      }

      // Clear existing data if requested
      if (options.clearExisting && tableState.exists) {
        await this.connection.query(`DELETE FROM ${tableName}`);
        this.logger.debug(`Cleared existing data from ${tableName}`);
      }

      // Load data
      const rowsLoaded = await this.insertData(
        tableName,
        metadataId,
        data,
        requiredParameterIds,
        options
      );

      // Update tracking
      this.loadedMetadataIds.add(metadataId);
      duckDBSchemaTracker.updateRowCount(metadataId, rowsLoaded);
      
      // Invalidate cache
      duckDBQueryCache.invalidate(`"metadataIds":\\[.*${metadataId}.*\\]`);
      
      const duration = performance.now() - startTime;
      this.logger.info(`Loaded ${rowsLoaded} rows into ${tableName} in ${duration.toFixed(2)}ms`);

      return {
        tableName,
        rowsLoaded,
        duration,
        columnsAdded: columnsAdded.length > 0 ? columnsAdded : undefined
      };

    } catch (error) {
      this.logger.error(`Failed to load data for metadataId ${metadataId}`, error);
      throw error;
    }
  }

  /**
   * Check if table exists and get its columns
   */
  private async checkTableState(
    tableName: string,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    metadataId: number
  ): Promise<{
    exists: boolean;
    columns?: string[];
  }> {
    try {
      const checkTableSQL = `
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = '${tableName}'
      `;
      const result = await this.connection.query(checkTableSQL);
      const exists = result.toArray()[0]['count'] > 0;

      if (exists) {
        // Get columns
        const schemaQuery = `
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = '${tableName}' 
            AND column_name NOT IN ('metadata_id', 'timestamp')
        `;
        const schemaResult = await this.connection.query(schemaQuery);
        const columns = schemaResult.toArray().map(row => row.column_name as string);
        
        return { exists: true, columns };
      }

      return { exists: false };
    } catch (error) {
      this.logger.warn('Failed to check table state', error);
      return { exists: false };
    }
  }

  /**
   * Sync schema tracker with actual database state
   */
  private async syncSchemaTracker(
    tableName: string,
    metadataId: number,
    tableState: { exists: boolean; columns?: string[] }
  ): Promise<void> {
    const trackerHasTable = duckDBSchemaTracker.hasTable(metadataId);

    if (tableState.exists && !trackerHasTable && tableState.columns) {
      // Table exists in DB but not in tracker
      duckDBSchemaTracker.registerTable(metadataId, tableState.columns, 0);
      this.logger.info(`Synced schema tracker for existing table ${tableName}`);
    } else if (!tableState.exists && trackerHasTable) {
      // Table doesn't exist in DB but exists in tracker
      duckDBSchemaTracker.removeTable(metadataId);
      this.logger.info(`Removed non-existent table from tracker: ${tableName}`);
    }
  }

  /**
   * Create a new table
   */
  private async createTable(
    tableName: string,
    metadataId: number,
    parameterIds: string[]
  ): Promise<void> {
    const columns: TableColumn[] = [
      { name: 'metadata_id', type: 'INTEGER', nullable: false },
      { name: 'timestamp', type: 'TIMESTAMP', nullable: false },
      ...parameterIds.map(id => ({
        name: id,
        type: 'DOUBLE',
        nullable: true
      }))
    ];

    const createSQL = buildCreateTableStatement(tableName, columns);
    await this.connection.query(createSQL);
    
    this.logger.info(`Created table ${tableName} with ${parameterIds.length} parameter columns`);
    
    // Register in schema tracker
    duckDBSchemaTracker.registerTable(metadataId, parameterIds, 0);
  }

  /**
   * Add missing columns to existing table
   */
  private async addMissingColumns(
    tableName: string,
    metadataId: number,
    missingColumns: string[]
  ): Promise<string[]> {
    const added: string[] = [];
    
    for (const columnId of missingColumns) {
      const escapedName = escapeColumnName(columnId);
      const alterSQL = `ALTER TABLE ${tableName} ADD COLUMN ${escapedName} DOUBLE`;
      
      try {
        await this.connection.query(alterSQL);
        added.push(columnId);
      } catch (error) {
        this.logger.warn(`Failed to add column ${columnId}`, error);
      }
    }

    if (added.length > 0) {
      duckDBSchemaTracker.addColumns(metadataId, added);
      this.logger.info(`Added ${added.length} columns to ${tableName}`);
    }

    return added;
  }

  /**
   * Insert data in batches
   */
  private async insertData(
    tableName: string,
    metadataId: number,
    data: TimeSeriesData[],
    parameterIds: string[],
    options: DataLoadOptions
  ): Promise<number> {
    const batchSize = options.batchSize || 10000;
    let processedRows = 0;

    for (let i = 0; i < data.length; i += batchSize) {
      const batch = data.slice(i, i + batchSize);
      
      // Build INSERT statement
      const values = batch.map(row => {
        const params = parameterIds.map(id => 
          row.data[id] !== null && row.data[id] !== undefined 
            ? row.data[id] 
            : 'NULL'
        ).join(', ');
        return `(${metadataId}, TIMESTAMP '${row.timestamp.toISOString()}', ${params})`;
      }).join(', ');

      const columnNames = [
        'metadata_id',
        'timestamp',
        ...parameterIds.map(id => escapeColumnName(id))
      ].join(', ');
      
      const insertSQL = `INSERT INTO ${tableName} (${columnNames}) VALUES ${values}`;
      await this.connection.query(insertSQL);
      
      processedRows += batch.length;
      
      if (options.onProgress) {
        options.onProgress((processedRows / data.length) * 100);
      }
    }

    return processedRows;
  }

  /**
   * Check if data is loaded for metadata IDs
   */
  isDataLoaded(metadataIds: number[]): boolean {
    return metadataIds.every(id => this.loadedMetadataIds.has(id));
  }

  /**
   * Get loaded metadata IDs
   */
  getLoadedMetadataIds(): number[] {
    return Array.from(this.loadedMetadataIds);
  }

  /**
   * Clear loaded data tracking
   */
  clearLoadedTracking(): void {
    this.loadedMetadataIds.clear();
  }
}