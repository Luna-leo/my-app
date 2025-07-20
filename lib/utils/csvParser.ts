/**
 * CSV Parser Utility
 * 
 * Common utility functions for parsing CSV files
 * Extracted from duckdbCsvImporter.ts for reusability
 */

export interface CsvParseResult {
  headers: string[];
  data: string[][];
  parameterIds: string[];
  parameterNames: string[];
  timestamps: string[];
}

/**
 * Parse CSV headers (parameter IDs and names)
 */
export function parseCsvHeaders(lines: string[]): {
  parameterIds: string[];
  parameterNames: string[];
} {
  if (lines.length < 2) {
    throw new Error('CSV must have at least 2 header rows');
  }

  // Line 0: Parameter IDs (skip first column which is timestamp)
  const parameterIds = lines[0]
    .split(',')
    .slice(1)
    .map(id => id.trim())
    .filter(id => id !== '');

  // Line 1: Parameter Names (skip first column which is timestamp)
  const parameterNames = lines[1]
    .split(',')
    .slice(1)
    .map(name => name.trim())
    .filter(name => name !== '');

  if (parameterIds.length !== parameterNames.length) {
    throw new Error('Parameter IDs and names count mismatch');
  }

  return { parameterIds, parameterNames };
}

/**
 * Parse CSV data rows
 */
export function parseCsvDataRows(lines: string[], startRow: number = 3): {
  timestamps: string[];
  data: string[][];
} {
  const timestamps: string[] = [];
  const data: string[][] = [];

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const values = line.split(',').map(v => v.trim());
    if (values.length > 0 && values[0]) {
      timestamps.push(values[0]);
      data.push(values.slice(1));
    }
  }

  return { timestamps, data };
}

/**
 * Parse complete CSV file
 */
export async function parseCsvFile(file: File): Promise<CsvParseResult> {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());

  if (lines.length < 4) {
    throw new Error('CSV must have at least 4 rows (2 headers + 1 data row)');
  }

  const { parameterIds, parameterNames } = parseCsvHeaders(lines);
  const { timestamps, data } = parseCsvDataRows(lines);

  return {
    headers: parameterIds,
    data,
    parameterIds,
    parameterNames,
    timestamps
  };
}

/**
 * Extract unique headers from multiple CSV files
 */
export async function extractUniqueHeaders(files: File[]): Promise<Set<string>> {
  const allHeaders = new Set<string>();

  for (const file of files) {
    try {
      const { parameterIds } = await parseCsvFile(file);
      parameterIds.forEach(id => allHeaders.add(id));
    } catch (error) {
      console.warn(`Failed to parse headers from ${file.name}:`, error);
    }
  }

  return allHeaders;
}

/**
 * Get data range from CSV files
 */
export async function getDataRange(files: File[]): Promise<{
  startTime?: Date;
  endTime?: Date;
}> {
  let minTime: Date | undefined;
  let maxTime: Date | undefined;

  for (const file of files) {
    try {
      const { timestamps } = await parseCsvFile(file);
      
      if (timestamps.length > 0) {
        const firstTime = new Date(timestamps[0]);
        const lastTime = new Date(timestamps[timestamps.length - 1]);

        if (!isNaN(firstTime.getTime())) {
          if (!minTime || firstTime < minTime) {
            minTime = firstTime;
          }
        }

        if (!isNaN(lastTime.getTime())) {
          if (!maxTime || lastTime > maxTime) {
            maxTime = lastTime;
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to get data range from ${file.name}:`, error);
    }
  }

  return {
    startTime: minTime,
    endTime: maxTime
  };
}

/**
 * Batch process CSV data
 */
export interface BatchProcessOptions {
  batchSize: number;
  onBatch: (batch: { timestamps: string[]; data: string[][] }, batchIndex: number) => Promise<void>;
  onProgress?: (processed: number, total: number) => void;
}

export async function batchProcessCsvData(
  file: File,
  options: BatchProcessOptions
): Promise<void> {
  const text = await file.text();
  const lines = text.split('\n').filter(line => line.trim());
  
  const { timestamps, data } = parseCsvDataRows(lines);
  const totalRows = timestamps.length;
  let processed = 0;

  for (let i = 0; i < totalRows; i += options.batchSize) {
    const batchEnd = Math.min(i + options.batchSize, totalRows);
    const batch = {
      timestamps: timestamps.slice(i, batchEnd),
      data: data.slice(i, batchEnd)
    };

    await options.onBatch(batch, Math.floor(i / options.batchSize));
    
    processed = batchEnd;
    options.onProgress?.(processed, totalRows);
  }
}