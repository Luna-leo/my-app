import Papa from 'papaparse';
import * as iconv from 'iconv-lite';
import { db } from './index';
import { CsvHeader, DataSource, Metadata, ParameterInfo } from './schema';

export interface CsvParseResult {
  headers: CsvHeader[];
  data: any[][];
}

export interface ImportProgress {
  current: number;
  total: number;
  phase: 'parsing' | 'processing' | 'saving';
  message: string;
}

export class CsvImporter {
  private onProgress?: (progress: ImportProgress) => void;

  constructor(onProgress?: (progress: ImportProgress) => void) {
    this.onProgress = onProgress;
  }

  private updateProgress(progress: ImportProgress) {
    if (this.onProgress) {
      this.onProgress(progress);
    }
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
  ): Promise<{ parameters: Map<string, ParameterInfo>, timeSeriesData: Map<string, Record<string, number | null>> }> {
    const parametersMap = new Map<string, ParameterInfo>();
    const timeSeriesMap = new Map<string, Record<string, number | null>>();

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

        const dataPoint = timeSeriesMap.get(timestamp) || {};
        
        for (let i = 0; i < parsed.headers.length; i++) {
          const header = parsed.headers[i];
          const value = row[i + 1]; // +1 because timestamp is at index 0
          
          if (value && value !== '') {
            const numValue = parseFloat(value);
            if (!isNaN(numValue)) {
              dataPoint[header.parameterId] = numValue;
            }
          }
        }

        timeSeriesMap.set(timestamp, dataPoint);
      }
    }

    return {
      parameters: parametersMap,
      timeSeriesData: timeSeriesMap
    };
  }

  private async saveToDatabase(
    combinedData: { parameters: Map<string, ParameterInfo>, timeSeriesData: Map<string, Record<string, number | null>> },
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

      // Save time series data
      const timeSeriesArray = Array.from(combinedData.timeSeriesData.entries()).map(([timestamp, data]) => ({
        metadataId,
        timestamp: new Date(timestamp),
        data
      }));

      // Batch insert for better performance
      const batchSize = 1000;
      for (let i = 0; i < timeSeriesArray.length; i += batchSize) {
        await db.timeSeries.bulkAdd(timeSeriesArray.slice(i, i + batchSize));
      }
    });
  }
}