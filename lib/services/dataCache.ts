import { TimeSeriesData, Metadata, ParameterInfo } from '@/lib/db/schema';
import { MemoryEfficientCache } from './memoryEfficientCache';

interface DataCacheKey {
  type: 'timeseries' | 'metadata' | 'parameter' | 'transform' | 'sampling';
  id: string | number;
}

class DataCache {
  private static instance: DataCache;
  private timeseriesCache: MemoryEfficientCache<TimeSeriesData[]>;
  private metadataCache: MemoryEfficientCache<Metadata>;
  private parameterCache: MemoryEfficientCache<ParameterInfo>;
  private transformCache: MemoryEfficientCache<unknown>;
  private samplingCache: MemoryEfficientCache<unknown>;

  private constructor() {
    // Different cache configurations for different data types
    this.timeseriesCache = new MemoryEfficientCache<TimeSeriesData[]>({
      maxSize: 20,
      maxMemoryMB: 100, // 100MB for time series data
      ttl: 5 * 60 * 1000
    });
    
    this.metadataCache = new MemoryEfficientCache<Metadata>({
      maxSize: 100,
      maxMemoryMB: 10,
      ttl: 30 * 60 * 1000 // 30 minutes for metadata
    });
    
    this.parameterCache = new MemoryEfficientCache<ParameterInfo>({
      maxSize: 200,
      maxMemoryMB: 5,
      ttl: 60 * 60 * 1000 // 1 hour for parameters
    });
    
    this.transformCache = new MemoryEfficientCache<unknown>({
      maxSize: 30,
      maxMemoryMB: 50,
      ttl: 5 * 60 * 1000
    });
    
    this.samplingCache = new MemoryEfficientCache<unknown>({
      maxSize: 20,
      maxMemoryMB: 80, // 80MB for sampled data
      ttl: 5 * 60 * 1000
    });

    // Run garbage collection periodically
    setInterval(() => {
      this.gc();
    }, 60 * 1000); // Every minute
  }

  static getInstance(): DataCache {
    if (!DataCache.instance) {
      DataCache.instance = new DataCache();
    }
    return DataCache.instance;
  }

  private generateKey(key: DataCacheKey): string {
    return `${key.type}:${key.id}`;
  }

  private getCache(type: DataCacheKey['type']): MemoryEfficientCache<unknown> {
    switch (type) {
      case 'timeseries': return this.timeseriesCache;
      case 'metadata': return this.metadataCache;
      case 'parameter': return this.parameterCache;
      case 'transform': return this.transformCache;
      case 'sampling': return this.samplingCache;
      default: throw new Error(`Unknown cache type: ${type}`);
    }
  }

  set<T>(key: DataCacheKey, data: T): void {
    const cache = this.getCache(key.type);
    const cacheKey = this.generateKey(key);
    cache.set(cacheKey, data);
  }

  get<T>(key: DataCacheKey): T | null {
    const cache = this.getCache(key.type);
    const cacheKey = this.generateKey(key);
    return cache.get(cacheKey) as T | null;
  }

  // Batch get with missing keys returned
  getBatch<T>(keys: DataCacheKey[]): { cached: Map<string, T>; missing: DataCacheKey[] } {
    const cached = new Map<string, T>();
    const missing: DataCacheKey[] = [];

    for (const key of keys) {
      const data = this.get<T>(key);
      if (data !== null) {
        cached.set(this.generateKey(key), data);
      } else {
        missing.push(key);
      }
    }

    return { cached, missing };
  }

  // Batch set
  setBatch<T>(entries: Array<{ key: DataCacheKey; data: T }>): void {
    for (const { key, data } of entries) {
      this.set(key, data);
    }
  }

  has(key: DataCacheKey): boolean {
    const cache = this.getCache(key.type);
    const cacheKey = this.generateKey(key);
    return cache.has(cacheKey);
  }

  delete(key: DataCacheKey): void {
    const cache = this.getCache(key.type);
    const cacheKey = this.generateKey(key);
    cache.delete(cacheKey);
  }

