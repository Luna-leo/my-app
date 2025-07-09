import { useState, useEffect, useRef, useCallback } from 'react';
import { webGLContextManager } from '@/lib/utils/webglContextManager';

interface UseWebGLModeOptions {
  chartId: string;
  idleTimeout?: number; // milliseconds
  autoUpgrade?: boolean; // upgrade when in viewport
  dataPoints?: number; // number of data points in the chart
}

interface WebGLModeState {
  isWebGLMode: boolean;
  isInViewport: boolean;
  lastInteraction: number;
}

export function useWebGLMode(options: UseWebGLModeOptions) {
  const {
    chartId,
    idleTimeout = 30000, // 30 seconds default
    autoUpgrade = true,
    dataPoints = 0,
  } = options;

  const [state, setState] = useState<WebGLModeState>({
    isWebGLMode: true, // Start with WebGL enabled
    isInViewport: false,
    lastInteraction: 0,
  });

  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const elementRef = useRef<HTMLElement | null>(null);

  // Handle interaction (click, hover, etc.)
  const handleInteraction = useCallback(() => {
    const now = Date.now();
    setState(prev => ({ ...prev, lastInteraction: now }));

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Check if this chart should use WebGL based on data points
    const shouldUseWebGL = webGLContextManager.shouldUseWebGL(dataPoints);
    
    // Try to upgrade to WebGL if not already and if it makes sense
    if (!state.isWebGLMode && shouldUseWebGL) {
      const canUpgrade = webGLContextManager.canAddContext();
      if (canUpgrade) {
        setState(prev => ({ ...prev, isWebGLMode: true }));
      } else {
        // Try to free up a context by evicting LRU
        const evicted = webGLContextManager.evictLRU();
        if (evicted) {
          setState(prev => ({ ...prev, isWebGLMode: true }));
        }
      }
    } else if (state.isWebGLMode) {
      // Update last used time if already registered
      if (webGLContextManager.hasContext(chartId)) {
        webGLContextManager.updateLastUsed(chartId, now);
      }
    }

    // Set timeout to downgrade after idle
    timeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, isWebGLMode: false }));
      // Context will be released by the chart component
    }, idleTimeout);
  }, [chartId, idleTimeout, state.isWebGLMode, dataPoints]);

  // Set up intersection observer for viewport detection
  useEffect(() => {
    if (!autoUpgrade || !elementRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const isInViewport = entry.isIntersecting;
          setState(prev => ({ ...prev, isInViewport }));

          // Auto-upgrade if in viewport, WebGL available, and data size warrants it
          if (isInViewport && !state.isWebGLMode && autoUpgrade) {
            const shouldUseWebGL = webGLContextManager.shouldUseWebGL(dataPoints);
            if (shouldUseWebGL && webGLContextManager.canAddContext()) {
              setState(prev => ({ ...prev, isWebGLMode: true }));
            }
          }
        });
      },
      {
        threshold: [0, 0.25, 0.5, 0.75, 1.0], // Multiple thresholds for better tracking
        rootMargin: '100px', // Pre-load 100px before entering viewport
      }
    );

    if (elementRef.current) {
      observerRef.current.observe(elementRef.current);
    }

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, [autoUpgrade, chartId, state.isWebGLMode, dataPoints]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      // Context cleanup is handled by the chart component
    };
  }, []);

  // Listen for context eviction
  useEffect(() => {
    const handleEviction = (evictedId: string) => {
      if (evictedId === chartId) {
        console.log(`[useWebGLMode] Chart ${chartId} was evicted, switching to non-WebGL mode`);
        setState(prev => ({ ...prev, isWebGLMode: false }));
      }
    };

    webGLContextManager.on('evict', handleEviction);
    return () => {
      webGLContextManager.off('evict', handleEviction);
    };
  }, [chartId]);

  return {
    isWebGLMode: state.isWebGLMode,
    isInViewport: state.isInViewport,
    handleInteraction,
    setElementRef: (el: HTMLElement | null) => {
      elementRef.current = el;
    },
  };
}