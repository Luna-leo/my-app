/// <reference lib="webworker" />

import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema';
import { sampleTimeSeriesData, SamplingConfig } from '@/lib/utils/chartDataSampling';
import { ChartSeriesData } from '@/lib/utils/chartDataUtils';

export type WorkerMessage = 
  | { type: 'PROCESS_DATA'; data: ProcessDataPayload }
  | { type: 'SAMPLE_DATA'; data: SampleDataPayload }
  | { type: 'TRANSFORM_DATA'; data: TransformDataPayload };

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

// Prevent TypeScript error for worker context
export {};