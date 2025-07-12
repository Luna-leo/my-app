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
    const row: Record<string, Date | number | null> = {
      timestamp: item.timestamp
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
  while (record = await cursor.next()) {
    // Transform the record to match expected format
    const { timestamp, ...parameterValues } = record;
    const transformedRecord = {
      timestamp,
      data: parameterValues
    };
    data.push(transformedRecord);
  }
  
  await reader.close();
  return data;
}