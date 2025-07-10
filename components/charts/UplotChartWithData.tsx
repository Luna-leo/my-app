'use client'

import { useEffect, useRef, memo, useCallback, useState, useMemo } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useChartDimensions, AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import { shallowEqual } from '@/lib/utils/hashUtils'
import { useChartData } from '@/hooks/useChartDataOptimized'
import { colorService } from '@/lib/services/colorService'
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
  additionalPlugins?: uPlot.Plugin[]
  // Zoom and pan options
  enableZoom?: boolean
  enablePan?: boolean
  zoomFactor?: number
  panButton?: number // 0: left, 1: middle, 2: right
}

function UplotChartWithDataComponent({
  config,
  aspectRatio = UPLOT_DEFAULTS.ASPECT_RATIO,
  className = '',
  onEdit,
  onDuplicate,
  onDelete,
  padding,
  samplingConfig,
  additionalPlugins = [],
  enableZoom = true,
  enablePan = true,
  zoomFactor = 0.75,
  panButton = 1
}: UplotChartWithDataProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)
  
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
        enableZoom,
        enablePan,
        zoomFactor,
        panButton,
        onZoomChange: setIsZoomed,
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
      
      // Add any additional plugins
      if (additionalPlugins.length > 0) {
        options.plugins.push(...additionalPlugins)
      }
      
      // Apply series colors based on metadata ID
      options.series.forEach((series, i) => {
        if (i > 0 && plotData.series[i - 1]) {
          // Get the metadata ID from the series data
          const seriesData = plotData.series[i - 1]
          const metadataId = seriesData.metadataId
          
          // Use colorService to get consistent color for this metadata ID
          const color = colorService.getColorForDataId(metadataId)
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
  }, [plotData, dimensions, config, dataViewport, additionalPlugins, enableZoom, enablePan, zoomFactor, panButton])
  
  // Handle chart creation
  const handleChartCreate = useCallback((chart: uPlot) => {
    chartRef.current = chart
    console.log(`[Chart ${config.title}] uPlot chart created`)
  }, [config.title])
  
  // Handle reset zoom
  const handleResetZoom = useCallback(() => {
    console.log('[UplotChartWithData] handleResetZoom called')
    const chart = chartRef.current as uPlot & { resetZoom?: () => void }
    if (chart && chart.resetZoom) {
      console.log('[UplotChartWithData] Calling chart.resetZoom()')
      chart.resetZoom()
    } else {
      console.warn('[UplotChartWithData] No resetZoom method found on chart')
    }
  }, [])
  
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
          minHeight: 100
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
        
        {/* Reset Zoom Button */}
        {isZoomed && (enableZoom || enablePan) && (
          <div className="absolute top-1 right-1 z-[1001]">
            <button
              onClick={handleResetZoom}
              className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 rounded-md transition-all"
              title="Reset zoom (Double-click, R, or Escape)"
            >
              Reset Zoom
            </button>
          </div>
        )}
        
        {uplotData && uplotOptions && (
          <UplotChart
            data={uplotData}
            options={uplotOptions}
            onCreate={handleChartCreate}
            onDestroy={handleChartDestroy}
            className="[&_.u-legend]:absolute [&_.u-legend]:top-1 [&_.u-legend]:right-1 [&_.u-legend]:z-[1000] [&_.u-over]:pointer-events-auto"
          />
        )}
      </div>
    </ChartContainer>
  )
}

// Memoize component to prevent unnecessary re-renders
export const UplotChartWithData = memo(UplotChartWithDataComponent, (prevProps, nextProps) => {
  // Custom comparison function - optimized for performance
  if (
    prevProps.aspectRatio !== nextProps.aspectRatio ||
    prevProps.className !== nextProps.className ||
    prevProps.onEdit !== nextProps.onEdit ||
    prevProps.onDuplicate !== nextProps.onDuplicate ||
    prevProps.onDelete !== nextProps.onDelete
  ) {
    return false;
  }
  
  // Efficient config comparison
  if (prevProps.config === nextProps.config) {
    // Same reference
  } else if (!prevProps.config || !nextProps.config) {
    return false;
  } else {
    // Compare key config properties
    const configChanged = (
      prevProps.config.title !== nextProps.config.title ||
      prevProps.config.chartType !== nextProps.config.chartType ||
      prevProps.config.xAxisParameter !== nextProps.config.xAxisParameter ||
      prevProps.config.yAxisParameters.length !== nextProps.config.yAxisParameters.length ||
      prevProps.config.selectedDataIds.length !== nextProps.config.selectedDataIds.length ||
      !prevProps.config.yAxisParameters.every((p, i) => p === nextProps.config.yAxisParameters[i]) ||
      !prevProps.config.selectedDataIds.every((id, i) => id === nextProps.config.selectedDataIds[i])
    );
    
    if (configChanged) return false;
  }
  
  // Efficient padding comparison
  if (prevProps.padding === nextProps.padding) {
    return true;
  }
  
  if (!prevProps.padding && !nextProps.padding) {
    return true;
  }
  
  if (!prevProps.padding || !nextProps.padding) {
    return false;
  }
  
  return shallowEqual(prevProps.padding, nextProps.padding);
})