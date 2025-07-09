/**
 * Chart-specific data sampling utilities
 * Handles sampling for time series data with multiple parameters
 */

import { TimeSeriesData } from '@/lib/db/schema';
import { sampleData, SamplingOptions, DataPoint } from './dataSamplingUtils';


// Extended DataPoint type for parameter series with index
interface IndexedDataPoint extends DataPoint {
  index: number;
}

export interface SamplingConfig {
  enabled: boolean;
  method: 'lttb' | 'nth' | 'minmax' | 'adaptive';
  targetPoints: number;
  preserveExtremes: boolean;
  samplingThreshold: number; // Only sample if data exceeds this threshold
}

export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  enabled: true,
  method: 'lttb',
  targetPoints: 1000, // Reduced for better memory efficiency
  preserveExtremes: true,
  samplingThreshold: 2000 // More aggressive sampling
};

/**
 * Sample time series data while preserving all parameters
 * @param data - Time series data to sample
 * @param config - Sampling configuration
 * @param samplingParameter - Optional specific parameter to use for sampling decisions. If not provided, uses the first numeric parameter (sorted alphabetically)
 */
export function sampleTimeSeriesData(
  data: TimeSeriesData[],
  config: SamplingConfig = DEFAULT_SAMPLING_CONFIG,
  samplingParameter?: string
): TimeSeriesData[] {
  // Don't sample if disabled or data is small
  if (!config.enabled || data.length <= config.samplingThreshold) {
    return data;
  }

  // Determine which parameter to use for sampling
  let parameterForSampling: string | null = null;
  
  if (samplingParameter) {
    // Use the provided parameter if it exists and is numeric
    if (data.length > 0 && data[0].data && 
        samplingParameter in data[0].data && 
        typeof data[0].data[samplingParameter] === 'number') {
      parameterForSampling = samplingParameter;
    }
  }
  
  if (!parameterForSampling && data.length > 0 && data[0].data) {
    // Get all numeric parameters and sort them alphabetically for deterministic selection
    const numericParams = Object.keys(data[0].data)
      .filter(key => typeof data[0].data[key] === 'number')
      .sort(); // Sort alphabetically to ensure consistent ordering
    
    parameterForSampling = numericParams[0] || null;
  }

  if (!parameterForSampling) {
    console.warn('No numeric parameter found for sampling, returning original data');
    return data;
  }

  // Create lightweight data points for sampling without copying all data
  const dataPointsGenerator = function*() {
    for (let i = 0; i < data.length; i++) {
      yield {
        x: data[i].timestamp,
        y: data[i].data[parameterForSampling] as number || 0,
        index: i // Store index instead of full data
      };
    }
  };

  // Convert generator to array for sampling (only creates minimal data)
  const dataPoints = Array.from(dataPointsGenerator());

  // Apply sampling
  const samplingOptions: SamplingOptions = {
    method: config.method,
    targetPoints: config.targetPoints,
    preserveExtremes: config.preserveExtremes
  };

  const samplingResult = sampleData(dataPoints, samplingOptions);

  // Extract only the sampled data using indices
  const sampledData: TimeSeriesData[] = [];
  for (const point of samplingResult.data) {
    const index = (point as IndexedDataPoint).index;
    if (typeof index === 'number' && index >= 0 && index < data.length) {
      sampledData.push(data[index]);
    }
  }

  console.log(`Time series sampled: ${samplingResult.originalCount} → ${samplingResult.sampledCount} points (using parameter: ${parameterForSampling})`);

  return sampledData;
}

/**
 * Sample data for each parameter series independently
 * This is useful when parameters have very different scales or patterns
 */
export function sampleParameterSeriesIndependently(
  data: TimeSeriesData[],
  parameters: string[],
  config: SamplingConfig = DEFAULT_SAMPLING_CONFIG
): TimeSeriesData[] {
  if (!config.enabled || data.length <= config.samplingThreshold) {
    return data;
  }

  // Create a map to track which indices to keep
  const indicesToKeep = new Set<number>();

  // Sample each parameter independently and combine results
  for (const param of parameters) {
    // Create data points without copying all data
    const dataPoints: IndexedDataPoint[] = [];
    for (let i = 0; i < data.length; i++) {
      dataPoints.push({
        x: data[i].timestamp,
        y: typeof data[i].data[param] === 'number' ? data[i].data[param] as number : 0,
        index: i
      });
    }

    const samplingOptions: SamplingOptions = {
      method: config.method,
      targetPoints: Math.floor(config.targetPoints / parameters.length), // Distribute points
      preserveExtremes: config.preserveExtremes
    };

    const samplingResult = sampleData(dataPoints, samplingOptions);
    
    // Add sampled indices to the keep set
    for (const point of samplingResult.data) {
      const index = (point as IndexedDataPoint).index;
      if (typeof index === 'number') {
        indicesToKeep.add(index);
      }
    }
  }

  // Return data points that were selected by any parameter sampling
  const sortedIndices = Array.from(indicesToKeep).sort((a, b) => a - b);
  const sampledData: TimeSeriesData[] = [];
  for (const index of sortedIndices) {
    sampledData.push(data[index]);
  }

  console.log(`Multi-parameter sampled: ${data.length} → ${sampledData.length} points`);

  return sampledData;
}

/**
 * Progressive sampling strategy for viewport-based loading
 * Optimized for memory efficiency
 */
