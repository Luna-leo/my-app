import { useEffect, useRef, useState, useCallback } from 'react';
import { PlotlyChartState } from '@/lib/types/plotly';
import { CHART_DEFAULTS } from '@/lib/constants/plotlyConfig';
import { webGLContextManager, generateContextId } from '@/lib/utils/webglContextManager';

export function usePlotlyInit() {
  const plotlyRef = useRef<typeof import('plotly.js-gl2d-dist')>(null);
  const hasPlotRef = useRef(false);
  const contextIdRef = useRef<string | null>(null);
  const [chartState, setChartState] = useState<PlotlyChartState>({
    isPlotlyReady: false,
    hasPlot: false,
  });

  const initPlotly = useCallback(async (
    plotElement: HTMLElement | null,
    onSuccess?: () => void,
    onError?: (error: Error) => void
  ): Promise<boolean> => {
    if (!plotElement || !(plotElement instanceof HTMLElement)) {
      console.error('Plot element is not an HTML element');
      return false;
    }

    try {
      // Generate context ID if not exists
      if (!contextIdRef.current) {
        contextIdRef.current = generateContextId();
      }
      
      // Wait a bit to ensure DOM is ready
      await new Promise(resolve => setTimeout(resolve, CHART_DEFAULTS.INIT_DELAY_MS));

      // Load Plotly module if not already loaded
      if (!plotlyRef.current) {
        const Plotly = await import('plotly.js-gl2d-dist');
        plotlyRef.current = Plotly;
      }

      setChartState(prev => ({ ...prev, isPlotlyReady: true }));
      onSuccess?.();
      return true;
    } catch (err) {
      console.error('Failed to initialize Plotly:', err);
      const error = err instanceof Error ? err : new Error('Failed to initialize Plotly');
      setChartState(prev => ({ ...prev, error: error.message }));
      onError?.(error);
      return false;
    }
  }, []);

  const cleanup = useCallback(async (plotElement: HTMLElement | null) => {
    // Clean up via context manager
    if (contextIdRef.current) {
      await webGLContextManager.removeContext(contextIdRef.current);
      contextIdRef.current = null;
    }
    
    hasPlotRef.current = false;
    setChartState(prev => ({ ...prev, hasPlot: false }));
  }, []);

  // Register/update context when plot is created
  const registerPlot = useCallback((plotElement: HTMLElement) => {
    if (contextIdRef.current && plotlyRef.current) {
      webGLContextManager.registerContext(contextIdRef.current, plotElement, plotlyRef.current);
    }
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clean up context
      if (contextIdRef.current) {
        webGLContextManager.removeContext(contextIdRef.current);
      }
      // Reset state
      hasPlotRef.current = false;
      setChartState({
        isPlotlyReady: false,
        hasPlot: false,
      });
    };
  }, []);

  return {
    plotlyRef,
    hasPlotRef,
    chartState,
    setChartState,
    initPlotly,
    cleanup,
    registerPlot,
  };
}