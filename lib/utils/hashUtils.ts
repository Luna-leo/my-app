/**
 * Utility functions for efficient object hashing and comparison
 * Used to replace JSON.stringify for performance-critical operations
 */

/**
 * Creates a stable hash for chart configuration objects
 * Much faster than JSON.stringify for cache key generation
 */
export function hashChartConfig(config: {
  xAxisParameter: string;
  yAxisParameters: string[];
  selectedDataIds: number[];
  chartType: string;
}, samplingOption: boolean | { enabled: boolean; method?: string; targetPoints?: number; preserveExtremes?: boolean } = true): string {
  // Sort arrays to ensure stable hashing
  const sortedYParams = [...config.yAxisParameters].sort();
  const sortedDataIds = [...config.selectedDataIds].sort();
  
  // Build hash components
  const parts: string[] = [
    'x:' + config.xAxisParameter,
    'y:' + sortedYParams.join(','),
    'd:' + sortedDataIds.join(','),
    't:' + config.chartType
  ];
  
  // Add sampling configuration
  if (typeof samplingOption === 'boolean') {
    parts.push('s:' + samplingOption);
  } else {
    parts.push(
      's:' + samplingOption.enabled,
      'm:' + (samplingOption.method || 'nth'),
      'tp:' + (samplingOption.targetPoints || 1000),
      'pe:' + (samplingOption.preserveExtremes || false)
    );
  }
  
  return parts.join('|');
}

/**
 * Creates a hash for sampling cache keys
 * Optimized for arrays of metadata IDs
 */
export function hashSamplingConfig(metadataIds: number[], samplingConfig: {
  method: string;
  targetPoints: number;
  preserveExtremes: boolean;
}): string {
  // Use a more efficient approach than JSON.stringify
  const sortedIds = [...metadataIds].sort((a, b) => a - b);
  
  return [
    'ids:' + sortedIds.join(','),
    'm:' + samplingConfig.method,
    'tp:' + samplingConfig.targetPoints,
    'pe:' + samplingConfig.preserveExtremes
  ].join('|');
}

/**
 * Fast shallow comparison for objects
 * Returns true if objects have same keys and primitive values
 */
export function shallowEqual<T extends Record<string, any>>(obj1: T, obj2: T): boolean {
  if (obj1 === obj2) return true;
  
  const keys1 = Object.keys(obj1);
  const keys2 = Object.keys(obj2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (obj1[key] !== obj2[key]) return false;
  }
  
  return true;
}

/**
 * Optimized array comparison for chart data
 * Checks length and samples before full comparison
 */
export function areArraysEqual<T>(arr1: T[], arr2: T[], sampleSize: number = 10): boolean {
  if (arr1 === arr2) return true;
  if (arr1.length !== arr2.length) return false;
  
  // Quick sample check for large arrays
  if (arr1.length > sampleSize * 2) {
    const step = Math.floor(arr1.length / sampleSize);
    for (let i = 0; i < arr1.length; i += step) {
      if (arr1[i] !== arr2[i]) return false;
    }
  }
  
  // Full comparison for small arrays or if samples match
  return arr1.every((val, idx) => val === arr2[idx]);
}

/**
 * Creates a version key from data structure
 * Useful for detecting changes without deep comparison
 */
export function getDataVersion(data: any[][]): string {
  if (!data || data.length === 0) return 'empty';
  
  // Use first array length, last array length, and total length
  const firstLen = data[0]?.length || 0;
  const lastLen = data[data.length - 1]?.length || 0;
  
  // Sample a few values for additional uniqueness
  const sample1 = data[0]?.[0] || 0;
  const sample2 = data[0]?.[Math.floor(firstLen / 2)] || 0;
  const sample3 = data[data.length - 1]?.[lastLen - 1] || 0;
  
  return `${data.length}-${firstLen}-${lastLen}-${sample1}-${sample2}-${sample3}`;
}

/**
 * Memoized hash computation using WeakMap
 * Automatically handles garbage collection
 */
const hashCache = new WeakMap<object, string>();

export function getMemoizedHash<T extends object>(obj: T, hashFn: (obj: T) => string): string {
  const cached = hashCache.get(obj);
  if (cached) return cached;
  
  const hash = hashFn(obj);
  hashCache.set(obj, hash);
  return hash;
}