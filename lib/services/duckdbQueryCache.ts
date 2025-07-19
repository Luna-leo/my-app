/**
 * DuckDB Query Cache
 * 
 * Caches query results to improve performance for frequently executed queries
 * Uses LRU eviction policy and TTL-based expiration
 */

// Use Web Crypto API for browser compatibility

interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
  size: number;
  accessCount: number;
  lastAccessed: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  totalQueries: number;
  hitRate: number;
  cacheSize: number;
  entryCount: number;
}

export interface QueryCacheOptions {
  maxSizeMB: number;
  defaultTTL: number; // milliseconds
  maxEntries: number;
  enableCompression?: boolean;
}

export class DuckDBQueryCache {
  private static instance: DuckDBQueryCache;
  private cache: Map<string, CacheEntry> = new Map();
  private options: Required<QueryCacheOptions>;
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    evictions: 0,
    totalQueries: 0,
    hitRate: 0,
    cacheSize: 0,
    entryCount: 0
  };
  private accessOrder: string[] = []; // For LRU tracking

  private constructor(options: QueryCacheOptions) {
    this.options = {
      maxSizeMB: options.maxSizeMB,
      defaultTTL: options.defaultTTL,
      maxEntries: options.maxEntries,
      enableCompression: options.enableCompression || false
    };

    // Periodic cleanup
    setInterval(() => this.cleanup(), 60000); // Every minute
  }

  static getInstance(options?: QueryCacheOptions): DuckDBQueryCache {
    if (!DuckDBQueryCache.instance) {
      DuckDBQueryCache.instance = new DuckDBQueryCache(
        options || {
          maxSizeMB: 100,
          defaultTTL: 5 * 60 * 1000, // 5 minutes
          maxEntries: 1000
        }
      );
    }
    return DuckDBQueryCache.instance;
  }

  /**
   * Generate cache key from query and parameters
   */
  private generateCacheKey(query: string, params?: unknown[]): string {
    const normalizedQuery = query.toLowerCase().replace(/\s+/g, ' ').trim();
    const keyData = {
      query: normalizedQuery,
      params: params || []
    };
    
    // Simple hash function for browser compatibility
    const str = JSON.stringify(keyData);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  /**
   * Estimate size of data in bytes
   */
  private estimateSize(data: unknown): number {
    try {
      return JSON.stringify(data).length * 2; // Rough estimate (UTF-16)
    } catch {
      return 1024; // Default 1KB if estimation fails
    }
  }

  /**
   * Get cached query result
   */
  get<T>(query: string, params?: unknown[]): T | null {
    const key = this.generateCacheKey(query, params);
    const entry = this.cache.get(key);
    
    this.stats.totalQueries++;

    if (!entry) {
      this.stats.misses++;
      this.updateHitRate();
      return null;
    }

    // Check TTL
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      this.removeFromAccessOrder(key);
      this.stats.misses++;
      this.stats.evictions++;
      this.updateHitRate();
      return null;
    }

    // Update access tracking
    entry.accessCount++;
    entry.lastAccessed = now;
    this.updateAccessOrder(key);
    
    this.stats.hits++;
    this.updateHitRate();
    
    console.log(`[QueryCache] Cache hit for query (${this.stats.hitRate.toFixed(1)}% hit rate)`);
    
    return entry.data as T;
  }

  /**
   * Set query result in cache
   */
  set<T>(query: string, data: T, params?: unknown[], ttl?: number): void {
    const key = this.generateCacheKey(query, params);
    const size = this.estimateSize(data);
    const now = Date.now();

    // Check if we need to evict entries
    this.ensureCapacity(size);

    const entry: CacheEntry<T> = {
      data,
      timestamp: now,
      ttl: ttl || this.options.defaultTTL,
      size,
      accessCount: 1,
      lastAccessed: now
    };

    this.cache.set(key, entry);
    this.updateAccessOrder(key);
    this.updateCacheStats();

    console.log(`[QueryCache] Cached query result (${(size / 1024).toFixed(2)}KB)`);
  }

  /**
   * Invalidate cache entries matching pattern
   */
  invalidate(pattern?: string | RegExp): number {
    if (!pattern) {
      const count = this.cache.size;
      this.cache.clear();
      this.accessOrder = [];
      this.updateCacheStats();
      console.log(`[QueryCache] Cleared all ${count} entries`);
      return count;
    }

    let invalidated = 0;
    const regex = typeof pattern === 'string' 
      ? new RegExp(pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      : pattern;

    for (const [key] of this.cache) {
      // Check if the original query matches the pattern
      if (regex.test(key)) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        invalidated++;
      }
    }

    this.updateCacheStats();
    console.log(`[QueryCache] Invalidated ${invalidated} entries matching pattern`);
    return invalidated;
  }

  /**
   * Ensure cache has capacity for new entry
   */
  private ensureCapacity(requiredSize: number): void {
    const maxSizeBytes = this.options.maxSizeMB * 1024 * 1024;
    
    // Check entry count limit
    while (this.cache.size >= this.options.maxEntries) {
      this.evictLRU();
    }

    // Check size limit
    let currentSize = this.stats.cacheSize;
    while (currentSize + requiredSize > maxSizeBytes && this.cache.size > 0) {
      this.evictLRU();
      currentSize = this.calculateTotalSize();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    if (this.accessOrder.length === 0) return;

    const lruKey = this.accessOrder[0];
    this.cache.delete(lruKey);
    this.accessOrder.shift();
    this.stats.evictions++;
    
    console.log(`[QueryCache] Evicted LRU entry`);
  }

  /**
   * Update access order for LRU tracking
   */
  private updateAccessOrder(key: string): void {
    this.removeFromAccessOrder(key);
    this.accessOrder.push(key);
  }

  /**
   * Remove key from access order
   */
  private removeFromAccessOrder(key: string): void {
    const index = this.accessOrder.indexOf(key);
    if (index > -1) {
      this.accessOrder.splice(index, 1);
    }
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        this.removeFromAccessOrder(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.updateCacheStats();
      console.log(`[QueryCache] Cleaned up ${cleaned} expired entries`);
    }
  }

  /**
   * Calculate total cache size
   */
  private calculateTotalSize(): number {
    let total = 0;
    for (const entry of this.cache.values()) {
      total += entry.size;
    }
    return total;
  }

  /**
   * Update cache statistics
   */
  private updateCacheStats(): void {
    this.stats.cacheSize = this.calculateTotalSize();
    this.stats.entryCount = this.cache.size;
  }

  /**
   * Update hit rate
   */
  private updateHitRate(): void {
    if (this.stats.totalQueries > 0) {
      this.stats.hitRate = (this.stats.hits / this.stats.totalQueries) * 100;
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache metadata for monitoring
   */
  getCacheMetadata(): {
    entries: Array<{
      key: string;
      size: number;
      age: number;
      accessCount: number;
      ttl: number;
    }>;
    totalSize: number;
    entryCount: number;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries()).map(([key, entry]) => ({
      key,
      size: entry.size,
      age: now - entry.timestamp,
      accessCount: entry.accessCount,
      ttl: entry.ttl
    }));

    return {
      entries: entries.sort((a, b) => b.accessCount - a.accessCount),
      totalSize: this.stats.cacheSize,
      entryCount: this.stats.entryCount
    };
  }

  /**
   * Warm up cache with predefined queries
   */
  async warmUp(
    queries: Array<{
      query: string;
      params?: unknown[];
      executor: () => Promise<unknown>;
      ttl?: number;
    }>
  ): Promise<void> {
    console.log(`[QueryCache] Warming up cache with ${queries.length} queries...`);
    
    for (const { query, params, executor, ttl } of queries) {
      try {
        const result = await executor();
        this.set(query, result, params, ttl);
      } catch (error) {
        console.error(`[QueryCache] Failed to warm up query:`, error);
      }
    }
    
    console.log(`[QueryCache] Warm up completed. Cache size: ${(this.stats.cacheSize / 1024 / 1024).toFixed(2)}MB`);
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.accessOrder = [];
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      totalQueries: 0,
      hitRate: 0,
      cacheSize: 0,
      entryCount: 0
    };
    console.log('[QueryCache] Cache cleared');
  }
}

// Export singleton getter
export const duckDBQueryCache = DuckDBQueryCache.getInstance();