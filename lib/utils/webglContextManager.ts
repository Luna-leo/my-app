// WebGL Context Manager for Plotly charts
// Manages WebGL contexts with LRU eviction and priority handling

import { EventEmitter } from 'events';

interface ContextInfo {
  element: HTMLElement;
  plotlyInstance: typeof import('plotly.js');
  createdAt: number;
  lastUsed: number;
  priority: number; // 0 = normal, 1 = viewport priority
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
  
  private readonly MAX_CONTEXTS = 6; // Keep well below browser limit to avoid issues
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
  registerContext(id: string, element: HTMLElement, plotlyInstance: typeof import('plotly.js')): void {
    const now = Date.now();
    
    this.activeContexts.set(id, {
      element,
      plotlyInstance,
      createdAt: now,
      lastUsed: now,
      priority: this.NORMAL_PRIORITY,
    });
    
    // Process any pending requests
    this.processQueue();
  }
  
  // Update last used time
  updateLastUsed(id: string, timestamp: number): void {
    const context = this.activeContexts.get(id);
    if (context) {
      context.lastUsed = timestamp;
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
      try {
        // Purge the Plotly instance to free WebGL resources
        if (context.plotlyInstance && context.element) {
          await context.plotlyInstance.purge(context.element);
        }
      } catch (error) {
        console.warn(`Failed to purge context ${id}:`, error);
      }
      this.activeContexts.delete(id);
      
      // Emit eviction event
      this.emit('evict', id);
    }
    
    // Process queue
    this.processQueue();
  }
  
  // Evict the least recently used context
  evictLRU(): string | null {
    if (this.activeContexts.size === 0) return null;
    
    let lruId: string | null = null;
    let lruTime = Infinity;
    let lruPriority = Infinity;
    
    // Find LRU context (considering priority)
    this.activeContexts.forEach((context, id) => {
      // Lower priority contexts are evicted first
      if (context.priority < lruPriority || 
          (context.priority === lruPriority && context.lastUsed < lruTime)) {
        lruId = id;
        lruTime = context.lastUsed;
        lruPriority = context.priority;
      }
    });
    
    if (lruId) {
      this.removeContext(lruId);
    }
    
    return lruId;
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