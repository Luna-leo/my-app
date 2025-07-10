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
import { createSelectionPlugin, SelectionRange } from '@/lib/utils/uplotSelectionPlugin'
import { createDoubleClickResetPlugin } from '@/lib/utils/uplotZoomPlugin'
import { zoomSyncService } from '@/lib/services/zoomSyncService'

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
  onChartCreate?: (chart: uPlot) => void
  enableSelectionZoom?: boolean
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
  onChartCreate,
  enableSelectionZoom = true
}: UplotChartWithDataProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)
  const [error, setError] = useState<string | null>(null)
  const chartIdRef = useRef<string>(`chart-${Math.random().toString(36).substr(2, 9)}`)
  
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
  
  // Handle zoom to selection
  const handleZoomToSelection = useCallback((range: SelectionRange) => {
    console.log(`[UplotChartWithData] handleZoomToSelection called for ${chartIdRef.current}`, range)
    if (!chartRef.current) return
    
    const chart = chartRef.current
    
    // For time series, convert milliseconds to seconds
    const xMin = config.xAxisParameter === 'timestamp' ? range.xMin / 1000 : range.xMin
    const xMax = config.xAxisParameter === 'timestamp' ? range.xMax / 1000 : range.xMax
    
    // Add padding
    const xPadding = (xMax - xMin) * 0.1
    const yPadding = (range.yMax - range.yMin) * 0.1
    
    console.log(`[UplotChartWithData] Setting scales - X: ${xMin - xPadding} to ${xMax + xPadding}`)
    
    // Use batch to apply all scale changes at once
    console.log(`[UplotChartWithData] Before setScale - X scale:`, {
      min: chart.scales.x.min,
      max: chart.scales.x.max
    })
    
    chart.batch(() => {
      // Set X scale
      chart.setScale('x', { 
        min: xMin - xPadding, 
        max: xMax + xPadding 
      })
      
      // Set Y scale for all y scales
      Object.keys(chart.scales).forEach(scale => {
        if (scale !== 'x') {
          chart.setScale(scale, { 
            min: range.yMin - yPadding, 
            max: range.yMax + yPadding 
          })
        }
      })
    })
    
    // Check if scale was actually updated
    console.log(`[UplotChartWithData] After setScale - X scale:`, {
      min: chart.scales.x.min,
      max: chart.scales.x.max,
      expected: {
        min: xMin - xPadding,
        max: xMax + xPadding
      }
    })
    
    // Notify sync service about zoom change after a small delay to ensure scales are updated
    setTimeout(() => {
      if (!zoomSyncService.isCurrentlyUpdating()) {
        const currentScales = chart.scales
        console.log(`[UplotChartWithData] Notifying zoom change for ${chartIdRef.current}`)
        console.log(`[UplotChartWithData] Current scales:`, {
          x: { min: currentScales.x.min, max: currentScales.x.max }
        })
        console.log(`[UplotChartWithData] Scale values after zoom:`, {
          xMin: currentScales.x.min,
          xMax: currentScales.x.max,
          xMinType: typeof currentScales.x.min,
          xMaxType: typeof currentScales.x.max
        })
        
        // Get the first Y scale (if exists)
        const yScaleKeys = Object.keys(currentScales).filter(k => k !== 'x')
        const firstYScale = yScaleKeys.length > 0 ? currentScales[yScaleKeys[0]] : undefined
        
        // Ensure we're passing the correct values
        const xMinValue = currentScales.x.min!
        const xMaxValue = currentScales.x.max!
        
        console.log(`[UplotChartWithData] Sending to sync service: xMin=${xMinValue}, xMax=${xMaxValue}`)
        
        zoomSyncService.handleZoomChange(chartIdRef.current, {
          xMin: xMinValue,
          xMax: xMaxValue,
          yMin: firstYScale?.min,
          yMax: firstYScale?.max
        })
      }
    }, 10) // Increase delay slightly to ensure scale update is complete
  }, [config.xAxisParameter])
  
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
        // Don't set fixed ranges - this prevents setScale from working
        // xRange and yRange should only be used for initial view
        xRange: undefined,
        yRange: undefined,
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
      
      // Add selection zoom plugin if enabled
      if (enableSelectionZoom) {
        console.log('[UplotChartWithData] Adding selection zoom plugin')
        const selectionPlugin = createSelectionPlugin({
          onSelect: (range) => {
            console.log('[UplotChartWithData] Selection onSelect called:', range)
            // Convert timestamps if needed
            if (config.xAxisParameter === 'timestamp') {
              range = {
                ...range,
                xMin: range.xMin * 1000,
                xMax: range.xMax * 1000,
              }
            }
            console.log('[UplotChartWithData] Calling handleZoomToSelection')
            handleZoomToSelection(range)
          },
          selectionColor: '#4285F4',
          selectionOpacity: 0.2,
          minSelectionSize: 10,
          enabled: true,
        })
        options.plugins.push(selectionPlugin)
        
        // Add double-click reset plugin with sync support
        const doubleClickResetPlugin = createDoubleClickResetPlugin({ 
          debug: true,
          chartId: chartIdRef.current,
          onReset: () => {
            // Notify sync service about reset
            zoomSyncService.handleReset(chartIdRef.current)
          }
        })
        options.plugins.push(doubleClickResetPlugin)
      }
      
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
      
      console.log('[UplotChartWithData] Built options:', {
        ...options,
        plugins: options.plugins?.map((p, i) => `Plugin ${i}: ${p.hooks ? Object.keys(p.hooks).join(', ') : 'no hooks'}`)
      })
      console.log('[UplotChartWithData] Actual plugins array length:', options.plugins?.length || 0)
      return options
    } catch (err) {
      console.error('[UplotChartWithData] Error building options:', err)
      setError(UPLOT_ERROR_MESSAGES.INIT_FAILED)
      return null
    }
  }, [plotData, dimensions, config, dataViewport, additionalPlugins, enableSelectionZoom, handleZoomToSelection])
  
  // Handle chart creation
  const handleChartCreate = useCallback((chart: uPlot) => {
    chartRef.current = chart
    console.log(`[Chart ${config.title}] uPlot chart created`)
    
    // Add resetZoom method if not already present (from the double-click plugin)
    const chartWithReset = chart as uPlot & { resetZoom?: () => void }
    if (!chartWithReset.resetZoom) {
      console.log(`[Chart ${config.title}] Adding resetZoom method to chart`)
      const initialScales: Record<string, { min: number; max: number }> = {}
      Object.keys(chart.scales).forEach(key => {
        const scale = chart.scales[key]
        if (scale.min != null && scale.max != null) {
          initialScales[key] = {
            min: scale.min,
            max: scale.max
          }
        }
      })
      
      chartWithReset.resetZoom = () => {
        chart.batch(() => {
          Object.keys(initialScales).forEach(key => {
            if (chart.scales[key]) {
              chart.setScale(key, initialScales[key])
            }
          })
        })
      }
    }
    
    // Register with zoom sync service
    const isTimeSeries = config.xAxisParameter === 'timestamp'
    zoomSyncService.registerChart(chartIdRef.current, chartWithReset, isTimeSeries)
    
    // Set initial view if dataViewport is available
    if (dataViewport) {
      console.log(`[Chart ${config.title}] Setting initial viewport from dataViewport`)
      const xMin = config.xAxisParameter === 'timestamp' ? dataViewport.xMin / 1000 : dataViewport.xMin
      const xMax = config.xAxisParameter === 'timestamp' ? dataViewport.xMax / 1000 : dataViewport.xMax
      
      chart.batch(() => {
        chart.setScale('x', { min: xMin, max: xMax })
        chart.setScale('y', { min: dataViewport.yMin, max: dataViewport.yMax })
      })
    }
    
    if (onChartCreate) {
      onChartCreate(chart)
    }
  }, [config.title, config.xAxisParameter, onChartCreate, dataViewport])
  
  
  // Handle chart destruction
  const handleChartDestroy = useCallback(() => {
    // Unregister from zoom sync service
    zoomSyncService.unregisterChart(chartIdRef.current)
    
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