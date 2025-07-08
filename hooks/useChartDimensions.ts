import { useCallback, useEffect, useRef, useState } from 'react';

interface ChartDimensions {
  width: number;
  height: number;
  isReady: boolean;
}

interface UseChartDimensionsOptions {
  aspectRatio?: number | 'auto';
  padding?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  debounceMs?: number;
}

export function useChartDimensions(
  containerRef: React.RefObject<HTMLElement>,
  options: UseChartDimensionsOptions = {}
): ChartDimensions {
  const {
    aspectRatio = 1.3,
    padding = { top: 0, right: 0, bottom: 0, left: 0 },
    debounceMs = 150,
  } = options;

  const [dimensions, setDimensions] = useState<ChartDimensions>({
    width: 0,
    height: 0,
    isReady: false,
  });

  const timeoutRef = useRef<NodeJS.Timeout>();

  const calculateDimensions = useCallback(() => {
    if (!containerRef.current) return;

    const computedStyle = window.getComputedStyle(containerRef.current);
    const containerPaddingLeft = parseFloat(computedStyle.paddingLeft) || 0;
    const containerPaddingRight = parseFloat(computedStyle.paddingRight) || 0;
    const containerPaddingTop = parseFloat(computedStyle.paddingTop) || 0;
    const containerPaddingBottom = parseFloat(computedStyle.paddingBottom) || 0;

    const totalHorizontalPadding = containerPaddingLeft + containerPaddingRight + (padding.left || 0) + (padding.right || 0);
    const totalVerticalPadding = containerPaddingTop + containerPaddingBottom + (padding.top || 0) + (padding.bottom || 0);

    const availableWidth = Math.max(0, containerRef.current.clientWidth - totalHorizontalPadding);
    
    let availableHeight: number;
    if (aspectRatio === 'auto') {
      availableHeight = Math.max(0, containerRef.current.clientHeight - totalVerticalPadding);
    } else {
      availableHeight = Math.max(0, availableWidth / aspectRatio);
    }

    return {
      width: availableWidth,
      height: availableHeight,
      isReady: availableWidth > 0 && availableHeight > 0,
    };
  }, [containerRef, aspectRatio, padding]);

  const updateDimensions = useCallback(() => {
    const newDimensions = calculateDimensions();
    if (newDimensions && (newDimensions.width !== dimensions.width || newDimensions.height !== dimensions.height)) {
      setDimensions(newDimensions);
    }
  }, [calculateDimensions, dimensions.width, dimensions.height]);

  const debouncedUpdateDimensions = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(updateDimensions, debounceMs);
  }, [updateDimensions, debounceMs]);

  useEffect(() => {
    if (!containerRef.current) return;

    // Initial calculation
    updateDimensions();

    const resizeObserver = new ResizeObserver(() => {
      debouncedUpdateDimensions();
    });

    resizeObserver.observe(containerRef.current);

    // Also listen to window resize as a fallback
    const handleWindowResize = () => debouncedUpdateDimensions();
    window.addEventListener('resize', handleWindowResize);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleWindowResize);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [containerRef, debouncedUpdateDimensions, updateDimensions]);

  return dimensions;
}

// Preset aspect ratios
export const ASPECT_RATIOS = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '3:2': 3 / 2,
  '1:1': 1,
  '2:3': 2 / 3,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
  'golden': 1.618,
  'widescreen': 2.35,
  'auto': 'auto' as const,
} as const;

export type AspectRatioPreset = keyof typeof ASPECT_RATIOS;