export function getProgressiveSamplingConfig(
  dataLength: number,
  viewportWidth?: number,
  memoryPressure?: 'low' | 'medium' | 'high'
): SamplingConfig {
  // Base target points on memory pressure
  let baseTargetPoints = DEFAULT_SAMPLING_CONFIG.targetPoints;
  let threshold = DEFAULT_SAMPLING_CONFIG.samplingThreshold;
  
  // Adjust based on memory pressure
  if (memoryPressure === 'high') {
    baseTargetPoints = 500;
    threshold = 1000;
  } else if (memoryPressure === 'medium') {
    baseTargetPoints = 750;
    threshold = 1500;
  }
  
  // Determine target points based on data size and viewport
  let targetPoints = baseTargetPoints;
  
  if (viewportWidth) {
    // More conservative points per pixel
    targetPoints = Math.min(viewportWidth * 1.5, 5000);
  } else if (dataLength > 1000000) {
    // Very large datasets
    targetPoints = Math.min(baseTargetPoints * 2, 2000);
  } else if (dataLength > 500000) {
    targetPoints = Math.min(baseTargetPoints * 1.5, 1500);
  } else if (dataLength > 100000) {
    targetPoints = Math.min(baseTargetPoints * 1.2, 1200);
  }

  // Use more efficient sampling methods for large datasets
  let method: SamplingConfig['method'] = 'lttb';
  if (dataLength > 500000) {
    method = 'adaptive'; // Better for very large datasets
  } else if (dataLength > 100000) {
    method = 'minmax'; // Faster while preserving peaks
  }

  return {
    enabled: true,
    targetPoints,
    preserveExtremes: true,
    samplingThreshold: threshold,
    method
  };
}

/**
 * Get memory-aware sampling configuration
 * Monitors available memory and adjusts sampling accordingly
 */
export function getMemoryAwareSamplingConfig(
  dataLength: number,
  currentMemoryUsageMB?: number,
  maxMemoryMB: number = 200
): SamplingConfig {
  let memoryPressure: 'low' | 'medium' | 'high' = 'low';
  
  if (currentMemoryUsageMB) {
    const memoryUsageRatio = currentMemoryUsageMB / maxMemoryMB;
    if (memoryUsageRatio > 0.8) {
      memoryPressure = 'high';
    } else if (memoryUsageRatio > 0.6) {
      memoryPressure = 'medium';
    }
  }
  
  return getProgressiveSamplingConfig(dataLength, undefined, memoryPressure);
}

/**
 * Sample time series data independently for each metadata ID
 * This ensures each series maintains its shape when overlaid on the same chart
 * @param dataByMetadata - Map of metadataId to time series data
 * @param config - Base sampling configuration
 * @param samplingParameter - Optional specific parameter to use for sampling decisions
 */
export function sampleTimeSeriesDataByMetadata(
  dataByMetadata: Map<number, TimeSeriesData[]>,
  config: SamplingConfig = DEFAULT_SAMPLING_CONFIG,
  samplingParameter?: string
): TimeSeriesData[] {
  // Don't sample if disabled
  if (!config.enabled) {
    // Flatten and sort all data
    const allData: TimeSeriesData[] = [];
    dataByMetadata.forEach(data => {
      allData.push(...data);
    });
    allData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return allData;
  }

  const totalDataPoints = Array.from(dataByMetadata.values()).reduce((sum, data) => sum + data.length, 0);
  
  // If total data is small, don't sample
  if (totalDataPoints <= config.samplingThreshold) {
    const allData: TimeSeriesData[] = [];
    dataByMetadata.forEach(data => {
      allData.push(...data);
    });
    allData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
    return allData;
  }

  // Calculate how many points each series should get
  const seriesCount = dataByMetadata.size;
  const minPointsPerSeries = 100; // Ensure each series has at least 100 points
  const baseTargetPoints = Math.max(config.targetPoints, seriesCount * minPointsPerSeries);
  
  // Sample each metadata's data independently
  const sampledDataArrays: TimeSeriesData[][] = [];
  
  dataByMetadata.forEach((data, metadataId) => {
    if (data.length === 0) return;
    
    // Calculate proportional target points for this series
    const proportion = data.length / totalDataPoints;
    const targetPointsForSeries = Math.max(
      minPointsPerSeries,
      Math.floor(baseTargetPoints * proportion)
    );
    
    // Create a config specific to this series
    const seriesConfig: SamplingConfig = {
      ...config,
      targetPoints: targetPointsForSeries,
      samplingThreshold: 0 // Force sampling since we already checked total threshold
    };
    
    console.log(`[Sampling] Metadata ${metadataId}: ${data.length} → ${targetPointsForSeries} points (${(proportion * 100).toFixed(1)}% of total)`);
    
    // Sample this series
    const sampledSeries = sampleTimeSeriesData(data, seriesConfig, samplingParameter);
    sampledDataArrays.push(sampledSeries);
  });
  
  // Merge and sort all sampled data
  const allSampledData: TimeSeriesData[] = [];
  for (const arr of sampledDataArrays) {
    allSampledData.push(...arr);
  }
  allSampledData.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
  
  console.log(`[Sampling] Total: ${totalDataPoints} → ${allSampledData.length} points across ${seriesCount} series`);
  
  return allSampledData;
}