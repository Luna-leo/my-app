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
    const activeWorkspace = await db.workspaces.where('isActive').equals(1).first();
    
    if (activeWorkspace) {
      return activeWorkspace;
    }

    const defaultWorkspace: Workspace = {
      id: uuidv4(),
      name: 'Default Workspace',
      description: 'Default workspace for chart configurations',
      isActive: true,
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

    return await db.chartConfigurations
      .where('workspaceId')
      .equals(workspaceId!)
      .toArray();
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
      createdAt: new Date(data.workspace.createdAt),
      updatedAt: new Date()
    };

    await db.workspaces.add(workspace);

    const charts: ChartConfiguration[] = data.charts.map((chart: ChartConfiguration) => ({
      ...chart,
      id: uuidv4(),
      workspaceId: newWorkspaceId,
      createdAt: new Date(chart.createdAt),
      updatedAt: new Date()
    }));

    await db.chartConfigurations.bulkAdd(charts);

    return { workspace, charts };
  }

  async switchWorkspace(workspaceId: string): Promise<void> {
    await db.transaction('rw', db.workspaces, async () => {
      await db.workspaces.where('isActive').equals(1).modify({ isActive: false });
      await db.workspaces.update(workspaceId, { isActive: true });
    });
  }

  async getActiveWorkspace(): Promise<Workspace | undefined> {
    return await db.workspaces.where('isActive').equals(1).first();
  }

  async createWorkspace(name: string, description?: string): Promise<Workspace> {
    const workspace: Workspace = {
      id: uuidv4(),
      name,
      description,
      isActive: false,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    await db.workspaces.add(workspace);
    return workspace;
  }

  async getAllWorkspaces(): Promise<Workspace[]> {
    return await db.workspaces.toArray();
  }
}

export const chartConfigService = ChartConfigurationService.getInstance();