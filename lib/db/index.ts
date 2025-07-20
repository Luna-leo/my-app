import Dexie, { Table } from 'dexie';
import { Metadata, ParameterInfo, ChartConfiguration, Workspace, ParquetFile, DataChunk } from './schema';
import { generateDataKey } from '../utils/dataKeyUtils';

// Re-export types for external use
export type { Metadata, ParameterInfo, ChartConfiguration, Workspace, ParquetFile, DataChunk } from './schema';

export class AppDatabase extends Dexie {
  metadata!: Table<Metadata>;
  parameters!: Table<ParameterInfo>;
  chartConfigurations!: Table<ChartConfiguration>;
  workspaces!: Table<Workspace>;
  parquetFiles!: Table<ParquetFile>;
  dataChunks!: Table<DataChunk>;

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

    // Add parquetFiles table for storing Parquet data
    this.version(8).stores({
      metadata: '++id, &dataKey, plant, machineNo, importedAt, [plant+machineNo+dataStartTime]',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo, [parameterId+plant+machineNo]',
      timeSeries: '++id, metadataId, timestamp, [metadataId+timestamp]',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt, selectedDataKeys',
      parquetFiles: '++id, metadataId, filename, createdAt'
    });

    // Add dataChunks table for storing compressed time series data chunks
    this.version(9).stores({
      metadata: '++id, &dataKey, plant, machineNo, importedAt, [plant+machineNo+dataStartTime]',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo, [parameterId+plant+machineNo]',
      timeSeries: '++id, metadataId, timestamp, [metadataId+timestamp]',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt, selectedDataKeys',
      parquetFiles: '++id, metadataId, filename, createdAt',
      dataChunks: '++id, metadataId, chunkIndex, [metadataId+chunkIndex], createdAt'
    });

    // Remove timeSeries table as it's no longer used (data is persisted in dataChunks)
    this.version(10).stores({
      metadata: '++id, &dataKey, plant, machineNo, importedAt, [plant+machineNo+dataStartTime]',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo, [parameterId+plant+machineNo]',
      chartConfigurations: '++id, workspaceId, createdAt, updatedAt',
      workspaces: '++id, name, isActive, createdAt, selectedDataKeys',
      parquetFiles: '++id, metadataId, filename, createdAt',
      dataChunks: '++id, metadataId, chunkIndex, [metadataId+chunkIndex], createdAt'
    }).upgrade(async tx => {
      // Drop timeSeries table data
      console.log('[DB Migration v10] Removing unused timeSeries table');
    });
  }

  async clearAllData() {
    await this.transaction('rw', this.metadata, this.parameters, this.parquetFiles, this.dataChunks, async () => {
      await this.metadata.clear();
      await this.parameters.clear();
      await this.parquetFiles.clear();
      await this.dataChunks.clear();
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


}

export const db = new AppDatabase();