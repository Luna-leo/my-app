/**
 * Streaming CSV Parser
 * 
 * Memory-efficient CSV parsing using streams and generators
 * Processes large files without loading entire content into memory
 */

export interface StreamingParseOptions {
  chunkSize?: number; // Size of each chunk in bytes
  skipRows?: number; // Number of header rows to skip
  onProgress?: (bytesProcessed: number, totalBytes: number) => void;
}

export interface CsvChunk {
  rows: string[][];
  startRowIndex: number;
  endRowIndex: number;
  isLastChunk: boolean;
}

export interface CsvHeaders {
  parameterIds: string[];
  parameterNames: string[];
  columnCount: number;
}

/**
 * Parse CSV headers from stream without loading entire file
 */
export async function parseHeadersFromStream(file: File): Promise<CsvHeaders> {
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';
  const headerLines: string[] = [];
  const requiredHeaders = 2; // Parameter IDs and Names
  
  try {
    while (headerLines.length < requiredHeaders) {
      const { done, value } = await reader.read();
      
      if (done && headerLines.length < requiredHeaders) {
        throw new Error(`CSV file must have at least ${requiredHeaders} header rows`);
      }
      
      if (value) {
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Keep last incomplete line in buffer
        buffer = lines[lines.length - 1];
        
        // Process complete lines
        for (let i = 0; i < lines.length - 1; i++) {
          if (headerLines.length < requiredHeaders) {
            headerLines.push(lines[i].trim());
          }
        }
      }
      
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
  
  // Parse headers
  const parameterIds = headerLines[0]
    .split(',')
    .slice(1) // Skip timestamp column
    .map(id => id.trim())
    .filter(id => id !== '');
    
  const parameterNames = headerLines[1]
    .split(',')
    .slice(1) // Skip timestamp column
    .map(name => name.trim())
    .filter(name => name !== '');
    
  if (parameterIds.length !== parameterNames.length) {
    throw new Error('Parameter IDs and names count mismatch');
  }
  
  return {
    parameterIds,
    parameterNames,
    columnCount: parameterIds.length + 1 // +1 for timestamp
  };
}

/**
 * Stream CSV data in chunks using generator
 */
export async function* streamCsvData(
  file: File,
  options: StreamingParseOptions = {}
): AsyncGenerator<CsvChunk> {
  const {
    chunkSize = 1024 * 1024, // 1MB chunks by default
    skipRows = 3, // Skip 3 header rows by default
    onProgress
  } = options;
  
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  
  let buffer = '';
  let rowIndex = 0;
  let skippedRows = 0;
  let bytesProcessed = 0;
  const totalBytes = file.size;
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      
      if (value) {
        bytesProcessed += value.byteLength;
        buffer += decoder.decode(value, { stream: !done });
        onProgress?.(bytesProcessed, totalBytes);
      }
      
      // Process buffer when it's large enough or when done
      if (buffer.length >= chunkSize || done) {
        const lines = buffer.split('\n');
        
        // Keep last incomplete line in buffer (unless done)
        buffer = done ? '' : lines[lines.length - 1];
        const linesToProcess = done ? lines : lines.slice(0, -1);
        
        const rows: string[][] = [];
        const startRowIndex = rowIndex;
        
        for (const line of linesToProcess) {
          const trimmedLine = line.trim();
          if (!trimmedLine) continue;
          
          // Skip header rows
          if (skippedRows < skipRows) {
            skippedRows++;
            continue;
          }
          
          // Parse data row
          const values = trimmedLine.split(',').map(v => v.trim());
          if (values.length > 0 && values[0]) {
            rows.push(values);
            rowIndex++;
          }
        }
        
        // Yield chunk if we have data
        if (rows.length > 0) {
          yield {
            rows,
            startRowIndex,
            endRowIndex: rowIndex - 1,
            isLastChunk: done && buffer.length === 0
          };
        }
      }
      
      if (done) break;
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Count total rows in CSV file without loading entire content
 */
export async function countCsvRows(
  file: File,
  skipRows: number = 3
): Promise<number> {
  let rowCount = 0;
  
  for await (const chunk of streamCsvData(file, { skipRows })) {
    rowCount += chunk.rows.length;
  }
  
  return rowCount;
}

/**
 * Get first and last timestamp from CSV without loading entire file
 */
export async function getTimestampRange(file: File): Promise<{
  firstTimestamp?: string;
  lastTimestamp?: string;
}> {
  let firstTimestamp: string | undefined;
  let lastTimestamp: string | undefined;
  
  for await (const chunk of streamCsvData(file)) {
    if (!firstTimestamp && chunk.rows.length > 0) {
      firstTimestamp = chunk.rows[0][0]; // First column is timestamp
    }
    
    if (chunk.rows.length > 0) {
      lastTimestamp = chunk.rows[chunk.rows.length - 1][0];
    }
    
    // For large files, we could optimize by seeking to the end
    // but for now we'll process all chunks
  }
  
  return { firstTimestamp, lastTimestamp };
}

/**
 * Process CSV file in streaming batches
 */
export interface StreamingBatchOptions {
  batchSize: number;
  onBatch: (batch: {
    timestamps: string[];
    data: string[][];
    batchIndex: number;
    isLastBatch: boolean;
  }) => Promise<void>;
  onProgress?: (processed: number, total: number) => void;
}

export async function processCsvInBatches(
  file: File,
  options: StreamingBatchOptions
): Promise<number> {
  const { batchSize, onBatch, onProgress } = options;
  
  let batch: { timestamps: string[]; data: string[][] } = {
    timestamps: [],
    data: []
  };
  let batchIndex = 0;
  let totalProcessed = 0;
  let estimatedTotal = Math.ceil(file.size / 100); // Rough estimate
  
  for await (const chunk of streamCsvData(file)) {
    for (const row of chunk.rows) {
      batch.timestamps.push(row[0]);
      batch.data.push(row.slice(1));
      
      if (batch.timestamps.length >= batchSize) {
        await onBatch({
          ...batch,
          batchIndex,
          isLastBatch: false
        });
        
        totalProcessed += batch.timestamps.length;
        onProgress?.(totalProcessed, estimatedTotal);
        
        // Reset batch
        batch = { timestamps: [], data: [] };
        batchIndex++;
      }
    }
    
    // Update estimated total based on progress
    if (chunk.isLastChunk) {
      estimatedTotal = totalProcessed + batch.timestamps.length;
    }
  }
  
  // Process remaining data
  if (batch.timestamps.length > 0) {
    await onBatch({
      ...batch,
      batchIndex,
      isLastBatch: true
    });
    
    totalProcessed += batch.timestamps.length;
    onProgress?.(totalProcessed, totalProcessed);
  }
  
  return totalProcessed;
}

/**
 * Memory-efficient unique header extraction from multiple files
 */
export async function extractUniqueHeadersStreaming(
  files: File[]
): Promise<Set<string>> {
  const allHeaders = new Set<string>();
  
  for (const file of files) {
    try {
      const headers = await parseHeadersFromStream(file);
      headers.parameterIds.forEach(id => allHeaders.add(id));
    } catch (error) {
      console.warn(`Failed to parse headers from ${file.name}:`, error);
    }
  }
  
  return allHeaders;
}

/**
 * Get data range from multiple files using streaming
 */
export async function getDataRangeStreaming(
  files: File[]
): Promise<{ startTime?: Date; endTime?: Date }> {
  let minTime: Date | undefined;
  let maxTime: Date | undefined;
  
  for (const file of files) {
    try {
      const { firstTimestamp, lastTimestamp } = await getTimestampRange(file);
      
      if (firstTimestamp) {
        const firstTime = new Date(firstTimestamp);
        if (!isNaN(firstTime.getTime())) {
          if (!minTime || firstTime < minTime) {
            minTime = firstTime;
          }
        }
      }
      
      if (lastTimestamp) {
        const lastTime = new Date(lastTimestamp);
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