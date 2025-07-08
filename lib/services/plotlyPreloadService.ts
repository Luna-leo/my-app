import type { PlotlyModule } from 'plotly.js-gl2d-dist';

class PlotlyPreloadService {
  private static instance: PlotlyPreloadService;
  private plotlyModule: typeof import('plotly.js-gl2d-dist') | null = null;
  private loadingPromise: Promise<typeof import('plotly.js-gl2d-dist')> | null = null;
  private isPreloaded = false;

  private constructor() {}

  static getInstance(): PlotlyPreloadService {
    if (!PlotlyPreloadService.instance) {
      PlotlyPreloadService.instance = new PlotlyPreloadService();
    }
    return PlotlyPreloadService.instance;
  }

  /**
   * Preload Plotly module at application startup
   */
  async preload(): Promise<void> {
    if (this.isPreloaded || this.loadingPromise) {
      return;
    }

    console.log('[PlotlyPreload] Starting preload...');
    const startTime = performance.now();

    this.loadingPromise = import('plotly.js-gl2d-dist');
    
    try {
      this.plotlyModule = await this.loadingPromise;
      this.isPreloaded = true;
      const loadTime = performance.now() - startTime;
      console.log(`[PlotlyPreload] Module preloaded in ${loadTime.toFixed(2)}ms`);
    } catch (error) {
      console.error('[PlotlyPreload] Failed to preload module:', error);
      this.loadingPromise = null;
      throw error;
    }
  }

  /**
   * Get the preloaded Plotly module
   * If not preloaded, it will load on demand
   */
  async getPlotly(): Promise<typeof import('plotly.js-gl2d-dist')> {
    if (this.plotlyModule) {
      return this.plotlyModule;
    }

    if (this.loadingPromise) {
      return await this.loadingPromise;
    }

    // Load on demand if not preloaded
    console.log('[PlotlyPreload] Loading on demand...');
    const startTime = performance.now();
    
    this.loadingPromise = import('plotly.js-gl2d-dist');
    
    try {
      this.plotlyModule = await this.loadingPromise;
      this.isPreloaded = true;
      const loadTime = performance.now() - startTime;
      console.log(`[PlotlyPreload] Module loaded on demand in ${loadTime.toFixed(2)}ms`);
      return this.plotlyModule;
    } catch (error) {
      console.error('[PlotlyPreload] Failed to load module:', error);
      this.loadingPromise = null;
      throw error;
    }
  }

  /**
   * Check if Plotly is already loaded
   */
  isLoaded(): boolean {
    return this.isPreloaded && this.plotlyModule !== null;
  }

  /**
   * Reset the service (mainly for testing)
   */
  reset(): void {
    this.plotlyModule = null;
    this.loadingPromise = null;
    this.isPreloaded = false;
  }
}

export const plotlyPreloadService = PlotlyPreloadService.getInstance();