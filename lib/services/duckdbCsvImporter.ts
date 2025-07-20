/**
 * DuckDB CSV Importer
 * 
 * Direct CSV import to DuckDB using modular services
 * Orchestrates CSV reading, table creation, data insertion, and parameter saving
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { Metadata, DataSource } from '@/lib/db/schema';
import { duckDBSchemaTracker } from './duckdbSchemaTracker';
import { db } from '@/lib/db';
import { generateDataKey } from '@/lib/utils/dataKeyUtils';
import { createParquetDataManager } from './parquetDataManager';

// Import modular services
import { CsvFileReader } from './import/csvFileReader';
import { TableManager } from './import/tableManager';
import { DataInserter } from './import/dataInserter';
import { ParameterSaver } from './import/parameterSaver';
import { ProgressTracker } from './import/progressTracker';

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
  private connection: duckdb.AsyncDuckDBConnection;
  private csvReader: CsvFileReader;
  private tableManager: TableManager;
  private dataInserter: DataInserter;
  private parameterSaver: ParameterSaver;

  constructor(connection: duckdb.AsyncDuckDBConnection) {
    this.connection = connection;
    this.csvReader = new CsvFileReader();
    this.tableManager = new TableManager({ connection });
    this.dataInserter = new DataInserter({ connection });
    this.parameterSaver = new ParameterSaver();
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
    
    // Initialize progress tracker
    const progressTracker = new ProgressTracker({
      onProgress: onProgress ? (progress) => {
        onProgress({
          current: progress.current,
          total: progress.total,
          phase: progress.phase,
          message: progress.message
        });
      } : undefined
    });

    try {
      // Phase 1: Validate and read CSV files
      progressTracker.setPhase('preparing', `Preparing to import ${files.length} files...`);
      
      const validation = await this.csvReader.validateFiles(files);
      if (!validation.valid) {
        throw new Error(`CSV validation failed: ${validation.errors.join(', ')}`);
      }

      // Read all files and extract headers
      const readResult = await this.csvReader.readMultipleFiles(
        files,
        (current, total) => {
          progressTracker.updateProgress({
            current: (current / total) * 20,
            total: 100,
            phase: 'preparing',
            message: `Reading file ${current + 1} of ${total}...`
          });
        }
      );

      const uniqueHeaders = Array.from(readResult.allHeaders);
      
      // Phase 2: Save metadata to IndexedDB
      progressTracker.updateProgress({
        current: 20,
        total: 100,
        phase: 'preparing',
        message: 'Creating metadata...'
      });
      
      const importedAt = new Date();
      const dataKey = generateDataKey({
        plant: metadata.plant,
        machineNo: metadata.machineNo,
        dataSource: metadata.dataSource,
        dataStartTime: metadata.dataStartTime || readResult.dataRange.startTime || new Date(),
        dataEndTime: metadata.dataEndTime || readResult.dataRange.endTime || new Date(),
        importedAt: importedAt
      });

      const metadataId = await db.metadata.add({
        ...metadata,
        dataKey,
        importedAt,
        dataStartTime: metadata.dataStartTime || readResult.dataRange.startTime || new Date(),
        dataEndTime: metadata.dataEndTime || readResult.dataRange.endTime || new Date()
      });
      
      // Phase 3: Create table
      progressTracker.updateProgress({
        current: 25,
        total: 100,
        phase: 'preparing',
        message: `Creating table with ${uniqueHeaders.length} columns...`
      });
      
      const tableResult = await this.tableManager.createTableForCsvData(
        metadataId as number,
        uniqueHeaders,
        { createIndexes: false } // We'll create indexes later
      );

      // Phase 4: Import data
      progressTracker.setPhase('importing');
      
      const totalRowsImported = await this.dataInserter.insertMultipleFiles(
        files,
        tableResult.tableName,
        metadataId as number,
        uniqueHeaders,
        tableResult.actualColumnNames,
        (progress) => {
          const overallProgress = 25 + (progress.currentFile - 1 + progress.currentRow / progress.totalRows) / progress.totalFiles * 60;
          progressTracker.updateProgress({
            current: overallProgress,
            total: 100,
            phase: 'importing',
            message: `Importing ${progress.fileName} (${progress.currentFile}/${progress.totalFiles}) - ${Math.round((progress.currentRow / progress.totalRows) * 100)}%`
          });
        }
      );

      // Phase 5: Create indexes
      progressTracker.updateProgress({
        current: 85,
        total: 100,
        phase: 'indexing',
        message: 'Creating indexes...'
      });

      await this.tableManager.createDefaultIndexes(tableResult.tableName);

      // Register table in schema tracker
      duckDBSchemaTracker.registerTable(metadataId as number, tableResult.actualColumnNames, totalRowsImported);
      
      // Phase 6: Save parameters
      progressTracker.updateProgress({
        current: 90,
        total: 100,
        phase: 'indexing',
        message: 'Saving parameter information...'
      });
      
      const paramResult = await this.parameterSaver.saveParametersFromFiles(files, {
        plant: metadata.plant,
        machineNo: metadata.machineNo
      });
      
      if (!paramResult.success) {
        errors.push(...paramResult.errors);
      }

      const duration = performance.now() - startTime;

      // Phase 7: Convert to Parquet if requested
      let parquetFileId: string | undefined;
      if (options?.convertToParquet) {
        progressTracker.updateProgress({
          current: 95,
          total: 100,
          phase: 'indexing',
          message: 'Converting to Parquet format...'
        });

        try {
          const parquetManager = createParquetDataManager(this.connection);
          const metadataRecord = await db.metadata.get(metadataId as number);
          
          if (metadataRecord) {
            const parquetResult = await parquetManager.convertTableToParquet(
              tableResult.tableName,
              metadataId as number,
              metadataRecord,
              { compression: 'snappy' }
            );

            if (parquetResult.success) {
              parquetFileId = parquetResult.parquetFileId;
              console.log(`[DuckDBCsvImporter] Successfully converted to Parquet: ${parquetResult.filename}`);
              console.log(`[DuckDBCsvImporter] Keeping DuckDB table ${tableResult.tableName} in memory along with Parquet backup`);
            }
          }
        } catch (err) {
          console.error('[DuckDBCsvImporter] Failed to convert to Parquet:', err);
          errors.push(`Parquet conversion failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        }
      }

      // Complete
      progressTracker.complete(undefined, {
        rowCount: totalRowsImported,
        duration,
        fileCount: files.length
      });

      return {
        success: true,
        metadataId: metadataId as number,
        tableName: tableResult.tableName,
        rowCount: totalRowsImported,
        columnCount: uniqueHeaders.length,
        duration,
        errors,
        parquetFileId
      };

    } catch (error) {
      console.error('[DuckDBCsvImporter] Import failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      errors.push(errorMessage);
      
      progressTracker.reportError(errorMessage);
      
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
   * @deprecated Use DataInserter service instead
   */
  private async importSingleFile(
    file: File,
    tableName: string,
    metadataId: number,
    allHeaders: string[],
    actualColumnNames: string[],
    onProgress?: (progress: number) => void
  ): Promise<number> {
    // This method is kept for backward compatibility
    // It now delegates to the DataInserter service
    return await this.dataInserter.insertSingleFile(
      file,
      tableName,
      metadataId,
      allHeaders,
      actualColumnNames,
      (currentRow, totalRows) => {
        const progress = (currentRow / totalRows) * 100;
        onProgress?.(progress);
      }
    );
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
    // Single file import - delegate to multiple file import with array of one
    return this.importMultipleCsvFiles(
      [file],
      metadata,
      dataSource,
      onProgress,
      options
    );
  }

  /**
   * Import CSV using external file path (for larger files)
   * @deprecated This method is not recommended for web environments
   */
  async importCsvFromPath(
    filePath: string,
    metadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>,
    onProgress?: (progress: DuckDBImportProgress) => void
  ): Promise<DuckDBImportResult> {
    const startTime = performance.now();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const errors: string[] = [];
    
    const progressTracker = new ProgressTracker({
      onProgress: onProgress ? (progress) => {
        onProgress({
          current: progress.current,
          total: progress.total,
          phase: progress.phase,
          message: progress.message
        });
      } : undefined
    });

    try {
      progressTracker.setPhase('preparing', 'Preparing file import...');
      
      // Generate metadata
      const importedAt = new Date();
      const dataKey = generateDataKey({
        plant: metadata.plant,
        machineNo: metadata.machineNo,
        dataSource: metadata.dataSource,
        dataStartTime: metadata.dataStartTime || new Date(),
        dataEndTime: metadata.dataEndTime || new Date(),
        importedAt: importedAt
      });

      const metadataId = await db.metadata.add({
        ...metadata,
        dataKey,
        importedAt
      });
      
      const tableName = `timeseries_${metadataId}`;

      // Use DuckDB's COPY statement for efficient import
      await this.connection.query(`
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
      const statsResult = await this.connection.query(`
        SELECT 
          COUNT(*) as row_count,
          COUNT(*) - 1 as column_count
        FROM duckdb_columns()
        WHERE table_name = '${tableName}'
      `);
      
      const stats = statsResult.toArray()[0];
      
      // Register table in schema tracker
      const columnsResult = await this.connection.query(`
        SELECT column_name 
        FROM duckdb_columns() 
        WHERE table_name = '${tableName}' 
        AND column_name NOT IN ('metadata_id', 'timestamp')
      `);
      
      const columns = columnsResult.toArray().map(row => row.column_name);
      duckDBSchemaTracker.registerTable(metadataId as number, columns, stats.row_count);

      const duration = performance.now() - startTime;
      
      progressTracker.complete(undefined, {
        rowCount: stats.row_count,
        duration
      });

      return {
        success: true,
        metadataId: metadataId as number,
        tableName,
        rowCount: stats.row_count,
        columnCount: stats.column_count,
        duration,
        errors: []
      };

    } catch (error) {
      console.error('[DuckDBCsvImporter] Import from path failed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      progressTracker.reportError(errorMessage);
      
      return {
        success: false,
        metadataId: 0,
        tableName: '',
        rowCount: 0,
        columnCount: 0,
        duration: performance.now() - startTime,
        errors: [errorMessage]
      };
    }
  }

  /**
   * Escape string for SQL
   * @deprecated Use sqlBuilder utilities instead
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
      const rowCount = await this.tableManager.getRowCount(tableName);
      
      // Get column count
      const columnsResult = await this.connection.query(`
        SELECT COUNT(*) as column_count
        FROM duckdb_columns()
        WHERE table_name = '${tableName}'
      `);
      
      const columnCount = columnsResult.toArray()[0]?.column_count || 0;
      
      // Estimate size (simplified - actual implementation would need more sophisticated calculation)
      const sizeInBytes = rowCount * columnCount * 8; // Rough estimate
      
      return {
        rowCount,
        columnCount,
        sizeInBytes,
        compressionRatio: 1.0
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