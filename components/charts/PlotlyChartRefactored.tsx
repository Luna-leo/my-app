'use client'

import { useEffect, useRef, memo, useCallback } from 'react'
import { useChartDimensions, AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import { usePlotlyInit } from '@/hooks/usePlotlyInit'
import { useChartAnimation } from '@/hooks/useChartAnimation'
import { PlotlyAnimationFunction } from '@/lib/types/plotly'
import { RGBAColor } from '@/lib/utils/plotlyUtils'
import {
  rgbaToCSS,
  buildPlotlyLayout,
  buildScatterTrace,
  tryCreatePlotlyChart,
  resizePlotlyChart,
  updatePlotlyData,
  hasExistingPlot,
  isElementReady,
  PLOTLY_MODEBAR_CONFIG,
} from '@/lib/utils/plotlyUtils'
import { 
  CHART_DEFAULTS, 
  ANIMATION_CONFIG,
  AXIS_RANGES,
} from '@/lib/constants/plotlyConfig'

interface PlotlyChartProps {
  aspectRatio?: number | AspectRatioPreset
  lineColor?: RGBAColor
  updateFunction?: PlotlyAnimationFunction
  className?: string
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
}

function PlotlyChartRefactoredComponent({
  aspectRatio = CHART_DEFAULTS.ASPECT_RATIO,
  lineColor = CHART_DEFAULTS.LINE_COLOR,
  updateFunction,
  className = '',
  padding
}: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const dataRef = useRef<Array<{x: number, y: number}>>([])
  
  // Convert aspect ratio preset to number if needed
  const numericAspectRatio = typeof aspectRatio === 'string' 
    ? ASPECT_RATIOS[aspectRatio] 
    : aspectRatio
  
  // Use hooks
  const dimensions = useChartDimensions(containerRef, {
    aspectRatio: numericAspectRatio,
    padding,
    debounceMs: CHART_DEFAULTS.DEBOUNCE_MS
  })
  
  const { plotlyRef, hasPlotRef, chartState, initPlotly, cleanup, registerPlot } = usePlotlyInit()
  const isInitializedRef = useRef(false)
  
  // Use animation hook
  useChartAnimation({
    isPlotlyReady: chartState.isPlotlyReady,
    plotlyRef,
    plotRef,
    hasPlot: hasPlotRef.current,
    updateFunction,
    dataRef,
  })
  
  // Initialize data only once
  const initializeData = useCallback(() => {
    if (dataRef.current.length === 0) {
      const numPoints = ANIMATION_CONFIG.INITIAL_POINTS
      const freq = ANIMATION_CONFIG.DEFAULT_FREQUENCY
      const amp = ANIMATION_CONFIG.DEFAULT_AMPLITUDE
      
      for (let i = 0; i < numPoints; i++) {
        const x = i / numPoints * 2 - 1 // Normalize to -1 to 1 range
        const y = Math.sin(2 * Math.PI * i * freq) * amp
        dataRef.current.push({ x, y })
      }
    }
  }, [])
  
  // Create or update chart
  useEffect(() => {
    if (!dimensions.isReady || !plotRef.current) return
    
    let disposed = false
    
    const setupChart = async () => {
      if (disposed) return
      
      // Validate element is ready
      if (!isElementReady(plotRef.current)) {
        // Retry after a short delay
        setTimeout(() => {
          if (!disposed) setupChart()
        }, 100)
        return
      }
      
      // Initialize Plotly if needed
      if (!chartState.isPlotlyReady) {
        const success = await initPlotly(plotRef.current)
        if (!success || !plotlyRef.current) return
      }
      
      // Initialize data
      initializeData()
      
      // Create trace
      const trace = buildScatterTrace({
        x: dataRef.current.map(d => d.x),
        y: dataRef.current.map(d => d.y),
        name: 'Line',
        color: rgbaToCSS(lineColor),
        mode: 'lines',
      })
      
      // Create layout
      const layout = buildPlotlyLayout({
        width: dimensions.width,
        height: dimensions.height,
        xRange: AXIS_RANGES.DEFAULT_X,
        yRange: AXIS_RANGES.DEFAULT_Y,
      })
      
      // Get current plot element
      const currentPlotElement = plotRef.current
      if (!currentPlotElement) return
      
      // Check if plot already exists
      if (hasExistingPlot(currentPlotElement) && plotlyRef.current) {
        // Update existing plot
        const updated = await updatePlotlyData(
          plotlyRef.current,
          currentPlotElement,
          [trace],
          layout
        )
        if (!updated) {
          // Fallback to creating new plot
          const config = { ...PLOTLY_MODEBAR_CONFIG.DEFAULT }
          const plotCreated = await tryCreatePlotlyChart(
            currentPlotElement,
            [trace],
            layout,
            config,
            plotlyRef.current
          )
          if (plotCreated) {
            hasPlotRef.current = true
            registerPlot(currentPlotElement)
          }
        }
      } else if (plotlyRef.current && !isInitializedRef.current) {
        // Create new plot
        const config = { ...PLOTLY_MODEBAR_CONFIG.DEFAULT }
        const plotCreated = await tryCreatePlotlyChart(
          currentPlotElement,
          [trace],
          layout,
          config,
          plotlyRef.current
        )
        if (plotCreated) {
          hasPlotRef.current = true
          isInitializedRef.current = true
          registerPlot(currentPlotElement)
        }
      }
    }
    
    setupChart()
    
    return () => {
      disposed = true
    }
  }, [dimensions, lineColor, chartState.isPlotlyReady, initPlotly, initializeData, registerPlot, plotlyRef, hasPlotRef])
  
  // Handle resize
  useEffect(() => {
    if (plotlyRef.current && dimensions.isReady && hasPlotRef.current) {
      resizePlotlyChart(
        plotlyRef.current,
        plotRef.current,
        dimensions.width,
        dimensions.height
      )
    }
  }, [dimensions, plotlyRef, hasPlotRef])
  
  // Cleanup on unmount
  useEffect(() => {
    const plot = plotRef.current
    
    return () => {
      cleanup(plot)
    }
  }, [cleanup])
  
  return (
    <div 
      ref={containerRef} 
      className={`w-full ${className}`}
      style={{ 
        height: dimensions.isReady ? dimensions.height : 'auto', 
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div
        ref={plotRef}
        className="border border-border rounded-lg [&_.modebar]:!z-[1000] [&_.modebar-container]:!absolute [&_.modebar-container]:!top-1 [&_.modebar-container]:!right-1"
        style={{ 
          width: dimensions.width || '100%', 
          height: dimensions.height || '100%', 
          boxSizing: 'border-box',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
    </div>
  )
}

// Memoize component to prevent unnecessary re-renders
export const PlotlyChartRefactored = memo(PlotlyChartRefactoredComponent, (prevProps, nextProps) => {
  // Custom comparison function
  return (
    prevProps.aspectRatio === nextProps.aspectRatio &&
    prevProps.className === nextProps.className &&
    prevProps.updateFunction === nextProps.updateFunction &&
    JSON.stringify(prevProps.lineColor) === JSON.stringify(nextProps.lineColor) &&
    JSON.stringify(prevProps.padding) === JSON.stringify(nextProps.padding)
  )
})