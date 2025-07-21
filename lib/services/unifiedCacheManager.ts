/**
 * Unified Cache Manager
 * 
 * Consolidates all caching functionality into a single, efficient system
 * with proper memory management, TTL, and hierarchical resolution support
 */

import { TimeSeriesData, Metadata, ParameterInfo } from '@/lib/db/schema';
import { ChartPlotData, ChartViewport } from '@/types/chart';
import { SamplingConfig } from '@/lib/utils/chartDataSampling';
import { MemoryEfficientCache } from './memoryEfficientCache';
import { createSamplingCacheKeyWithParams } from '@/lib/utils/hashUtils';
import { getMemoryStats } from '@/lib/services/memoryMonitor';

// Cache entry types
export type CacheEntryType = 
  | 'timeseries'    // Raw time series data
  | 'metadata'      // Dataset metadata
  | 'parameter'     // Parameter information
  | 'transform'     // Transformed chart data
  | 'sampling'      // Sampled data with resolution info
  | 'chart';        // Rendered chart data

interface CacheEntry<T> {
  data: T;
  type: CacheEntryType;
  timestamp: number;
  size?: number; // Estimated size in bytes
  resolution?: number; // For sampling data
  dependencies?: string[]; // Keys this entry depends on
}

interface CacheStats {
  totalEntries: number;
  totalMemoryMB: number;
  entriesByType: Record<CacheEntryType, { count: number; memoryMB: number }>;
  hitRate: number;
  evictionCount: number;
}

interface CacheConfig {
  maxMemoryMB: number;
  ttlMs: number;
  maxEntries: number;
  enableHierarchicalSampling: boolean;
}

// Default configurations per cache type
const DEFAULT_CONFIGS: Record<CacheEntryType, CacheConfig> = {
  timeseries: {
    maxMemoryMB: 100,
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxEntries: 20,
    enableHierarchicalSampling: false
  },
  metadata: {
    maxMemoryMB: 10,
    ttlMs: 30 * 60 * 1000, // 30 minutes
    maxEntries: 100,
    enableHierarchicalSampling: false
  },
  parameter: {
    maxMemoryMB: 5,
    ttlMs: 60 * 60 * 1000, // 1 hour
    maxEntries: 200,
    enableHierarchicalSampling: false
  },
  transform: {
    maxMemoryMB: 50,
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxEntries: 30,
    enableHierarchicalSampling: false
  },
  sampling: {
    maxMemoryMB: 80,
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxEntries: 50,
    enableHierarchicalSampling: true
  },
  chart: {
    maxMemoryMB: 50,
    ttlMs: 5 * 60 * 1000, // 5 minutes
    maxEntries: 20,
    enableHierarchicalSampling: false
  }
};

export class UnifiedCacheManager {
  private static instance: UnifiedCacheManager;
  private caches: Map<CacheEntryType, MemoryEfficientCache<CacheEntry<unknown>>>;
  private resolutionIndex: Map<string, Map<number, string>>; // For hierarchical sampling
  private hitCount = 0;
  private missCount = 0;
  private evictionCount = 0;
  private gcInterval: NodeJS.Timeout;

  private constructor() {
    this.caches = new Map();
    this.resolutionIndex = new Map();

    // Initialize caches for each type
    for (const [type, config] of Object.entries(DEFAULT_CONFIGS) as [CacheEntryType, CacheConfig][]) {
      this.caches.set(type, new MemoryEfficientCache<CacheEntry<unknown>>({
        maxSize: config.maxEntries,
        maxMemoryMB: config.maxMemoryMB,
        ttl: config.ttlMs,
        onEvict: (key) => {
          this.evictionCount++;
          this.cleanupResolutionIndex(key, type);
        }
      }));
    }

    // Periodic garbage collection and memory pressure monitoring
    this.gcInterval = setInterval(() => {
      this.performGarbageCollection();
    }, 60 * 1000); // Every minute
  }

  static getInstance(): UnifiedCacheManager {
    if (!UnifiedCacheManager.instance) {
      UnifiedCacheManager.instance = new UnifiedCacheManager();
    }
    return UnifiedCacheManager.instance;
  }

  /**
   * Get data from cache with automatic type inference
   */
  get<T>(key: string, type: CacheEntryType): T | null {
    const cache = this.caches.get(type);
    if (!cache) return null;

    const entry = cache.get(key);
    if (entry) {
      this.hitCount++;
      return entry.data as T;
    }

    // For sampling data, try hierarchical resolution
    if (type === 'sampling' && DEFAULT_CONFIGS.sampling.enableHierarchicalSampling) {
      const higherResData = this.findHigherResolutionData(key);
      if (higherResData) {
        this.hitCount++;
        return higherResData as T;
      }
    }

    this.missCount++;
    return null;
  }

