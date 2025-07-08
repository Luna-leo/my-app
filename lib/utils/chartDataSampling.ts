/**
 * Chart-specific data sampling utilities
 * Handles sampling for time series data with multiple parameters
 */

import { TimeSeriesData } from '@/lib/db/schema';
import { sampleData, SamplingOptions, DataPoint } from './dataSamplingUtils';

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
  targetPoints: 2000,
  preserveExtremes: true,
  samplingThreshold: 5000
};

/**
 * Sample time series data while preserving all parameters
 */
export function sampleTimeSeriesData(
  data: TimeSeriesData[],
  config: SamplingConfig = DEFAULT_SAMPLING_CONFIG
): TimeSeriesData[] {
  // Don't sample if disabled or data is small
  if (!config.enabled || data.length <= config.samplingThreshold) {
    return data;
  }

  // Convert to DataPoint format for sampling
  // Use the first numeric parameter for sampling decisions
  const firstParam = data.length > 0 && data[0].data 
    ? Object.keys(data[0].data).find(key => typeof data[0].data[key] === 'number')
    : null;

  if (!firstParam) {
    console.warn('No numeric parameter found for sampling, returning original data');
    return data;
  }

  // Convert to sampling format
  const dataPoints: DataPoint[] = data.map(item => ({
    x: item.timestamp,
    y: item.data[firstParam] as number || 0,
    originalData: item // Keep reference to original
  }));

  // Apply sampling
  const samplingOptions: SamplingOptions = {
    method: config.method,
    targetPoints: config.targetPoints,
    preserveExtremes: config.preserveExtremes
  };

  const samplingResult = sampleData(dataPoints, samplingOptions);

  // Convert back to TimeSeriesData format
  const sampledData = samplingResult.data.map(point => {
    const original = (point as any).originalData as TimeSeriesData;
    return original;
  });

  console.log(`Time series sampled: ${samplingResult.originalCount} → ${samplingResult.sampledCount} points`);

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
  parameters.forEach(param => {
    const dataPoints: DataPoint[] = data.map((item, index) => ({
      x: item.timestamp,
      y: typeof item.data[param] === 'number' ? item.data[param] as number : 0,
      index
    }));

    const samplingOptions: SamplingOptions = {
      method: config.method,
      targetPoints: Math.floor(config.targetPoints / parameters.length), // Distribute points
      preserveExtremes: config.preserveExtremes
    };

    const samplingResult = sampleData(dataPoints, samplingOptions);
    
    // Add sampled indices to the keep set
    samplingResult.data.forEach(point => {
      const index = (point as any).index;
      if (typeof index === 'number') {
        indicesToKeep.add(index);
      }
    });
  });

  // Return data points that were selected by any parameter sampling
  const sampledData = Array.from(indicesToKeep)
    .sort((a, b) => a - b)
    .map(index => data[index]);

  console.log(`Multi-parameter sampled: ${data.length} → ${sampledData.length} points`);

  return sampledData;
}

/**
 * Progressive sampling strategy for viewport-based loading
 */
export function getProgressiveSamplingConfig(
  dataLength: number,
  viewportWidth?: number
): SamplingConfig {
  // Determine target points based on data size and viewport
  let targetPoints = DEFAULT_SAMPLING_CONFIG.targetPoints;
  
  if (viewportWidth) {
    // Aim for ~2-3 points per pixel
    targetPoints = Math.min(viewportWidth * 2.5, 10000);
  } else if (dataLength > 100000) {
    targetPoints = 5000; // Higher quality for very large datasets
  } else if (dataLength > 50000) {
    targetPoints = 3000;
  }

  return {
    ...DEFAULT_SAMPLING_CONFIG,
    targetPoints,
    method: dataLength > 50000 ? 'adaptive' : 'lttb'
  };
}