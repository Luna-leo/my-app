// WebGL Context Manager for Plotly charts
// Manages WebGL contexts with LRU eviction and priority handling

import { EventEmitter } from 'events';

interface ContextInfo {
  element: HTMLElement;
  plotlyInstance: typeof import('plotly.js');
  createdAt: number;
  lastUsed: number;
  priority: number; // 0 = normal, 1 = viewport priority
  dataPoints?: number; // Number of data points in the chart
  interactionCount?: number; // Number of user interactions
}

interface ContextRequest {
  chartId: string;
  timestamp: number;
  isViewportPriority?: boolean;
}

class WebGLContextManager extends EventEmitter {
  private static instance: WebGLContextManager;
  private activeContexts: Map<string, ContextInfo> = new Map();
  private contextQueue: ContextRequest[] = [];
  
  private readonly MAX_CONTEXTS = 16; // Support up to 16 charts display
  private readonly VIEWPORT_PRIORITY = 1;
  private readonly NORMAL_PRIORITY = 0;
  
  private constructor() {
    super();
    // Increase max listeners to handle multiple charts
    this.setMaxListeners(20);
  }
  
  static getInstance(): WebGLContextManager {
    if (!WebGLContextManager.instance) {
      WebGLContextManager.instance = new WebGLContextManager();
    }
    return WebGLContextManager.instance;
  }
  
  // Check if we can add a new context
  canAddContext(): boolean {
    return this.activeContexts.size < this.MAX_CONTEXTS;
  }
  
  // Request a context for a chart
  requestContext(chartId: string, timestamp: number, isViewportPriority = false): boolean {
    // If already has context, just update last used
    if (this.activeContexts.has(chartId)) {
      this.updateLastUsed(chartId, timestamp);
      return true;
    }
    
    // If we have room, grant immediately
    if (this.canAddContext()) {
      // Context will be registered later by registerContext
      return true;
    }
    
    // Otherwise, add to queue
    this.contextQueue.push({
      chartId,
      timestamp,
      isViewportPriority,
    });
    
    // Try to process queue
    this.processQueue();
    
    return false;
  }
  
  // Register a new context (called after Plotly chart is created)
  registerContext(
    id: string, 
    element: HTMLElement, 
    plotlyInstance: typeof import('plotly.js'),
    dataPoints?: number
  ): void {
    const now = Date.now();
    
    console.log(`[WebGLContextManager] Registering context ${id} with ${dataPoints} data points (active: ${this.activeContexts.size}/${this.MAX_CONTEXTS})`);
    
    this.activeContexts.set(id, {
      element,
      plotlyInstance,
      createdAt: now,
      lastUsed: now,
      priority: this.NORMAL_PRIORITY,
      dataPoints: dataPoints || 0,
      interactionCount: 0,
    });
    
    // Process any pending requests
    this.processQueue();
  }
  
  // Update last used time and interaction count
  updateLastUsed(id: string, timestamp: number): void {
    const context = this.activeContexts.get(id);
    if (context) {
      context.lastUsed = timestamp;
      context.interactionCount = (context.interactionCount || 0) + 1;
    }
  }
  
  // Release a context
  releaseContext(id: string): void {
    this.activeContexts.delete(id);
    
    // Process queue to see if any pending requests can be fulfilled
    this.processQueue();
  }
  
  // Remove a context and clean up
  async removeContext(id: string): Promise<void> {
    const context = this.activeContexts.get(id);
    if (context) {
      console.log(`[WebGLContextManager] Removing context ${id} (active contexts: ${this.activeContexts.size})`);
      try {
        // Note: We're not calling purge here because it removes the entire plot
        // The chart component will handle switching to non-WebGL mode
        console.log(`[WebGLContextManager] Skipping purge to preserve plot, chart will fallback to SVG mode`);
      } catch (error) {
        console.warn(`Failed to handle context removal ${id}:`, error);
      }
      this.activeContexts.delete(id);
      
      // Emit eviction event
      this.emit('evict', id);
      console.log(`[WebGLContextManager] Emitted evict event for ${id} (remaining contexts: ${this.activeContexts.size})`);
    }
    
    // Process queue
    this.processQueue();
  }
  
