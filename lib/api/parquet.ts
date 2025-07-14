import parquet from 'parquetjs';
import path from 'path';
import { getUploadPath } from './storage';
import { TimeSeriesData } from '@/lib/db/schema';

export async function saveTimeSeriesAsParquet(
  uploadId: string,
  timeSeriesData: TimeSeriesData[],
  parameterIds: string[]
) {
  const parquetPath = path.join(getUploadPath(uploadId), 'timeseries.parquet');
  
  // Debug: Check timestamp format of first few records
  if (timeSeriesData.length > 0) {
    console.log('[Parquet] First timestamp:', {
      raw: timeSeriesData[0].timestamp,
      type: typeof timeSeriesData[0].timestamp,
      isDate: timeSeriesData[0].timestamp instanceof Date,
      value: timeSeriesData[0].timestamp instanceof Date ? timeSeriesData[0].timestamp.toISOString() : 'Not a Date'
    });
  }
  
  // Define schema based on parameters
  const schemaFields: Record<string, { type: string; optional?: boolean }> = {
    timestamp: { type: 'TIMESTAMP_MILLIS' }
  };
  
  for (const parameterId of parameterIds) {
    schemaFields[parameterId] = { type: 'DOUBLE', optional: true };
  }
  
  const schema = new parquet.ParquetSchema(schemaFields);
  const writer = await parquet.ParquetWriter.openFile(schema, parquetPath);
  
  // Convert time series data to parquet rows
  for (const item of timeSeriesData) {
    // Ensure timestamp is a Date object
    const timestamp = item.timestamp instanceof Date ? item.timestamp : new Date(item.timestamp);
    
    // Validate timestamp
    if (isNaN(timestamp.getTime())) {
      console.error('[Parquet] Invalid timestamp detected:', {
        original: item.timestamp,
        converted: timestamp,
        iso: timestamp.toISOString()
      });
      throw new Error(`Invalid timestamp at index ${timeSeriesData.indexOf(item)}: ${item.timestamp}`);
    }
    
    const row: Record<string, Date | number | null> = {
      timestamp: timestamp
    };
    
    // Add parameter values
    for (const parameterId of parameterIds) {
      row[parameterId] = item.data[parameterId] ?? null;
    }
    
    await writer.appendRow(row);
  }
  
  await writer.close();
  return parquetPath;
}

export async function readTimeSeriesFromParquet(uploadId: string) {
  const parquetPath = path.join(getUploadPath(uploadId), 'timeseries.parquet');
  
  const reader = await parquet.ParquetReader.openFile(parquetPath);
  const cursor = reader.getCursor();
  const data: Record<string, unknown>[] = [];
  
  let record = null;
  let isFirstRecord = true;
  while (record = await cursor.next()) {
    // Transform the record to match expected format
    const { timestamp, ...parameterValues } = record;
    
    // Debug first record
    if (isFirstRecord) {
      console.log('[Parquet Read] First record timestamp:', {
        raw: timestamp,
        type: typeof timestamp,
        isDate: timestamp instanceof Date,
        value: timestamp instanceof Date ? timestamp.toISOString() : timestamp
      });
      isFirstRecord = false;
    }
    
    const transformedRecord = {
      timestamp,
      data: parameterValues
    };
    data.push(transformedRecord);
  }
  
  await reader.close();
  return data;
}