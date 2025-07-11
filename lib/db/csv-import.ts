import Papa from 'papaparse';
import * as iconv from 'iconv-lite';
import { db } from './index';
import { CsvHeader, DataSource, Metadata, ParameterInfo } from './schema';
import { parseTimestamp } from '../utils/date-parser';

export interface CsvParseResult {
  headers: CsvHeader[];
  data: (string | number | boolean | null)[][];
}

export interface ImportProgress {
  current: number;
  total: number;
  phase: 'parsing' | 'processing' | 'saving';
  message: string;
}

export class CsvImporter {
  private onProgress?: (progress: ImportProgress) => void;
  public detectedDataRange?: { startTime: Date; endTime: Date };

  constructor(onProgress?: (progress: ImportProgress) => void) {
    this.onProgress = onProgress;
  }

  private updateProgress(progress: ImportProgress) {
    if (this.onProgress) {
      this.onProgress(progress);
    }
  }

  async detectDataRange(
    files: File[],
    dataSource: DataSource
  ): Promise<{ startTime: Date; endTime: Date } | undefined> {
    let minTimestamp: Date | null = null;
    let maxTimestamp: Date | null = null;

    for (const file of files) {
      try {
        // Parse only a sample of the file for performance
        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const decoded = iconv.decode(buffer, dataSource.encoding);
        
        const lines = decoded.split('\n').filter(line => line.trim());
        
        console.log(`Processing file: ${file.name}, lines: ${lines.length}`);
        
        // Skip header lines (first 3 rows)
        if (lines.length <= 3) continue;
        
        // Check first few data rows for start time
        const firstDataRows = lines.slice(3, Math.min(13, lines.length));
        console.log(`First data rows sample:`, firstDataRows.slice(0, 3));
        
        for (const line of firstDataRows) {
          // Use PapaParse to properly parse CSV line
          const parseResult = Papa.parse(line, { 
            delimiter: ',',
            quoteChar: '"',
            escapeChar: '"',
            skipEmptyLines: true
          });
          
          if (parseResult.data && parseResult.data.length > 0 && parseResult.data[0].length > 0) {
            const columns = parseResult.data[0] as string[];
            const timestampStr = columns[0]?.trim();
            console.log(`Trying to parse timestamp: "${timestampStr}"`);
            const timestamp = parseTimestamp(timestampStr);
            if (timestamp) {
              console.log(`Parsed timestamp: ${timestamp}`);
              if (!minTimestamp || timestamp < minTimestamp) {
                minTimestamp = timestamp;
              }
              break; // Found a valid timestamp, no need to check more
            }
          }
        }
        
        // Check last few data rows for end time
        const lastDataRows = lines.slice(Math.max(lines.length - 10, 3));
        for (let i = lastDataRows.length - 1; i >= 0; i--) {
          const line = lastDataRows[i];
          // Use PapaParse to properly parse CSV line
          const parseResult = Papa.parse(line, { 
            delimiter: ',',
            quoteChar: '"',
            escapeChar: '"',
            skipEmptyLines: true
          });
          
          if (parseResult.data && parseResult.data.length > 0 && parseResult.data[0].length > 0) {
            const columns = parseResult.data[0] as string[];
            const timestampStr = columns[0]?.trim();
            const timestamp = parseTimestamp(timestampStr);
            if (timestamp) {
              if (!maxTimestamp || timestamp > maxTimestamp) {
                maxTimestamp = timestamp;
              }
              break; // Found a valid timestamp, no need to check more
            }
          }
        }
      } catch (error) {
        console.error(`Error parsing file ${file.name}:`, error);
        // Continue with next file
      }
    }

    console.log(`Detected range: min=${minTimestamp}, max=${maxTimestamp}`);
    
    return minTimestamp && maxTimestamp 
      ? { startTime: minTimestamp, endTime: maxTimestamp } 
      : undefined;
  }

  async importFiles(
    files: File[],
    metadata: Omit<Metadata, 'id' | 'importedAt'>,
    dataSource: DataSource
  ): Promise<void> {
    this.updateProgress({
      current: 0,
      total: files.length,
      phase: 'parsing',
      message: 'Starting import...'
    });

    // Parse all files
    const parsedFiles: CsvParseResult[] = [];
    for (let i = 0; i < files.length; i++) {
      this.updateProgress({
        current: i + 1,
        total: files.length,
        phase: 'parsing',
        message: `Parsing file ${i + 1} of ${files.length}: ${files[i].name}`
      });

      const result = await this.parseFile(files[i], dataSource);
      parsedFiles.push(result);
    }

    // Process and combine data
    this.updateProgress({
      current: 0,
      total: 1,
      phase: 'processing',
      message: 'Processing and combining data...'
    });

    const combinedData = await this.combineData(parsedFiles, metadata);
    
    // Store detected data range
    this.detectedDataRange = combinedData.dataRange;

    // Save to IndexedDB
    this.updateProgress({
      current: 0,
      total: 1,
      phase: 'saving',
      message: 'Saving to database...'
    });

    await this.saveToDatabase(combinedData, metadata);
  }

