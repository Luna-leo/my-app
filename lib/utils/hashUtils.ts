/**
 * Lightweight hashing utilities for object comparison and caching
 * Provides fast alternatives to JSON.stringify for performance-critical operations
 */

/**
 * Simple hash function for strings
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  return hash;
}

/**
 * Fast hash function for objects with stable property ordering
 * Much faster than JSON.stringify for cache key generation
 */
export function hashObject(obj: Record<string, unknown>, includeKeys?: string[]): string {
  const parts: string[] = [];
  
  // Get keys to hash
  const keys = includeKeys || Object.keys(obj).sort();
  
  for (const key of keys) {
    const value = obj[key];
    
    if (value === null || value === undefined) {
      parts.push(`${key}:null`);
    } else if (typeof value === 'string') {
      parts.push(`${key}:s${hashString(value)}`);
    } else if (typeof value === 'number') {
      parts.push(`${key}:n${value}`);
    } else if (typeof value === 'boolean') {
      parts.push(`${key}:b${value ? 1 : 0}`);
    } else if (Array.isArray(value)) {
      // For arrays, hash length and first/last elements
      const len = value.length;
      if (len === 0) {
        parts.push(`${key}:a0`);
      } else if (len === 1) {
        parts.push(`${key}:a1-${hashValue(value[0])}`);
      } else {
        parts.push(`${key}:a${len}-${hashValue(value[0])}-${hashValue(value[len-1])}`);
      }
    } else if (typeof value === 'object') {
      // Recursively hash nested objects (shallow)
      parts.push(`${key}:o${hashString(JSON.stringify(value))}`);
    }
  }
  
  return parts.join('|');
}

/**
 * Hash a single value
 */
function hashValue(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return `s${hashString(value)}`;
  if (typeof value === 'number') return `n${value}`;
  if (typeof value === 'boolean') return `b${value ? 1 : 0}`;
  if (value instanceof Date) return `d${value.getTime()}`;
  return `o${hashString(JSON.stringify(value))}`;
}

/**
 * Create a cache key for chart configuration
 * Optimized for the specific shape of chart configs
 */
export function createChartConfigHash(config: {
  xAxisParameter: string;
  yAxisParameters: string[];
  selectedDataIds: number[];
  chartType: string;
}, samplingConfig?: {
  enabled: boolean;
  method?: string;
  targetPoints?: number;
  preserveExtremes?: boolean;
}): string {
  const parts = [
    `x:${config.xAxisParameter}`,
    `y:${config.yAxisParameters.sort().join(',')}`,
    `d:${config.selectedDataIds ? config.selectedDataIds.sort().join(',') : ''}`,
    `t:${config.chartType}`
  ];
  
  if (samplingConfig) {
    parts.push(`s:${samplingConfig.enabled ? 1 : 0}`);
    if (samplingConfig.enabled && samplingConfig.method) {
      parts.push(`sm:${samplingConfig.method}`);
      parts.push(`sp:${samplingConfig.targetPoints || 0}`);
      parts.push(`se:${samplingConfig.preserveExtremes ? 1 : 0}`);
    }
  }
  
  return parts.join('|');
}

/**
 * Create a cache key for sampling configuration
 */
export function createSamplingCacheKey(dataIds: number[], samplingConfig: {
  method: string;
  targetPoints: number;
  preserveExtremes: boolean;
}): string {
  return [
    `ids:${dataIds.sort().join(',')}`,
    `m:${samplingConfig.method}`,
    `p:${samplingConfig.targetPoints}`,
    `e:${samplingConfig.preserveExtremes ? 1 : 0}`
  ].join('|');
}

/**
 * Shallow compare two objects
 * Returns true if objects have same properties with same values
 */
export function shallowEqual(obj1: unknown, obj2: unknown): boolean {
  if (obj1 === obj2) return true;
  
  if (!obj1 || !obj2) return false;
  if (typeof obj1 !== 'object' || typeof obj2 !== 'object') return false;
  
  const o1 = obj1 as Record<string, unknown>;
  const o2 = obj2 as Record<string, unknown>;
  
  const keys1 = Object.keys(o1);
  const keys2 = Object.keys(o2);
  
  if (keys1.length !== keys2.length) return false;
  
  for (const key of keys1) {
    if (o1[key] !== o2[key]) return false;
  }
  
  return true;
}

/**
 * Deep compare two arrays efficiently
 * Checks length and samples before full comparison
 */
export function arraysEqual(arr1: unknown[], arr2: unknown[]): boolean {
  if (arr1 === arr2) return true;
  if (!arr1 || !arr2) return false;
  if (arr1.length !== arr2.length) return false;
  
  // Quick sample check for large arrays
  if (arr1.length > 1000) {
    // Check first, middle, and last elements
    const indices = [0, Math.floor(arr1.length / 2), arr1.length - 1];
    for (const i of indices) {
      if (arr1[i] !== arr2[i]) return false;
    }
  }
  
  // Full comparison
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  
  return true;
}

/**
 * Alias for createChartConfigHash for backward compatibility
 */
export const hashChartConfig = createChartConfigHash;

/**
 * Alias for createSamplingCacheKey for backward compatibility
 */
export const hashSamplingConfig = createSamplingCacheKey;

/**
 * Custom comparison function for React.memo
 * Optimized for chart component props
 */
export function chartPropsAreEqual(
  prevProps: { data: unknown; options: unknown; [key: string]: unknown },
  nextProps: { data: unknown; options: unknown; [key: string]: unknown }
): boolean {
  // Quick reference check
  if (prevProps === nextProps) return true;
  
  // Check data reference first (most likely to change)
  if (prevProps.data !== nextProps.data) {
    // If data arrays have different lengths, they're different
    if (Array.isArray(prevProps.data) && Array.isArray(nextProps.data)) {
      if (prevProps.data.length !== nextProps.data.length) return false;
      
      // For nested arrays (like uPlot data), check sub-array lengths
      if (prevProps.data.length > 0 && Array.isArray(prevProps.data[0])) {
        for (let i = 0; i < prevProps.data.length; i++) {
          if (!prevProps.data[i] || !nextProps.data[i]) return false;
          if (prevProps.data[i].length !== nextProps.data[i].length) return false;
        }
      }
    }
    return false;
  }
  
  // Check options reference
  if (prevProps.options !== nextProps.options) {
    // Shallow compare options
    if (!shallowEqual(prevProps.options, nextProps.options)) return false;
  }
  
  // Check other props (excluding data and options)
  const otherKeys = Object.keys(prevProps).filter(k => k !== 'data' && k !== 'options');
  for (const key of otherKeys) {
    if (prevProps[key] !== nextProps[key]) return false;
  }
  
  return true;
}