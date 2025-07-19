/**
 * DuckDB CSV Importer
 * 
 * Direct CSV import to DuckDB using COPY statement
 * Bypasses IndexedDB for faster loading
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { Metadata, DataSource } from '@/lib/db/schema';
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

      onProgress?.({
        current: 20,
        total: 100,
        phase: 'preparing',
        message: 'Reading CSV file...'
      });

      // Parse CSV manually to avoid stack overflow with large files
      const text = await file.text();
      const lines = text.split('\n');
      
      // Skip header rows
      const dataStartIndex = 3; // Skip first 3 rows
      const headers = lines[dataStartIndex - 1].split(',').map(h => h.trim());
      
      // Create table with proper schema
      const columnDefs = headers.map((header) => {
        if (header.toLowerCase().includes('timestamp') || header.toLowerCase().includes('time')) {
          return `"${header}" TIMESTAMP`;
        }
        return `"${header}" DOUBLE`;
      }).join(', ');

      onProgress?.({
        current: 40,
        total: 100,
        phase: 'importing',
        message: `Creating table with ${headers.length} columns...`
      });

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

      // Import data in batches to avoid memory issues
      const metadataId = Math.floor(Math.random() * 1000000); // Temporary ID
      const batchSize = 1000;
      let importedRows = 0;
      
      for (let i = dataStartIndex; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, Math.min(i + batchSize, lines.length))
          .filter(line => line.trim() !== '');
        
        if (batch.length === 0) continue;
        
        const values = batch.map(line => {
          const cols = line.split(',').map(col => col.trim());
          const valueList = [metadataId.toString()];
          
          cols.forEach((col, idx) => {
            if (headers[idx] && (headers[idx].toLowerCase().includes('timestamp') || headers[idx].toLowerCase().includes('time'))) {
              valueList.push(col ? `TIMESTAMP '${col}'` : 'NULL');
            } else if (!col || col === '') {
              valueList.push('NULL');
            } else {
              valueList.push(col);
            }
          });
          
          return `(${valueList.join(', ')})`;
        }).join(', ');
        
        try {
          await this.connection!.query(`
            INSERT INTO ${tableName} VALUES ${values}
          `);
          importedRows += batch.length;
          
          const progress = 60 + (importedRows / (lines.length - dataStartIndex)) * 30;
          onProgress?.({
            current: progress,
            total: 100,
            phase: 'importing',
            message: `Imported ${importedRows} rows...`
          });
        } catch (err) {
          console.warn(`[DuckDBCsvImporter] Failed to import batch at line ${i}:`, err);
        }
      }

      // Get row count
      const countResult = await this.connection!.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `);
      const rowCount = countResult.toArray()[0].count;

      onProgress?.({
        current: 90,
        total: 100,
        phase: 'indexing',
        message: 'Creating indexes...'
      });

      // Create indexes for better query performance
      if (headers.some(h => h.toLowerCase() === 'timestamp')) {
        await this.connection!.query(`
          CREATE INDEX idx_${tableName}_timestamp 
          ON ${tableName}(timestamp)
        `);
      }

      // Register table in schema tracker
      duckDBSchemaTracker.registerTable(metadataId, headers, rowCount);

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
        columnCount: headers.length,
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