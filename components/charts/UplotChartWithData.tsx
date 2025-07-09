'use client'

import { useEffect, useRef, memo, useCallback, useState, useMemo } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useChartDimensions, AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import { useChartData } from '@/hooks/useChartDataOptimized'
import { generateLineColors } from '@/lib/utils/chartDataUtils'
import {
  buildUplotOptions,
  transformToUplotData,
  createTooltipPlugin,
  resizeUplotChart,
  isValidChart,
} from '@/lib/utils/uplotUtils'
import { UPLOT_DEFAULTS, UPLOT_ERROR_MESSAGES, UPLOT_DATA_LIMITS } from '@/lib/constants/uplotConfig'
import { ChartLoadingState, ChartErrorState, ChartEmptyState } from './ChartStates'
import { ChartContainer } from './ChartContainer'
import { UplotChart } from './UplotChart'
import uPlot from 'uplot'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'

interface UplotChartWithDataProps {
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
  samplingConfig?: SamplingConfig
}

function UplotChartWithDataComponent({
  config,
  aspectRatio = UPLOT_DEFAULTS.ASPECT_RATIO,
  className = '',
  onEdit,
  onDuplicate,
  onDelete,
  padding,
  samplingConfig
}: UplotChartWithDataProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Convert aspect ratio preset to number if needed
  const numericAspectRatio = typeof aspectRatio === 'string' 
    ? ASPECT_RATIOS[aspectRatio] 
    : aspectRatio
  
  // Use hooks
  const dimensions = useChartDimensions(containerRef, {
    aspectRatio: numericAspectRatio,
    padding,
    debounceMs: UPLOT_DEFAULTS.DEBOUNCE_MS
  })
  
  console.log('[UplotChartWithData] Container and dimensions:', {
    hasContainerRef: !!containerRef.current,
    dimensions
  })
  
  // Use sampling config from props
  const { plotData, dataViewport, loadingState } = useChartData(config, samplingConfig ?? true)
  
  console.log('[UplotChartWithData] Chart data hook result:', {
    config,
    plotData,
    dataViewport,
    loadingState
  })
  
  // Transform data to uPlot format
  const uplotData = useMemo(() => {
    if (!plotData || !plotData.series.length) return null
    
    try {
      console.log('[UplotChartWithData] Transforming data for', config.title, plotData)
      
      // For uPlot, all series must share the same x values
      // Use the first series as the reference for x values
      const firstSeries = plotData.series[0]
      if (!firstSeries || firstSeries.xValues.length === 0) {
        console.warn('[UplotChartWithData] No data in first series')
        return null
      }
      
      // Build x values array (convert timestamps to seconds for uPlot)
      const xValues: number[] = firstSeries.xValues.map(x => 
        config.xAxisParameter === 'timestamp' ? x / 1000 : x
      )
      
      // Build y values arrays for each series
      const ySeriesData: number[][] = plotData.series.map(series => {
        // Create y values array with same length as x values
        // If series has different x values, we need to interpolate or use null
        return series.yValues
      })
      
      // Check if we have valid data
      if (xValues.length === 0) {
        console.warn('[UplotChartWithData] No x values found')
        return null
      }
      
      const uplotData = transformToUplotData(xValues, ySeriesData)
      console.log('[UplotChartWithData] Transformed data:', uplotData)
      
      return uplotData
    } catch (err) {
      console.error('[UplotChartWithData] Error transforming data:', err)
      setError(UPLOT_ERROR_MESSAGES.INVALID_DATA)
      return null
    }
  }, [plotData, config.xAxisParameter, config.title])
  
  // Build uPlot options
  const uplotOptions = useMemo(() => {
    console.log('[UplotChartWithData] Building options:', {
      hasPlotData: !!plotData,
      dimensionsReady: dimensions.isReady,
      dimensions: { width: dimensions.width, height: dimensions.height }
    })
    
    if (!plotData) return null
    
    // Use default dimensions if not ready
    const chartWidth = dimensions.width || 800
    const chartHeight = dimensions.height || 400
    
    try {
      const seriesNames = plotData.series.map(series => 
        `${series.metadataLabel} - ${series.parameterInfo.parameterName}`
      )
      
      const options = buildUplotOptions({
        width: chartWidth,
        height: chartHeight,
        xLabel: plotData.xParameterInfo 
          ? `${plotData.xParameterInfo.parameterName} [${plotData.xParameterInfo.unit || ''}]`
          : 'Time',
        yLabel: plotData.series.length === 1
          ? `${plotData.series[0].parameterInfo.parameterName} [${plotData.series[0].parameterInfo.unit || ''}]`
          : 'Value',
        seriesNames,
        chartType: config.chartType,
        isTimeAxis: config.xAxisParameter === 'timestamp',
        showLegend: false,
        xRange: dataViewport ? [
          config.xAxisParameter === 'timestamp' ? dataViewport.xMin / 1000 : dataViewport.xMin,
          config.xAxisParameter === 'timestamp' ? dataViewport.xMax / 1000 : dataViewport.xMax
        ] : undefined,
        yRange: dataViewport ? [dataViewport.yMin, dataViewport.yMax] : undefined,
      })
      
      // Add tooltip plugin with chart data
      if (!options.plugins) {
        options.plugins = []
      }
      const chartData = plotData.series.map(series => ({
        metadataLabel: series.metadataLabel,
        parameterName: series.parameterInfo.parameterName,
        unit: series.parameterInfo.unit || ''
      }))
      options.plugins.push(createTooltipPlugin(chartData))
      
      // Apply series colors
      const colors = generateLineColors(plotData.series.length)
      options.series.forEach((series, i) => {
        if (i > 0 && colors[i - 1]) {
          const color = `rgba(${colors[i - 1].r}, ${colors[i - 1].g}, ${colors[i - 1].b}, ${colors[i - 1].a})`
          series.stroke = color
          if (series.points) {
            series.points.fill = color
          }
        }
      })
      
      console.log('[UplotChartWithData] Built options:', options)
      return options
    } catch (err) {
      console.error('[UplotChartWithData] Error building options:', err)
      setError(UPLOT_ERROR_MESSAGES.INIT_FAILED)
      return null
    }
  }, [plotData, dimensions, config, dataViewport])
  
  // Handle chart creation
  const handleChartCreate = useCallback((chart: uPlot) => {
    chartRef.current = chart
    console.log(`[Chart ${config.title}] uPlot chart created`)
  }, [config.title])
  
  // Handle chart destruction
  const handleChartDestroy = useCallback(() => {
    chartRef.current = null
    console.log(`[Chart ${config.title}] uPlot chart destroyed`)
  }, [config.title])
  
  // Handle resize
  useEffect(() => {
    if (chartRef.current && dimensions.isReady && isValidChart(chartRef.current)) {
      resizeUplotChart(chartRef.current, dimensions.width, dimensions.height)
    }
  }, [dimensions])
  
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
  if (loadingState.error || error) {
    return (
      <ChartErrorState
        title={config.title}
        error={loadingState.error || error || UPLOT_ERROR_MESSAGES.INIT_FAILED}
        className={className}
      />
    )
  }
  
  // No data state
  if (!plotData || plotData.series.length === 0 || !uplotData || !uplotOptions) {
    console.log('[UplotChartWithData] Empty state:', {
      hasPlotData: !!plotData,
      seriesLength: plotData?.series.length || 0,
      hasUplotData: !!uplotData,
      hasUplotOptions: !!uplotOptions,
      loadingState,
      error
    })
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
          height: dimensions.height || 400,
          minHeight: 100,
          overflow: 'hidden'
        }}
      >
        {/* Mode Indicators */}
        {(samplingConfig?.enabled ?? true) && totalPoints > UPLOT_DATA_LIMITS.MAX_POINTS_WITHOUT_SAMPLING && (
          <div className="absolute top-1 left-1 z-[1001]">
            <div className="bg-amber-500/20 text-amber-700 dark:text-amber-400 text-xs px-1.5 py-0.5 rounded-sm font-mono">
              Sampled
            </div>
          </div>
        )}
        {uplotData && uplotOptions && (
          <UplotChart
            data={uplotData}
            options={uplotOptions}
            onCreate={handleChartCreate}
            onDestroy={handleChartDestroy}
            className="[&_.u-legend]:absolute [&_.u-legend]:top-1 [&_.u-legend]:right-1 [&_.u-legend]:z-[1000]"
          />
        )}
      </div>
    </ChartContainer>
  )
}

// Memoize component to prevent unnecessary re-renders
export const UplotChartWithData = memo(UplotChartWithDataComponent, (prevProps, nextProps) => {
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