/**
 * CSV File Reader Service
 * 
 * Handles CSV file reading and initial parsing
 * Extracted from duckdbCsvImporter.ts
 */

import { parseCsvFile, extractUniqueHeaders, getDataRange } from '@/lib/utils/csvParser';
import { Metadata } from '@/lib/db/schema';

export interface CsvFileInfo {
  file: File;
  headers: string[];
  parameterIds: string[];
  parameterNames: string[];
  rowCount: number;
  firstTimestamp?: string;
  lastTimestamp?: string;
}

export interface CsvReadResult {
  files: CsvFileInfo[];
  allHeaders: Set<string>;
  dataRange: {
    startTime?: Date;
    endTime?: Date;
  };
  totalRows: number;
}

export class CsvFileReader {
  /**
   * Read and analyze multiple CSV files
   */
  async readMultipleFiles(
    files: File[],
    onProgress?: (current: number, total: number) => void
  ): Promise<CsvReadResult> {
    const fileInfos: CsvFileInfo[] = [];
    let totalRows = 0;

    // Process each file
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      onProgress?.(i, files.length);

      try {
        const parseResult = await parseCsvFile(file);
        
        const fileInfo: CsvFileInfo = {
          file,
          headers: parseResult.headers,
          parameterIds: parseResult.parameterIds,
          parameterNames: parseResult.parameterNames,
          rowCount: parseResult.timestamps.length,
          firstTimestamp: parseResult.timestamps[0],
          lastTimestamp: parseResult.timestamps[parseResult.timestamps.length - 1]
        };

        fileInfos.push(fileInfo);
        totalRows += fileInfo.rowCount;
      } catch (error) {
        console.error(`[CsvFileReader] Failed to read file ${file.name}:`, error);
        throw new Error(`Failed to read ${file.name}: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    // Extract unique headers
    const allHeaders = await extractUniqueHeaders(files);
    
    // Get data range
    const dataRange = await getDataRange(files);

    onProgress?.(files.length, files.length);

    return {
      files: fileInfos,
      allHeaders,
      dataRange,
      totalRows
    };
  }

  /**
   * Validate CSV files
   */
  async validateFiles(files: File[]): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    const errors: string[] = [];

    if (files.length === 0) {
      errors.push('No files provided');
      return { valid: false, errors };
    }

    // Check each file
    for (const file of files) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        errors.push(`${file.name} is not a CSV file`);
      }

      if (file.size === 0) {
        errors.push(`${file.name} is empty`);
      }

      // Try to parse the file
      try {
        const result = await parseCsvFile(file);
        if (result.timestamps.length === 0) {
          errors.push(`${file.name} contains no data rows`);
        }
      } catch (error) {
        errors.push(`${file.name}: ${error instanceof Error ? error.message : 'Invalid format'}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Create metadata from file information
   */
  createMetadata(
    baseMetadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>,
    dataRange: { startTime?: Date; endTime?: Date },
    totalRows: number
  ): Metadata {
    const importedAt = new Date();
    
    return {
      ...baseMetadata,
      importedAt,
      dataKey: '', // Will be generated later
      dataStartTime: dataRange.startTime,
      dataEndTime: dataRange.endTime,
      recordCount: totalRows
    } as Metadata;
  }

  /**
   * Read file in batches for streaming processing
   */
  async *readFileInBatches(
    file: File,
    batchSize: number = 1000
  ): AsyncGenerator<{
    timestamps: string[];
    data: string[][];
    batchIndex: number;
    isLastBatch: boolean;
  }> {
    const text = await file.text();
    const lines = text.split('\n').filter(line => line.trim());
    
    // Skip header rows (3 rows)
    const dataLines = lines.slice(3);
    let batchIndex = 0;

    for (let i = 0; i < dataLines.length; i += batchSize) {
      const batchEnd = Math.min(i + batchSize, dataLines.length);
      const batchLines = dataLines.slice(i, batchEnd);
      
      const timestamps: string[] = [];
      const data: string[][] = [];

      for (const line of batchLines) {
        const values = line.split(',').map(v => v.trim());
        if (values.length > 0 && values[0]) {
          timestamps.push(values[0]);
          data.push(values.slice(1));
        }
      }

      yield {
        timestamps,
        data,
        batchIndex: batchIndex++,
        isLastBatch: batchEnd >= dataLines.length
      };
    }
  }
}