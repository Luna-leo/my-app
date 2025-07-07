import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema';

export interface ChartSeriesData {
  metadataId: number;
  metadataLabel: string;
  parameterId: string;
  parameterInfo: ParameterInfo;
  timestamps: number[];
  values: (number | null)[];
}

export interface ChartData {
  series: ChartSeriesData[];
}

export interface XYSeriesData {
  metadataId: number;
  metadataLabel: string;
  parameterId: string;
  parameterInfo: ParameterInfo;
  xValues: number[];
  yValues: (number | null)[];
}

export interface XYData {
  xParameterInfo: ParameterInfo | null;
  series: XYSeriesData[];
}

/**
 * Merge time series data from multiple sources
 */
export function mergeTimeSeriesData(dataArrays: TimeSeriesData[][]): TimeSeriesData[] {
  // Flatten all data
  const allData = dataArrays.flat();
  
  // Sort by timestamp
  allData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  return allData;
}

/**
 * Transform time series data for chart display
 */
export async function transformDataForChart(
  timeSeriesData: TimeSeriesData[],
  yAxisParameters: string[],
  parameterInfoMap: Map<string, ParameterInfo>,
  metadataMap: Map<number, { label?: string; plant: string; machineNo: string }>
): Promise<ChartData> {
  if (timeSeriesData.length === 0) {
    return {
      series: []
    };
  }

  // Group data by metadataId
  const dataByMetadata = new Map<number, TimeSeriesData[]>();
  timeSeriesData.forEach(data => {
    const group = dataByMetadata.get(data.metadataId) || [];
    group.push(data);
    dataByMetadata.set(data.metadataId, group);
  });

  // Create series for each metadata x parameter combination
  const series: ChartSeriesData[] = [];
  
  dataByMetadata.forEach((dataPoints, metadataId) => {
    const metadata = metadataMap.get(metadataId);
    const metadataLabel = metadata?.label || `${metadata?.plant}-${metadata?.machineNo}` || `Data ${metadataId}`;
    
    yAxisParameters.forEach(parameterId => {
      const parameterInfo = parameterInfoMap.get(parameterId);
      if (!parameterInfo) {
        throw new Error(`Parameter info not found for ${parameterId}`);
      }

      const timestamps = dataPoints.map(d => d.timestamp.getTime());
      const values = dataPoints.map(d => d.data[parameterId] ?? null);

      series.push({
        metadataId,
        metadataLabel,
        parameterId,
        parameterInfo,
        timestamps,
        values
      });
    });
  });

  return {
    series
  };
}

/**
 * Transform data for XY chart (non-time based)
 */
export async function transformDataForXYChart(
  timeSeriesData: TimeSeriesData[],
  xAxisParameter: string,
  yAxisParameters: string[],
  parameterInfoMap: Map<string, ParameterInfo>,
  metadataMap: Map<number, { label?: string; plant: string; machineNo: string }>
): Promise<XYData> {
  if (timeSeriesData.length === 0) {
    return {
      xParameterInfo: null,
      series: []
    };
  }

  // Get X-axis parameter info
  const xParameterInfo = parameterInfoMap.get(xAxisParameter) || null;

  // Group data by metadataId
  const dataByMetadata = new Map<number, TimeSeriesData[]>();
  timeSeriesData.forEach(data => {
    const group = dataByMetadata.get(data.metadataId) || [];
    group.push(data);
    dataByMetadata.set(data.metadataId, group);
  });

  // Create series for each metadata x parameter combination
  const series: XYSeriesData[] = [];
  
  dataByMetadata.forEach((dataPoints, metadataId) => {
    const metadata = metadataMap.get(metadataId);
    const metadataLabel = metadata?.label || `${metadata?.plant}-${metadata?.machineNo}` || `Data ${metadataId}`;
    
    yAxisParameters.forEach(parameterId => {
      const parameterInfo = parameterInfoMap.get(parameterId);
      if (!parameterInfo) {
        throw new Error(`Parameter info not found for ${parameterId}`);
      }

      const xValues = dataPoints.map(d => {
        const value = d.data[xAxisParameter];
        return value !== null ? value : NaN;
      });
      const yValues = dataPoints.map(d => d.data[parameterId] ?? null);

      series.push({
        metadataId,
        metadataLabel,
        parameterId,
        parameterInfo,
        xValues,
        yValues
      });
    });
  });

  return {
    xParameterInfo,
    series
  };
}

/**
 * Calculate data range for scaling
 */
export function calculateDataRange(values: (number | null)[]): { min: number; max: number } {
  const validValues = values.filter(v => v !== null && !isNaN(v)) as number[];
  
  if (validValues.length === 0) {
    return { min: 0, max: 1 };
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  
  // Add 5% padding
  const range = max - min;
  const padding = range * 0.05;
  
  return {
    min: min - padding,
    max: max + padding
  };
}

/**
 * Normalize values to [-1, 1] range for WebGL
 */
export function normalizeValues(
  values: (number | null)[],
  min: number,
  max: number
): number[] {
  const range = max - min || 1;
  
  return values.map(value => {
    if (value === null || isNaN(value)) {
      return 0; // Default to center for invalid values
    }
    return ((value - min) / range) * 2 - 1;
  });
}

/**
 * Generate distinct colors for multiple lines
 */
export function generateLineColors(count: number): { r: number; g: number; b: number; a: number }[] {
  const colors = [
    { r: 0.2, g: 0.6, b: 1.0, a: 1 },   // Blue
    { r: 1.0, g: 0.2, b: 0.2, a: 1 },   // Red
    { r: 0.2, g: 0.8, b: 0.2, a: 1 },   // Green
    { r: 1.0, g: 0.6, b: 0.0, a: 1 },   // Orange
    { r: 0.8, g: 0.2, b: 0.8, a: 1 },   // Purple
    { r: 0.0, g: 0.8, b: 0.8, a: 1 },   // Cyan
    { r: 0.8, g: 0.8, b: 0.2, a: 1 },   // Yellow
    { r: 0.6, g: 0.4, b: 0.2, a: 1 },   // Brown
  ];

  const result: { r: number; g: number; b: number; a: number }[] = [];
  
  for (let i = 0; i < count; i++) {
    result.push(colors[i % colors.length]);
  }
  
  return result;
}