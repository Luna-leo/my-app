import { useEffect, useRef, useState, useCallback } from 'react';
import { PlotlyChartState } from '@/lib/types/plotly';
import { CHART_DEFAULTS } from '@/lib/constants/plotlyConfig';
// Removed webGLContextManager import - it will be used at the chart level instead

export function usePlotlyInit() {
  const plotlyRef = useRef<typeof import('plotly.js-gl2d-dist')>(null);
  const hasPlotRef = useRef(false);
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
    // Clean up Plotly chart if exists
    if (plotlyRef.current && plotElement) {
      try {
        await plotlyRef.current.purge(plotElement);
      } catch (error) {
        console.warn('Failed to purge Plotly chart:', error);
      }
    }
    
    hasPlotRef.current = false;
    setChartState(prev => ({ ...prev, hasPlot: false }));
  }, []);

  // Register plot creation
  const registerPlot = useCallback((plotElement: HTMLElement) => {
    // Just mark that we have a plot
    hasPlotRef.current = true;
  }, []);
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
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