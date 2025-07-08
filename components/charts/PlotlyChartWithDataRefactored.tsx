'use client'

import { useEffect, useRef, memo, useCallback, useState } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useChartDimensions, AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import { useChartData } from '@/hooks/useChartData'
import { usePlotlyInit } from '@/hooks/usePlotlyInit'
import { useWebGLMode } from '@/hooks/useWebGLMode'
import { generateLineColors } from '@/lib/utils/chartDataUtils'
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
  PLOTLY_MARGINS,
} from '@/lib/utils/plotlyUtils'
import { webGLContextManager } from '@/lib/utils/webglContextManager'
import { HOVER_TEMPLATES, CHART_DEFAULTS, ERROR_MESSAGES } from '@/lib/constants/plotlyConfig'
import { ChartLoadingState, ChartErrorState, ChartEmptyState } from './ChartStates'
import { ChartContainer } from './ChartContainer'

interface PlotlyChartWithDataProps {
  config: ChartConfiguration
  aspectRatio?: number | AspectRatioPreset
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
}

function PlotlyChartWithDataRefactoredComponent({
  config,
  aspectRatio = CHART_DEFAULTS.ASPECT_RATIO,
  className = '',
  onEdit,
  onDuplicate,
  onDelete,
  padding
}: PlotlyChartWithDataProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  
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
  
  const { plotData, dataViewport, loadingState } = useChartData(config)
  const { plotlyRef, hasPlotRef, chartState, initPlotly, cleanup, registerPlot } = usePlotlyInit()
  const isInitializedRef = useRef(false)
  const lastDataRef = useRef<string>('')
  const lastConfigRef = useRef<string>('')
  const chartIdRef = useRef(`chart-${Date.now()}-${Math.random()}`) // Unique ID for this chart
  
  // Use WebGL mode hook - start with WebGL disabled
  const { isWebGLMode, handleInteraction, setElementRef } = useWebGLMode({
    chartId: chartIdRef.current, // Use unique ID instead of title
    idleTimeout: 30000, // 30 seconds
    autoUpgrade: false, // Disable auto-upgrade to prevent conflicts
  })
  
  // Always start with non-WebGL to avoid context issues
  const [hasInteracted, setHasInteracted] = useState(false)
  const forceNonWebGL = !hasInteracted || !isWebGLMode
  
  // Build traces from plot data
  const buildTraces = useCallback(() => {
    if (!plotData) return []
    
    const colors = generateLineColors(plotData.series.length)
    
    const traces = plotData.series.map((series, index) => {
      // Filter out NaN values
      const validIndices: number[] = []
      for (let i = 0; i < series.yValues.length; i++) {
        if (!isNaN(series.yValues[i]) && !isNaN(series.xValues[i])) {
          validIndices.push(i)
        }
      }
      
      // Skip if no valid data
      if (validIndices.length === 0) {
        return null
      }
      
      const xData = validIndices.map(i => series.xValues[i])
      const yData = validIndices.map(i => series.yValues[i])
      
      const cssColor = rgbaToCSS(colors[index])
      
      // Build hover template
      const hovertemplate = config.xAxisParameter === 'timestamp'
        ? HOVER_TEMPLATES.TIME_SERIES(
            series.parameterInfo.parameterName,
            series.parameterInfo.unit || ''
          )
        : HOVER_TEMPLATES.XY_CHART(
            series.parameterInfo.parameterName,
            series.parameterInfo.unit || '',
            plotData.xParameterInfo?.parameterName || 'X',
            plotData.xParameterInfo?.unit || ''
          )
      
      return buildScatterTrace({
        x: xData,
        y: yData,
        name: `${series.metadataLabel} - ${series.parameterInfo.parameterName}`,
        color: cssColor,
        mode: config.chartType === 'scatter' ? 'markers' : 'lines',
        hovertemplate,
        lineWidth: CHART_DEFAULTS.LINE_WIDTH,
        markerSize: CHART_DEFAULTS.MARKER_SIZE,
        forceNonWebGL: forceNonWebGL, // Use non-WebGL by default
      })
    })
    
    // Filter out null traces
    return traces.filter(trace => trace !== null)
  }, [plotData, config.xAxisParameter, config.chartType, isWebGLMode, forceNonWebGL])
  
  // Initialize or update Plotly chart
  useEffect(() => {
    if (!plotData || !dataViewport || !dimensions.isReady || !plotRef.current) return
    
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
      
      // Additional validation for plot element
      const rect = plotRef.current.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) {
        console.warn('[PlotlyChartWithData] Plot element has no size, retrying...')
        setTimeout(() => {
          if (!disposed) setupChart()
        }, 100)
        return
      }
      
      // Check if data or config has actually changed
      const dataKey = JSON.stringify({ plotData, dataViewport })
      const configKey = JSON.stringify({
        xAxisParameter: config.xAxisParameter,
        yAxisParameters: config.yAxisParameters,
        selectedDataIds: config.selectedDataIds,
        chartType: config.chartType
      })
      
      // If config changed, force re-initialization
      if (configKey !== lastConfigRef.current) {
        lastConfigRef.current = configKey
        isInitializedRef.current = false
        hasPlotRef.current = false // Reset hasPlot flag
        
        // Clean up existing plot when config changes
        if (plotRef.current) {
          await cleanup(plotRef.current)
        }
      } else if (dataKey === lastDataRef.current && isInitializedRef.current) {
        return // No change, skip update
      }
      lastDataRef.current = dataKey
      
      // Initialize Plotly if needed
      if (!chartState.isPlotlyReady) {
        const success = await initPlotly(plotRef.current)
        if (!success || !plotlyRef.current) return
      }
      
      // Build traces
      const traces = buildTraces()
      
      // Check if we have valid data to plot
      const hasValidData = traces.some(trace => trace.x && trace.y && trace.x.length > 0 && trace.y.length > 0)
      if (!hasValidData || traces.length === 0) {
        console.warn('[PlotlyChartWithData] No valid data to plot, skipping chart creation')
        return
      }
      
      // Filter out any traces without data
      const validTraces = traces.filter(trace => trace.x && trace.y && trace.x.length > 0 && trace.y.length > 0)
      if (validTraces.length === 0) {
        console.warn('[PlotlyChartWithData] No valid traces after filtering')
        return
      }
      
      // Create layout
      const layout = buildPlotlyLayout({
        width: dimensions.width,
        height: dimensions.height,
        xAxisTitle: plotData.xParameterInfo 
          ? `${plotData.xParameterInfo.parameterName} [${plotData.xParameterInfo.unit || ''}]`
          : 'Time',
        yAxisTitle: plotData.series.length === 1
          ? `${plotData.series[0].parameterInfo.parameterName} [${plotData.series[0].parameterInfo.unit || ''}]`
          : 'Value',
        xRange: [dataViewport.xMin, dataViewport.xMax],
        yRange: [dataViewport.yMin, dataViewport.yMax],
        showLegend: true,
        margins: PLOTLY_MARGINS.WITH_LEGEND,
        xAxisType: config.xAxisParameter === 'timestamp' ? 'date' : 'linear',
      })
      
      // Get current plot element
      const currentPlotElement = plotRef.current
      if (!currentPlotElement) return
      
      // Check if plot already exists
      if (hasExistingPlot(currentPlotElement) && plotlyRef.current && hasPlotRef.current) {
        // Update existing plot
        const updated = await updatePlotlyData(
          plotlyRef.current,
          currentPlotElement,
          validTraces,
          layout
        )
        if (!updated) {
          // Fallback to creating new plot
          const plotlyConfig = { 
            ...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS,
            modeBarButtonsToAdd: [...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS.modeBarButtonsToAdd],
            modeBarButtonsToRemove: [...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS.modeBarButtonsToRemove]
          }
          const plotCreated = await tryCreatePlotlyChart(
            currentPlotElement,
            validTraces,
            layout,
            plotlyConfig,
            plotlyRef.current
          )
          if (plotCreated) {
            hasPlotRef.current = true
            registerPlot(currentPlotElement)
          }
        }
      } else if (plotlyRef.current) {
        // Create new plot
        const plotlyConfig = { 
          ...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS,
          modeBarButtonsToAdd: [...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS.modeBarButtonsToAdd],
          modeBarButtonsToRemove: [...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS.modeBarButtonsToRemove]
        }
        const plotCreated = await tryCreatePlotlyChart(
          currentPlotElement,
          validTraces,
          layout,
          plotlyConfig,
          plotlyRef.current
        )
        if (plotCreated) {
          hasPlotRef.current = true
          isInitializedRef.current = true
          registerPlot(currentPlotElement)
        } else {
          throw new Error(ERROR_MESSAGES.PLOT_CREATION_FAILED)
        }
      }
    }
    
    setupChart().catch(err => {
      console.error('Error setting up chart:', err)
    })
    
    return () => {
      disposed = true
    }
  }, [plotData, dataViewport, dimensions.width, dimensions.height, chartState.isPlotlyReady, initPlotly, buildTraces, registerPlot, config, dimensions.isReady, plotlyRef, hasPlotRef, cleanup, isWebGLMode])
  
  // Handle resize
  useEffect(() => {
    if (plotlyRef.current && dimensions.isReady && hasPlotRef.current && plotRef.current && isInitializedRef.current) {
      // Only resize if plot actually exists and is initialized
      if (hasExistingPlot(plotRef.current)) {
        resizePlotlyChart(
          plotlyRef.current,
          plotRef.current,
          dimensions.width,
          dimensions.height
        )
      }
    }
  }, [dimensions, plotlyRef, hasPlotRef])
  
  // Handle WebGL mode changes by forcing re-render
  useEffect(() => {
    if (isInitializedRef.current && hasPlotRef.current) {
      // Force re-initialization when WebGL mode changes
      isInitializedRef.current = false
      hasPlotRef.current = false
    }
  }, [isWebGLMode, hasPlotRef])
  
  // Register WebGL context when in WebGL mode and plot exists
  useEffect(() => {
    const chartId = chartIdRef.current
    
    if (isWebGLMode && !forceNonWebGL && hasPlotRef.current && plotRef.current && plotlyRef.current) {
      // Only register if actually using WebGL
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hasWebGLTraces = (plotRef.current as any).data?.some((trace: any) => trace.type === 'scattergl')
      if (hasWebGLTraces) {
        webGLContextManager.registerContext(
          chartId,
          plotRef.current,
          plotlyRef.current
        )
      }
    }
    
    return () => {
      // Clean up WebGL context on unmount
      webGLContextManager.removeContext(chartId)
    }
  }, [isWebGLMode, hasPlotRef, plotlyRef, forceNonWebGL])
  
  // Set element ref for intersection observer
  useEffect(() => {
    if (containerRef.current) {
      setElementRef(containerRef.current)
    }
  }, [setElementRef])
  
  // Cleanup on unmount
  useEffect(() => {
    const plot = plotRef.current
    
    return () => {
      cleanup(plot)
    }
  }, [cleanup])
  
  // Loading state
  if (loadingState.loading) {
    return (
      <ChartLoadingState
        title={config.title}
        progress={loadingState.progress}
        className={className}
      />
    )
  }
  
  // Error state
  if (loadingState.error || chartState.error) {
    return (
      <ChartErrorState
        title={config.title}
        error={loadingState.error || chartState.error || ERROR_MESSAGES.INIT_FAILED}
        className={className}
      />
    )
  }
  
  // No data state
  if (!plotData || plotData.series.length === 0) {
    return <ChartEmptyState title={config.title} className={className} />
  }
  
  // Calculate total points
  const totalPoints = plotData.series.reduce((acc, s) => acc + s.xValues.length, 0)
  
  return (
    <ChartContainer
      title={config.title}
      chartType={config.chartType}
      seriesCount={plotData.series.length}
      pointCount={totalPoints}
      className={className}
      onEdit={onEdit}
      onDuplicate={onDuplicate}
      onDelete={onDelete}
    >
      <div 
        ref={containerRef} 
        className="w-full relative"
        style={{ 
          height: dimensions.isReady ? dimensions.height : 400,
          overflow: 'hidden'
        }}
        onClick={() => {
          setHasInteracted(true)
          handleInteraction()
        }}
        onMouseEnter={() => {
          setHasInteracted(true)
          handleInteraction()
        }}
      >
        {/* WebGL Mode Indicator */}
        {isWebGLMode && (
          <div className="absolute top-1 left-1 z-[1001] bg-green-500/20 text-green-700 dark:text-green-400 text-xs px-1.5 py-0.5 rounded-sm font-mono">
            WebGL
          </div>
        )}
        <div
          ref={plotRef}
          className="[&_.modebar]:!z-[1000] [&_.modebar-container]:!absolute [&_.modebar-container]:!top-1 [&_.modebar-container]:!right-1"
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
    </ChartContainer>
  )
}

// Memoize component to prevent unnecessary re-renders
export const PlotlyChartWithDataRefactored = memo(PlotlyChartWithDataRefactoredComponent, (prevProps, nextProps) => {
  // Custom comparison function
  return (
    prevProps.aspectRatio === nextProps.aspectRatio &&
    prevProps.className === nextProps.className &&
    prevProps.onEdit === nextProps.onEdit &&
    prevProps.onDuplicate === nextProps.onDuplicate &&
    prevProps.onDelete === nextProps.onDelete &&
    JSON.stringify(prevProps.config) === JSON.stringify(nextProps.config) &&
    JSON.stringify(prevProps.padding) === JSON.stringify(nextProps.padding)
  )
})