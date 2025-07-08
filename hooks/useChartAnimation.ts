import { useEffect, useRef } from 'react';
import { PlotlyAnimationFunction } from '@/lib/types/plotly';
import { 
  createAnimationState, 
  shouldUpdateAnimation 
} from '@/lib/utils/plotlyUtils';
import { ANIMATION_CONFIG } from '@/lib/constants/plotlyConfig';

interface UseChartAnimationProps {
  isPlotlyReady: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  plotlyRef: React.RefObject<any>;
  plotRef: React.RefObject<HTMLDivElement | null>;
  hasPlot: boolean;
  updateFunction?: PlotlyAnimationFunction;
  dataRef: React.MutableRefObject<Array<{ x: number; y: number }>>;
}

export function useChartAnimation({
  isPlotlyReady,
  plotlyRef,
  plotRef,
  hasPlot,
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
  const defaultUpdate: PlotlyAnimationFunction = (data, frame) => {
    const { DEFAULT_FREQUENCY, DEFAULT_AMPLITUDE, DEFAULT_SPEED } = ANIMATION_CONFIG;
    
    return data.map((point, i) => ({
      x: point.x,
      y: Math.sin(2 * Math.PI * i * DEFAULT_FREQUENCY + frame * DEFAULT_SPEED) * DEFAULT_AMPLITUDE,
    }));
  };

  // Animation loop
  useEffect(() => {
    if (!plotlyRef.current || !isPlotlyReady || !plotRef.current) return;

    const animate = (currentTime: number) => {
      const state = animationStateRef.current;
      
      if (shouldUpdateAnimation(state, currentTime, ANIMATION_CONFIG.TARGET_FPS)) {
        state.isUpdating = true;
        state.lastUpdateTime = currentTime;
        frameRef.current++;
        
        try {
          if (plotlyRef.current && plotRef.current && dataRef.current && hasPlot) {
            // Update data
            if (updateFunctionRef.current) {
              dataRef.current = updateFunctionRef.current(dataRef.current, frameRef.current);
            } else {
              dataRef.current = defaultUpdate(dataRef.current, frameRef.current);
            }
            
            // Update plot more efficiently using restyle
            const update = {
              x: [dataRef.current.map(d => d.x)],
              y: [dataRef.current.map(d => d.y)],
            };
            
            plotlyRef.current.restyle(plotRef.current, update, [0]);
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
  }, [isPlotlyReady, plotlyRef, plotRef, hasPlot, dataRef]);

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