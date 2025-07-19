/**
 * DuckDB CSV Importer
 * 
 * Direct CSV import to DuckDB using COPY statement
 * Bypasses IndexedDB for faster loading
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { Metadata, DataSource } from '@/lib/db/schema';
import { generateDataKey } from '@/lib/utils/dataKeyUtils';
import { duckDBSchemaTracker } from './duckdbSchemaTracker';

export interface DuckDBImportProgress {
  current: number;
  total: number;
  phase: 'preparing' | 'importing' | 'indexing' | 'completed';
  message: string;
}

export interface DuckDBImportResult {
  success: boolean;
  metadataId: number;
  tableName: string;
  rowCount: number;
  columnCount: number;
  duration: number;
  errors: string[];
}

export class DuckDBCsvImporter {
  private connection: duckdb.AsyncDuckDBConnection | null = null;

  constructor(connection: duckdb.AsyncDuckDBConnection) {
    this.connection = connection;
  }

  /**
   * Import CSV file directly to DuckDB
   */
  async importCsv(
    file: File,
    metadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>,
    dataSource: DataSource,
    onProgress?: (progress: DuckDBImportProgress) => void
  ): Promise<DuckDBImportResult> {
    const startTime = performance.now();
    const tableName = `timeseries_${metadata.plant}_${metadata.machineNo}_${Date.now()}`;
    const errors: string[] = [];

    try {
      onProgress?.({
        current: 0,
        total: 100,
        phase: 'preparing',
        message: 'Preparing CSV import...'
      });

      // Read file as text for DuckDB
      const fileText = await file.text();
      
      // Create temporary CSV view
      const tempViewName = `temp_csv_${Date.now()}`;
      
      onProgress?.({
        current: 20,
        total: 100,
        phase: 'preparing',
        message: 'Analyzing CSV structure...'
      });

      // First, create a view to analyze the CSV structure
      await this.connection!.query(`
        CREATE TEMPORARY VIEW ${tempViewName} AS
        SELECT * FROM read_csv_auto(
          '${this.escapeString(fileText)}',
          header = true,
          skip = 3,  -- Skip first 3 header rows
          delim = ',',
          quote = '"',
          escape = '"',
          null_padding = true,
          ignore_errors = true
        )
      `);

      // Get column information
      const schemaResult = await this.connection!.query(`
        SELECT column_name, data_type 
        FROM duckdb_columns() 
        WHERE table_name = '${tempViewName}'
      `);
      
      const columns = schemaResult.toArray();
      console.log(`[DuckDBCsvImporter] Detected ${columns.length} columns`);

      onProgress?.({
        current: 40,
        total: 100,
        phase: 'importing',
        message: `Creating table with ${columns.length} columns...`
      });

      // Create target table with proper schema
      const columnDefs = columns.map((col: any) => {
        const colName = col.column_name;
        let colType = 'DOUBLE'; // Default to DOUBLE for numeric data
        
        if (colName.toLowerCase() === 'timestamp' || colName.toLowerCase().includes('time')) {
          colType = 'TIMESTAMP';
        } else if (col.data_type.includes('VARCHAR')) {
          colType = 'VARCHAR';
        }
        
        return `"${colName}" ${colType}`;
      }).join(', ');

      await this.connection!.query(`
        CREATE TABLE ${tableName} (
          metadata_id INTEGER,
          ${columnDefs}
        )
      `);

      onProgress?.({
        current: 60,
        total: 100,
        phase: 'importing',
        message: 'Importing data...'
      });

      // Import data from CSV with metadata_id
      const metadataId = Math.floor(Math.random() * 1000000); // Temporary ID
      
      await this.connection!.query(`
        INSERT INTO ${tableName}
        SELECT 
          ${metadataId} as metadata_id,
          *
        FROM ${tempViewName}
      `);

      // Get row count
      const countResult = await this.connection!.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `);
      const rowCount = countResult.toArray()[0].count;

      onProgress?.({
        current: 80,
        total: 100,
        phase: 'indexing',
        message: 'Creating indexes...'
      });

      // Create indexes for better query performance
      if (columns.some((col: any) => col.column_name.toLowerCase() === 'timestamp')) {
        await this.connection!.query(`
          CREATE INDEX idx_${tableName}_timestamp 
          ON ${tableName}(timestamp)
        `);
      }

      // Register table in schema tracker
      const columnNames = columns.map((col: any) => col.column_name);
      duckDBSchemaTracker.registerTable(metadataId, columnNames, rowCount);

      // Clean up temporary view
      await this.connection!.query(`DROP VIEW ${tempViewName}`);

      const duration = performance.now() - startTime;

      onProgress?.({
        current: 100,
        total: 100,
        phase: 'completed',
        message: `Import completed: ${rowCount} rows in ${duration.toFixed(0)}ms`
      });

      return {
        success: true,
        metadataId,
        tableName,
        rowCount,
        columnCount: columns.length,
        duration,
        errors
      };

    } catch (error) {
      console.error('[DuckDBCsvImporter] Import failed:', error);
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        metadataId: 0,
        tableName,
        rowCount: 0,
        columnCount: 0,
        duration: performance.now() - startTime,
        errors
      };
    }
  }

  /**
   * Import CSV using external file path (for larger files)
   */
  async importCsvFromPath(
    filePath: string,
    metadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>,
    onProgress?: (progress: DuckDBImportProgress) => void
  ): Promise<DuckDBImportResult> {
    const startTime = performance.now();
    const tableName = `timeseries_${metadata.plant}_${metadata.machineNo}_${Date.now()}`;
    const metadataId = Math.floor(Math.random() * 1000000);

    try {
      onProgress?.({
        current: 0,
        total: 100,
        phase: 'preparing',
        message: 'Preparing file import...'
      });

      // Use DuckDB's COPY statement for efficient import
      await this.connection!.query(`
        CREATE TABLE ${tableName} AS
        SELECT 
          ${metadataId} as metadata_id,
          * 
        FROM read_csv_auto(
          '${filePath}',
          header = true,
          skip = 3,
          delim = ',',
          quote = '"',
          escape = '"',
          null_padding = true,
          timestampformat = '%Y-%m-%d %H:%M:%S'
        )
      `);

      // Get statistics
      const statsResult = await this.connection!.query(`
        SELECT 
          COUNT(*) as row_count,
          COUNT(*) - 1 as column_count
        FROM duckdb_columns()
        WHERE table_name = '${tableName}'
      `);
      
      const stats = statsResult.toArray()[0];

      const duration = performance.now() - startTime;

      onProgress?.({
        current: 100,
        total: 100,
        phase: 'completed',
        message: `Import completed: ${stats.row_count} rows in ${duration.toFixed(0)}ms`
      });

      return {
        success: true,
        metadataId,
        tableName,
        rowCount: stats.row_count,
        columnCount: stats.column_count,
        duration,
        errors: []
      };

    } catch (error) {
      console.error('[DuckDBCsvImporter] Import from path failed:', error);
      return {
        success: false,
        metadataId: 0,
        tableName,
        rowCount: 0,
        columnCount: 0,
        duration: performance.now() - startTime,
        errors: [error instanceof Error ? error.message : 'Unknown error']
      };
    }
  }

  /**
   * Escape string for SQL
   */
  private escapeString(str: string): string {
    return str.replace(/'/g, "''");
  }

  /**
   * Get import statistics
   */
  async getImportStats(tableName: string): Promise<{
    rowCount: number;
    columnCount: number;
    sizeInBytes: number;
    compressionRatio: number;
  } | null> {
    try {
      const result = await this.connection!.query(`
        SELECT 
          COUNT(*) as row_count,
          COUNT(*) as column_count,
          SUM(LENGTH(*)::BIGINT) as size_bytes
        FROM ${tableName}
      `);
      
      const stats = result.toArray()[0];
      
      return {
        rowCount: stats.row_count,
        columnCount: stats.column_count,
        sizeInBytes: stats.size_bytes,
        compressionRatio: 1.0 // Placeholder
      };
    } catch (error) {
      console.error('[DuckDBCsvImporter] Failed to get stats:', error);
      return null;
    }
  }
}

// Factory function
export function createDuckDBCsvImporter(connection: duckdb.AsyncDuckDBConnection): DuckDBCsvImporter {
  return new DuckDBCsvImporter(connection);
}