  // Evict the least recently used context with smart priority
  evictLRU(): string | null {
    if (this.activeContexts.size === 0) return null;
    
    console.log(`[WebGLContextManager] Running LRU eviction (active contexts: ${this.activeContexts.size}/${this.MAX_CONTEXTS})`);
    
    let evictId: string | null = null;
    let lowestScore = Infinity;
    
    // Calculate smart priority score for each context
    this.activeContexts.forEach((context, id) => {
      // Calculate priority score (lower = more likely to evict)
      const timeSinceUse = Date.now() - context.lastUsed;
      const interactionScore = (context.interactionCount || 0) * 100;
      const dataPointScore = Math.min((context.dataPoints || 0) / 100, 100);
      const viewportScore = context.priority * 1000; // viewport priority
      
      // Combined score (higher = keep, lower = evict)
      const score = viewportScore + interactionScore + dataPointScore - (timeSinceUse / 1000);
      
      if (score < lowestScore) {
        lowestScore = score;
        evictId = id;
      }
    });
    
    if (evictId) {
      console.log(`[WebGLContextManager] Evicting context ${evictId} with score ${lowestScore}`);
      this.removeContext(evictId);
    }
    
    return evictId;
  }
  
  // Process the context request queue
  private processQueue(): void {
    if (this.contextQueue.length === 0) return;
    
    // Sort queue by priority and timestamp
    this.contextQueue.sort((a, b) => {
      if (a.isViewportPriority !== b.isViewportPriority) {
        return a.isViewportPriority ? -1 : 1;
      }
      return a.timestamp - b.timestamp;
    });
    
    // Process as many requests as possible
    while (this.contextQueue.length > 0 && this.canAddContext()) {
      const request = this.contextQueue.shift();
      if (request) {
        // The actual context will be registered when the chart is created
        this.emit('grant', request.chartId);
      }
    }
  }
  
  // Check if a context exists
  hasContext(id: string): boolean {
    return this.activeContexts.has(id);
  }
  
  // Get context info
  getContext(id: string) {
    return this.activeContexts.get(id);
  }
  
  // Get active context count
  getActiveCount(): number {
    return this.activeContexts.size;
  }
  
  // Get all active context IDs
  getActiveContextIds(): string[] {
    return Array.from(this.activeContexts.keys());
  }
  
  // Update context priority
  updatePriority(id: string, isViewportPriority: boolean): void {
    const context = this.activeContexts.get(id);
    if (context) {
      context.priority = isViewportPriority ? this.VIEWPORT_PRIORITY : this.NORMAL_PRIORITY;
    }
  }
  
  // Calculate smart priority based on multiple factors
  calculateSmartPriority(options: {
    isInViewport: boolean;
    dataPoints: number;
    interactionCount: number;
    lastInteractionTime?: number;
  }): number {
    let priority = 0;
    
    // Viewport priority (0-1000)
    if (options.isInViewport) {
      priority += 1000;
    }
    
    // Data points priority (0-500)
    // More data points = higher priority for WebGL
    if (options.dataPoints > 10000) {
      priority += 500;
    } else if (options.dataPoints > 5000) {
      priority += 300;
    } else if (options.dataPoints > 1000) {
      priority += 100;
    }
    
    // Interaction priority (0-300)
    priority += Math.min(options.interactionCount * 50, 300);
    
    // Recency bonus (0-200)
    if (options.lastInteractionTime) {
      const timeSinceInteraction = Date.now() - options.lastInteractionTime;
      if (timeSinceInteraction < 5000) { // Within 5 seconds
        priority += 200;
      } else if (timeSinceInteraction < 30000) { // Within 30 seconds
        priority += 100;
      }
    }
    
    return priority;
  }
  
  // Check if chart should use WebGL based on data points
  shouldUseWebGL(dataPoints: number): boolean {
    // Very small datasets don't benefit from WebGL
    if (dataPoints < 500) return false;
    
    // Large datasets strongly benefit from WebGL
    if (dataPoints > 5000) return true;
    
    // Medium datasets: use WebGL if we have available contexts
    return this.canAddContext();
  }
  
  // Clean up all contexts
  async cleanupAll(): Promise<void> {
    const promises = Array.from(this.activeContexts.keys()).map(id => 
      this.removeContext(id)
    );
    await Promise.all(promises);
    this.contextQueue = [];
  }
  
  // Get stats for debugging
  getStats() {
    return {
      activeCount: this.activeContexts.size,
      queueLength: this.contextQueue.length,
      maxContexts: this.MAX_CONTEXTS,
      contexts: Array.from(this.activeContexts.entries()).map(([id, info]) => ({
        id,
        lastUsed: info.lastUsed,
        priority: info.priority,
        age: Date.now() - info.createdAt,
      })),
    };
  }
}

export const webGLContextManager = WebGLContextManager.getInstance();

// Helper to generate unique context ID
export function generateContextId(prefix: string = 'plotly'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}