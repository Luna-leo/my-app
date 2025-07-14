/// <reference lib="webworker" />

import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema';
import { sampleTimeSeriesData, SamplingConfig } from '@/lib/utils/chartDataSampling';
import { ChartSeriesData } from '@/lib/utils/chartDataUtils';

export type WorkerMessage = 
  | { type: 'PROCESS_DATA'; data: ProcessDataPayload }
  | { type: 'SAMPLE_DATA'; data: SampleDataPayload }
  | { type: 'TRANSFORM_DATA'; data: TransformDataPayload }
  | { type: 'PREPARE_UPLOAD'; data: PrepareUploadPayload };

export type WorkerResponse = 
  | { type: 'DATA_PROCESSED'; data: any; id: string }
  | { type: 'ERROR'; error: string; id: string }
  | { type: 'PROGRESS'; progress: number; id: string };

interface ProcessDataPayload {
  id: string;
  data: TimeSeriesData[];
  samplingConfig?: SamplingConfig;
  parameters: string[];
}

interface SampleDataPayload {
  id: string;
  data: TimeSeriesData[];
  samplingConfig: SamplingConfig;
  samplingParameter?: string;
}

interface TransformDataPayload {
  id: string;
  data: TimeSeriesData[];
  yAxisParameters: string[];
  parameterInfoMap: Record<string, ParameterInfo>;
  metadataMap: Record<number, { label?: string; plant: string; machineNo: string }>;
}

interface PrepareUploadPayload {
  id: string;
  timeSeriesData: TimeSeriesData[];
  metadata: any;
  parameters: any[];
  chunkSize?: number;
}

