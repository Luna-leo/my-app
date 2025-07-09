/**
 * Memory-efficient cache implementation using WeakMap and LRU eviction
 * Provides automatic garbage collection and memory pressure handling
 */

export interface CacheOptions {
  maxSize?: number;
  maxMemoryMB?: number;
  ttl?: number;
}

interface CacheNode<T> {
  key: string;
  value: T;
  size: number;
  timestamp: number;
  prev: CacheNode<T> | null;
  next: CacheNode<T> | null;
}

export class MemoryEfficientCache<T> {
  private cache = new Map<string, CacheNode<T>>();
  private head: CacheNode<T> | null = null;
  private tail: CacheNode<T> | null = null;
  private currentSize = 0;
  private readonly maxSize: number;
  private readonly maxMemoryBytes: number;
  private readonly ttl: number;

  constructor(options: CacheOptions = {}) {
    this.maxSize = options.maxSize || 100;
    this.maxMemoryBytes = (options.maxMemoryMB || 50) * 1024 * 1024; // Convert MB to bytes
    this.ttl = options.ttl || 5 * 60 * 1000; // 5 minutes default
  }

  /**
   * Estimate memory size of a value
   * This is a rough estimation and may not be 100% accurate
   */
  private estimateSize(value: unknown): number {
    if (value === null || value === undefined) return 0;
    
    if (typeof value === 'string') return value.length * 2; // 2 bytes per char
    if (typeof value === 'number') return 8;
    if (typeof value === 'boolean') return 4;
    
    if (Array.isArray(value)) {
      let size = 0;
      for (let i = 0; i < Math.min(value.length, 100); i++) { // Sample first 100 items
        size += this.estimateSize(value[i]);
      }
      return size * (value.length / Math.min(value.length, 100)); // Extrapolate
    }
    
    if (typeof value === 'object') {
      // For objects, estimate based on a sample of properties
      let size = 0;
      let count = 0;
      for (const key in value) {
        if (count++ > 10) break; // Sample first 10 properties
        size += key.length * 2 + this.estimateSize((value as Record<string, unknown>)[key]);
      }
      return size * (Object.keys(value).length / Math.min(Object.keys(value).length, 10));
    }
    
    return 100; // Default size for unknown types
  }

  /**
   * Move node to head (most recently used)
   */
  private moveToHead(node: CacheNode<T>): void {
    if (node === this.head) return;

    // Remove from current position
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.tail) this.tail = node.prev;

    // Move to head
    node.prev = null;
    node.next = this.head;
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;
  }

  /**
   * Remove least recently used nodes until we're under memory/size limits
   */
  private evict(): void {
    while (this.tail && (this.cache.size > this.maxSize || this.currentSize > this.maxMemoryBytes)) {
      const node = this.tail;
      this.tail = node.prev;
      if (this.tail) {
        this.tail.next = null;
      } else {
        this.head = null;
      }
      
      this.cache.delete(node.key);
      this.currentSize -= node.size;
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(node: CacheNode<T>): boolean {
    return Date.now() - node.timestamp > this.ttl;
  }

  /**
   * Set a cache entry
   */
  set(key: string, value: T): void {
    // Remove existing entry if present
    const existing = this.cache.get(key);
    if (existing) {
      this.currentSize -= existing.size;
      if (existing.prev) existing.prev.next = existing.next;
      if (existing.next) existing.next.prev = existing.prev;
      if (existing === this.head) this.head = existing.next;
      if (existing === this.tail) this.tail = existing.prev;
    }

    // Create new node
    const size = this.estimateSize(value);
    const node: CacheNode<T> = {
      key,
      value,
      size,
      timestamp: Date.now(),
      prev: null,
      next: this.head
    };

    // Add to cache
    this.cache.set(key, node);
    this.currentSize += size;

    // Update linked list
    if (this.head) this.head.prev = node;
    this.head = node;
    if (!this.tail) this.tail = node;

    // Evict if necessary
    this.evict();
  }

  /**
   * Get a cache entry
   */
  get(key: string): T | null {
    const node = this.cache.get(key);
    if (!node) return null;

    // Check expiration
    if (this.isExpired(node)) {
      this.delete(key);
      return null;
    }

    // Move to head (mark as recently used)
    this.moveToHead(node);
    return node.value;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const node = this.cache.get(key);
    if (!node) return false;
    
    if (this.isExpired(node)) {
      this.delete(key);
      return false;
    }
    
    return true;
  }

  /**
   * Delete a cache entry
   */
  delete(key: string): void {
    const node = this.cache.get(key);
    if (!node) return;

    // Remove from linked list
    if (node.prev) node.prev.next = node.next;
    if (node.next) node.next.prev = node.prev;
    if (node === this.head) this.head = node.next;
    if (node === this.tail) this.tail = node.prev;

    // Remove from cache
    this.cache.delete(key);
    this.currentSize -= node.size;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.head = null;
    this.tail = null;
    this.currentSize = 0;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    memoryMB: number;
    hitRate: number;
    entries: Array<{ key: string; sizeMB: number; age: number }>;
  } {
    const now = Date.now();
    const entries = Array.from(this.cache.entries())
      .map(([key, node]) => ({
        key,
        sizeMB: node.size / (1024 * 1024),
        age: now - node.timestamp
      }))
      .sort((a, b) => b.sizeMB - a.sizeMB); // Sort by size, largest first

    return {
      size: this.cache.size,
      memoryMB: this.currentSize / (1024 * 1024),
      hitRate: 0, // Would need to track hits/misses for this
      entries: entries.slice(0, 10) // Top 10 largest entries
    };
  }

  /**
   * Run garbage collection manually
   * Removes expired entries and triggers eviction if needed
   */
  gc(): void {
    const now = Date.now();
    const expiredKeys: string[] = [];
    
    for (const [key, node] of this.cache.entries()) {
      if (now - node.timestamp > this.ttl) {
        expiredKeys.push(key);
      }
    }
    
    for (const key of expiredKeys) {
      this.delete(key);
    }
    
    this.evict();
  }
}

/**
 * Specialized cache for large array data (like time series)
 * Uses WeakMap for automatic garbage collection
 */
export class WeakArrayCache<K extends object, V> {
  private cache = new WeakMap<K, { value: V; timestamp: number }>();
  private keys = new WeakSet<K>();
  private readonly ttl: number;

  constructor(ttl: number = 5 * 60 * 1000) {
    this.ttl = ttl;
  }

  set(key: K, value: V): void {
    this.cache.set(key, {
      value,
      timestamp: Date.now()
    });
    this.keys.add(key);
  }

  get(key: K): V | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // Check expiration
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.keys.delete(key);
      return null;
    }

    return entry.value;
  }

  has(key: K): boolean {
    if (!this.keys.has(key)) return false;
    
    const entry = this.cache.get(key);
    if (!entry) {
      this.keys.delete(key);
      return false;
    }

    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.keys.delete(key);
      return false;
    }

    return true;
  }

  delete(key: K): void {
    this.cache.delete(key);
    this.keys.delete(key);
  }
}