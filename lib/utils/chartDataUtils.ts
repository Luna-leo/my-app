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
  // Calculate total size to pre-allocate array
  let totalSize = 0;
  for (const arr of dataArrays) {
    totalSize += arr.length;
  }
  
  // Pre-allocate result array
  const allData = new Array<TimeSeriesData>(totalSize);
  let index = 0;
  
  // Copy data without using flat()
  for (const arr of dataArrays) {
    if (!arr) continue; // Skip null/undefined arrays
    for (const item of arr) {
      if (item) { // Only add valid items
        allData[index++] = item;
      }
    }
  }
  
  // Remove any undefined entries that might have been created if index < totalSize
  const validData = allData.slice(0, index);
  
  // Sort by timestamp
  validData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  return validData;
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
  // Debug logging
  console.log('[transformDataForChart] Input:', {
    dataLength: timeSeriesData.length,
    yAxisParameters,
    parameterInfoMapSize: parameterInfoMap.size,
    metadataMapSize: metadataMap.size
  });

  if (timeSeriesData.length === 0) {
    return {
      series: []
    };
  }

  // Validate input data
  if (!Array.isArray(yAxisParameters)) {
    console.error('[transformDataForChart] yAxisParameters is not an array:', yAxisParameters);
    return {
      series: []
    };
  }

  // Group data by metadataId
  const dataByMetadata = new Map<number, TimeSeriesData[]>();
  console.log('[transformDataForChart] Grouping data. Total points:', timeSeriesData.length);
  
  timeSeriesData.forEach((data, index) => {
    if (!data || typeof data.metadataId !== 'number') {
      console.warn(`[transformDataForChart] Invalid data point at index ${index}:`, data);
      return;
    }
    const group = dataByMetadata.get(data.metadataId) || [];
    group.push(data);
    dataByMetadata.set(data.metadataId, group);
  });
  
  console.log('[transformDataForChart] Data grouped into', dataByMetadata.size, 'metadata groups');

  // Create series for each metadata x parameter combination
  const series: ChartSeriesData[] = [];
  
  dataByMetadata.forEach((dataPoints, metadataId) => {
    const metadata = metadataMap.get(metadataId);
    const metadataLabel = metadata?.label || `${metadata?.plant}-${metadata?.machineNo}` || `Data ${metadataId}`;
    
    yAxisParameters.forEach(parameterId => {
      if (!parameterId) {
        console.warn('[transformDataForChart] Empty parameterId');
        return;
      }

      console.log(`[transformDataForChart] Processing parameterId: "${parameterId}" (type: ${typeof parameterId})`);

      const parameterInfo = parameterInfoMap.get(parameterId);
      if (!parameterInfo) {
        console.warn(`[transformDataForChart] Parameter info not found for "${parameterId}". Available in map:`, Array.from(parameterInfoMap.keys()));
        return;
      }

      // Pre-allocate arrays for better performance
      const timestamps = new Array<number>(dataPoints.length);
      const values = new Array<number | null>(dataPoints.length);
      
      // Fill arrays without creating intermediate objects
      let validPointCount = 0;
      for (let i = 0; i < dataPoints.length; i++) {
        const dataPoint = dataPoints[i];
        
        // Validate data point
        if (!dataPoint || !dataPoint.timestamp) {
          console.warn(`[transformDataForChart] Invalid data point at index ${i}:`, dataPoint);
          timestamps[i] = 0;
          values[i] = null;
          continue;
        }
        
        validPointCount++;
        
        // Safely get timestamp
        try {
          timestamps[i] = dataPoint.timestamp.getTime();
        } catch {
          console.warn(`[transformDataForChart] Invalid timestamp at index ${i}:`, dataPoint.timestamp);
          timestamps[i] = 0;
        }
        
        // Safely get value
        if (dataPoint.data && typeof dataPoint.data === 'object') {
          // Check if the parameter exists in the data
          if (parameterId in dataPoint.data) {
            values[i] = dataPoint.data[parameterId] ?? null;
          } else {
            // Only log first occurrence to avoid spam
            if (i === 0) {
              const dataKeys = Object.keys(dataPoint.data);
              console.warn(`[transformDataForChart] Parameter "${parameterId}" not found in data.`);
              console.warn(`[transformDataForChart] Available keys (first 10):`, dataKeys.slice(0, 10));
              console.warn(`[transformDataForChart] Total keys:`, dataKeys.length);
              console.warn(`[transformDataForChart] Sample key types:`, dataKeys.slice(0, 5).map(k => `${k}: ${typeof dataPoint.data[k]}`));
            }
            values[i] = null;
          }
        } else {
          // Only log first occurrence to avoid spam
          if (i === 0) {
            console.warn(`[transformDataForChart] Invalid data object at index ${i}:`, dataPoint);
          }
          values[i] = null;
        }
      }
      
      console.log(`[transformDataForChart] Processed ${validPointCount}/${dataPoints.length} valid points for parameterId "${parameterId}"`);

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
  // Debug logging
  console.log('[transformDataForXYChart] Input:', {
    dataLength: timeSeriesData.length,
    xAxisParameter,
    yAxisParameters,
    parameterInfoMapSize: parameterInfoMap.size,
    metadataMapSize: metadataMap.size
  });

  if (timeSeriesData.length === 0) {
    return {
      xParameterInfo: null,
      series: []
    };
  }

  // Validate input data
  if (!Array.isArray(yAxisParameters)) {
    console.error('[transformDataForXYChart] yAxisParameters is not an array:', yAxisParameters);
    return {
      xParameterInfo: null,
      series: []
    };
  }

  // Check if data has valid structure
  const sampleData = timeSeriesData[0];
  if (!sampleData || !sampleData.data) {
    console.error('[transformDataForXYChart] Invalid data structure:', sampleData);
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

      // Pre-allocate arrays for better performance
      const xValues = new Array<number>(dataPoints.length);
      const yValues = new Array<number | null>(dataPoints.length);
      
      // Fill arrays without creating intermediate objects
      for (let i = 0; i < dataPoints.length; i++) {
        const dataPoint = dataPoints[i];
        if (!dataPoint || !dataPoint.data) {
          // Only log first occurrence to avoid spam
          if (i === 0) {
            console.error(`[transformDataForXYChart] Invalid data point for metadataId ${metadataId}:`, dataPoint);
          }
          xValues[i] = NaN;
          yValues[i] = null;
          continue;
        }
        
        const xValue = dataPoint.data[xAxisParameter];
        xValues[i] = xValue !== null && xValue !== undefined ? Number(xValue) : NaN;
        yValues[i] = dataPoint.data[parameterId] ?? null;
      }

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
  const result = new Array<number>(values.length);
  
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || isNaN(value)) {
      result[i] = 0; // Default to center for invalid values
    } else {
      result[i] = ((value - min) / range) * 2 - 1;
    }
  }
  
  return result;
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