  private async parseFile(file: File, dataSource: DataSource): Promise<CsvParseResult> {
    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    // Decode based on data source
    const decoded = iconv.decode(buffer, dataSource.encoding);
    
    return new Promise((resolve, reject) => {
      Papa.parse(decoded, {
        complete: (result) => {
          if (result.errors.length > 0) {
            reject(new Error(`CSV parsing errors: ${result.errors.map(e => e.message).join(', ')}`));
            return;
          }

          // Extract headers from first 3 rows
          const headers = this.extractHeaders(result.data as string[][]);
          
          // Extract data from row 4 onwards
          const data = (result.data as string[][]).slice(3);
          
          resolve({ headers, data });
        },
        error: (error: Error) => {
          reject(error);
        }
      });
    });
  }

  private extractHeaders(rows: string[][]): CsvHeader[] {
    if (rows.length < 3) {
      throw new Error('CSV file must have at least 3 header rows');
    }

    const parameterIds = rows[0];
    const parameterNames = rows[1];
    const units = rows[2];

    const headers: CsvHeader[] = [];
    
    // Start from index 1 to skip timestamp column
    for (let i = 1; i < parameterIds.length; i++) {
      const parameterId = parameterIds[i];
      const parameterName = parameterNames[i];
      const unit = units[i];

      // Skip invalid parameters
      if (!parameterId || !parameterName || !unit) continue;
      if (parameterName === '-' && unit === '-') continue;

      headers.push({
        parameterId: parameterId.trim(),
        parameterName: parameterName.trim(),
        unit: unit.trim()
      });
    }

    return headers;
  }

  private async combineData(
    parsedFiles: CsvParseResult[],
    metadata: Omit<Metadata, 'id' | 'importedAt'>
  ): Promise<{ 
    parameters: Map<string, ParameterInfo>, 
    timeSeriesData: Map<string, Record<string, number | null>>,
    dataRange?: { startTime: Date, endTime: Date }
  }> {
    const parametersMap = new Map<string, ParameterInfo>();
    const timeSeriesMap = new Map<string, Record<string, number | null>>();
    let minTimestamp: Date | null = null;
    let maxTimestamp: Date | null = null;

    // Process each file
    for (const parsed of parsedFiles) {
      // Add unique parameters
      for (const header of parsed.headers) {
        const key = `${header.parameterId}_${header.parameterName}_${header.unit}`;
        if (!parametersMap.has(key)) {
          parametersMap.set(key, {
            parameterId: header.parameterId,
            parameterName: header.parameterName,
            unit: header.unit,
            plant: metadata.plant,
            machineNo: metadata.machineNo
          });
        }
      }

      // Convert to long format
      for (const row of parsed.data) {
        const timestamp = row[0];
        if (!timestamp) continue;

        const dataPoint = timeSeriesMap.get(String(timestamp)) || {};
        
        for (let i = 0; i < parsed.headers.length; i++) {
          const header = parsed.headers[i];
          const value = row[i + 1]; // +1 because timestamp is at index 0
          
          if (value && value !== '') {
            const numValue = parseFloat(String(value));
            if (!isNaN(numValue)) {
              dataPoint[header.parameterId] = numValue;
            }
          }
        }

        timeSeriesMap.set(String(timestamp), dataPoint);
        
        // Track data range
        const timestampDate = parseTimestamp(String(timestamp));
        if (timestampDate) {
          if (!minTimestamp || timestampDate < minTimestamp) {
            minTimestamp = timestampDate;
          }
          if (!maxTimestamp || timestampDate > maxTimestamp) {
            maxTimestamp = timestampDate;
          }
        }
      }
    }

    return {
      parameters: parametersMap,
      timeSeriesData: timeSeriesMap,
      dataRange: minTimestamp && maxTimestamp ? { startTime: minTimestamp, endTime: maxTimestamp } : undefined
    };
  }

  private async saveToDatabase(
    combinedData: { 
      parameters: Map<string, ParameterInfo>, 
      timeSeriesData: Map<string, Record<string, number | null>>,
      dataRange?: { startTime: Date, endTime: Date }
    },
    metadata: Omit<Metadata, 'id' | 'importedAt'>
  ): Promise<void> {
    await db.transaction('rw', db.metadata, db.parameters, db.timeSeries, async () => {
      // Save metadata
      const metadataId = await db.metadata.add({
        ...metadata,
        importedAt: new Date()
      });

      // Save parameters
      const parametersArray = Array.from(combinedData.parameters.values());
      await db.parameters.bulkAdd(parametersArray);

      // Save time series data with optional filtering
      let timeSeriesArray = Array.from(combinedData.timeSeriesData.entries())
        .map(([timestamp, data]) => {
          const parsedDate = parseTimestamp(timestamp);
          return parsedDate ? {
            metadataId,
            timestamp: parsedDate,
            data
          } : null;
        })
        .filter(item => item !== null) as { metadataId: number; timestamp: Date; data: Record<string, number | null> }[];

      // Apply data range filtering if specified
      const dataStartTime = (metadata as { dataStartTime?: Date }).dataStartTime;
      const dataEndTime = (metadata as { dataEndTime?: Date }).dataEndTime;
      
      if (dataStartTime || dataEndTime) {
        timeSeriesArray = timeSeriesArray.filter(item => {
          if (dataStartTime && item.timestamp < dataStartTime) return false;
          if (dataEndTime && item.timestamp > dataEndTime) return false;
          return true;
        });
      }

      // Batch insert for better performance
      const batchSize = 1000;
      for (let i = 0; i < timeSeriesArray.length; i += batchSize) {
        await db.timeSeries.bulkAdd(timeSeriesArray.slice(i, i + batchSize));
      }
    });
  }
}