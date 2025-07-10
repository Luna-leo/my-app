import Dexie, { Table } from 'dexie';
import { Metadata, ParameterInfo, TimeSeriesData, ChartConfiguration, Workspace } from './schema';

export class AppDatabase extends Dexie {
  metadata!: Table<Metadata>;
  parameters!: Table<ParameterInfo>;
  timeSeries!: Table<TimeSeriesData>;
  chartConfigurations!: Table<ChartConfiguration>;
  workspaces!: Table<Workspace>;

  constructor() {
    super('GraphDataDB');
    
    this.version(1).stores({
      metadata: '++id, plant, machineNo, importedAt',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo',
      timeSeries: '++id, metadataId, timestamp'
    });

    this.version(2).stores({
      metadata: '++id, plant, machineNo, importedAt',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo',
      timeSeries: '++id, metadataId, timestamp',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt'
    });
  }

  async clearAllData() {
    await this.transaction('rw', this.metadata, this.parameters, this.timeSeries, async () => {
      await this.metadata.clear();
      await this.parameters.clear();
      await this.timeSeries.clear();
    });
    
    await this.transaction('rw', this.chartConfigurations, this.workspaces, async () => {
      await this.chartConfigurations.clear();
      await this.workspaces.clear();
    });
  }

  async getParametersByPlantAndMachine(plant: string, machineNo: string) {
    return await this.parameters
      .where('[plant+machineNo]')
      .equals([plant, machineNo])
      .toArray();
  }

  async getTimeSeriesData(
    metadataId: number, 
    startTime?: Date, 
    endTime?: Date,
    samplingOptions?: {
      enabled: boolean;
      targetPoints: number;
      method: 'nth' | 'random';
    }
  ) {
    const query = this.timeSeries.where('metadataId').equals(metadataId);
    
    // If sampling is enabled, apply database-level sampling
    if (samplingOptions?.enabled && samplingOptions.targetPoints > 0) {
      // Get total count first
      const totalCount = await query.count();
      
      if (totalCount <= samplingOptions.targetPoints) {
        // No need to sample if data is already small
        const results = await query.toArray();
        return this.filterByTimeRange(results, startTime, endTime);
      }
      
      // Apply sampling based on method
      if (samplingOptions.method === 'nth') {
        // Nth-point sampling at database level
        const step = Math.ceil(totalCount / samplingOptions.targetPoints);
        const sampledData: TimeSeriesData[] = [];
        
        // Use offset to sample every nth record
        for (let i = 0; i < totalCount; i += step) {
          const items = await query.offset(i).limit(1).toArray();
          if (items.length > 0) {
            sampledData.push(items[0]);
          }
        }
        
        return this.filterByTimeRange(sampledData, startTime, endTime);
      } else {
        // Random sampling - get indices first
        const indices = this.generateRandomIndices(totalCount, samplingOptions.targetPoints);
        const sampledData: TimeSeriesData[] = [];
        
        // Fetch data at specific indices
        for (const index of indices) {
          const items = await query.offset(index).limit(1).toArray();
          if (items.length > 0) {
            sampledData.push(items[0]);
          }
        }
        
        // Sort by timestamp
        sampledData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
        return this.filterByTimeRange(sampledData, startTime, endTime);
      }
    }
    
    // Original behavior - load all data
    if (startTime || endTime) {
      const results = await query.toArray();
      return this.filterByTimeRange(results, startTime, endTime);
    }
    
    return await query.toArray();
  }
  
  private filterByTimeRange(data: TimeSeriesData[], startTime?: Date, endTime?: Date): TimeSeriesData[] {
    if (!startTime && !endTime) return data;
    
    return data.filter(item => {
      if (startTime && item.timestamp < startTime) return false;
      if (endTime && item.timestamp > endTime) return false;
      return true;
    });
  }
  
  private generateRandomIndices(totalCount: number, sampleSize: number): number[] {
    const indices = new Set<number>();
    
    while (indices.size < sampleSize && indices.size < totalCount) {
      indices.add(Math.floor(Math.random() * totalCount));
    }
    
    return Array.from(indices).sort((a, b) => a - b);
  }

  /**
   * Stream time series data in chunks for memory-efficient processing
   * @param metadataId - The metadata ID to query
   * @param options - Streaming options including chunk size and time range
   * @returns AsyncGenerator that yields chunks of time series data
   */
  async *streamTimeSeriesData(
    metadataId: number,
    options?: {
      chunkSize?: number;
      startTime?: Date;
      endTime?: Date;
    }
  ): AsyncGenerator<TimeSeriesData[], void> {
    const chunkSize = options?.chunkSize || 1000;
    const collection = this.timeSeries.where('metadataId').equals(metadataId);
    
    // Get total count for progress tracking
    const totalCount = await collection.count();
    if (totalCount === 0) return;
    
    let offset = 0;
    
    while (offset < totalCount) {
      // Fetch chunk with timestamp ordering
      const chunk = await collection
        .offset(offset)
        .limit(chunkSize)
        .sortBy('timestamp');
      
      if (chunk.length === 0) break;
      
      // Apply time filtering if specified
      let filteredChunk = chunk;
      if (options?.startTime || options?.endTime) {
        filteredChunk = chunk.filter(item => {
          if (options.startTime && item.timestamp < options.startTime) return false;
          if (options.endTime && item.timestamp > options.endTime) return false;
          return true;
        });
      }
      
      if (filteredChunk.length > 0) {
        yield filteredChunk;
      }
      
      offset += chunk.length;
      
      // Allow event loop to process other tasks
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  /**
   * Stream multiple time series data sources and merge them
   * @param metadataIds - Array of metadata IDs to stream
   * @param options - Streaming options
   * @returns AsyncGenerator that yields merged chunks
   */
  async *streamMultipleTimeSeriesData(
    metadataIds: number[],
    options?: {
      chunkSize?: number;
      startTime?: Date;
      endTime?: Date;
    }
  ): AsyncGenerator<TimeSeriesData[], void> {
    const chunkSize = options?.chunkSize || 1000;
    
    // Create streams for each metadata ID
    const streams = metadataIds.map(id => 
      this.streamTimeSeriesData(id, { ...options, chunkSize: Math.floor(chunkSize / metadataIds.length) })
    );
    
    // Buffer for each stream
    const buffers: { stream: AsyncGenerator<TimeSeriesData[]>; buffer: TimeSeriesData[]; done: boolean }[] = 
      streams.map(stream => ({ stream, buffer: [], done: false }));
    
    // Merge sorted streams
    while (buffers.some(b => !b.done || b.buffer.length > 0)) {
      // Fill buffers
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
      
      // Merge and yield a chunk
      const mergedChunk: TimeSeriesData[] = [];
      const targetChunkSize = chunkSize;
      
      while (mergedChunk.length < targetChunkSize && buffers.some(b => b.buffer.length > 0)) {
        // Find buffer with earliest timestamp
        let earliestBufferIndex = -1;
        let earliestTimestamp: Date | null = null;
        
        for (let i = 0; i < buffers.length; i++) {
          if (buffers[i].buffer.length > 0) {
            const timestamp = buffers[i].buffer[0].timestamp;
            if (!earliestTimestamp || timestamp < earliestTimestamp) {
              earliestTimestamp = timestamp;
              earliestBufferIndex = i;
            }
          }
        }
        
        if (earliestBufferIndex >= 0) {
          mergedChunk.push(buffers[earliestBufferIndex].buffer.shift()!);
        } else {
          break;
        }
      }
      
      if (mergedChunk.length > 0) {
        yield mergedChunk;
      }
      
      // Allow event loop to process
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }
}

export const db = new AppDatabase();