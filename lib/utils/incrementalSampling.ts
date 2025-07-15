/**
 * Incremental Sampling Utilities
 * Efficiently generate higher resolution samples using existing lower resolution data
 */

import { TimeSeriesData } from '@/lib/db/schema';
import { SamplingConfig, sampleTimeSeriesData } from './chartDataSampling';
import { sampleData, DataPoint } from './dataSamplingUtils';

// Extended DataPoint type with index for tracking original positions
interface IndexedDataPoint extends DataPoint {
  index: number;
}

interface IncrementalSamplingResult {
  data: TimeSeriesData[];
  reusedPoints: number;
  newPoints: number;
  method: 'incremental' | 'full';
}

/**
 * Generate higher resolution data by combining existing sampled data with additional points
 * This avoids re-processing the entire dataset
 */
export function incrementalSample(
  originalData: TimeSeriesData[],
  existingSampledData: TimeSeriesData[],
  existingConfig: SamplingConfig,
  targetConfig: SamplingConfig,
  samplingParameter?: string
): IncrementalSamplingResult {
  // If target is lower resolution than existing, just downsample the existing data
  if (targetConfig.targetPoints <= existingConfig.targetPoints) {
    console.log(`[IncrementalSampling] Downsampling from ${existingConfig.targetPoints} to ${targetConfig.targetPoints}`);
    const downsampled = resampleData(existingSampledData, targetConfig, samplingParameter);
    return {
      data: downsampled,
      reusedPoints: downsampled.length,
      newPoints: 0,
      method: 'incremental'
    };
  }

  // If sampling methods differ, we need to do full resampling
  if (existingConfig.method !== targetConfig.method) {
    console.log(`[IncrementalSampling] Method changed from ${existingConfig.method} to ${targetConfig.method}, full resampling required`);
    return {
      data: sampleTimeSeriesData(originalData, targetConfig, samplingParameter),
      reusedPoints: 0,
      newPoints: targetConfig.targetPoints,
      method: 'full'
    };
  }

  // For LTTB method, we can reuse existing points and add more
  if (targetConfig.method === 'lttb') {
    return incrementalLTTB(
      originalData,
      existingSampledData,
      existingConfig,
      targetConfig,
      samplingParameter
    );
  }

  // For nth-point sampling, we can calculate additional indices
  if (targetConfig.method === 'nth') {
    return incrementalNth(
      originalData,
      existingSampledData,
      existingConfig,
      targetConfig
    );
  }

  // For other methods, fall back to full resampling
  console.log(`[IncrementalSampling] Unsupported method ${targetConfig.method} for incremental sampling`);
  return {
    data: sampleTimeSeriesData(originalData, targetConfig, samplingParameter),
    reusedPoints: 0,
    newPoints: targetConfig.targetPoints,
    method: 'full'
  };
}

/**
 * Incremental LTTB sampling - reuse existing points and add more detail
 */
function incrementalLTTB(
  originalData: TimeSeriesData[],
  existingSampledData: TimeSeriesData[],
  existingConfig: SamplingConfig,
  targetConfig: SamplingConfig,
  samplingParameter?: string
): IncrementalSamplingResult {
  if (originalData.length === 0) {
    return { data: [], reusedPoints: 0, newPoints: 0, method: 'incremental' };
  }

  // Create a map of existing sampled points by timestamp for quick lookup
  const existingTimestamps = new Set(existingSampledData.map(d => d.timestamp));
  
  // Identify regions where we need more detail
  const regions = identifyLowDensityRegions(existingSampledData, targetConfig.targetPoints);
  
  // Collect additional points from original data
  const additionalPoints: TimeSeriesData[] = [];
  let additionalBudget = targetConfig.targetPoints - existingSampledData.length;

  for (const region of regions) {
    if (additionalBudget <= 0) break;

    // Find original points in this region that aren't already sampled
    const regionPoints = originalData.filter(d => 
      d.timestamp.getTime() >= region.start && 
      d.timestamp.getTime() <= region.end && 
      !existingTimestamps.has(d.timestamp)
    );

    // Sample additional points from this region
    const pointsToAdd = Math.min(
      Math.ceil(region.targetPoints),
      regionPoints.length,
      additionalBudget
    );

    if (pointsToAdd > 0 && regionPoints.length > 0) {
      // Use LTTB to select the best points from this region
      const sampledRegion = sampleTimeSeriesDataLTTB(
        regionPoints,
        pointsToAdd,
        samplingParameter
      );
      additionalPoints.push(...sampledRegion);
      additionalBudget -= sampledRegion.length;
    }
  }

  // Combine existing and new points, then sort by timestamp
  const combined = [...existingSampledData, ...additionalPoints].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  console.log(`[IncrementalSampling] LTTB: Reused ${existingSampledData.length} points, added ${additionalPoints.length} new points`);

  return {
    data: combined,
    reusedPoints: existingSampledData.length,
    newPoints: additionalPoints.length,
    method: 'incremental'
  };
}

