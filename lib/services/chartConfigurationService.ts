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
    // First try to find active workspace using filter instead of where clause
    const allWorkspaces = await db.workspaces.toArray();
    const activeWorkspace = allWorkspaces.find(w => w.isActive === true || w.isActive === 1);
    
    if (activeWorkspace) {
      // Ensure it's using boolean true
      if (activeWorkspace.isActive !== true) {
        await db.workspaces.update(activeWorkspace.id!, { isActive: true });
      }
      return activeWorkspace;
    }

    // Check if there are any workspaces at all
    if (allWorkspaces.length > 0) {
      // Make the first workspace active
      const firstWorkspace = allWorkspaces[0];
      await db.workspaces.update(firstWorkspace.id!, { isActive: true });
      return firstWorkspace;
    }

    // Create a new default workspace
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
    return allWorkspaces.find(w => w.isActive === true || w.isActive === 1);
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

  async migrateSelectedDataFromCharts(_workspaceId: string): Promise<string[]> {
    // Since charts no longer have selectedDataIds, migration is not needed
    // Return empty array
    return [];
  }
}

export const chartConfigService = ChartConfigurationService.getInstance();