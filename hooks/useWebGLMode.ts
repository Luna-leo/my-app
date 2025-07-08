import { useState, useEffect, useRef, useCallback } from 'react';
import { webGLContextManager } from '@/lib/utils/webglContextManager';

interface UseWebGLModeOptions {
  chartId: string;
  idleTimeout?: number; // milliseconds
  autoUpgrade?: boolean; // upgrade when in viewport
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
  } = options;

  const [state, setState] = useState<WebGLModeState>({
    isWebGLMode: false,
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

    // Try to upgrade to WebGL if not already
    if (!state.isWebGLMode) {
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
    } else {
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
  }, [chartId, idleTimeout, state.isWebGLMode]);

  // Set up intersection observer for viewport detection
  useEffect(() => {
    if (!autoUpgrade || !elementRef.current) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        entries.forEach(entry => {
          const isInViewport = entry.isIntersecting;
          setState(prev => ({ ...prev, isInViewport }));

          // Auto-upgrade if in viewport and WebGL available
          if (isInViewport && !state.isWebGLMode && autoUpgrade) {
            const canUpgrade = webGLContextManager.canAddContext();
            if (canUpgrade) {
              setState(prev => ({ ...prev, isWebGLMode: true }));
            }
          }
        });
      },
      {
        threshold: 0.1, // 10% visibility
        rootMargin: '50px', // Pre-load slightly before entering viewport
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
  }, [autoUpgrade, chartId, state.isWebGLMode]);

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