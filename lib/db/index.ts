import Dexie, { Table } from 'dexie';
import { Metadata, ParameterInfo, TimeSeriesData, ChartConfiguration, Workspace } from './schema';
import { generateDataKey } from '../utils/dataKeyUtils';

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

    this.version(3).stores({
      metadata: '++id, dataKey, plant, machineNo, importedAt',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo',
      timeSeries: '++id, metadataId, timestamp',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt, selectedDataKeys'
    }).upgrade(async tx => {
      // Migrate existing metadata to include dataKey
      const allMetadata = await tx.table('metadata').toArray();
      
      for (const metadata of allMetadata) {
        if (!metadata.dataKey) {
          const dataKey = generateDataKey({
            plant: metadata.plant,
            machineNo: metadata.machineNo,
            dataSource: metadata.dataSource,
            dataStartTime: metadata.dataStartTime ? new Date(metadata.dataStartTime) : undefined,
            dataEndTime: metadata.dataEndTime ? new Date(metadata.dataEndTime) : undefined
          });
          
          await tx.table('metadata').update(metadata.id, { dataKey });
        }
      }
      
      // Migrate existing workspaces to include selectedDataKeys
      const allWorkspaces = await tx.table('workspaces').toArray();
      
      for (const workspace of allWorkspaces) {
        if (!workspace.selectedDataKeys) {
          // Initialize with empty array for now
          // The actual migration from chart configurations will be done in the service layer
          await tx.table('workspaces').update(workspace.id, { selectedDataKeys: [] });
        }
      }
    });

    // Force migration for existing data
    this.version(4).stores({
      metadata: '++id, dataKey, plant, machineNo, importedAt',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo',
      timeSeries: '++id, metadataId, timestamp',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt, selectedDataKeys'
    }).upgrade(async tx => {
      // Ensure all metadata has dataKey
      const allMetadata = await tx.table('metadata').toArray();
      console.log('[DB Migration v4] Checking metadata:', allMetadata.length);
      
      for (const metadata of allMetadata) {
        if (!metadata.dataKey) {
          const dataKey = generateDataKey({
            plant: metadata.plant,
            machineNo: metadata.machineNo,
            dataSource: metadata.dataSource,
            dataStartTime: metadata.dataStartTime ? new Date(metadata.dataStartTime) : undefined,
            dataEndTime: metadata.dataEndTime ? new Date(metadata.dataEndTime) : undefined
          });
          
          console.log('[DB Migration v4] Adding dataKey to metadata:', metadata.id, dataKey);
          await tx.table('metadata').update(metadata.id, { dataKey });
        }
      }
    });

    // Remove selectedDataIds from charts
    this.version(5).stores({
      metadata: '++id, dataKey, plant, machineNo, importedAt',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo',
      timeSeries: '++id, metadataId, timestamp',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt, selectedDataKeys'
    }).upgrade(async tx => {
      // Remove selectedDataIds from all chart configurations
      const allCharts = await tx.table('chartConfigurations').toArray();
      console.log('[DB Migration v5] Removing selectedDataIds from charts:', allCharts.length);
      
      for (const chart of allCharts) {
        if ('selectedDataIds' in chart) {
          // Create a copy without selectedDataIds
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { selectedDataIds: _, ...chartWithoutIds } = chart;
          await tx.table('chartConfigurations').update(chart.id, chartWithoutIds);
          console.log('[DB Migration v5] Removed selectedDataIds from chart:', chart.id);
        }
      }
    });

    // Add unique constraint to dataKey and optimize indexes
    this.version(6).stores({
      metadata: '++id, &dataKey, plant, machineNo, importedAt, [plant+machineNo+dataStartTime]',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo, [parameterId+plant+machineNo]',
      timeSeries: '++id, metadataId, timestamp, [metadataId+timestamp]',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt, selectedDataKeys'
    });

    // Clean up duplicate active workspaces before adding any constraints
    this.version(7).stores({
      metadata: '++id, &dataKey, plant, machineNo, importedAt, [plant+machineNo+dataStartTime]',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo, [parameterId+plant+machineNo]',
      timeSeries: '++id, metadataId, timestamp, [metadataId+timestamp]',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt, selectedDataKeys'
    }).upgrade(async tx => {
      // Clean up any duplicate active workspaces
      const allWorkspaces = await tx.table('workspaces').toArray();
      console.log('[DB Migration v7] Checking for duplicate active workspaces:', allWorkspaces.length);
      
      const activeWorkspaces = allWorkspaces.filter(w => w.isActive === true || w.isActive === 1);
      console.log('[DB Migration v7] Found active workspaces:', activeWorkspaces.length);
      
      if (activeWorkspaces.length > 1) {
        // Keep the most recently updated one as active
        const sortedActive = activeWorkspaces.sort((a, b) => {
          const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return dateB - dateA; // Most recent first
        });
        
        console.log('[DB Migration v7] Keeping workspace as active:', sortedActive[0].id);
        
        // Deactivate all except the first one
        for (let i = 1; i < sortedActive.length; i++) {
          console.log('[DB Migration v7] Deactivating workspace:', sortedActive[i].id);
          await tx.table('workspaces').update(sortedActive[i].id, { isActive: false });
        }
      }
      
      // Also fix any numeric isActive values
      for (const workspace of allWorkspaces) {
        if (typeof workspace.isActive === 'number') {
          const shouldBeActive = workspace.isActive === 1 && 
            (!activeWorkspaces.length || workspace.id === activeWorkspaces[0].id);
          console.log(`[DB Migration v7] Converting numeric isActive for workspace ${workspace.id}: ${workspace.isActive} -> ${shouldBeActive}`);
          await tx.table('workspaces').update(workspace.id, { isActive: shouldBeActive });
        }
      }
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

  async getMetadataByDataKey(dataKey: string) {
    return await this.metadata
      .where('dataKey')
      .equals(dataKey)
      .first();
  }

  async getMetadataByDataKeys(dataKeys: string[]) {
    return await this.metadata
      .where('dataKey')
      .anyOf(dataKeys)
      .toArray();
  }

  async getTimeSeriesData(
    metadataId: number, 
    startTime?: Date, 
    endTime?: Date,
    parameterIds?: string[]
  ) {
    const query = this.timeSeries.where('metadataId').equals(metadataId);
    
    let results: TimeSeriesData[];
    if (startTime || endTime) {
      results = await query.toArray();
      results = results.filter(item => {
        if (startTime && item.timestamp < startTime) return false;
        if (endTime && item.timestamp > endTime) return false;
        return true;
      });
    } else {
      results = await query.toArray();
    }
    
    // If parameterIds are specified, filter the data to include only those parameters
    if (parameterIds && parameterIds.length > 0) {
      return results.map(item => ({
        ...item,
        data: Object.keys(item.data).reduce((filtered, key) => {
          if (parameterIds.includes(key)) {
            filtered[key] = item.data[key];
          }
          return filtered;
        }, {} as Record<string, number | null>)
      }));
    }
    
    return results;
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
      parameterIds?: string[];
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
      
      // Apply parameter filtering if specified
      if (options?.parameterIds && options.parameterIds.length > 0) {
        filteredChunk = filteredChunk.map(item => ({
          ...item,
          data: Object.keys(item.data).reduce((filtered, key) => {
            if (options.parameterIds!.includes(key)) {
              filtered[key] = item.data[key];
            }
            return filtered;
          }, {} as Record<string, number | null>)
        }));
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
      parameterIds?: string[];
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