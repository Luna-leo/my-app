'use client'

import { useEffect, useRef } from 'react'
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

export function PlotlyChartRefactored({
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
  
  const { plotlyRef, hasPlotRef, chartState, initPlotly, cleanup } = usePlotlyInit()
  
  // Use animation hook
  useChartAnimation({
    isPlotlyReady: chartState.isPlotlyReady,
    plotlyRef,
    plotRef,
    hasPlot: hasPlotRef.current,
    updateFunction,
    dataRef,
  })
  
  // Initialize Plotly
  useEffect(() => {
    if (!dimensions.isReady) return
    
    let disposed = false
    
    const createChart = async () => {
      if (disposed) return
      
      const success = await initPlotly(plotRef.current)
      if (!success || !plotlyRef.current || !plotRef.current) return
      
      // Initialize data
      const initializeData = () => {
        if (dataRef.current.length === 0) {
          const numPoints = Math.min(ANIMATION_CONFIG.INITIAL_POINTS, Math.round(dimensions.width))
          const freq = ANIMATION_CONFIG.DEFAULT_FREQUENCY
          const amp = ANIMATION_CONFIG.DEFAULT_AMPLITUDE
          
          for (let i = 0; i < numPoints; i++) {
            const x = i / numPoints * 2 - 1 // Normalize to -1 to 1 range
            const y = Math.sin(2 * Math.PI * i * freq) * amp
            dataRef.current.push({ x, y })
          }
        }
      }
      
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
      
      // Create config - spread to make mutable
      const config = { ...PLOTLY_MODEBAR_CONFIG.DEFAULT }
      
      // Create plot
      const plotCreated = await tryCreatePlotlyChart(
        plotRef.current,
        [trace],
        layout,
        config,
        plotlyRef.current
      )
      
      if (plotCreated) {
        hasPlotRef.current = true
      }
    }
    
    createChart()
    
    return () => {
      disposed = true
    }
  }, [dimensions, lineColor, initPlotly, plotlyRef, hasPlotRef])
  
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