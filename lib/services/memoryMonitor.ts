/**
 * Memory monitoring service for tracking application memory usage
 * Provides real-time memory pressure detection and alerts
 */

import { useState, useEffect } from 'react';

export interface MemoryStats {
  usedMB: number;
  totalMB: number;
  percentUsed: number;
  pressure: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
}

export interface MemoryThresholds {
  low: number;    // < 40% memory usage
  medium: number; // 40-60% memory usage
  high: number;   // 60-80% memory usage
  critical: number; // > 80% memory usage
}

type MemoryChangeListener = (stats: MemoryStats) => void;

class MemoryMonitor {
  private static instance: MemoryMonitor;
  private listeners: Set<MemoryChangeListener> = new Set();
  private currentStats: MemoryStats | null = null;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private readonly thresholds: MemoryThresholds = {
    low: 0.4,
    medium: 0.6,
    high: 0.8,
    critical: 0.9
  };

  private constructor() {}

  static getInstance(): MemoryMonitor {
    if (!MemoryMonitor.instance) {
      MemoryMonitor.instance = new MemoryMonitor();
    }
    return MemoryMonitor.instance;
  }

  /**
   * Start monitoring memory usage
   */
  startMonitoring(intervalMs: number = 5000): void {
    if (this.monitoringInterval) {
      return; // Already monitoring
    }

    // Initial check
    this.checkMemory();

    // Set up periodic monitoring
    this.monitoringInterval = setInterval(() => {
      this.checkMemory();
    }, intervalMs);
  }

  /**
   * Stop monitoring memory usage
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  /**
   * Check current memory usage
   */
  async checkMemory(): Promise<MemoryStats> {
    const stats = await this.getMemoryStats();
    
    // Check if memory pressure has changed
    if (!this.currentStats || stats.pressure !== this.currentStats.pressure) {
      this.notifyListeners(stats);
    }
    
    this.currentStats = stats;
    return stats;
  }

  /**
   * Get current memory statistics
   */
  private async getMemoryStats(): Promise<MemoryStats> {
    // Try to use performance.measureUserAgentSpecificMemory if available
    if ('measureUserAgentSpecificMemory' in performance) {
      try {
        const result = await (performance as typeof performance & { measureUserAgentSpecificMemory: () => Promise<{ bytes: number }> }).measureUserAgentSpecificMemory();
        const usedMB = result.bytes / (1024 * 1024);
        const totalMB = this.estimateTotalMemory();
        const percentUsed = usedMB / totalMB;
        
        return {
          usedMB,
          totalMB,
          percentUsed,
          pressure: this.calculatePressure(percentUsed),
          timestamp: Date.now()
        };
      } catch {
        // Fall back to performance.memory
      }
    }

    // Fallback: Use performance.memory (Chrome only)
    if ('memory' in performance) {
      const memory = (performance as typeof performance & { memory: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
      const usedMB = memory.usedJSHeapSize / (1024 * 1024);
      const totalMB = memory.jsHeapSizeLimit / (1024 * 1024);
      const percentUsed = usedMB / totalMB;
      
      return {
        usedMB,
        totalMB,
        percentUsed,
        pressure: this.calculatePressure(percentUsed),
        timestamp: Date.now()
      };
    }

    // Fallback: Estimate based on typical browser limits
    const estimatedUsedMB = this.estimateMemoryUsage();
    const estimatedTotalMB = this.estimateTotalMemory();
    const percentUsed = estimatedUsedMB / estimatedTotalMB;
    
    return {
      usedMB: estimatedUsedMB,
      totalMB: estimatedTotalMB,
      percentUsed,
      pressure: this.calculatePressure(percentUsed),
      timestamp: Date.now()
    };
  }

  /**
   * Calculate memory pressure level
   */
  private calculatePressure(percentUsed: number): MemoryStats['pressure'] {
    if (percentUsed >= this.thresholds.critical) return 'critical';
    if (percentUsed >= this.thresholds.high) return 'high';
    if (percentUsed >= this.thresholds.medium) return 'medium';
    return 'low';
  }

  /**
   * Estimate memory usage based on known allocations
   */
  private estimateMemoryUsage(): number {
    // This is a rough estimate - in production, you'd track actual allocations
    let estimatedMB = 50; // Base browser overhead
    
    // Add cache sizes
    if (typeof window !== 'undefined' && (window as typeof window & { __memoryTracking?: { totalMB?: number } }).__memoryTracking) {
      estimatedMB += (window as typeof window & { __memoryTracking?: { totalMB?: number } }).__memoryTracking?.totalMB || 0;
    }
    
    return estimatedMB;
  }

  /**
   * Estimate total available memory
   */
  private estimateTotalMemory(): number {
    // Most modern browsers limit tabs to ~2-4GB
    // Conservative estimate
    return 2048; // 2GB
  }

  /**
   * Get current memory stats without triggering a check
   */
  getCurrentStats(): MemoryStats | null {
    return this.currentStats;
  }

  /**
   * Subscribe to memory pressure changes
   */
  subscribe(listener: MemoryChangeListener): () => void {
    this.listeners.add(listener);
    
    // Return unsubscribe function
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Notify all listeners of memory changes
   */
  private notifyListeners(stats: MemoryStats): void {
    this.listeners.forEach(listener => {
      try {
        listener(stats);
      } catch (error) {
        console.error('Error in memory monitor listener:', error);
      }
    });
  }

  /**
   * Force garbage collection if possible (development only)
   */
  forceGC(): void {
    if (typeof window !== 'undefined' && 'gc' in window) {
      try {
        (window as typeof window & { gc: () => void }).gc();
        console.log('Forced garbage collection');
      } catch (error) {
        console.warn('Unable to force garbage collection:', error);
      }
    }
  }
}

export const memoryMonitor = MemoryMonitor.getInstance();

/**
 * Get current memory statistics
 */
export async function getMemoryStats(): Promise<MemoryStats> {
  return memoryMonitor.checkMemory();
}

/**
 * React hook for monitoring memory usage
 */
export function useMemoryMonitor(onPressureChange?: (stats: MemoryStats) => void) {
  const [memoryStats, setMemoryStats] = useState<MemoryStats | null>(null);

  useEffect(() => {
    // Start monitoring
    memoryMonitor.startMonitoring();

    // Subscribe to changes
    const unsubscribe = memoryMonitor.subscribe((stats) => {
      setMemoryStats(stats);
      if (onPressureChange) {
        onPressureChange(stats);
      }
    });

    // Initial check
    memoryMonitor.checkMemory().then(setMemoryStats);

    return () => {
      unsubscribe();
    };
  }, [onPressureChange]);

  return memoryStats;
}

