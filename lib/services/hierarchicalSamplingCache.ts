/**
 * Hierarchical Sampling Cache Manager
 * Optimizes progressive loading by reusing lower resolution data to generate higher resolution data
 */

import { TimeSeriesData } from '@/lib/db/schema';
import { SamplingConfig } from '@/lib/utils/chartDataSampling';
import { createSamplingCacheKey } from '@/lib/utils/hashUtils';
import { samplingCache } from './dataCache';

interface CachedSamplingData {
  data: TimeSeriesData[];
  config: SamplingConfig;
  timestamp: number;
}

// Resolution levels for reference (can be used for future enhancements)
// interface ResolutionLevel {
//   name: 'preview' | 'normal' | 'high' | 'full';
//   targetPoints: number;
//   priority: number;
// }

// const RESOLUTION_LEVELS: ResolutionLevel[] = [
//   { name: 'preview', targetPoints: 500, priority: 0 },
//   { name: 'normal', targetPoints: 2000, priority: 1 },
//   { name: 'high', targetPoints: 5000, priority: 2 },
//   { name: 'full', targetPoints: Infinity, priority: 3 }
// ];

export class HierarchicalSamplingCache {
  private cache: Map<string, CachedSamplingData> = new Map();
  private resolutionIndex: Map<string, Map<number, string>> = new Map(); // metadataIds -> targetPoints -> cacheKey
  
  constructor() {}

  /**
   * Get sampled data, potentially using lower resolution data as a base
   */
  get(metadataIds: number[], samplingConfig: SamplingConfig): TimeSeriesData[] | null {
    const directKey = this.createKey(metadataIds, samplingConfig);
    
    // Check direct cache hit
    const directHit = this.cache.get(directKey);
    if (directHit) {
      console.log(`[HierarchicalSamplingCache] Direct cache hit for ${samplingConfig.targetPoints} points`);
      return directHit.data;
    }

    // Check persistent cache
    const persistentData = samplingCache.get<TimeSeriesData[]>(directKey);
    if (persistentData) {
      console.log(`[HierarchicalSamplingCache] Persistent cache hit for ${samplingConfig.targetPoints} points`);
      this.cache.set(directKey, {
        data: persistentData,
        config: samplingConfig,
        timestamp: Date.now()
      });
      return persistentData;
    }

    // Try to find a higher resolution cache to downsample from
    const higherResData = this.findHigherResolutionData(metadataIds, samplingConfig);
    if (higherResData) {
      console.log(`[HierarchicalSamplingCache] Found higher resolution data (${higherResData.config.targetPoints} points) to downsample from`);
      return higherResData.data; // Return the higher res data, sampling will be done by caller if needed
    }

    return null;
  }

  /**
   * Store sampled data with resolution tracking
   */
  set(metadataIds: number[], samplingConfig: SamplingConfig, data: TimeSeriesData[]): void {
    const key = this.createKey(metadataIds, samplingConfig);
    
    // Store in memory cache
    this.cache.set(key, {
      data,
      config: samplingConfig,
      timestamp: Date.now()
    });

    // Store in persistent cache
    samplingCache.set(key, data);

    // Update resolution index
    const metadataKey = metadataIds.sort().join(',');
    if (!this.resolutionIndex.has(metadataKey)) {
      this.resolutionIndex.set(metadataKey, new Map());
    }
    this.resolutionIndex.get(metadataKey)!.set(samplingConfig.targetPoints, key);

    console.log(`[HierarchicalSamplingCache] Cached ${data.length} points at resolution ${samplingConfig.targetPoints}`);
  }

  /**
   * Find higher resolution cached data that can be downsampled
   */
  private findHigherResolutionData(metadataIds: number[], targetConfig: SamplingConfig): CachedSamplingData | null {
    const metadataKey = metadataIds.sort().join(',');
    const resolutionMap = this.resolutionIndex.get(metadataKey);
    
    if (!resolutionMap) return null;

    // Find all cached resolutions higher than target
    const availableResolutions = Array.from(resolutionMap.entries())
      .filter(([points]) => points >= targetConfig.targetPoints)
      .sort(([a], [b]) => a - b); // Sort by points ascending (prefer closest higher resolution)

    for (const [, cacheKey] of availableResolutions) {
      const cached = this.cache.get(cacheKey);
      if (cached && cached.config.method === targetConfig.method) {
        return cached;
      }
    }

    return null;
  }

  /**
   * Get the best available resolution data for incremental loading
   */
  getBestAvailableResolution(metadataIds: number[], maxTargetPoints: number): CachedSamplingData | null {
    const metadataKey = metadataIds.sort().join(',');
    const resolutionMap = this.resolutionIndex.get(metadataKey);
    
    if (!resolutionMap) return null;

    // Find the highest resolution that doesn't exceed maxTargetPoints
    const availableResolutions = Array.from(resolutionMap.entries())
      .filter(([points]) => points <= maxTargetPoints)
      .sort(([a], [b]) => b - a); // Sort by points descending (prefer highest resolution)

    for (const [, cacheKey] of availableResolutions) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    return null;
  }

  /**
   * Clear cache for specific metadata IDs
   */
  clearForMetadata(metadataIds: number[]): void {
    const metadataKey = metadataIds.sort().join(',');
    const resolutionMap = this.resolutionIndex.get(metadataKey);
    
    if (resolutionMap) {
      // Clear all resolutions for these metadata IDs
      resolutionMap.forEach((cacheKey) => {
        this.cache.delete(cacheKey);
        // Note: We don't clear persistent cache here as it has its own eviction policy
      });
      this.resolutionIndex.delete(metadataKey);
    }
  }

  /**
   * Clear all cache
   */
  clear(): void {
    this.cache.clear();
    this.resolutionIndex.clear();
    console.log('[HierarchicalSamplingCache] Cleared all cache');
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    totalEntries: number;
    entriesByResolution: Map<number, number>;
    memoryUsage: number;
  } {
    const entriesByResolution = new Map<number, number>();
    let totalMemory = 0;

    this.cache.forEach((entry) => {
      const currentCount = entriesByResolution.get(entry.config.targetPoints) || 0;
      entriesByResolution.set(entry.config.targetPoints, currentCount + 1);
      
      // Rough estimate of memory usage
      totalMemory += entry.data.length * 100; // Assume ~100 bytes per data point
    });

    return {
      totalEntries: this.cache.size,
      entriesByResolution,
      memoryUsage: totalMemory
    };
  }

  private createKey(metadataIds: number[], samplingConfig: SamplingConfig): string {
    return createSamplingCacheKey(metadataIds, {
      method: samplingConfig.method,
      targetPoints: samplingConfig.targetPoints,
      preserveExtremes: samplingConfig.preserveExtremes
    });
  }
}

// Export singleton instance
export const hierarchicalSamplingCache = new HierarchicalSamplingCache();