/**
 * Incremental nth-point sampling
 */
function incrementalNth(
  originalData: TimeSeriesData[],
  existingSampledData: TimeSeriesData[],
  existingConfig: SamplingConfig,
  targetConfig: SamplingConfig
): IncrementalSamplingResult {
  if (originalData.length === 0) {
    return { data: [], reusedPoints: 0, newPoints: 0, method: 'incremental' };
  }

  // Calculate the step sizes
  const existingStep = Math.max(1, Math.floor(originalData.length / existingConfig.targetPoints));
  const targetStep = Math.max(1, Math.floor(originalData.length / targetConfig.targetPoints));

  // If target step is larger, we're downsampling - just filter existing data
  if (targetStep >= existingStep) {
    const downsampled = existingSampledData.filter((_, index) => 
      index % Math.floor(targetStep / existingStep) === 0
    );
    return {
      data: downsampled,
      reusedPoints: downsampled.length,
      newPoints: 0,
      method: 'incremental'
    };
  }

  // For upsampling, we need to add intermediate points
  const result: TimeSeriesData[] = [];
  const existingIndices = new Set<number>();

  // Map existing points to their original indices
  existingSampledData.forEach(point => {
    const idx = originalData.findIndex(d => d.timestamp === point.timestamp);
    if (idx !== -1) existingIndices.add(idx);
  });

  // Add all points at the new interval
  for (let i = 0; i < originalData.length; i += targetStep) {
    result.push(originalData[i]);
  }

  // Sort by timestamp
  result.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  const reusedCount = result.filter(point => 
    existingIndices.has(originalData.findIndex(d => d.timestamp === point.timestamp))
  ).length;

  console.log(`[IncrementalSampling] Nth: Generated ${result.length} points (${reusedCount} reused)`);

  return {
    data: result,
    reusedPoints: reusedCount,
    newPoints: result.length - reusedCount,
    method: 'incremental'
  };
}

/**
 * Identify regions with low point density that need more detail
 */
function identifyLowDensityRegions(
  sampledData: TimeSeriesData[],
  targetPoints: number
): Array<{ start: number; end: number; targetPoints: number }> {
  if (sampledData.length < 2) return [];

  const regions: Array<{ start: number; end: number; gap: number }> = [];
  const totalTimeRange = sampledData[sampledData.length - 1].timestamp.getTime() - sampledData[0].timestamp.getTime();
  const idealPointDensity = targetPoints / totalTimeRange;

  // Find gaps between consecutive points
  for (let i = 0; i < sampledData.length - 1; i++) {
    const gap = sampledData[i + 1].timestamp.getTime() - sampledData[i].timestamp.getTime();
    const expectedPoints = gap * idealPointDensity;
    
    // If this gap should have more than 1 point, it's a low-density region
    if (expectedPoints > 1.5) {
      regions.push({
        start: sampledData[i].timestamp.getTime(),
        end: sampledData[i + 1].timestamp.getTime(),
        gap: gap
      });
    }
  }

  // Sort regions by gap size (largest first) and calculate target points
  regions.sort((a, b) => b.gap - a.gap);
  
  const totalGap = regions.reduce((sum, r) => sum + r.gap, 0);
  const pointsToDistribute = targetPoints - sampledData.length;

  return regions.map(region => ({
    start: region.start,
    end: region.end,
    targetPoints: (region.gap / totalGap) * pointsToDistribute
  }));
}

/**
 * Resample data to a different resolution
 */
function resampleData(
  data: TimeSeriesData[],
  config: SamplingConfig,
  samplingParameter?: string
): TimeSeriesData[] {
  if (data.length <= config.targetPoints) {
    return data;
  }

  return sampleTimeSeriesData(data, config, samplingParameter);
}


/**
 * LTTB sampling for a specific dataset
 */
function sampleTimeSeriesDataLTTB(
  data: TimeSeriesData[],
  targetPoints: number,
  samplingParameter?: string
): TimeSeriesData[] {
  if (data.length <= targetPoints) {
    return data;
  }

  // Convert to IndexedDataPoint format
  const dataPoints: IndexedDataPoint[] = data.map((point, index) => ({
    x: point.timestamp.getTime(),
    y: samplingParameter && point.data ? (point.data[samplingParameter] ?? 0) : index,
    index
  }));

  // Apply LTTB sampling
  const samplingResult = sampleData(dataPoints, {
    method: 'lttb',
    targetPoints: targetPoints,
    preserveExtremes: true
  });

  // Convert back to TimeSeriesData
  return samplingResult.data.map(p => data[p.index]);
}