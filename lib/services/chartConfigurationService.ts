import { db } from '@/lib/db';
import { ChartConfiguration, Workspace } from '@/lib/db/schema';
import { v4 as uuidv4 } from 'uuid';

export class ChartConfigurationService {
  private static instance: ChartConfigurationService;
  private autoSaveTimer: NodeJS.Timeout | null = null;
  private pendingSaves: Map<string, ChartConfiguration> = new Map();

  private constructor() {}

  static getInstance(): ChartConfigurationService {
    if (!ChartConfigurationService.instance) {
      ChartConfigurationService.instance = new ChartConfigurationService();
    }
    return ChartConfigurationService.instance;
  }

  async initializeWorkspace(): Promise<Workspace> {
    console.log('[initializeWorkspace] Starting workspace initialization');
    
    // First try to find active workspace using filter instead of where clause
    const allWorkspaces = await db.workspaces.toArray();
    console.log('[initializeWorkspace] All workspaces:', allWorkspaces);
    
    const activeWorkspace = allWorkspaces.find(w => {
      // Handle legacy data where isActive might be stored as 1/0
      const isActive = w.isActive as boolean | number;
      return isActive === true || isActive === 1;
    });
    
    if (activeWorkspace) {
      console.log('[initializeWorkspace] Found active workspace:', activeWorkspace);
      // Ensure it's using boolean true
      if (activeWorkspace.isActive !== true) {
        console.log('[initializeWorkspace] Converting isActive to boolean');
        await db.workspaces.update(activeWorkspace.id!, { isActive: true });
      }
      return activeWorkspace;
    }

    // Check if there are any workspaces at all
    if (allWorkspaces.length > 0) {
      console.log('[initializeWorkspace] No active workspace found, activating first workspace');
      // Make the first workspace active
      const firstWorkspace = allWorkspaces[0];
      await db.workspaces.update(firstWorkspace.id!, { isActive: true });
      return firstWorkspace;
    }

    // Create a new default workspace
    console.log('[initializeWorkspace] No workspaces found, creating default workspace');
    const defaultWorkspace: Workspace = {
      id: uuidv4(),
      name: 'Default Workspace',
      description: 'Default workspace for chart configurations',
      isActive: true,
      selectedDataKeys: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.workspaces.add(defaultWorkspace);
    console.log('[initializeWorkspace] Created default workspace:', defaultWorkspace);
    return defaultWorkspace;
  }

  async saveChartConfiguration(config: ChartConfiguration): Promise<void> {
    const now = new Date();
    const configToSave = {
      ...config,
      id: config.id || uuidv4(),
      updatedAt: now,
      createdAt: config.createdAt || now
    };

    if (await db.chartConfigurations.where('id').equals(configToSave.id!).first()) {
      await db.chartConfigurations.update(configToSave.id!, configToSave);
    } else {
      await db.chartConfigurations.add(configToSave);
    }
  }

  async saveChartConfigurationDebounced(config: ChartConfiguration): Promise<void> {
    this.pendingSaves.set(config.id || '', config);
    
    if (this.autoSaveTimer) {
      clearTimeout(this.autoSaveTimer);
    }

    this.autoSaveTimer = setTimeout(async () => {
      const configs = Array.from(this.pendingSaves.values());
      this.pendingSaves.clear();
      
      await Promise.all(configs.map(c => this.saveChartConfiguration(c)));
    }, 1000);
  }

  async loadChartConfigurations(workspaceId?: string): Promise<ChartConfiguration[]> {
    if (!workspaceId) {
      const workspace = await this.initializeWorkspace();
      workspaceId = workspace.id;
    }

    const charts = await db.chartConfigurations
      .where('workspaceId')
      .equals(workspaceId!)
      .toArray();
    
    // Sort by createdAt to maintain consistent order
    return charts.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });
  }

  async deleteChartConfiguration(id: string): Promise<void> {
    await db.chartConfigurations.delete(id);
  }

  async exportWorkspace(workspaceId?: string): Promise<string> {
    if (!workspaceId) {
      const workspace = await this.initializeWorkspace();
      workspaceId = workspace.id;
    }

    const workspace = await db.workspaces.get(workspaceId!);
    const charts = await this.loadChartConfigurations(workspaceId);
    // Charts are already sorted by createdAt in loadChartConfigurations

    const exportData = {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      workspace,
      charts
    };

    return JSON.stringify(exportData, null, 2);
  }

  async importWorkspace(jsonData: string): Promise<{ workspace: Workspace; charts: ChartConfiguration[] }> {
    const data = JSON.parse(jsonData);
    
    if (data.version !== '1.0') {
      throw new Error('Unsupported export version');
    }

    const newWorkspaceId = uuidv4();
    const workspace: Workspace = {
      ...data.workspace,
      id: newWorkspaceId,
      isActive: false,
      selectedDataKeys: data.workspace.selectedDataKeys || [],
      createdAt: new Date(data.workspace.createdAt),
      updatedAt: new Date()
    };

    await db.workspaces.add(workspace);

    // Preserve the order from the imported data
    const charts: ChartConfiguration[] = data.charts.map((chart: ChartConfiguration) => ({
      ...chart,
      id: uuidv4(),
      workspaceId: newWorkspaceId,
      createdAt: new Date(chart.createdAt),
      updatedAt: new Date()
    }));

    // Add charts one by one to ensure order is preserved
    await db.chartConfigurations.bulkAdd(charts);

    return { workspace, charts };
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    await db.transaction('rw', db.workspaces, async () => {
      // Get all workspaces and update them
      const allWorkspaces = await db.workspaces.toArray();
      for (const workspace of allWorkspaces) {
        if (workspace.isActive && workspace.id !== workspaceId) {
          await db.workspaces.update(workspace.id!, { isActive: false });
        }
      }
      await db.workspaces.update(workspaceId, { isActive: true });
    });
  }

  async getActiveWorkspace(): Promise<Workspace | undefined> {
    // Use filter instead of where clause to avoid key type issues
    const allWorkspaces = await db.workspaces.toArray();
    return allWorkspaces.find(w => {
      // Handle legacy data where isActive might be stored as 1/0
      const isActive = w.isActive as boolean | number;
      return isActive === true || isActive === 1;
    });
  }

  async createWorkspace(name: string, description?: string): Promise<Workspace> {
    const workspace: Workspace = {
      id: uuidv4(),
      name,
      description,
      isActive: false,
      selectedDataKeys: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.workspaces.add(workspace);
    return workspace;
  }

  async getAllWorkspaces(): Promise<Workspace[]> {
    return await db.workspaces.toArray();
  }

  async updateWorkspace(workspaceId: string, updates: Partial<Workspace>): Promise<void> {
    await db.workspaces.update(workspaceId, {
      ...updates,
      updatedAt: new Date()
    });
  }

  async deleteWorkspace(workspaceId: string): Promise<void> {
    await db.transaction('rw', db.workspaces, db.chartConfigurations, async () => {
      // Delete all charts in the workspace
      const charts = await db.chartConfigurations
        .where('workspaceId')
        .equals(workspaceId)
        .toArray();
      
      for (const chart of charts) {
        await db.chartConfigurations.delete(chart.id!);
      }
      
      // Delete the workspace
      await db.workspaces.delete(workspaceId);
    });
  }

  async updateWorkspaceSelectedDataKeys(workspaceId: string, selectedDataKeys: string[]): Promise<void> {
    console.log('[updateWorkspaceSelectedDataKeys] Updating workspace:', workspaceId, 'with keys:', selectedDataKeys);
    const result = await db.workspaces.update(workspaceId, { 
      selectedDataKeys,
      updatedAt: new Date()
    });
    console.log('[updateWorkspaceSelectedDataKeys] Update result:', result);
    
    // Verify the update
    const updated = await db.workspaces.get(workspaceId);
    console.log('[updateWorkspaceSelectedDataKeys] Verified workspace after update:', updated);
  }

  async updateActiveWorkspaceSelectedDataKeys(selectedDataKeys: string[]): Promise<void> {
    let activeWorkspace = await this.getActiveWorkspace();
    console.log('[updateActiveWorkspaceSelectedDataKeys] activeWorkspace:', activeWorkspace);
    console.log('[updateActiveWorkspaceSelectedDataKeys] selectedDataKeys:', selectedDataKeys);
    
    // If no active workspace found, try to initialize one
    if (!activeWorkspace) {
      console.warn('[updateActiveWorkspaceSelectedDataKeys] No active workspace found, initializing...');
      activeWorkspace = await this.initializeWorkspace();
    }
    
    if (activeWorkspace && activeWorkspace.id) {
      try {
        await this.updateWorkspaceSelectedDataKeys(activeWorkspace.id, selectedDataKeys);
        console.log('[updateActiveWorkspaceSelectedDataKeys] Successfully updated workspace with keys');
      } catch (error) {
        console.error('[updateActiveWorkspaceSelectedDataKeys] Error updating workspace:', error);
        
        // Retry once after a short delay
        setTimeout(async () => {
          try {
            const retryWorkspace = await this.getActiveWorkspace();
            if (retryWorkspace && retryWorkspace.id) {
              await this.updateWorkspaceSelectedDataKeys(retryWorkspace.id, selectedDataKeys);
              console.log('[updateActiveWorkspaceSelectedDataKeys] Successfully updated workspace on retry');
            }
          } catch (retryError) {
            console.error('[updateActiveWorkspaceSelectedDataKeys] Retry failed:', retryError);
          }
        }, 100);
      }
    } else {
      console.error('[updateActiveWorkspaceSelectedDataKeys] Failed to get or create active workspace');
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async migrateSelectedDataFromCharts(_workspaceId: string): Promise<string[]> {
    // Since charts no longer have selectedDataIds, migration is not needed
    // Return empty array
    return [];
  }

  async getWorkspaceStats(workspaceId: string): Promise<{ dataCount: number; chartCount: number }> {
    try {
      // Get workspace
      const workspace = await db.workspaces.get(workspaceId);
      if (!workspace) {
        return { dataCount: 0, chartCount: 0 };
      }

      // Count selected data
      const dataCount = workspace.selectedDataKeys?.length || 0;

      // Count charts
      const chartCount = await db.chartConfigurations
        .where('workspaceId')
        .equals(workspaceId)
        .count();

      return { dataCount, chartCount };
    } catch (error) {
      console.error('[getWorkspaceStats] Error:', error);
      return { dataCount: 0, chartCount: 0 };
    }
  }

  async cleanupEmptyWorkspaces(): Promise<number> {
    try {
      const allWorkspaces = await this.getAllWorkspaces();
      let deletedCount = 0;

      for (const workspace of allWorkspaces) {
        if (!workspace.id || workspace.isActive) continue;

        const stats = await this.getWorkspaceStats(workspace.id);
        
        // Delete workspace if it has no data and no charts
        if (stats.dataCount === 0 && stats.chartCount === 0) {
          await this.deleteWorkspace(workspace.id);
          deletedCount++;
          console.log(`[cleanupEmptyWorkspaces] Deleted empty workspace: ${workspace.name} (${workspace.id})`);
        }
      }

      return deletedCount;
    } catch (error) {
      console.error('[cleanupEmptyWorkspaces] Error:', error);
      return 0;
    }
  }
}

export const chartConfigService = ChartConfigurationService.getInstance();