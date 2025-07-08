import { TimeSeriesData, Metadata, ParameterInfo } from '@/lib/db/schema';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface DataCacheKey {
  type: 'timeseries' | 'metadata' | 'parameter';
  id: string | number;
}

class DataCache {
  private static instance: DataCache;
  private cache = new Map<string, CacheEntry<unknown>>();
  private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 100; // Maximum number of entries

  private constructor() {}

  static getInstance(): DataCache {
    if (!DataCache.instance) {
      DataCache.instance = new DataCache();
    }
    return DataCache.instance;
  }

  private generateKey(key: DataCacheKey): string {
    return `${key.type}:${key.id}`;
  }

  private isExpired(entry: CacheEntry<unknown>): boolean {
    return Date.now() - entry.timestamp > entry.ttl;
  }

  private cleanup(): void {
    // Remove expired entries
    for (const [key, entry] of this.cache.entries()) {
      if (this.isExpired(entry)) {
        this.cache.delete(key);
      }
    }

    // If still over limit, remove oldest entries
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      
      const toRemove = entries.slice(0, this.cache.size - this.MAX_CACHE_SIZE);
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  set<T>(key: DataCacheKey, data: T, ttl?: number): void {
    const cacheKey = this.generateKey(key);
    this.cache.set(cacheKey, {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.DEFAULT_TTL
    });
    
    // Cleanup if needed
    if (this.cache.size > this.MAX_CACHE_SIZE) {
      this.cleanup();
    }
  }

  get<T>(key: DataCacheKey): T | null {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) {
      return null;
    }

    if (this.isExpired(entry)) {
      this.cache.delete(cacheKey);
      return null;
    }

    return entry.data as T;
  }

  // Batch get with missing keys returned
  getBatch<T>(keys: DataCacheKey[]): { cached: Map<string, T>; missing: DataCacheKey[] } {
    const cached = new Map<string, T>();
    const missing: DataCacheKey[] = [];

    keys.forEach(key => {
      const data = this.get<T>(key);
      if (data !== null) {
        cached.set(this.generateKey(key), data);
      } else {
        missing.push(key);
      }
    });

    return { cached, missing };
  }

  // Batch set
  setBatch<T>(entries: Array<{ key: DataCacheKey; data: T; ttl?: number }>): void {
    entries.forEach(({ key, data, ttl }) => {
      this.set(key, data, ttl);
    });
  }

  has(key: DataCacheKey): boolean {
    const cacheKey = this.generateKey(key);
    const entry = this.cache.get(cacheKey);
    
    if (!entry) return false;
    
    if (this.isExpired(entry)) {
      this.cache.delete(cacheKey);
      return false;
    }
    
    return true;
  }

  delete(key: DataCacheKey): void {
    const cacheKey = this.generateKey(key);
    this.cache.delete(cacheKey);
  }

  clear(): void {
    this.cache.clear();
  }

  // Get cache statistics
  getStats(): { size: number; entries: Array<{ key: string; size: number; age: number }> } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      size: JSON.stringify(entry.data).length,
      age: now - entry.timestamp
    }));

    return {
      size: this.cache.size,
      entries
    };
  }
}

export const dataCache = DataCache.getInstance();

// Typed cache functions for specific data types
export const timeSeriesCache = {
  get: (metadataId: number): TimeSeriesData[] | null => {
    return dataCache.get<TimeSeriesData[]>({ type: 'timeseries', id: metadataId });
  },
  set: (metadataId: number, data: TimeSeriesData[], ttl?: number): void => {
    dataCache.set({ type: 'timeseries', id: metadataId }, data, ttl);
  },
  has: (metadataId: number): boolean => {
    return dataCache.has({ type: 'timeseries', id: metadataId });
  }
};

export const metadataCache = {
  get: (metadataId: number): Metadata | null => {
    return dataCache.get<Metadata>({ type: 'metadata', id: metadataId });
  },
  set: (metadataId: number, data: Metadata, ttl?: number): void => {
    dataCache.set({ type: 'metadata', id: metadataId }, data, ttl);
  },
  has: (metadataId: number): boolean => {
    return dataCache.has({ type: 'metadata', id: metadataId });
  }
};

export const parameterCache = {
  get: (parameterId: string): ParameterInfo | null => {
    return dataCache.get<ParameterInfo>({ type: 'parameter', id: parameterId });
  },
  set: (parameterId: string, data: ParameterInfo, ttl?: number): void => {
    dataCache.set({ type: 'parameter', id: parameterId }, data, ttl);
  },
  has: (parameterId: string): boolean => {
    return dataCache.has({ type: 'parameter', id: parameterId });
  }
};