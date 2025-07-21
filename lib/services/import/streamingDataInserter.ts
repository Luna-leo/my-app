/**
 * Streaming Data Inserter Service
 * 
 * Memory-efficient data insertion using streaming and chunked processing
 * Handles large files without loading entire content into memory
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { escapeColumnName, formatTimestampForSql } from '@/lib/utils/sqlBuilder';
import { processCsvInBatches, parseHeadersFromStream } from '@/lib/utils/streamingCsvParser';

export interface StreamingInserterOptions {
  connection: duckdb.AsyncDuckDBConnection;
  batchSize?: number;
  chunkSize?: number; // Size of streaming chunks in bytes
  maxMemoryUsage?: number; // Maximum memory usage in bytes
}

export interface StreamingInsertProgress {
  currentFile: number;
  totalFiles: number;
  currentRow: number;
  estimatedTotalRows: number;
  fileName: string;
  memoryUsage: number;
  throughput: number; // rows per second
}

export class StreamingDataInserter {
  private connection: duckdb.AsyncDuckDBConnection;
  private batchSize: number;
  private chunkSize: number;
  private maxMemoryUsage: number;
  private startTime: number = 0;
  private rowsProcessed: number = 0;

  constructor(options: StreamingInserterOptions) {
    this.connection = options.connection;
    this.batchSize = options.batchSize || 1000;
    this.chunkSize = options.chunkSize || 1024 * 1024; // 1MB default
    this.maxMemoryUsage = options.maxMemoryUsage || 100 * 1024 * 1024; // 100MB default
  }

  /**
   * Insert data from multiple files using streaming
   */
  async insertMultipleFilesStreaming(
    files: File[],
    tableName: string,
    metadataId: number,
    allHeaders: string[],
    actualColumnNames: string[],
    onProgress?: (progress: StreamingInsertProgress) => void
  ): Promise<number> {
    let totalRowsInserted = 0;
    this.startTime = performance.now();
    this.rowsProcessed = 0;

    for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
      const file = files[fileIndex];
      
      const rowsInserted = await this.insertSingleFileStreaming(
        file,
        tableName,
        metadataId,
        allHeaders,
        actualColumnNames,
        (currentRow, estimatedTotal) => {
          const memoryUsage = this.estimateMemoryUsage();
          const throughput = this.calculateThroughput();
          
          onProgress?.({
            currentFile: fileIndex + 1,
            totalFiles: files.length,
            currentRow,
            estimatedTotalRows: estimatedTotal,
            fileName: file.name,
            memoryUsage,
            throughput
          });
        }
      );

      totalRowsInserted += rowsInserted;
    }

    return totalRowsInserted;
  }

  /**
   * Insert data from a single file using streaming
   */
  async insertSingleFileStreaming(
    file: File,
    tableName: string,
    metadataId: number,
    allHeaders: string[],
    actualColumnNames: string[],
    onProgress?: (currentRow: number, estimatedTotal: number) => void
  ): Promise<number> {
    // Parse headers to create column mapping
    const headers = await parseHeadersFromStream(file);
    const headerMapping = new Map<string, number>();
    
    // Map parameter IDs to their column indices
    headers.parameterIds.forEach((id, index) => {
      headerMapping.set(id, index + 1); // +1 because timestamp is column 0
    });

    let totalInserted = 0;
    const estimatedTotalRows = Math.ceil(file.size / 100); // Rough estimate

    // Process file in streaming batches
    await processCsvInBatches(file, {
      batchSize: this.batchSize,
      onBatch: async (batch) => {
        const values = this.prepareBatchValuesStreaming(
          batch,
          metadataId,
          allHeaders,
          headerMapping
        );

        if (values.length > 0) {
          await this.insertBatch(tableName, actualColumnNames, values);
          totalInserted += values.length;
          this.rowsProcessed += values.length;
          
          onProgress?.(totalInserted, estimatedTotalRows);
        }

        // Check memory pressure and pause if needed
        await this.checkMemoryPressure();
      },
      onProgress: (processed, total) => {
        // Update progress with more accurate total
        onProgress?.(processed, total);
      }
    });

    return totalInserted;
  }

  /**
   * Prepare batch values for insertion from streaming data
   */
  private prepareBatchValuesStreaming(
    batch: {
      timestamps: string[];
      data: string[][];
    },
    metadataId: number,
    allHeaders: string[],
    headerMapping: Map<string, number>
  ): string[][] {
    const values: string[][] = [];

    for (let i = 0; i < batch.timestamps.length; i++) {
      const timestamp = batch.timestamps[i];
      const rowData = batch.data[i];
      
      // Prepare value list
      const valueList: string[] = [
        metadataId.toString(),
        formatTimestampForSql(timestamp)
      ];

      // Map values to all headers
      allHeaders.forEach((header) => {
        const originalIndex = headerMapping.get(header);
        
        if (originalIndex === undefined || originalIndex - 1 >= rowData.length) {
          valueList.push('NULL');
        } else {
          const value = rowData[originalIndex - 1];
          
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
   * Insert a batch of data (reused from parent class)
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

    // Build VALUES clause
    const valuesClause = values
      .map(row => `(${row.join(', ')})`)
      .join(', ');

    const columnList = columns
      .map(col => escapeColumnName(col))
      .join(', ');

    const sql = `INSERT INTO ${tableName} (${columnList}) VALUES ${valuesClause}`;

    try {
      await this.connection.query(sql);
    } catch (error) {
      console.error('[StreamingDataInserter] Insert failed:', error);
      throw new Error(`Failed to insert batch: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check memory pressure and pause if needed
   */
  private async checkMemoryPressure(): Promise<void> {
    const memoryUsage = this.estimateMemoryUsage();
    
    if (memoryUsage > this.maxMemoryUsage) {
      console.log('[StreamingDataInserter] Memory pressure detected, pausing for GC');
      
      // Force garbage collection if available (V8 only)
      if (global.gc) {
        global.gc();
      }
      
      // Small delay to allow GC
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  /**
   * Estimate current memory usage
   */
  private estimateMemoryUsage(): number {
    // Check if performance.memory is available (Chrome/Edge only)
    const perf = performance as PerformanceWithMemory;
    interface PerformanceWithMemory extends Performance {
      memory?: {
        usedJSHeapSize: number;
      };
    }
    if (perf.memory && perf.memory.usedJSHeapSize) {
      return perf.memory.usedJSHeapSize;
    }
    
    // Fallback estimate based on processed rows
    return this.rowsProcessed * 100; // Rough estimate: 100 bytes per row
  }

  /**
   * Calculate processing throughput
   */
  private calculateThroughput(): number {
    const elapsedSeconds = (performance.now() - this.startTime) / 1000;
    return elapsedSeconds > 0 ? Math.round(this.rowsProcessed / elapsedSeconds) : 0;
  }

}