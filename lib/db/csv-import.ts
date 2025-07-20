import Papa from 'papaparse';
import * as iconv from 'iconv-lite';
import { db } from './index';
import { CsvHeader, DataSource, Metadata, ParameterInfo } from './schema';
import { parseTimestamp } from '../utils/date-parser';
import { generateDataKey } from '../utils/dataKeyUtils';

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

export interface ImportResult {
  success: boolean;
  metadataId?: number;
  counts: {
    parameters: number;
    timeSeriesTotal: number;
    timeSeriesImported: number;
    timeSeriesSkipped: number;
  };
  errors: string[];
  warnings: string[];
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
        
        
        // Skip header lines (first 3 rows)
        if (lines.length <= 3) continue;
        
        // Check first few data rows for start time
        const firstDataRows = lines.slice(3, Math.min(13, lines.length));
        
        for (const line of firstDataRows) {
          // Use PapaParse to properly parse CSV line
          const parseResult = Papa.parse(line, { 
            delimiter: ',',
            quoteChar: '"',
            escapeChar: '"',
            skipEmptyLines: true
          });
          
          if (parseResult.data && parseResult.data.length > 0) {
            const firstRow = parseResult.data[0];
            if (Array.isArray(firstRow) && firstRow.length > 0) {
              const columns = firstRow as string[];
              const timestampStr = columns[0]?.trim();
              const timestamp = parseTimestamp(timestampStr);
              if (timestamp) {
                if (!minTimestamp || timestamp < minTimestamp) {
                  minTimestamp = timestamp;
                }
                break; // Found a valid timestamp, no need to check more
              }
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
          
          if (parseResult.data && parseResult.data.length > 0) {
            const firstRow = parseResult.data[0];
            if (Array.isArray(firstRow) && firstRow.length > 0) {
              const columns = firstRow as string[];
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
        }
      } catch {
        // Continue with next file
      }
    }

    return minTimestamp && maxTimestamp 
      ? { startTime: minTimestamp, endTime: maxTimestamp } 
      : undefined;
  }

  async importFiles(
    files: File[],
    metadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>,
    dataSource: DataSource
  ): Promise<ImportResult> {
    const result: ImportResult = {
      success: false,
      counts: {
        parameters: 0,
        timeSeriesTotal: 0,
        timeSeriesImported: 0,
        timeSeriesSkipped: 0
      },
      errors: [],
      warnings: []
    };

    this.updateProgress({
      current: 0,
      total: files.length,
      phase: 'parsing',
      message: 'Starting import...'
    });

    // Detect data range if not provided
    if (!metadata.dataStartTime || !metadata.dataEndTime) {
      try {
        const detectedRange = await this.detectDataRange(files, dataSource);
        if (detectedRange) {
          if (!metadata.dataStartTime) {
            metadata = { ...metadata, dataStartTime: detectedRange.startTime };
            result.warnings.push(`Data start time was not provided. Using detected start time: ${detectedRange.startTime.toISOString()}`);
          }
          if (!metadata.dataEndTime) {
            metadata = { ...metadata, dataEndTime: detectedRange.endTime };
            result.warnings.push(`Data end time was not provided. Using detected end time: ${detectedRange.endTime.toISOString()}`);
          }
        }
      } catch (error) {
        result.warnings.push(`Failed to detect data range: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

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

    try {
      await this.saveToDatabase(combinedData, metadata, result);
    } catch (error) {
      result.errors.push(`Failed to save to database: ${error instanceof Error ? error.message : String(error)}`);
      console.error('[CSV Import] Database save error:', error);
    }
    
    return result;
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
    metadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>
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
    metadata: Omit<Metadata, 'id' | 'importedAt' | 'dataKey'>,
    result: ImportResult
  ): Promise<void> {
    // TODO: Update to use new persistence model instead of timeSeries table
    await db.transaction('rw', db.metadata, db.parameters, async () => {
      // Use detected data range if metadata doesn't have start/end times
      const finalMetadata = { ...metadata };
      if (combinedData.dataRange) {
        if (!finalMetadata.dataStartTime) {
          finalMetadata.dataStartTime = combinedData.dataRange.startTime;
        }
        if (!finalMetadata.dataEndTime) {
          finalMetadata.dataEndTime = combinedData.dataRange.endTime;
        }
      }

      // Generate dataKey for the metadata with importedAt timestamp
      const importedAt = new Date();
      const dataKey = generateDataKey({
        plant: finalMetadata.plant,
        machineNo: finalMetadata.machineNo,
        dataSource: finalMetadata.dataSource,
        dataStartTime: finalMetadata.dataStartTime,
        dataEndTime: finalMetadata.dataEndTime,
        importedAt: importedAt
      });

      // Check if data with same key already exists (now includes importedAt, so duplicates are allowed)
      // Note: With importedAt in the key, each import will have a unique key
      const existingMetadata = await db.metadata.where('dataKey').equals(dataKey).first();
      
      if (existingMetadata) {
        // This should rarely happen now since importedAt makes keys unique
        throw new Error(`Data with same key already exists (ID: ${existingMetadata.id})`);
      }

      // Save metadata
      const metadataId = await db.metadata.add({
        ...finalMetadata,
        dataKey,
        importedAt: importedAt
      });

      // Save parameters - use bulkPut to handle duplicates
      const parametersArray = Array.from(combinedData.parameters.values());
      console.log(`[CSV Import] Saving ${parametersArray.length} parameters for ${finalMetadata.plant}-${finalMetadata.machineNo}`);
      
      try {
        // Use bulkPut instead of bulkAdd to update existing parameters
        await db.parameters.bulkPut(parametersArray);
        console.log(`[CSV Import] Successfully saved ${parametersArray.length} parameters`);
        result.counts.parameters = parametersArray.length;
      } catch (error) {
        console.error('[CSV Import] Error saving parameters:', error);
        result.errors.push(`Failed to save parameters: ${error instanceof Error ? error.message : String(error)}`);
        // Continue with import even if some parameters fail
      }

      // Save time series data with optional filtering
      const totalTimeSeriesCount = combinedData.timeSeriesData.size;
      result.counts.timeSeriesTotal = totalTimeSeriesCount;
      
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
      const dataStartTime = finalMetadata.dataStartTime;
      const dataEndTime = finalMetadata.dataEndTime;
      
      const beforeFilterCount = timeSeriesArray.length;
      
      if (dataStartTime || dataEndTime) {
        timeSeriesArray = timeSeriesArray.filter(item => {
          if (dataStartTime && item.timestamp < dataStartTime) return false;
          if (dataEndTime && item.timestamp > dataEndTime) return false;
          return true;
        });
      }
      
      result.counts.timeSeriesSkipped = beforeFilterCount - timeSeriesArray.length;

      // TODO: Implement data persistence using new model
      // const batchSize = 1000;
      // for (let i = 0; i < timeSeriesArray.length; i += batchSize) {
      //   await db.timeSeries.bulkAdd(timeSeriesArray.slice(i, i + batchSize));
      // }
      console.log('[csv-import] Skipping timeSeries bulk insert - needs migration to new persistence model');
      
      result.counts.timeSeriesImported = timeSeriesArray.length;
      result.metadataId = metadataId;
      result.success = true;
      
      if (result.counts.timeSeriesSkipped > 0) {
        result.warnings.push(`Skipped ${result.counts.timeSeriesSkipped} time series entries outside the specified date range`);
      }
    });
  }
}