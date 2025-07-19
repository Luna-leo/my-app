export interface DataSource {
  type: 'CASS' | 'Chinami';
  encoding: 'shift-jis' | 'utf-8';
}

export interface Metadata {
  id?: number;
  dataKey: string;
  plant: string;
  machineNo: string;
  label?: string;
  event?: string;
  startTime?: Date;
  endTime?: Date;
  dataStartTime?: Date;
  dataEndTime?: Date;
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

export interface ChartConfiguration {
  id?: string;
  workspaceId: string;
  title: string;
  chartType: 'line' | 'scatter';
  xAxisParameter: string;
  yAxisParameters: string[];
  displaySettings?: {
    colors?: string[];
    lineStyles?: string[];
    markerStyles?: string[];
    yAxisRange?: [number, number];
    xAxisRange?: [number, number];
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface Workspace {
  id?: string;
  name: string;
  description?: string;
  isActive: boolean;
  selectedDataKeys: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ParquetFile {
  id?: string;
  metadataId: number;
  filename: string;
  blob: Blob;
  size: number;
  parameters: string[]; // List of parameter IDs in this file
  rowCount: number;
  createdAt: Date;
}

export interface DataChunk {
  id?: string;
  metadataId: number;
  chunkIndex: number;
  compressedData: Blob;
  rowCount: number;
  startRow: number;
  endRow: number;
  startTimestamp?: Date;
  endTimestamp?: Date;
  columns: string[];
  compressionType: 'gzip' | 'none';
  createdAt: Date;
}