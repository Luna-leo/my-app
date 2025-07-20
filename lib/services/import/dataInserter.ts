/**
 * Data Inserter Service
 * 
 * Handles batch data insertion into DuckDB tables
 * Extracted from duckdbCsvImporter.ts
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { 
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildInsertStatement,
  escapeColumnName,
  formatTimestampForSql
} from '@/lib/utils/sqlBuilder';
import { CsvFileReader } from './csvFileReader';

export interface DataInserterOptions {
  connection: duckdb.AsyncDuckDBConnection;
  batchSize?: number;
}

export interface InsertProgress {
  currentFile: number;
  totalFiles: number;
  currentRow: number;
  totalRows: number;
  fileName: string;
}

export class DataInserter {
  private connection: duckdb.AsyncDuckDBConnection;
  private batchSize: number;

  constructor(options: DataInserterOptions) {
    this.connection = options.connection;
    this.batchSize = options.batchSize || 1000;
  }

  /**
   * Insert data from multiple files
   */
  async insertMultipleFiles(
    files: File[],
    tableName: string,
    metadataId: number,
    allHeaders: string[],
    actualColumnNames: string[],
    onProgress?: (progress: InsertProgress) => void
  ): Promise<number> {
    let totalRowsInserted = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const fileReader = new CsvFileReader();

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      
      const rowsInserted = await this.insertSingleFile(
        file,
        tableName,
        metadataId,
        allHeaders,
        actualColumnNames,
        (currentRow, totalRows) => {
          onProgress?.({
            currentFile: fileIndex + 1,
            totalFiles: files.length,
            currentRow,
            totalRows,
            fileName: file.name
          });
        }
      );

      totalRowsInserted += rowsInserted;
    }

    return totalRowsInserted;
  }

  /**
   * Insert data from a single file
   */
  async insertSingleFile(
    file: File,
    tableName: string,
    metadataId: number,
    allHeaders: string[],
    actualColumnNames: string[],
    onProgress?: (currentRow: number, totalRows: number) => void
  ): Promise<number> {
    const fileReader = new CsvFileReader();
    let totalInserted = 0;
    let processedRows = 0;

    // Count total rows first for progress reporting
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    const totalDataRows = Math.max(0, lines.length - 3); // Subtract header rows

    // Get header mapping
    const headerLine = lines[0];
    const rawHeaders = headerLine.split(',').map(h => h.trim());
    const headerMapping = new Map<string, number>();
    
    rawHeaders.forEach((h, index) => {
      if (h && h !== '') {
        headerMapping.set(h, index);
      }
    });

    // Process file in batches
    const batches = fileReader.readFileInBatches(file, this.batchSize);
    
    for await (const batch of batches) {
      const values = this.prepareBatchValues(
        batch,
        metadataId,
        allHeaders,
        headerMapping,
        rawHeaders
      );

      if (values.length > 0) {
        await this.insertBatch(tableName, actualColumnNames, values);
        totalInserted += values.length;
        processedRows += values.length;
        
        onProgress?.(processedRows, totalDataRows);
      }
    }

    return totalInserted;
  }

  /**
   * Prepare batch values for insertion
   */
  private prepareBatchValues(
    batch: {
      timestamps: string[];
      data: string[][];
    },
    metadataId: number,
    allHeaders: string[],
    headerMapping: Map<string, number>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    rawHeaders: string[]
  ): string[][] {
    const values: string[][] = [];

    for (let i = 0; i < batch.timestamps.length; i++) {
      const timestamp = batch.timestamps[i];
      const rowData = batch.data[i];
      
      // Build full row data
      const fullRow = [timestamp, ...rowData];
      
      // Prepare value list
      const valueList: string[] = [
        metadataId.toString(),
        formatTimestampForSql(timestamp)
      ];

      // Map values to all headers
      allHeaders.forEach((header) => {
        const originalIndex = headerMapping.get(header);
        
        if (originalIndex === undefined || originalIndex >= fullRow.length) {
          valueList.push('NULL');
        } else {
          const value = fullRow[originalIndex];
          
          if (!value || value === '') {
            valueList.push('NULL');
          } else if (header.toLowerCase().includes('timestamp') || 
                     header.toLowerCase().includes('time')) {
            valueList.push(formatTimestampForSql(value));
          } else {
            // Numeric value - insert directly without quotes
            valueList.push(value);
          }
        }
      });

      values.push(valueList);
    }

    return values;
  }

  /**
   * Insert a batch of data
   */
  private async insertBatch(
    tableName: string,
    actualColumnNames: string[],
    values: string[][]
  ): Promise<void> {
    if (values.length === 0) return;

    // Build column list
    const columns = [
      'metadata_id',
      'timestamp',
      ...actualColumnNames
    ];

    // Format values for SQL
    const formattedValues = values.map(row => {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      return row.map((val, index) => {
        // Values are already formatted (NULL, TIMESTAMP, or numeric)
        return val;
      });
    });

    // Build VALUES clause manually to avoid escaping issues
    const valuesClause = formattedValues
      .map(row => `(${row.join(', ')})`)
      .join(', ');

    const columnList = columns
      .map(col => escapeColumnName(col))
      .join(', ');

    const sql = `INSERT INTO ${tableName} (${columnList}) VALUES ${valuesClause}`;

    try {
      await this.connection.query(sql);
    } catch (error) {
      console.error('[DataInserter] Insert failed:', error);
      console.error('[DataInserter] Failed SQL (first 500 chars):', sql.substring(0, 500));
      throw new Error(`Failed to insert batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify inserted data count
   */
  async verifyInsertedCount(
    tableName: string,
    metadataId: number
  ): Promise<number> {
    try {
      const result = await this.connection.query(`
        SELECT COUNT(*) as count 
        FROM ${tableName} 
        WHERE metadata_id = ${metadataId}
      `);
      
      const rows = result.toArray();
      return rows[0]?.count || 0;
    } catch (error) {
      console.error('[DataInserter] Error verifying count:', error);
      return 0;
    }
  }
}