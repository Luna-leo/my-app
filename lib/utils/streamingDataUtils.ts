/**
 * Streaming data utilities for memory-efficient processing
 * Provides generators and async iterators for large dataset handling
 */

import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema';
import { ChartSeriesData } from './chartDataUtils';
import { sampleData, SamplingOptions } from './dataSamplingUtils';

/**
 * Stream-based transformation for time series data
 * Processes data in chunks to minimize memory usage
 */
export async function* transformDataForChartStream(
  dataStream: AsyncGenerator<TimeSeriesData[], void>,
  yAxisParameters: string[],
  parameterInfoMap: Map<string, ParameterInfo>,
  metadataMap: Map<number, { label?: string; plant: string; machineNo: string }>
): AsyncGenerator<ChartSeriesData[], void> {
  // Track data by metadata ID for merging
  const dataByMetadata = new Map<number, {
    timestamps: number[];
    values: Map<string, (number | null)[]>;
    metadataLabel: string;
  }>();
  
  // Process each chunk
  for await (const chunk of dataStream) {
    // Group chunk data by metadata
    for (const dataPoint of chunk) {
      const metadataId = dataPoint.metadataId;
      
      // Initialize metadata group if needed
      if (!dataByMetadata.has(metadataId)) {
        const metadata = metadataMap.get(metadataId);
        const metadataLabel = metadata?.label || `${metadata?.plant}-${metadata?.machineNo}` || `Data ${metadataId}`;
        
        dataByMetadata.set(metadataId, {
          timestamps: [],
          values: new Map(yAxisParameters.map(p => [p, []])),
          metadataLabel
        });
      }
      
      const group = dataByMetadata.get(metadataId)!;
      group.timestamps.push(dataPoint.timestamp.getTime());
      
      // Extract values for each parameter
      for (const parameterId of yAxisParameters) {
        const value = dataPoint.data[parameterId] ?? null;
        group.values.get(parameterId)!.push(value);
      }
    }
    
    // Yield transformed data for this chunk
    const seriesData: ChartSeriesData[] = [];
    
    for (const [metadataId, group] of dataByMetadata) {
      for (const parameterId of yAxisParameters) {
        const parameterInfo = parameterInfoMap.get(parameterId);
        if (!parameterInfo) continue;
        
        seriesData.push({
          metadataId,
          metadataLabel: group.metadataLabel,
          parameterId,
          parameterInfo,
          timestamps: [...group.timestamps], // Clone arrays
          values: [...group.values.get(parameterId)!]
        });
      }
    }
    
    if (seriesData.length > 0) {
      yield seriesData;
    }
    
    // Clear accumulated data to free memory
    dataByMetadata.clear();
  }
}

/**
 * Stream-based sampling for time series data
 * Applies sampling algorithm to streaming data
 */
export async function* sampleTimeSeriesDataStream(
  dataStream: AsyncGenerator<TimeSeriesData[], void>,
  samplingOptions: SamplingOptions & { samplingParameter?: string }
): AsyncGenerator<TimeSeriesData[], void> {
  // Buffer to accumulate data for sampling
  const buffer: TimeSeriesData[] = [];
  const bufferSize = samplingOptions.targetPoints * 2; // Buffer 2x target for better sampling
  
  for await (const chunk of dataStream) {
    buffer.push(...chunk);
    
    // When buffer is full, sample and yield
    if (buffer.length >= bufferSize) {
      const sampled = sampleBuffer(buffer, samplingOptions);
      yield sampled;
      
      // Keep last 10% of buffer for continuity
      const keepCount = Math.floor(bufferSize * 0.1);
      buffer.splice(0, buffer.length - keepCount);
    }
  }
  
  // Sample remaining data
  if (buffer.length > 0) {
    const sampled = sampleBuffer(buffer, samplingOptions);
    yield sampled;
  }
}

/**
 * Helper function to sample a buffer of time series data
 */
function sampleBuffer(
  data: TimeSeriesData[],
  options: SamplingOptions & { samplingParameter?: string }
): TimeSeriesData[] {
  if (data.length <= options.targetPoints) {
    return data;
  }
  
  // Determine sampling parameter
  let samplingParameter = options.samplingParameter;
  if (!samplingParameter && data.length > 0 && data[0].data) {
    const numericParams = Object.keys(data[0].data)
      .filter(key => typeof data[0].data[key] === 'number')
      .sort();
    samplingParameter = numericParams[0];
  }
  
  if (!samplingParameter) {
    return data; // Can't sample without a parameter
  }
  
  // Convert to sampling format
  const dataPoints = data.map((item, index) => ({
    x: item.timestamp,
    y: item.data[samplingParameter!] as number || 0,
    index
  }));
  
  // Apply sampling
  const samplingResult = sampleData(dataPoints, options);
  
  // Extract sampled data
  return samplingResult.data
    .map(point => data[(point as {index: number}).index])
    .filter(Boolean);
}

