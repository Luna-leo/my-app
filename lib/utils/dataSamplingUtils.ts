/**
 * Data sampling utilities for efficient chart rendering
 * Implements various sampling algorithms to reduce data points while preserving visual quality
 */

export interface DataPoint {
  x: number | Date;
  y: number;
  // Remove index signature to allow extending with any property type
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

    for (let j = bucketStart; j < Math.min(bucketEnd, data.length); j++) {
      const currX = toNumber(data[j].x);
      const currY = data[j].y;

      // Calculate triangle area (without the 0.5 factor as we only need relative values)
      const area = Math.abs(
        (prevX - avgX) * (currY - avgY) - 
        (prevX - currX) * (avgY - data[prevSelectedIndex].y)
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
    let minIndex = i;
    let maxIndex = i;
    let minValue = data[i].y;
    let maxValue = data[i].y;

    // Find min and max indices in bucket
    for (let j = i + 1; j < bucketEnd; j++) {
      if (data[j].y < minValue) {
        minValue = data[j].y;
        minIndex = j;
      }
      if (data[j].y > maxValue) {
        maxValue = data[j].y;
        maxIndex = j;
      }
    }

    // Add min first if it comes before max in time
    if (minIndex < maxIndex) {
      sampled.push(data[minIndex]);
      if (minIndex !== maxIndex) {
        sampled.push(data[maxIndex]);
      }
    } else if (maxIndex < minIndex) {
      sampled.push(data[maxIndex]);
      if (minIndex !== maxIndex) {
        sampled.push(data[minIndex]);
      }
    } else {
      // Same point is both min and max
      sampled.push(data[minIndex]);
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

  // If viewport is provided, focus on visible data without creating a new array
  let visibleStart = 0;
  let visibleEnd = data.length;
  let beforePoint: T | undefined;
  let afterPoint: T | undefined;

  if (viewport) {
    // Find viewport boundaries using binary search for better performance
    for (let i = 0; i < data.length; i++) {
      const x = toNumber(data[i].x);
      if (x < viewport.xMin) {
        beforePoint = data[i];
        visibleStart = i + 1;
      } else if (x > viewport.xMax && afterPoint === undefined) {
        afterPoint = data[i];
        visibleEnd = i;
        break;
      }
    }
  }

  // Create a view of visible data without copying
  const visibleLength = visibleEnd - visibleStart;
  if (visibleLength <= targetPoints) {
    // If visible data is small enough, return slice
    const result = data.slice(visibleStart, visibleEnd);
    if (beforePoint) result.unshift(beforePoint);
    if (afterPoint) result.push(afterPoint);
    return result;
  }

  // Create a custom LTTB implementation that works with array slice
  const sampled: T[] = [];
  const bucketSize = (visibleLength - 2) / (targetPoints - 2);

  // Always include first visible point
  sampled.push(data[visibleStart]);

  let prevSelectedIndex = visibleStart;

  for (let i = 0; i < targetPoints - 2; i++) {
    const bucketStart = Math.floor((i + 1) * bucketSize) + visibleStart + 1;
    const bucketEnd = Math.floor((i + 2) * bucketSize) + visibleStart + 1;

    // Calculate average point of next bucket
    let avgX = 0;
    let avgY = 0;
    let avgCount = 0;

    const nextBucketEnd = Math.min(visibleEnd, Math.floor((i + 3) * bucketSize) + visibleStart + 1);
    for (let j = bucketEnd; j < nextBucketEnd; j++) {
      avgX += toNumber(data[j].x);
      avgY += data[j].y;
      avgCount++;
    }

    if (avgCount > 0) {
      avgX /= avgCount;
      avgY /= avgCount;
    } else {
      avgX = toNumber(data[visibleEnd - 1].x);
      avgY = data[visibleEnd - 1].y;
    }

    // Find point with largest triangle area
    let maxArea = -1;
    let selectedIndex = bucketStart;
    const prevX = toNumber(data[prevSelectedIndex].x);

    for (let j = bucketStart; j < Math.min(bucketEnd, visibleEnd); j++) {
      const currX = toNumber(data[j].x);
      const currY = data[j].y;

      const area = Math.abs(
        (prevX - avgX) * (currY - avgY) - 
        (prevX - currX) * (avgY - data[prevSelectedIndex].y)
      );

      if (area > maxArea) {
        maxArea = area;
        selectedIndex = j;
      }
    }

    sampled.push(data[selectedIndex]);
    prevSelectedIndex = selectedIndex;
  }

  // Always include last visible point
  sampled.push(data[visibleEnd - 1]);

  // Add edge points for continuity
  if (beforePoint && sampled[0] !== beforePoint) {
    sampled.unshift(beforePoint);
  }
  if (afterPoint && sampled[sampled.length - 1] !== afterPoint) {
    sampled.push(afterPoint);
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