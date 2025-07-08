// WebGL Context Manager for Plotly charts
// Manages WebGL contexts to prevent context loss and flickering

class WebGLContextManager {
  private static instance: WebGLContextManager;
  private activeContexts: Map<string, {
    element: HTMLElement;
    plotlyInstance: typeof import('plotly.js');
    createdAt: number;
  }> = new Map();
  
  private readonly MAX_CONTEXTS = 8; // Browser limit is typically 16
  private readonly CONTEXT_TIMEOUT = 5000; // 5 seconds
  
  private constructor() {}
  
  static getInstance(): WebGLContextManager {
    if (!WebGLContextManager.instance) {
      WebGLContextManager.instance = new WebGLContextManager();
    }
    return WebGLContextManager.instance;
  }
  
  // Register a new context
  registerContext(id: string, element: HTMLElement, plotlyInstance: typeof import('plotly.js')): void {
    // Clean up stale contexts first
    this.cleanupStaleContexts();
    
    // If we're at the limit, remove the oldest context
    if (this.activeContexts.size >= this.MAX_CONTEXTS) {
      const oldest = this.getOldestContext();
      if (oldest) {
        this.removeContext(oldest[0]);
      }
    }
    
    this.activeContexts.set(id, {
      element,
      plotlyInstance,
      createdAt: Date.now(),
    });
  }
  
  // Remove a context
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
  
  // Clean up contexts older than timeout
  private cleanupStaleContexts(): void {
    const staleIds: string[] = [];
    
    this.activeContexts.forEach((context, id) => {
      // Check if element is still in DOM
      if (!document.contains(context.element)) {
        staleIds.push(id);
      }
    });
    
    // Remove stale contexts
    staleIds.forEach(id => this.removeContext(id));
  }
  
  // Get the oldest context
  private getOldestContext(): [string, ReturnType<WebGLContextManager['getContext']>] | undefined {
    let oldest: [string, ReturnType<WebGLContextManager['getContext']>] | undefined;
    let oldestTime = Infinity;
    
    this.activeContexts.forEach((context, id) => {
      if (context.createdAt < oldestTime) {
        oldestTime = context.createdAt;
        oldest = [id, context];
      }
    });
    
    return oldest;
  }
  
  // Clean up all contexts
  async cleanupAll(): Promise<void> {
    const promises = Array.from(this.activeContexts.keys()).map(id => 
      this.removeContext(id)
    );
    await Promise.all(promises);
  }
  
  // Get active context count
  getActiveCount(): number {
    return this.activeContexts.size;
  }
}

export const webGLContextManager = WebGLContextManager.getInstance();

// Helper to generate unique context ID
export function generateContextId(prefix: string = 'plotly'): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}