/**
 * Streaming merge for multiple sorted data streams
 * Efficiently merges pre-sorted streams without loading all data
 */
export async function* mergeTimeSeriesDataStreams(
  streams: AsyncGenerator<TimeSeriesData[], void>[]
): AsyncGenerator<TimeSeriesData[], void> {
  // Buffer for each stream
  const buffers: {
    stream: AsyncGenerator<TimeSeriesData[], void>;
    buffer: TimeSeriesData[];
    done: boolean;
    index: number;
  }[] = streams.map((stream, index) => ({
    stream,
    buffer: [],
    done: false,
    index
  }));
  
  const chunkSize = 1000;
  
  while (buffers.some(b => !b.done || b.buffer.length > 0)) {
    // Fill buffers that are running low
    for (const buffer of buffers) {
      if (!buffer.done && buffer.buffer.length < chunkSize / 2) {
        const result = await buffer.stream.next();
        if (result.done) {
          buffer.done = true;
        } else {
          buffer.buffer.push(...result.value);
        }
      }
    }
    
    // Merge next chunk
    const mergedChunk: TimeSeriesData[] = [];
    
    while (mergedChunk.length < chunkSize && buffers.some(b => b.buffer.length > 0)) {
      // Find earliest timestamp across all buffers
      let earliestBuffer: typeof buffers[0] | null = null;
      let earliestTime: Date | null = null;
      
      for (const buffer of buffers) {
        if (buffer.buffer.length > 0) {
          const time = buffer.buffer[0].timestamp;
          if (!earliestTime || time < earliestTime) {
            earliestTime = time;
            earliestBuffer = buffer;
          }
        }
      }
      
      if (earliestBuffer) {
        mergedChunk.push(earliestBuffer.buffer.shift()!);
      } else {
        break;
      }
    }
    
    if (mergedChunk.length > 0) {
      yield mergedChunk;
    }
  }
}

/**
 * Calculate optimal chunk size based on memory pressure and data characteristics
 */
export function getAdaptiveChunkSize(
  estimatedTotalSize: number,
  memoryPressure?: 'low' | 'medium' | 'high' | 'critical'
): number {
  const baseChunkSize = 1000;
  
  // Adjust based on memory pressure
  let pressureMultiplier = 1;
  switch (memoryPressure) {
    case 'critical':
      pressureMultiplier = 0.1; // 100 items
      break;
    case 'high':
      pressureMultiplier = 0.25; // 250 items
      break;
    case 'medium':
      pressureMultiplier = 0.5; // 500 items
      break;
    default:
      pressureMultiplier = 1; // 1000 items
  }
  
  // Adjust based on total size
  let sizeMultiplier = 1;
  if (estimatedTotalSize > 1000000) {
    sizeMultiplier = 0.5; // Very large dataset
  } else if (estimatedTotalSize > 100000) {
    sizeMultiplier = 0.75; // Large dataset
  }
  
  const chunkSize = Math.floor(baseChunkSize * pressureMultiplier * sizeMultiplier);
  return Math.max(100, Math.min(chunkSize, 5000)); // Clamp between 100 and 5000
}

/**
 * Create a streaming data pipeline with progress tracking
 */
export class StreamingDataPipeline {
  private abortController = new AbortController();
  
  /**
   * Process data with progress callbacks
   */
  async processWithProgress<T>(
    stream: AsyncGenerator<T[], void>,
    onProgress?: (processed: number, estimatedTotal?: number) => void,
    onChunk?: (chunk: T[]) => void
  ): Promise<T[]> {
    const results: T[] = [];
    let processed = 0;
    
    try {
      for await (const chunk of stream) {
        if (this.abortController.signal.aborted) {
          throw new Error('Processing aborted');
        }
        
        results.push(...chunk);
        processed += chunk.length;
        
        if (onProgress) {
          onProgress(processed);
        }
        
        if (onChunk) {
          onChunk(chunk);
        }
      }
    } catch (error) {
      if (error instanceof Error && error.message === 'Processing aborted') {
        // Clean abort
      } else {
        throw error;
      }
    }
    
    return results;
  }
  
  /**
   * Abort the current processing
   */
  abort(): void {
    this.abortController.abort();
  }
  
  /**
   * Reset for new processing
   */
  reset(): void {
    this.abortController = new AbortController();
  }
}