  clear(): void {
    this.timeseriesCache.clear();
    this.metadataCache.clear();
    this.parameterCache.clear();
    this.transformCache.clear();
    this.samplingCache.clear();
  }

  // Get cache statistics
  getStats(): { 
    total: { size: number; memoryMB: number };
    byType: Record<string, { size: number; memoryMB: number }>;
  } {
    const stats = {
      timeseries: this.timeseriesCache.getStats(),
      metadata: this.metadataCache.getStats(),
      parameter: this.parameterCache.getStats(),
      transform: this.transformCache.getStats(),
      sampling: this.samplingCache.getStats()
    };

    const total = {
      size: 0,
      memoryMB: 0
    };

    const byType: Record<string, { size: number; memoryMB: number }> = {};

    for (const [type, stat] of Object.entries(stats)) {
      total.size += stat.size;
      total.memoryMB += stat.memoryMB;
      byType[type] = {
        size: stat.size,
        memoryMB: stat.memoryMB
      };
    }

    return { total, byType };
  }

  // Manual garbage collection
  private gc(): void {
    this.timeseriesCache.gc();
    this.metadataCache.gc();
    this.parameterCache.gc();
    this.transformCache.gc();
    this.samplingCache.gc();
  }
}

export const dataCache = DataCache.getInstance();

// Typed cache functions for specific data types
export const timeSeriesCache = {
  get: (key: string | number): TimeSeriesData[] | null => {
    return dataCache.get<TimeSeriesData[]>({ type: 'timeseries', id: key });
  },
  set: (key: string | number, data: TimeSeriesData[]): void => {
    dataCache.set({ type: 'timeseries', id: key }, data);
  },
  has: (key: string | number): boolean => {
    return dataCache.has({ type: 'timeseries', id: key });
  },
  clear: (): void => {
    // Clear all timeseries entries
    dataCache.clear();
  }
};

export const metadataCache = {
  get: (metadataId: number): Metadata | null => {
    return dataCache.get<Metadata>({ type: 'metadata', id: metadataId });
  },
  set: (metadataId: number, data: Metadata): void => {
    dataCache.set({ type: 'metadata', id: metadataId }, data);
  },
  has: (metadataId: number): boolean => {
    return dataCache.has({ type: 'metadata', id: metadataId });
  },
  clear: (): void => {
    // Clear all metadata entries
    dataCache.clear();
  }
};

export const parameterCache = {
  get: (parameterId: string): ParameterInfo | null => {
    return dataCache.get<ParameterInfo>({ type: 'parameter', id: parameterId });
  },
  set: (parameterId: string, data: ParameterInfo): void => {
    dataCache.set({ type: 'parameter', id: parameterId }, data);
  },
  has: (parameterId: string): boolean => {
    return dataCache.has({ type: 'parameter', id: parameterId });
  },
  clear: (): void => {
    // Clear all parameter entries
    dataCache.clear();
  }
};

// Cache for transformed data
export const transformCache = {
  get: <T>(key: string): T | null => {
    return dataCache.get<T>({ type: 'transform', id: key });
  },
  set: <T>(key: string, data: T): void => {
    dataCache.set({ type: 'transform', id: key }, data);
  },
  has: (key: string): boolean => {
    return dataCache.has({ type: 'transform', id: key });
  },
  clear: (): void => {
    // Clear all transform entries
    dataCache.clear();
  }
};

// Cache for sampled data
export const samplingCache = {
  get: <T>(key: string): T | null => {
    return dataCache.get<T>({ type: 'sampling', id: key });
  },
  set: <T>(key: string, data: T): void => {
    dataCache.set({ type: 'sampling', id: key }, data);
  },
  has: (key: string): boolean => {
    return dataCache.has({ type: 'sampling', id: key });
  },
  delete: (key: string): void => {
    dataCache.delete({ type: 'sampling', id: key });
  },
  clear: (): void => {
    // Clear all sampling entries
    dataCache.clear();
  }
};