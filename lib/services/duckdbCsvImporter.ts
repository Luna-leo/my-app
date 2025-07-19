/**
 * DuckDB CSV Importer
 * 
 * Direct CSV import to DuckDB using COPY statement
 * Bypasses IndexedDB for faster loading
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { Metadata, DataSource, ParameterInfo } from '@/lib/db/schema';
import { duckDBSchemaTracker } from './duckdbSchemaTracker';
import { db } from '@/lib/db';
import { generateDataKey } from '@/lib/utils/dataKeyUtils';
import { createParquetDataManager } from './parquetDataManager';

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
  parquetFileId?: string;
}

export class DuckDBCsvImporter {
  private connection: duckdb.AsyncDuckDBConnection | null = null;

  constructor(connection: duckdb.AsyncDuckDBConnection) {
    this.connection = connection;
  }

  /**
   * Import multiple CSV files directly to DuckDB
   */
  async importMultipleCsvFiles(
    files: File[],
    metadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>,
    dataSource: DataSource,
    onProgress?: (progress: DuckDBImportProgress) => void,
    options?: {
      convertToParquet?: boolean;
    }
  ): Promise<DuckDBImportResult> {
    const startTime = performance.now();
    const errors: string[] = [];
    let totalRowsImported = 0;
    const allHeaders = new Set<string>();

    try {
      onProgress?.({
        current: 0,
        total: files.length,
        phase: 'preparing',
        message: `Preparing to import ${files.length} files...`
      });

      // First pass: collect all unique headers
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        const text = await file.text();
        const lines = text.split('\n');
        
        if (lines.length > 3) {
          // Get header line (1st row, index 0) - Parameter IDs
          const headerLine = lines[0];
          const headers = headerLine.split(',').map(h => h.trim());
          
          // Skip the first column (timestamp) and process other headers
          for (let i = 1; i < headers.length; i++) {
            const header = headers[i];
            if (header && header !== '') {
              allHeaders.add(header);
            }
          }
        }
      }

      const uniqueHeaders = Array.from(allHeaders);
      
      // First, save metadata to IndexedDB to get the actual ID
      const importedAt = new Date();
      
      // Detect data range from first file for metadata
      let dataStartTime: Date | undefined;
      let dataEndTime: Date | undefined;
      
      if (files.length > 0) {
        const firstFileText = await files[0].text();
        const lines = firstFileText.split('\n').filter(line => line.trim());
        if (lines.length > 3) {
          const firstDataLine = lines[3];
          const firstTimestamp = firstDataLine.split(',')[0]?.trim();
          if (firstTimestamp) {
            dataStartTime = new Date(firstTimestamp);
          }
          
          const lastDataLine = lines[lines.length - 1];
          const lastTimestamp = lastDataLine.split(',')[0]?.trim();
          if (lastTimestamp) {
            dataEndTime = new Date(lastTimestamp);
          }
        }
      }
      
      const dataKey = generateDataKey({
        plant: metadata.plant,
        machineNo: metadata.machineNo,
        dataSource: metadata.dataSource,
        dataStartTime: metadata.dataStartTime || dataStartTime || new Date(),
        dataEndTime: metadata.dataEndTime || dataEndTime || new Date(),
        importedAt: importedAt
      });

      const metadataId = await db.metadata.add({
        ...metadata,
        dataKey,
        importedAt,
        dataStartTime: metadata.dataStartTime || dataStartTime || new Date(),
        dataEndTime: metadata.dataEndTime || dataEndTime || new Date()
      });
      
      const tableName = `timeseries_${metadataId}`;
      
      // Create column definitions with proper naming and deduplication
      const columnNameMap = new Map<string, number>();
      const actualColumnNames: string[] = [];
      const columnDefs = uniqueHeaders.map((header) => {
        // Handle duplicate column names
        let columnName = header;
        const count = columnNameMap.get(header) || 0;
        if (count > 0) {
          columnName = `${header}_${count + 1}`;
        }
        columnNameMap.set(header, count + 1);
        
        // Store the actual column name for later use
        actualColumnNames.push(columnName);
        
        // Escape column name
        const escapedName = `"${columnName.replace(/"/g, '""')}"`;
        
        if (header.toLowerCase().includes('timestamp') || header.toLowerCase().includes('time')) {
          return `${escapedName} TIMESTAMP`;
        }
        return `${escapedName} DOUBLE`;
      }).join(', ');

      await this.connection!.query(`
        CREATE TABLE ${tableName} (
          metadata_id INTEGER,
          timestamp TIMESTAMP,
          ${columnDefs}
        )
      `);

      // Import each file
      
      for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
        const file = files[fileIndex];
        onProgress?.({
          current: fileIndex,
          total: files.length,
          phase: 'importing',
          message: `Importing file ${fileIndex + 1} of ${files.length}: ${file.name}`
        });

        const rowsImported = await this.importSingleFile(
          file,
          tableName,
          metadataId as number,
          uniqueHeaders,
          actualColumnNames,
          (progress) => {
            // Calculate overall progress
            const fileProgress = (fileIndex + progress / 100) / files.length;
            onProgress?.({
              current: fileProgress * 100,
              total: 100,
              phase: 'importing',
              message: `Importing ${file.name}: ${progress}%`
            });
          }
        );

        totalRowsImported += rowsImported;
      }

      // Create indexes
      onProgress?.({
        current: 90,
        total: 100,
        phase: 'indexing',
        message: 'Creating indexes...'
      });

      if (uniqueHeaders.some(h => h.toLowerCase() === 'timestamp')) {
        await this.connection!.query(`
          CREATE INDEX idx_${tableName}_timestamp 
          ON ${tableName}(timestamp)
        `);
      }

      // Register table in schema tracker with actual column names
      duckDBSchemaTracker.registerTable(metadataId as number, actualColumnNames, totalRowsImported);
      
      // Save parameter information to IndexedDB
      try {
        // Get parameter info from CSV headers
        const firstFile = files[0];
        const firstFileText = await firstFile.text();
        const lines = firstFileText.split('\n');
        
        if (lines.length >= 3) {
          const parameterIds = lines[0].split(',').slice(1).map(h => h.trim());
          const parameterNames = lines[1].split(',').slice(1).map(h => h.trim());
          const units = lines[2].split(',').slice(1).map(h => h.trim());
          
          const parameters: ParameterInfo[] = [];
          
          for (let i = 0; i < parameterIds.length; i++) {
            if (parameterIds[i] && parameterIds[i] !== '' && 
                parameterNames[i] && parameterNames[i] !== '-' &&
                units[i] && units[i] !== '-') {
              parameters.push({
                parameterId: parameterIds[i],
                parameterName: parameterNames[i],
                unit: units[i],
                plant: metadata.plant,
                machineNo: metadata.machineNo
              });
            }
          }
          
          if (parameters.length > 0) {
            await db.parameters.bulkPut(parameters);
            console.log(`[DuckDBCsvImporter] Saved ${parameters.length} parameters to IndexedDB`);
          }
        }
      } catch (err) {
        console.warn('[DuckDBCsvImporter] Failed to save parameters:', err);
      }

      const duration = performance.now() - startTime;

      // Convert to Parquet if requested
      let parquetFileId: string | undefined;
      if (options?.convertToParquet) {
        onProgress?.({
          current: 95,
          total: 100,
          phase: 'indexing',
          message: 'Converting to Parquet format...'
        });

        try {
          const parquetManager = createParquetDataManager(this.connection!);
          const metadataRecord = await db.metadata.get(metadataId as number);
          
          if (metadataRecord) {
            const parquetResult = await parquetManager.convertTableToParquet(
              tableName,
              metadataId as number,
              metadataRecord,
              { compression: 'snappy' }
            );

            if (parquetResult.success) {
              parquetFileId = parquetResult.parquetFileId;
              console.log(`[DuckDBCsvImporter] Successfully converted to Parquet: ${parquetResult.filename}`);
              
              // Keep the DuckDB table for now - Parquet serves as backup
              // await this.connection!.query(`DROP TABLE ${tableName}`);
              console.log(`[DuckDBCsvImporter] Keeping DuckDB table ${tableName} in memory along with Parquet backup`);
            }
          }
        } catch (err) {
          console.error('[DuckDBCsvImporter] Failed to convert to Parquet:', err);
          errors.push(`Parquet conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      onProgress?.({
        current: 100,
        total: 100,
        phase: 'completed',
        message: `Import completed: ${totalRowsImported} rows from ${files.length} files in ${duration.toFixed(0)}ms`
      });

      return {
        success: true,
        metadataId: metadataId as number,
        tableName,
        rowCount: totalRowsImported,
        columnCount: uniqueHeaders.length,
        duration,
        errors,
        parquetFileId
      };

    } catch (error) {
      console.error('[DuckDBCsvImporter] Import failed:', error);
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        metadataId: 0,
        tableName: '',
        rowCount: 0,
        columnCount: 0,
        duration: performance.now() - startTime,
        errors
      };
    }
  }

  /**
   * Import single CSV file data into existing table
   */
  private async importSingleFile(
    file: File,
    tableName: string,
    metadataId: number,
    allHeaders: string[],
    actualColumnNames: string[],
    onProgress?: (progress: number) => void
  ): Promise<number> {
    const text = await file.text();
    const lines = text.split('\n');
    
    // Skip header rows
    const dataStartIndex = 3;
    // Get parameter IDs from first row
    const rawHeaders = lines[0].split(',').map(h => h.trim());
    // Keep track of original indices for non-empty headers
    const headerMapping = new Map<string, number>();
    rawHeaders.forEach((h, index) => {
      if (h && h !== '') {
        headerMapping.set(h, index);
      }
    });
    
    // Import data in batches
    const batchSize = 1000;
    let importedRows = 0;
    
    for (let i = dataStartIndex; i < lines.length; i += batchSize) {
      const batch = lines.slice(i, Math.min(i + batchSize, lines.length))
        .filter(line => line.trim() !== '');
      
      if (batch.length === 0) continue;
      
      const values = batch.map((line, batchIndex) => {
        const cols = line.split(',').map(col => col.trim());
        const valueList = [metadataId.toString()];
        
        // Add timestamp (first column)
        const timestampValue = cols[0];
        // Debug: Log first few timestamps to understand format
        const currentRowNumber = importedRows + batchIndex + 1;
        if (currentRowNumber <= 5) {
          console.log(`[DuckDBCsvImporter] Row ${currentRowNumber} timestamp from CSV:`, timestampValue);
        }
        // Force timestamp to be interpreted as local time by removing any timezone info
        valueList.push(timestampValue ? `TIMESTAMP '${timestampValue}'::TIMESTAMP` : 'NULL');
        
        // Map values to all headers, using NULL for missing columns
        allHeaders.forEach((header) => {
          const originalIndex = headerMapping.get(header);
          
          if (originalIndex === undefined) {
            valueList.push('NULL');
          } else {
            const col = cols[originalIndex];
            if (header.toLowerCase().includes('timestamp') || header.toLowerCase().includes('time')) {
              valueList.push(col ? `TIMESTAMP '${col}'` : 'NULL');
            } else if (!col || col === '') {
              valueList.push('NULL');
            } else {
              valueList.push(col);
            }
          }
        });
        
        return `(${valueList.join(', ')})`;
      }).join(', ');
      
      try {
        // Build column list for INSERT using actual column names from table creation
        const columnList = ['metadata_id', 'timestamp', ...actualColumnNames.map(name => `"${name.replace(/"/g, '""')}"`)].join(', ');
        
        await this.connection!.query(`
          INSERT INTO ${tableName} (${columnList}) VALUES ${values}
        `);
        importedRows += batch.length;
        
        const progress = (importedRows / (lines.length - dataStartIndex)) * 100;
        onProgress?.(progress);
      } catch (err) {
        console.warn(`[DuckDBCsvImporter] Failed to import batch at line ${i}:`, err);
      }
    }

    return importedRows;
  }

  /**
   * Import CSV file directly to DuckDB
   */
  async importCsv(
    file: File,
    metadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>,
    dataSource: DataSource,
    onProgress?: (progress: DuckDBImportProgress) => void,
    options?: {
      convertToParquet?: boolean;
    }
  ): Promise<DuckDBImportResult> {
    const startTime = performance.now();
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
      // Get parameter IDs from first row
      const allHeaders = lines[0].split(',').map(h => h.trim());
      // Skip first column (timestamp) and filter empty headers
      const headers = allHeaders.slice(1).filter(h => h && h !== '');
      
      // Detect data range for metadata
      let dataStartTime: Date | undefined;
      let dataEndTime: Date | undefined;
      
      if (lines.length > dataStartIndex) {
        const firstDataLine = lines[dataStartIndex];
        const firstTimestamp = firstDataLine.split(',')[0]?.trim();
        if (firstTimestamp) {
          dataStartTime = new Date(firstTimestamp);
        }
        
        const lastDataLine = lines[lines.length - 1];
        const lastTimestamp = lastDataLine.split(',')[0]?.trim();
        if (lastTimestamp) {
          dataEndTime = new Date(lastTimestamp);
        }
      }
      
      // Save metadata to IndexedDB first to get the ID
      const importedAt = new Date();
      const dataKey = generateDataKey({
        plant: metadata.plant,
        machineNo: metadata.machineNo,
        dataSource: metadata.dataSource,
        dataStartTime: metadata.dataStartTime || dataStartTime || new Date(),
        dataEndTime: metadata.dataEndTime || dataEndTime || new Date(),
        importedAt: importedAt
      });

      const metadataId = await db.metadata.add({
        ...metadata,
        dataKey,
        importedAt,
        dataStartTime: metadata.dataStartTime || dataStartTime || new Date(),
        dataEndTime: metadata.dataEndTime || dataEndTime || new Date()
      });
      
      const tableName = `timeseries_${metadataId}`;
      
      // Create column definitions with proper naming and deduplication
      const columnNameMap = new Map<string, number>();
      const actualColumnNames: string[] = [];
      const columnDefs = headers.map((header) => {
        // Handle duplicate column names
        let columnName = header;
        const count = columnNameMap.get(header) || 0;
        if (count > 0) {
          columnName = `${header}_${count + 1}`;
        }
        columnNameMap.set(header, count + 1);
        
        // Store the actual column name for later use
        actualColumnNames.push(columnName);
        
        // Escape column name
        const escapedName = `"${columnName.replace(/"/g, '""')}"`;
        
        if (header.toLowerCase().includes('timestamp') || header.toLowerCase().includes('time')) {
          return `${escapedName} TIMESTAMP`;
        }
        return `${escapedName} DOUBLE`;
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
          timestamp TIMESTAMP,
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
      const batchSize = 1000;
      let importedRows = 0;
      
      for (let i = dataStartIndex; i < lines.length; i += batchSize) {
        const batch = lines.slice(i, Math.min(i + batchSize, lines.length))
          .filter(line => line.trim() !== '');
        
        if (batch.length === 0) continue;
        
        const values = batch.map((line, batchIndex) => {
          const cols = line.split(',').map(col => col.trim());
          const valueList = [metadataId.toString()];
          
          // Add timestamp (first column)
          const timestampValue = cols[0];
          // Debug: Log first few timestamps to understand format
          const currentRowNumber = importedRows + batchIndex + 1;
          if (currentRowNumber <= 5) {
            console.log(`[DuckDBCsvImporter] Row ${currentRowNumber} timestamp from CSV:`, timestampValue);
          }
          // Force timestamp to be interpreted as local time by removing any timezone info
          valueList.push(timestampValue ? `TIMESTAMP '${timestampValue}'::TIMESTAMP` : 'NULL');
          
          // Process remaining columns (skip timestamp at index 0)
          headers.forEach((header, headerIndex) => {
            // Original column index is headerIndex + 1 (because we skipped timestamp)
            const colIndex = headerIndex + 1;
            const col = cols[colIndex];
            
            if (header.toLowerCase().includes('timestamp') || header.toLowerCase().includes('time')) {
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
          // Build column list for INSERT using actual column names from table creation
          const columnList = ['metadata_id', 'timestamp', ...actualColumnNames.map(name => `"${name.replace(/"/g, '""')}"`)].join(', ');
          
          await this.connection!.query(`
            INSERT INTO ${tableName} (${columnList}) VALUES ${values}
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

      // Register table in schema tracker with actual column names
      duckDBSchemaTracker.registerTable(metadataId as number, actualColumnNames, rowCount);
      
      // Save parameter information to IndexedDB
      try {
        if (lines.length >= 3) {
          const parameterIds = lines[0].split(',').slice(1).map(h => h.trim());
          const parameterNames = lines[1].split(',').slice(1).map(h => h.trim());
          const units = lines[2].split(',').slice(1).map(h => h.trim());
          
          const parameters: ParameterInfo[] = [];
          
          for (let i = 0; i < parameterIds.length; i++) {
            if (parameterIds[i] && parameterIds[i] !== '' && 
                parameterNames[i] && parameterNames[i] !== '-' &&
                units[i] && units[i] !== '-') {
              parameters.push({
                parameterId: parameterIds[i],
                parameterName: parameterNames[i],
                unit: units[i],
                plant: metadata.plant,
                machineNo: metadata.machineNo
              });
            }
          }
          
          if (parameters.length > 0) {
            await db.parameters.bulkPut(parameters);
            console.log(`[DuckDBCsvImporter] Saved ${parameters.length} parameters to IndexedDB`);
          }
        }
      } catch (err) {
        console.warn('[DuckDBCsvImporter] Failed to save parameters:', err);
      }

      const duration = performance.now() - startTime;

      // Convert to Parquet if requested
      let parquetFileId: string | undefined;
      if (options?.convertToParquet) {
        onProgress?.({
          current: 95,
          total: 100,
          phase: 'indexing',
          message: 'Converting to Parquet format...'
        });

        try {
          const parquetManager = createParquetDataManager(this.connection!);
          const metadataRecord = await db.metadata.get(metadataId as number);
          
          if (metadataRecord) {
            const parquetResult = await parquetManager.convertTableToParquet(
              tableName,
              metadataId as number,
              metadataRecord,
              { compression: 'snappy' }
            );

            if (parquetResult.success) {
              parquetFileId = parquetResult.parquetFileId;
              console.log(`[DuckDBCsvImporter] Successfully converted to Parquet: ${parquetResult.filename}`);
              
              // Keep the DuckDB table for now - Parquet serves as backup
              // await this.connection!.query(`DROP TABLE ${tableName}`);
              console.log(`[DuckDBCsvImporter] Keeping DuckDB table ${tableName} in memory along with Parquet backup`);
            }
          }
        } catch (err) {
          console.error('[DuckDBCsvImporter] Failed to convert to Parquet:', err);
          errors.push(`Parquet conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      onProgress?.({
        current: 100,
        total: 100,
        phase: 'completed',
        message: `Import completed: ${rowCount} rows in ${duration.toFixed(0)}ms`
      });

      return {
        success: true,
        metadataId: metadataId as number,
        tableName,
        rowCount,
        columnCount: headers.length,
        duration,
        errors,
        parquetFileId
      };

    } catch (error) {
      console.error('[DuckDBCsvImporter] Import failed:', error);
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        metadataId: 0,
        tableName: '',
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
        tableName: '',
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