// Process incoming messages
self.addEventListener('message', async (event: MessageEvent<WorkerMessage>) => {
  const { type, data } = event.data;

  try {
    switch (type) {
      case 'SAMPLE_DATA':
        await handleSampleData(data);
        break;
      
      case 'TRANSFORM_DATA':
        await handleTransformData(data);
        break;
        
      case 'PROCESS_DATA':
        await handleProcessData(data);
        break;
        
      case 'PREPARE_UPLOAD':
        await handlePrepareUpload(data);
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    const response: WorkerResponse = {
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Unknown error',
      id: data.id
    };
    self.postMessage(response);
  }
});

async function handleSampleData(payload: SampleDataPayload) {
  const { id, data, samplingConfig, samplingParameter } = payload;
  
  // Send progress updates
  self.postMessage({ type: 'PROGRESS', progress: 10, id } as WorkerResponse);
  
  // Perform sampling
  const sampledData = sampleTimeSeriesData(data, samplingConfig, samplingParameter);
  
  self.postMessage({ type: 'PROGRESS', progress: 90, id } as WorkerResponse);
  
  // Send result
  const response: WorkerResponse = {
    type: 'DATA_PROCESSED',
    data: sampledData,
    id
  };
  
  self.postMessage(response);
}

async function handleTransformData(payload: TransformDataPayload) {
  const { id, data, yAxisParameters, parameterInfoMap, metadataMap } = payload;
  
  self.postMessage({ type: 'PROGRESS', progress: 10, id } as WorkerResponse);
  
  // Transform data for chart format
  const seriesDataMap = new Map<number, {
    timestamps: number[];
    values: Map<string, (number | null)[]>;
    metadataLabel: string;
  }>();
  
  // Process in chunks for progress updates
  const chunkSize = Math.ceil(data.length / 10);
  
  for (let i = 0; i < data.length; i++) {
    const dataPoint = data[i];
    const metadataId = dataPoint.metadataId;
    
    if (!seriesDataMap.has(metadataId)) {
      const metadata = metadataMap[metadataId];
      const metadataLabel = metadata?.label || `${metadata?.plant}-${metadata?.machineNo}` || `Data ${metadataId}`;
      
      seriesDataMap.set(metadataId, {
        timestamps: [],
        values: new Map(yAxisParameters.map(p => [p, []])),
        metadataLabel
      });
    }
    
    const series = seriesDataMap.get(metadataId)!;
    series.timestamps.push(dataPoint.timestamp.getTime());
    
    for (const parameterId of yAxisParameters) {
      const value = dataPoint.data[parameterId] ?? null;
      series.values.get(parameterId)!.push(value);
    }
    
    // Update progress
    if (i % chunkSize === 0) {
      const progress = 10 + (i / data.length) * 80;
      self.postMessage({ type: 'PROGRESS', progress, id } as WorkerResponse);
    }
  }
  
  // Convert to chart series data
  const chartSeriesData: ChartSeriesData[] = [];
  
  for (const [metadataId, series] of seriesDataMap) {
    for (const parameterId of yAxisParameters) {
      const parameterInfo = parameterInfoMap[parameterId];
      if (!parameterInfo) continue;
      
      chartSeriesData.push({
        metadataId,
        metadataLabel: series.metadataLabel,
        parameterId,
        parameterInfo,
        timestamps: series.timestamps,
        values: series.values.get(parameterId)!
      });
    }
  }
  
  self.postMessage({ type: 'PROGRESS', progress: 100, id } as WorkerResponse);
  
  const response: WorkerResponse = {
    type: 'DATA_PROCESSED',
    data: chartSeriesData,
    id
  };
  
  self.postMessage(response);
}

async function handleProcessData(payload: ProcessDataPayload) {
  const { id, data, samplingConfig, parameters } = payload;
  
  // First sample if needed
  let processedData = data;
  if (samplingConfig && samplingConfig.enabled && data.length > samplingConfig.samplingThreshold) {
    self.postMessage({ type: 'PROGRESS', progress: 10, id } as WorkerResponse);
    processedData = sampleTimeSeriesData(data, samplingConfig, parameters[0]);
    self.postMessage({ type: 'PROGRESS', progress: 50, id } as WorkerResponse);
  }
  
  // Then process the data (simplified for now)
  const result = {
    data: processedData,
    stats: {
      originalCount: data.length,
      processedCount: processedData.length,
      parameters: parameters.length
    }
  };
  
  self.postMessage({ type: 'PROGRESS', progress: 100, id } as WorkerResponse);
  
  const response: WorkerResponse = {
    type: 'DATA_PROCESSED',
    data: result,
    id
  };
  
  self.postMessage(response);
}

async function handlePrepareUpload(payload: PrepareUploadPayload) {
  const { id, timeSeriesData, metadata, parameters, chunkSize = 5000 } = payload;
  
  try {
    // Send initial progress
    self.postMessage({ type: 'PROGRESS', progress: 0, id } as WorkerResponse);
    
    // Calculate data periods
    const sortedData = [...timeSeriesData].sort((a, b) => 
      a.timestamp.getTime() - b.timestamp.getTime()
    );
    
    const dataPeriods: { start: string, end: string }[] = [];
    let currentPeriod: { start: string, end: string } | null = null;
    
    // Process data periods with progress updates
    const periodChunkSize = Math.ceil(sortedData.length / 20);
    
    for (let i = 0; i < sortedData.length; i++) {
      const data = sortedData[i];
      const timeStr = data.timestamp.toISOString();
      
      if (!currentPeriod) {
        currentPeriod = { start: timeStr, end: timeStr };
      } else {
        const prevTime = sortedData[i - 1].timestamp.getTime();
        const currentTime = data.timestamp.getTime();
        const gap = currentTime - prevTime;
        
        if (gap > 3600000) { // 1 hour gap
          dataPeriods.push(currentPeriod);
          currentPeriod = { start: timeStr, end: timeStr };
        } else {
          currentPeriod.end = timeStr;
        }
      }
      
      if (i === sortedData.length - 1 && currentPeriod) {
        dataPeriods.push(currentPeriod);
      }
      
      // Update progress periodically
      if (i % periodChunkSize === 0) {
        const progress = Math.round((i / sortedData.length) * 30);
        self.postMessage({ type: 'PROGRESS', progress, id } as WorkerResponse);
      }
    }
    
    // Process time series data into chunks if needed
    const shouldChunk = timeSeriesData.length > chunkSize;
    const chunks: any[] = [];
    
    if (shouldChunk) {
      // Create chunks with progress updates
      for (let i = 0; i < timeSeriesData.length; i += chunkSize) {
        const chunk = timeSeriesData.slice(i, i + chunkSize);
        
        // Convert timestamps to ISO strings for each chunk
        const processedChunk = chunk.map(ts => ({
          ...ts,
          id: undefined,
          timestamp: ts.timestamp.toISOString()
        }));
        
        chunks.push({
          index: chunks.length,
          total: Math.ceil(timeSeriesData.length / chunkSize),
          data: processedChunk
        });
        
        // Update progress
        const progress = 30 + Math.round((i / timeSeriesData.length) * 60);
        self.postMessage({ type: 'PROGRESS', progress, id } as WorkerResponse);
      }
    } else {
      // Process all data at once for small datasets
      const processedData = timeSeriesData.map(ts => ({
        ...ts,
        id: undefined,
        timestamp: ts.timestamp.toISOString()
      }));
      
      chunks.push({
        index: 0,
        total: 1,
        data: processedData
      });
      
      self.postMessage({ type: 'PROGRESS', progress: 90, id } as WorkerResponse);
    }
    
    // Prepare final upload data
    const uploadData = {
      metadata: {
        ...metadata,
        importedAt: metadata.importedAt?.toISOString ? metadata.importedAt.toISOString() : metadata.importedAt,
        dataStartTime: metadata.dataStartTime?.toISOString ? metadata.dataStartTime.toISOString() : metadata.dataStartTime,
        dataEndTime: metadata.dataEndTime?.toISOString ? metadata.dataEndTime.toISOString() : metadata.dataEndTime,
        startTime: metadata.startTime?.toISOString ? metadata.startTime.toISOString() : metadata.startTime,
        endTime: metadata.endTime?.toISOString ? metadata.endTime.toISOString() : metadata.endTime
      },
      parameters: parameters.map(p => ({
        ...p,
        id: undefined
      })),
      dataPeriods,
      chunks,
      isChunked: shouldChunk,
      totalRecords: timeSeriesData.length
    };
    
    self.postMessage({ type: 'PROGRESS', progress: 100, id } as WorkerResponse);
    
    // Send result
    const response: WorkerResponse = {
      type: 'DATA_PROCESSED',
      data: uploadData,
      id
    };
    
    self.postMessage(response);
  } catch (error) {
    const response: WorkerResponse = {
      type: 'ERROR',
      error: error instanceof Error ? error.message : 'Failed to prepare upload data',
      id
    };
    self.postMessage(response);
  }
}

// Prevent TypeScript error for worker context
export {};