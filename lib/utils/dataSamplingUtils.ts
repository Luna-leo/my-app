/**
 * Data sampling utilities for efficient chart rendering
 * Implements various sampling algorithms to reduce data points while preserving visual quality
 */

export interface DataPoint {
  x: number | Date;
  y: number;
  [key: string]: any; // Allow additional properties
}

export interface SamplingOptions {
  method: 'lttb' | 'nth' | 'minmax' | 'adaptive';
  targetPoints: number;
  preserveExtremes?: boolean;
  viewport?: {
    xMin: number;
    xMax: number;
  };
}

export interface SamplingResult<T extends DataPoint> {
  data: T[];
  originalCount: number;
  sampledCount: number;
  method: string;
}

/**
 * Convert x value to number for calculations
 */
function toNumber(x: number | Date): number {
  return x instanceof Date ? x.getTime() : x;
}

/**
 * Largest Triangle Three Buckets (LTTB) algorithm
 * Best for time series data - preserves visual shape
 */
export function lttbSample<T extends DataPoint>(
  data: T[],
  targetPoints: number
): T[] {
  if (data.length <= targetPoints || targetPoints < 3) {
    return data;
  }

  const sampled: T[] = [];
  const bucketSize = (data.length - 2) / (targetPoints - 2);

  // Always include first point
  sampled.push(data[0]);

  // Previous selected point
  let prevSelectedIndex = 0;

  for (let i = 0; i < targetPoints - 2; i++) {
    // Calculate bucket boundaries
    const bucketStart = Math.floor((i + 1) * bucketSize) + 1;
    const bucketEnd = Math.floor((i + 2) * bucketSize) + 1;

    // Calculate average point of next bucket (for area calculation)
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;

    for (let j = bucketEnd; j < Math.min(data.length, Math.floor((i + 3) * bucketSize) + 1); j++) {
      avgX += toNumber(data[j].x);
      avgY += data[j].y;
      avgCount++;
    }

    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    } else {
      // If no next bucket, use last point
      avgX = toNumber(data[data.length - 1].x);
      avgY = data[data.length - 1].y;
    }

    // Find point in current bucket with largest triangle area
    let maxArea = -1;
    let selectedIndex = bucketStart;
    const prevX = toNumber(data[prevSelectedIndex].x);
    const prevY = data[prevSelectedIndex].y;

    for (let j = bucketStart; j < Math.min(bucketEnd, data.length); j++) {
      const currX = toNumber(data[j].x);
      const currY = data[j].y;

      // Calculate triangle area (without the 0.5 factor as we only need relative values)
      const area = Math.abs(
        (prevX - avgX) * (currY - avgY) - 
        (prevX - currX) * (avgY - avgY)
      );

      if (area > maxArea) {
        maxArea = area;
        selectedIndex = j;
      }
    }

    sampled.push(data[selectedIndex]);
    prevSelectedIndex = selectedIndex;
  }

  // Always include last point
  sampled.push(data[data.length - 1]);

  return sampled;
}

/**
 * Every Nth point sampling
 * Simple and fast, but may miss important features
 */
export function nthPointSample<T extends DataPoint>(
  data: T[],
  targetPoints: number
): T[] {
  if (data.length <= targetPoints) {
    return data;
  }

  const sampled: T[] = [];
  const step = Math.ceil(data.length / targetPoints);

  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i]);
  }

  // Ensure last point is included
  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled.push(data[data.length - 1]);
  }

  return sampled;
}

/**
 * Min/Max preservation sampling
 * Good for preserving peaks and valleys
 */
export function minMaxSample<T extends DataPoint>(
  data: T[],
  targetPoints: number
): T[] {
  if (data.length <= targetPoints) {
    return data;
  }

  const sampled: T[] = [];
  const bucketSize = Math.ceil(data.length / (targetPoints / 2));

  for (let i = 0; i < data.length; i += bucketSize) {
    const bucketEnd = Math.min(i + bucketSize, data.length);
    let minPoint = data[i];
    let maxPoint = data[i];

    // Find min and max in bucket
    for (let j = i + 1; j < bucketEnd; j++) {
      if (data[j].y < minPoint.y) {
        minPoint = data[j];
      }
      if (data[j].y > maxPoint.y) {
        maxPoint = data[j];
      }
    }

    // Add min first if it comes before max in time
    if (toNumber(minPoint.x) < toNumber(maxPoint.x)) {
      sampled.push(minPoint);
      if (minPoint !== maxPoint) {
        sampled.push(maxPoint);
      }
    } else {
      sampled.push(maxPoint);
      if (minPoint !== maxPoint) {
        sampled.push(minPoint);
      }
    }
  }

  return sampled;
}