  /**
   * Set data in cache with automatic size estimation
   */
  set<T>(key: string, data: T, type: CacheEntryType, options?: {
    resolution?: number;
    dependencies?: string[];
  }): void {
    const cache = this.caches.get(type);
    if (!cache) return;

    const entry: CacheEntry<T> = {
      data,
      type,
      timestamp: Date.now(),
      size: this.estimateSize(data),
      resolution: options?.resolution,
      dependencies: options?.dependencies
    };

    cache.set(key, entry);

    // Update resolution index for sampling data
    if (type === 'sampling' && options?.resolution) {
      this.updateResolutionIndex(key, options.resolution);
    }
  }

  /**
   * Batch operations for efficiency
   */
  getBatch<T>(keys: string[], type: CacheEntryType): Map<string, T> {
    const results = new Map<string, T>();
    
    for (const key of keys) {
      const data = this.get<T>(key, type);
      if (data !== null) {
        results.set(key, data);
      }
    }

    return results;
  }

  setBatch<T>(entries: Array<{ key: string; data: T }>, type: CacheEntryType): void {
    for (const { key, data } of entries) {
      this.set(key, data, type);
    }
  }

  /**
   * Check if key exists in cache
   */
  has(key: string, type: CacheEntryType): boolean {
    const cache = this.caches.get(type);
    return cache ? cache.has(key) : false;
  }

  /**
   * Delete specific entry
   */
  delete(key: string, type: CacheEntryType): void {
    const cache = this.caches.get(type);
    if (cache) {
      cache.delete(key);
      this.cleanupResolutionIndex(key, type);
    }
  }

  /**
   * Clear cache by type or all caches
   */
  clear(type?: CacheEntryType): void {
    if (type) {
      const cache = this.caches.get(type);
      if (cache) {
        cache.clear();
      }
    } else {
      this.caches.forEach(cache => cache.clear());
      this.resolutionIndex.clear();
    }
    
    console.log(`[UnifiedCacheManager] Cleared ${type || 'all'} caches`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const entriesByType: Record<string, { count: number; memoryMB: number }> = {};
    let totalEntries = 0;
    let totalMemoryMB = 0;

    for (const [type, cache] of this.caches.entries()) {
      const stats = cache.getStats();
      entriesByType[type] = {
        count: stats.size,
        memoryMB: stats.memoryMB
      };
      totalEntries += stats.size;
      totalMemoryMB += stats.memoryMB;
    }

    const hitRate = this.hitCount + this.missCount > 0 
      ? this.hitCount / (this.hitCount + this.missCount) 
      : 0;

    return {
      totalEntries,
      totalMemoryMB,
      entriesByType: entriesByType as Record<CacheEntryType, { count: number; memoryMB: number }>,
      hitRate,
      evictionCount: this.evictionCount
    };
  }

  /**
   * Perform garbage collection based on memory pressure
   */
  private performGarbageCollection(): void {
    const memStats = getMemoryStats();
    
    if (memStats.pressure === 'critical') {
      console.warn('[UnifiedCacheManager] Critical memory pressure - clearing all caches');
      this.clear();
    } else if (memStats.pressure === 'high') {
      console.warn('[UnifiedCacheManager] High memory pressure - clearing old entries');
      
      // Clear oldest 50% of entries from each cache
      this.caches.forEach(cache => {
        cache.gc();
      });
    } else {
      // Normal GC - just remove expired entries
      this.caches.forEach(cache => {
        cache.gc();
      });
    }
  }

  /**
   * Hierarchical sampling support
   */
  private findHigherResolutionData(key: string): unknown | null {
    // Extract metadata from key to find related entries
    const parts = key.split(':');
    if (parts.length < 3) return null;
    
    const [metadataIds, parameterIds] = parts.slice(1, 3);
    const metadataKey = `${metadataIds}_${parameterIds}`;
    const resolutionMap = this.resolutionIndex.get(metadataKey);
    
    if (!resolutionMap) return null;

    // Find closest higher resolution
    const targetResolution = parseInt(parts[3] || '0');
    let closestKey: string | null = null;
    let closestResolution = Infinity;

    resolutionMap.forEach((cacheKey, resolution) => {
      if (resolution >= targetResolution && resolution < closestResolution) {
        closestResolution = resolution;
        closestKey = cacheKey;
      }
    });

    if (closestKey) {
      const cache = this.caches.get('sampling');
      const entry = cache?.get(closestKey);
      return entry?.data || null;
    }

    return null;
  }

  private updateResolutionIndex(key: string, resolution: number): void {
    const parts = key.split(':');
    if (parts.length < 3) return;
    
    const metadataKey = `${parts[1]}_${parts[2]}`;
    
    if (!this.resolutionIndex.has(metadataKey)) {
      this.resolutionIndex.set(metadataKey, new Map());
    }
    
    this.resolutionIndex.get(metadataKey)!.set(resolution, key);
  }

  private cleanupResolutionIndex(key: string, type: CacheEntryType): void {
    if (type !== 'sampling') return;
    
    // Remove from resolution index
    for (const [metadataKey, resolutionMap] of this.resolutionIndex.entries()) {
      for (const [resolution, cacheKey] of resolutionMap.entries()) {
        if (cacheKey === key) {
          resolutionMap.delete(resolution);
          if (resolutionMap.size === 0) {
            this.resolutionIndex.delete(metadataKey);
          }
          return;
        }
      }
    }
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: unknown): number {
    if (Array.isArray(data)) {
      // For arrays, estimate based on length and type
      if (data.length === 0) return 0;
      
      const sampleItem = data[0];
      let itemSize = 0;
      
      if (typeof sampleItem === 'object') {
        // Rough estimate: 100 bytes per object
        itemSize = 100;
      } else if (typeof sampleItem === 'number') {
        itemSize = 8;
      } else if (typeof sampleItem === 'string') {
        itemSize = sampleItem.length * 2; // UTF-16
      } else {
        itemSize = 16;
      }
      
      return data.length * itemSize;
    } else if (typeof data === 'object' && data !== null) {
      // Rough estimate for objects
      return JSON.stringify(data).length * 2;
    }
    
    return 100; // Default estimate
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
    }
    this.clear();
  }
}

