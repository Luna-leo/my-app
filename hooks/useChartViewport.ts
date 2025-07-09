import { useState, useCallback, useRef } from 'react';
import { SelectionRange } from '@/lib/utils/uplotSelectionPlugin';

export interface ChartViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface UseChartViewportOptions {
  initialViewport?: ChartViewport;
  onViewportChange?: (viewport: ChartViewport) => void;
  animationDuration?: number;
}

export interface ChartViewportActions {
  setViewport: (viewport: ChartViewport) => void;
  zoomToSelection: (selection: SelectionRange) => void;
  resetViewport: () => void;
  animateToViewport: (viewport: ChartViewport) => void;
}

export function useChartViewport(
  options: UseChartViewportOptions = {}
): [ChartViewport | null, ChartViewportActions] {
  const {
    initialViewport,
    onViewportChange,
    animationDuration = 300,
  } = options;

  const [viewport, setViewportInternal] = useState<ChartViewport | null>(initialViewport || null);
  const animationRef = useRef<number | null>(null);
  const startViewportRef = useRef<ChartViewport | null>(null);
  const targetViewportRef = useRef<ChartViewport | null>(null);

  // Set viewport with callback
  const setViewport = useCallback((newViewport: ChartViewport) => {
    setViewportInternal(newViewport);
    if (onViewportChange) {
      onViewportChange(newViewport);
    }
  }, [onViewportChange]);

  // Zoom to selection range
  const zoomToSelection = useCallback((selection: SelectionRange) => {
    // Add some padding around the selection
    const xPadding = (selection.xMax - selection.xMin) * 0.1;
    const yPadding = (selection.yMax - selection.yMin) * 0.1;

    const newViewport: ChartViewport = {
      xMin: selection.xMin - xPadding,
      xMax: selection.xMax + xPadding,
      yMin: selection.yMin - yPadding,
      yMax: selection.yMax + yPadding,
    };

    if (animationDuration > 0) {
      animateToViewport(newViewport);
    } else {
      setViewport(newViewport);
    }
  }, [animationDuration]);

  // Reset to initial viewport
  const resetViewport = useCallback(() => {
    if (initialViewport) {
      if (animationDuration > 0) {
        animateToViewport(initialViewport);
      } else {
        setViewport(initialViewport);
      }
    }
  }, [initialViewport, animationDuration]);

  // Animate to viewport
  const animateToViewport = useCallback((targetViewport: ChartViewport) => {
    if (!viewport) {
      setViewport(targetViewport);
      return;
    }

    // Cancel any existing animation
    if (animationRef.current !== null) {
      cancelAnimationFrame(animationRef.current);
    }

    startViewportRef.current = { ...viewport };
    targetViewportRef.current = targetViewport;
    const startTime = performance.now();

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / animationDuration, 1);
      
      // Use easing function for smooth animation
      const easeProgress = easeInOutCubic(progress);

      if (startViewportRef.current && targetViewportRef.current) {
        const animatedViewport: ChartViewport = {
          xMin: lerp(startViewportRef.current.xMin, targetViewportRef.current.xMin, easeProgress),
          xMax: lerp(startViewportRef.current.xMax, targetViewportRef.current.xMax, easeProgress),
          yMin: lerp(startViewportRef.current.yMin, targetViewportRef.current.yMin, easeProgress),
          yMax: lerp(startViewportRef.current.yMax, targetViewportRef.current.yMax, easeProgress),
        };

        setViewport(animatedViewport);

        if (progress < 1) {
          animationRef.current = requestAnimationFrame(animate);
        } else {
          animationRef.current = null;
          startViewportRef.current = null;
          targetViewportRef.current = null;
        }
      }
    };

    animationRef.current = requestAnimationFrame(animate);
  }, [viewport, animationDuration, setViewport]);

  const actions: ChartViewportActions = {
    setViewport,
    zoomToSelection,
    resetViewport,
    animateToViewport,
  };

  return [viewport, actions];
}

// Linear interpolation
function lerp(start: number, end: number, progress: number): number {
  return start + (end - start) * progress;
}

// Easing function for smooth animation
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}