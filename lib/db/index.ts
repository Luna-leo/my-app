import Dexie, { Table } from 'dexie';
import { Metadata, ParameterInfo, TimeSeriesData } from './schema';

export class AppDatabase extends Dexie {
  metadata!: Table<Metadata>;
  parameters!: Table<ParameterInfo>;
  timeSeries!: Table<TimeSeriesData>;

  constructor() {
    super('GraphDataDB');
    
    this.version(1).stores({
      metadata: '++id, plant, machineNo, importedAt',
      parameters: '++id, parameterId, [plant+machineNo], plant, machineNo',
      timeSeries: '++id, metadataId, timestamp'
    });
  }

  async clearAllData() {
    await this.transaction('rw', this.metadata, this.parameters, this.timeSeries, async () => {
      await this.metadata.clear();
      await this.parameters.clear();
      await this.timeSeries.clear();
    });
  }

  async getParametersByPlantAndMachine(plant: string, machineNo: string) {
    return await this.parameters
      .where('[plant+machineNo]')
      .equals([plant, machineNo])
      .toArray();
  }

  async getTimeSeriesData(metadataId: number, startTime?: Date, endTime?: Date) {
    const query = this.timeSeries.where('metadataId').equals(metadataId);
    
    if (startTime || endTime) {
      const results = await query.toArray();
      return results.filter(item => {
        if (startTime && item.timestamp < startTime) return false;
        if (endTime && item.timestamp > endTime) return false;
        return true;
      });
    }
    
    return await query.toArray();
  }
}

export const db = new AppDatabase();