/**
 * Adaptive sampling based on data density and variance
 * Automatically adjusts sampling rate based on data characteristics
 */
export function adaptiveSample<T extends DataPoint>(
  data: T[],
  targetPoints: number,
  viewport?: { xMin: number; xMax: number }
): T[] {
  if (data.length <= targetPoints) {
    return data;
  }

  // If viewport is provided, focus on visible data
  let visibleData = data;
  if (viewport) {
    visibleData = data.filter(d => {
      const x = toNumber(d.x);
      return x >= viewport.xMin && x <= viewport.xMax;
    });
  }

  // Use LTTB for main sampling
  const sampled = lttbSample(visibleData, targetPoints);

  // If we filtered by viewport, ensure continuity at edges
  if (viewport && visibleData.length < data.length) {
    // Add points just outside viewport for continuity
    const firstVisible = visibleData[0];
    const lastVisible = visibleData[visibleData.length - 1];

    // Find points just before and after viewport
    const beforePoint = data.find(d => toNumber(d.x) < viewport.xMin);
    const afterPoint = data.find(d => toNumber(d.x) > viewport.xMax);

    if (beforePoint && sampled[0] !== beforePoint) {
      sampled.unshift(beforePoint);
    }
    if (afterPoint && sampled[sampled.length - 1] !== afterPoint) {
      sampled.push(afterPoint);
    }
  }

  return sampled;
}

/**
 * Main sampling function that delegates to specific algorithms
 */
export function sampleData<T extends DataPoint>(
  data: T[],
  options: SamplingOptions
): SamplingResult<T> {
  const startTime = performance.now();

  // Early return for small datasets
  if (!data || data.length === 0) {
    return {
      data: [],
      originalCount: 0,
      sampledCount: 0,
      method: options.method
    };
  }

  if (data.length <= options.targetPoints) {
    return {
      data: data,
      originalCount: data.length,
      sampledCount: data.length,
      method: 'none'
    };
  }

  let sampledData: T[];

  switch (options.method) {
    case 'lttb':
      sampledData = lttbSample(data, options.targetPoints);
      break;
    case 'nth':
      sampledData = nthPointSample(data, options.targetPoints);
      break;
    case 'minmax':
      sampledData = minMaxSample(data, options.targetPoints);
      break;
    case 'adaptive':
      sampledData = adaptiveSample(data, options.targetPoints, options.viewport);
      break;
    default:
      // Default to LTTB
      sampledData = lttbSample(data, options.targetPoints);
  }

  // Ensure extremes are preserved if requested
  if (options.preserveExtremes && sampledData.length > 0) {
    // Check if first and last points are included
    if (sampledData[0] !== data[0]) {
      sampledData.unshift(data[0]);
    }
    if (sampledData[sampledData.length - 1] !== data[data.length - 1]) {
      sampledData.push(data[data.length - 1]);
    }
  }

  const endTime = performance.now();
  console.log(`Sampling completed: ${data.length} → ${sampledData.length} points in ${(endTime - startTime).toFixed(2)}ms`);

  return {
    data: sampledData,
    originalCount: data.length,
    sampledCount: sampledData.length,
    method: options.method
  };
}

/**
 * Calculate optimal target points based on viewport and pixel density
 */
export function calculateOptimalPoints(
  viewportWidth: number,
  pixelDensity: number = 2
): number {
  // Aim for ~2 data points per pixel for smooth rendering
  return Math.min(viewportWidth * pixelDensity, 10000); // Cap at 10k for performance
}

/**
 * Check if data needs sampling based on size and performance thresholds
 */
export function shouldSampleData(
  dataLength: number,
  threshold: number = 5000
): boolean {
  return dataLength > threshold;
}