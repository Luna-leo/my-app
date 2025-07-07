export interface DataSource {
  type: 'CASS' | 'Chinami';
  encoding: 'shift-jis' | 'utf-8';
}

export interface Metadata {
  id?: number;
  plant: string;
  machineNo: string;
  label?: string;
  event?: string;
  startTime?: Date;
  endTime?: Date;
  dataSource: DataSource['type'];
  importedAt: Date;
}

export interface ParameterInfo {
  id?: number;
  parameterId: string;
  parameterName: string;
  unit: string;
  plant: string;
  machineNo: string;
}

export interface TimeSeriesData {
  id?: number;
  metadataId: number;
  timestamp: Date;
  data: Record<string, number | null>;
}

export interface CsvHeader {
  parameterId: string;
  parameterName: string;
  unit: string;
}