'use client'

import { useEffect, useRef } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useChartDimensions, AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import { useChartData } from '@/hooks/useChartData'
import { usePlotlyInit } from '@/hooks/usePlotlyInit'
import { generateLineColors } from '@/lib/utils/chartDataUtils'
import {
  rgbaToCSS,
  buildPlotlyLayout,
  buildScatterTrace,
  tryCreatePlotlyChart,
  resizePlotlyChart,
  PLOTLY_MODEBAR_CONFIG,
  PLOTLY_MARGINS,
} from '@/lib/utils/plotlyUtils'
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

export function PlotlyChartWithDataRefactored({
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
  const { plotlyRef, hasPlotRef, chartState, initPlotly, cleanup } = usePlotlyInit()
  
  // Initialize Plotly when data is ready
  useEffect(() => {
    if (!plotData || !dataViewport || !dimensions.isReady) return
    
    let disposed = false
    
    const createChart = async () => {
      if (disposed) return
      
      // Cleanup existing plot
      await cleanup(plotRef.current)
      
      const success = await initPlotly(plotRef.current)
      if (!success || !plotlyRef.current || !plotRef.current) return
      
      // Generate colors
      const colors = generateLineColors(plotData.series.length)
      
      // Prepare traces for Plotly
      const traces = plotData.series.map((series, index) => {
        // Filter out NaN values
        const validIndices: number[] = []
        for (let i = 0; i < series.yValues.length; i++) {
          if (!isNaN(series.yValues[i])) {
            validIndices.push(i)
          }
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
        })
      })
      
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
      
      // Create config - spread to make mutable
      const plotlyConfig = { 
        ...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS,
        modeBarButtonsToAdd: [...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS.modeBarButtonsToAdd],
        modeBarButtonsToRemove: [...PLOTLY_MODEBAR_CONFIG.WITH_TOOLS.modeBarButtonsToRemove]
      }
      
      // Create plot
      const plotCreated = await tryCreatePlotlyChart(
        plotRef.current,
        traces,
        layout,
        plotlyConfig,
        plotlyRef.current
      )
      
      if (plotCreated) {
        hasPlotRef.current = true
      } else {
        throw new Error(ERROR_MESSAGES.PLOT_CREATION_FAILED)
      }
    }
    
    createChart().catch(err => {
      console.error('Error creating chart:', err)
    })
    
    return () => {
      disposed = true
    }
  }, [plotData, dataViewport, config, dimensions, initPlotly, cleanup, plotlyRef, hasPlotRef])
  
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
        className="w-full"
        style={{ 
          height: dimensions.isReady ? dimensions.height : 400,
          overflow: 'hidden'
        }}
      >
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