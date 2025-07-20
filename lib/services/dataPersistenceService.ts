/**
 * Data Persistence Service
 * 
 * Handles persisting DuckDB table data to IndexedDB for offline usage
 * Implements chunked storage with compression for efficient storage
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { db } from '@/lib/db';
import pako from 'pako';

export interface DataChunk {
  id?: string;
  metadataId: number;
  chunkIndex: number;
  compressedData: Blob;
  rowCount: number;
  startRow: number;
  endRow: number;
  startTimestamp?: Date;
  endTimestamp?: Date;
  columns: string[];
  compressionType: 'gzip' | 'none';
  createdAt: Date;
}

export interface PersistenceProgress {
  phase: 'preparing' | 'chunking' | 'compressing' | 'saving' | 'completed';
  current: number;
  total: number;
  message: string;
}

export interface RestorationProgress {
  phase: 'loading' | 'decompressing' | 'importing' | 'indexing' | 'completed';
  current: number;
  total: number;
  message: string;
}

export class DataPersistenceService {
  private connection: duckdb.AsyncDuckDBConnection;
  private chunkSize: number = 10000; // Rows per chunk
  
  constructor(connection: duckdb.AsyncDuckDBConnection) {
    this.connection = connection;
  }

  /**
   * Persist a DuckDB table to IndexedDB in chunks
   */
  async persistTable(
    metadataId: number,
    onProgress?: (progress: PersistenceProgress) => void
  ): Promise<{ success: boolean; chunksCreated: number; error?: string }> {
    const startTime = performance.now();
    const tableName = `timeseries_${metadataId}`;
    
    try {
      onProgress?.({
        phase: 'preparing',
        current: 0,
        total: 100,
        message: 'Analyzing table structure...'
      });

      // Check if table exists
      try {
        await this.connection.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
      } catch {
        console.error(`[DataPersistence] Table ${tableName} does not exist`);
        return {
          success: false,
          chunksCreated: 0,
          error: 'データがメモリに読み込まれていません。先に「復元」ボタンでデータを復元してください。'
        };
      }

      // Get table info
      const tableInfoResult = await this.connection.query(`
        SELECT COUNT(*) as total_rows
        FROM ${tableName}
      `);
      const totalRows = tableInfoResult.toArray()[0].total_rows;

      // Get column names
      const columnsResult = await this.connection.query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${tableName}'
        AND column_name NOT IN ('metadata_id')
        ORDER BY ordinal_position
      `);
      const columns = columnsResult.toArray().map((row: {column_name: string}) => row.column_name);

      console.log(`[DataPersistence] Persisting table ${tableName}: ${totalRows} rows, ${columns.length} columns`);

      // Clear existing chunks for this metadata
      await this.clearChunks(metadataId);

      // Process table in chunks
      const totalChunks = Math.ceil(totalRows / this.chunkSize);
      let chunksCreated = 0;

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const startRow = chunkIndex * this.chunkSize;
        const endRow = Math.min(startRow + this.chunkSize, totalRows);
        
        onProgress?.({
          phase: 'chunking',
          current: (chunkIndex / totalChunks) * 50,
          total: 100,
          message: `Processing chunk ${chunkIndex + 1} of ${totalChunks}...`
        });

        // Fetch chunk data
        const chunkResult = await this.connection.query(`
          SELECT ${columns.map(col => `"${col}"`).join(', ')}
          FROM ${tableName}
          ORDER BY timestamp
          LIMIT ${this.chunkSize}
          OFFSET ${startRow}
        `);

        const chunkData = chunkResult.toArray();
        
        // Get timestamp range for this chunk
        let startTimestamp: Date | undefined;
        let endTimestamp: Date | undefined;
        
        if (chunkData.length > 0 && 'timestamp' in chunkData[0]) {
          startTimestamp = new Date(chunkData[0].timestamp);
          endTimestamp = new Date(chunkData[chunkData.length - 1].timestamp);
        }

        onProgress?.({
          phase: 'compressing',
          current: 50 + (chunkIndex / totalChunks) * 30,
          total: 100,
          message: `Compressing chunk ${chunkIndex + 1}...`
        });

        // Compress chunk data
        const jsonData = JSON.stringify(chunkData);
        const compressed = pako.gzip(jsonData);
        const compressedBlob = new Blob([compressed], { type: 'application/gzip' });

        onProgress?.({
          phase: 'saving',
          current: 80 + (chunkIndex / totalChunks) * 20,
          total: 100,
          message: `Saving chunk ${chunkIndex + 1} to storage...`
        });

        // Save chunk to IndexedDB
        const chunk: DataChunk = {
          metadataId,
          chunkIndex,
          compressedData: compressedBlob,
          rowCount: chunkData.length,
          startRow,
          endRow: endRow - 1,
          startTimestamp,
          endTimestamp,
          columns,
          compressionType: 'gzip',
          createdAt: new Date()
        };

        await db.dataChunks.add(chunk);
        chunksCreated++;
      }

      const duration = performance.now() - startTime;
      console.log(`[DataPersistence] Successfully persisted ${totalRows} rows in ${chunksCreated} chunks (${duration.toFixed(0)}ms)`);

      onProgress?.({
        phase: 'completed',
        current: 100,
        total: 100,
        message: `Persistence completed: ${chunksCreated} chunks created`
      });

      return { success: true, chunksCreated };

    } catch (error) {
      console.error('[DataPersistence] Persistence failed:', error);
      return { 
        success: false, 
        chunksCreated: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Restore a table from IndexedDB chunks back to DuckDB
   */
  async restoreTable(
    metadataId: number,
    onProgress?: (progress: RestorationProgress) => void
  ): Promise<{ success: boolean; rowsRestored: number; error?: string }> {
    const startTime = performance.now();
    const tableName = `timeseries_${metadataId}`;
    
    try {
      onProgress?.({
        phase: 'loading',
        current: 0,
        total: 100,
        message: 'Loading data chunks from storage...'
      });

      // Get all chunks for this metadata
      const chunks = await db.dataChunks
        .where('metadataId')
        .equals(metadataId)
        .sortBy('chunkIndex');

      if (chunks.length === 0) {
        return { 
          success: false, 
          rowsRestored: 0, 
          error: 'No data chunks found for this metadata' 
        };
      }

      console.log(`[DataPersistence] Restoring ${chunks.length} chunks for table ${tableName}`);

      // Get columns from first chunk
      const columns = chunks[0].columns;
      
      // Create table schema
      const columnDefs = columns.map(col => {
        if (col === 'timestamp' || col.toLowerCase().includes('time')) {
          return `"${col}" TIMESTAMP`;
        }
        return `"${col}" DOUBLE`;
      }).join(', ');

      // Drop existing table if exists
      try {
        await this.connection.query(`DROP TABLE IF EXISTS ${tableName}`);
      } catch {
        // Table might not exist, continue
      }

      // Create new table
      await this.connection.query(`
        CREATE TABLE ${tableName} (
          metadata_id INTEGER,
          ${columnDefs}
        )
      `);

      let totalRowsRestored = 0;

      // Process each chunk
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        
        onProgress?.({
          phase: 'decompressing',
          current: (i / chunks.length) * 60,
          total: 100,
          message: `Decompressing chunk ${i + 1} of ${chunks.length}...`
        });

        // Decompress chunk data
        const compressedArray = await chunk.compressedData.arrayBuffer();
        const decompressed = pako.ungzip(new Uint8Array(compressedArray));
        const jsonData = new TextDecoder().decode(decompressed);
        const chunkData = JSON.parse(jsonData);

        onProgress?.({
          phase: 'importing',
          current: 60 + (i / chunks.length) * 30,
          total: 100,
          message: `Importing chunk ${i + 1} (${chunkData.length} rows)...`
        });

        // Import data in batches
        const batchSize = 1000;
        for (let j = 0; j < chunkData.length; j += batchSize) {
          const batch = chunkData.slice(j, Math.min(j + batchSize, chunkData.length));
          
          const values = batch.map((row: Record<string, unknown>) => {
            const valueList: (string | number)[] = [metadataId];
            
            columns.forEach(col => {
              const value = row[col];
              if (value === null || value === undefined) {
                valueList.push('NULL');
              } else if (col === 'timestamp' || col.toLowerCase().includes('time')) {
                // Handle timestamp values
                if (typeof value === 'number') {
                  // Epoch milliseconds - convert to timestamp
                  const date = new Date(value);
                  const isoString = date.toISOString().replace('T', ' ').slice(0, -1);
                  valueList.push(`TIMESTAMP '${isoString}'`);
                } else {
                  valueList.push(`TIMESTAMP '${value}'`);
                }
              } else {
                valueList.push(String(value));
              }
            });
            
            return `(${valueList.join(', ')})`;
          }).join(', ');

          const columnList = ['metadata_id', ...columns.map(col => `"${col}"`)].join(', ');
          
          await this.connection.query(`
            INSERT INTO ${tableName} (${columnList}) VALUES ${values}
          `);
          
          totalRowsRestored += batch.length;
        }
      }

      onProgress?.({
        phase: 'indexing',
        current: 90,
        total: 100,
        message: 'Creating indexes...'
      });

      // Create indexes
      await this.connection.query(`
        CREATE INDEX idx_${tableName}_timestamp 
        ON ${tableName}(timestamp)
      `);

      const duration = performance.now() - startTime;
      console.log(`[DataPersistence] Successfully restored ${totalRowsRestored} rows in ${duration.toFixed(0)}ms`);

      onProgress?.({
        phase: 'completed',
        current: 100,
        total: 100,
        message: `Restoration completed: ${totalRowsRestored} rows restored`
      });

      // Register table in schema tracker
      const { duckDBSchemaTracker } = await import('./duckdbSchemaTracker');
      duckDBSchemaTracker.registerTable(metadataId, columns.filter(col => col !== 'timestamp'), totalRowsRestored);

      return { success: true, rowsRestored: totalRowsRestored };

    } catch (error) {
      console.error('[DataPersistence] Restoration failed:', error);
      return { 
        success: false, 
        rowsRestored: 0, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      };
    }
  }

  /**
   * Clear all chunks for a specific metadata ID
   */
  async clearChunks(metadataId: number): Promise<void> {
    await db.dataChunks
      .where('metadataId')
      .equals(metadataId)
      .delete();
  }

  /**
   * Get persistence status for a metadata ID
   */
  async getPersistenceStatus(metadataId: number): Promise<{
    isPersisted: boolean;
    chunkCount: number;
    totalRows: number;
    totalSize: number;
    lastUpdated?: Date;
  }> {
    const chunks = await db.dataChunks
      .where('metadataId')
      .equals(metadataId)
      .toArray();

    if (chunks.length === 0) {
      return {
        isPersisted: false,
        chunkCount: 0,
        totalRows: 0,
        totalSize: 0
      };
    }

    let totalRows = 0;
    let totalSize = 0;
    let lastUpdated = chunks[0].createdAt;

    for (const chunk of chunks) {
      totalRows += chunk.rowCount;
      totalSize += chunk.compressedData.size;
      if (chunk.createdAt > lastUpdated) {
        lastUpdated = chunk.createdAt;
      }
    }

    return {
      isPersisted: true,
      chunkCount: chunks.length,
      totalRows,
      totalSize,
      lastUpdated
    };
  }

  /**
   * Get all persisted metadata IDs
   */
  async getPersistedMetadataIds(): Promise<number[]> {
    const chunks = await db.dataChunks.toArray();
    const metadataIds = new Set(chunks.map(chunk => chunk.metadataId));
    return Array.from(metadataIds);
  }

  /**
   * Calculate storage usage
   */
  async getStorageUsage(): Promise<{
    totalSize: number;
    metadataCount: number;
    chunkCount: number;
  }> {
    const chunks = await db.dataChunks.toArray();
    
    let totalSize = 0;
    const metadataIds = new Set<number>();
    
    for (const chunk of chunks) {
      totalSize += chunk.compressedData.size;
      metadataIds.add(chunk.metadataId);
    }

    return {
      totalSize,
      metadataCount: metadataIds.size,
      chunkCount: chunks.length
    };
  }

  /**
   * Check if a table exists in DuckDB
   */
  async isTableInMemory(metadataId: number): Promise<boolean> {
    const tableName = `timeseries_${metadataId}`;
    try {
      await this.connection.query(`SELECT 1 FROM ${tableName} LIMIT 1`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get data for upload from persisted chunks
   */
  async getDataForUpload(metadataId: number): Promise<{
    data: Array<{ timestamp: Date; [key: string]: unknown }>;
    columns: string[];
  }> {
    const chunks = await db.dataChunks
      .where('metadataId')
      .equals(metadataId)
      .sortBy('chunkIndex');

    if (chunks.length === 0) {
      throw new Error('No persisted data found for upload');
    }

    const allData: Array<{ timestamp: Date; [key: string]: unknown }> = [];
    const columns = chunks[0].columns.filter(col => col !== 'timestamp');

    for (const chunk of chunks) {
      // Decompress chunk
      const decompressed = await this.decompressChunk(chunk);
      const rows = JSON.parse(decompressed);

      // Convert each row to the expected format
      for (const row of rows) {
        const dataRow: { timestamp: Date; [key: string]: unknown } = {
          timestamp: new Date(row.timestamp)
        };

        // Add all parameter columns
        for (const col of columns) {
          dataRow[col] = row[col] ?? null;
        }

        allData.push(dataRow);
      }
    }

    return { data: allData, columns };
  }

  /**
   * Decompress a data chunk
   */
  private async decompressChunk(chunk: DataChunk): Promise<string> {
    const compressedArray = await chunk.compressedData.arrayBuffer();
    const decompressed = pako.ungzip(new Uint8Array(compressedArray));
    return new TextDecoder().decode(decompressed);
  }
}

// Factory function
export function createDataPersistenceService(connection: duckdb.AsyncDuckDBConnection): DataPersistenceService {
  return new DataPersistenceService(connection);
}