// Export singleton instance
export const unifiedCache = UnifiedCacheManager.getInstance();

// Typed cache interfaces for convenience
export const cacheInterfaces = (() => {
  // Ensure unifiedCache is initialized
  const cache = unifiedCache;
  
  return {
  timeseries: {
    get: (metadataId: number) => unifiedCache.get<TimeSeriesData[]>(`timeseries:${metadataId}`, 'timeseries'),
    set: (metadataId: number, data: TimeSeriesData[]) => unifiedCache.set(`timeseries:${metadataId}`, data, 'timeseries'),
    has: (metadataId: number) => unifiedCache.has(`timeseries:${metadataId}`, 'timeseries'),
    delete: (metadataId: number) => unifiedCache.delete(`timeseries:${metadataId}`, 'timeseries')
  },
  
  metadata: {
    get: (metadataId: number) => unifiedCache.get<Metadata>(`metadata:${metadataId}`, 'metadata'),
    set: (metadataId: number, data: Metadata) => unifiedCache.set(`metadata:${metadataId}`, data, 'metadata'),
    has: (metadataId: number) => unifiedCache.has(`metadata:${metadataId}`, 'metadata'),
    delete: (metadataId: number) => unifiedCache.delete(`metadata:${metadataId}`, 'metadata')
  },
  
  parameter: {
    get: (parameterId: string) => unifiedCache.get<ParameterInfo>(`parameter:${parameterId}`, 'parameter'),
    set: (parameterId: string, data: ParameterInfo) => unifiedCache.set(`parameter:${parameterId}`, data, 'parameter'),
    has: (parameterId: string) => unifiedCache.has(`parameter:${parameterId}`, 'parameter'),
    delete: (parameterId: string) => unifiedCache.delete(`parameter:${parameterId}`, 'parameter')
  },
  
  transform: {
    get: <T>(key: string) => unifiedCache.get<T>(key, 'transform'),
    set: <T>(key: string, data: T) => unifiedCache.set(key, data, 'transform'),
    has: (key: string) => unifiedCache.has(key, 'transform'),
    delete: (key: string) => unifiedCache.delete(key, 'transform')
  },
  
  sampling: {
    get: <T>(metadataIds: number[], parameterIds: string[], config: SamplingConfig) => {
      const key = createSamplingCacheKeyWithParams(metadataIds, parameterIds, {
        method: config.method,
        targetPoints: config.targetPoints,
        preserveExtremes: config.preserveExtremes
      });
      return unifiedCache.get<T>(key, 'sampling');
    },
    set: <T>(metadataIds: number[], parameterIds: string[], config: SamplingConfig, data: T) => {
      const key = createSamplingCacheKeyWithParams(metadataIds, parameterIds, {
        method: config.method,
        targetPoints: config.targetPoints,
        preserveExtremes: config.preserveExtremes
      });
      unifiedCache.set(key, data, 'sampling', { resolution: config.targetPoints });
    }
  },
  
  chart: {
    get: (configHash: string) => unifiedCache.get<{ plotData: ChartPlotData; viewport: ChartViewport }>(`chart:${configHash}`, 'chart'),
    set: (configHash: string, data: { plotData: ChartPlotData; viewport: ChartViewport }) => unifiedCache.set(`chart:${configHash}`, data, 'chart'),
    has: (configHash: string) => unifiedCache.has(`chart:${configHash}`, 'chart'),
    delete: (configHash: string) => unifiedCache.delete(`chart:${configHash}`, 'chart')
  }
  };
})();

// Backward compatibility exports
export const timeSeriesCache = cacheInterfaces.timeseries;
export const metadataCache = cacheInterfaces.metadata;
export const parameterCache = cacheInterfaces.parameter;
export const transformCache = cacheInterfaces.transform;
export const samplingCache = cacheInterfaces.sampling;