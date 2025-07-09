import { useEffect, useRef } from 'react';
import { ChartAnimationFunction } from '@/lib/types/chart';
import { 
  createAnimationState, 
  shouldUpdateAnimation 
} from '@/lib/utils/animationUtils';
import { ANIMATION_CONFIG } from '@/lib/constants/uplotConfig';
import uPlot from 'uplot';

interface UseChartAnimationProps {
  isChartReady: boolean;
  chartRef: React.RefObject<uPlot | null>;
  hasChart: boolean;
  updateFunction?: ChartAnimationFunction;
  dataRef: React.MutableRefObject<Array<{ x: number; y: number }>>;
}

export function useChartAnimation({
  isChartReady,
  chartRef,
  hasChart,
  updateFunction,
  dataRef,
}: UseChartAnimationProps) {
  const animationRef = useRef<number | undefined>(undefined);
  const frameRef = useRef(0);
  const updateFunctionRef = useRef(updateFunction);
  const animationStateRef = useRef(createAnimationState());

  // Update the ref whenever updateFunction changes
  useEffect(() => {
    updateFunctionRef.current = updateFunction;
  }, [updateFunction]);

  // Default update function if none provided
  const defaultUpdate: ChartAnimationFunction = (data, frame) => {
    const { DEFAULT_FREQUENCY, DEFAULT_AMPLITUDE, DEFAULT_SPEED } = ANIMATION_CONFIG;
    
    return data.map((point, i) => ({
      x: point.x,
      y: Math.sin(2 * Math.PI * i * DEFAULT_FREQUENCY + frame * DEFAULT_SPEED) * DEFAULT_AMPLITUDE,
    }));
  };

  // Animation loop
  useEffect(() => {
    if (!chartRef.current || !isChartReady) return;

    const animate = (currentTime: number) => {
      const state = animationStateRef.current;
      
      if (shouldUpdateAnimation(state, currentTime, ANIMATION_CONFIG.TARGET_FPS)) {
        state.isUpdating = true;
        state.lastUpdateTime = currentTime;
        frameRef.current++;
        
        try {
          if (chartRef.current && dataRef.current && hasChart) {
            // Update data
            if (updateFunctionRef.current) {
              dataRef.current = updateFunctionRef.current(dataRef.current, frameRef.current);
            } else {
              dataRef.current = defaultUpdate(dataRef.current, frameRef.current);
            }
            
            // Update uPlot chart data
            const newData: uPlot.AlignedData = [
              dataRef.current.map(d => d.x),
              dataRef.current.map(d => d.y),
            ];
            
            chartRef.current.setData(newData, false);
          }
        } catch (error) {
          console.error('Error updating plot:', error);
          // Stop animation on error
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = undefined;
          }
          return;
        } finally {
          state.isUpdating = false;
        }
      }
      
      animationRef.current = requestAnimationFrame(animate);
    };

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }
    
    // Only start animation if updateFunction is provided
    if (updateFunctionRef.current) {
      animationRef.current = requestAnimationFrame(animate);
    }

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, [isChartReady, chartRef, hasChart, dataRef]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = undefined;
      }
    };
  }, []);
}