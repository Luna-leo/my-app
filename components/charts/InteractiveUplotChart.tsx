'use client'

import { useRef, useCallback, useEffect, useMemo } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { UplotChartWithData } from './UplotChartWithData'
import { useChartSelection } from '@/hooks/useChartSelection'
import { useChartViewport } from '@/hooks/useChartViewport'
import { createSelectionPlugin, createZoomToSelectionPlugin, SelectionRange } from '@/lib/utils/uplotSelectionPlugin'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'
import { SelectionControls } from './SelectionControls'
import { useChartData } from '@/hooks/useChartDataOptimized'
import uPlot from 'uplot'

interface InteractiveUplotChartProps {
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
  
  // Selection options
  enableSelection?: boolean
  enableZoomToSelection?: boolean
  onSelectionChange?: (range: SelectionRange | null) => void
  selectionOptions?: {
    color?: string
    opacity?: number
    minSize?: number
  }
  
  // Viewport options
  enableViewportControl?: boolean
  initialViewport?: {
    xMin: number
    xMax: number
    yMin: number
    yMax: number
  }
  onViewportChange?: (viewport: { xMin: number; xMax: number; yMin: number; yMax: number }) => void
}

export function InteractiveUplotChart({
  config,
  aspectRatio,
  className = '',
  onEdit,
  onDuplicate,
  onDelete,
  padding,
  samplingConfig,
  enableSelection = true,
  enableZoomToSelection = true,
  onSelectionChange,
  selectionOptions = {},
  enableViewportControl = true,
  initialViewport,
  onViewportChange,
}: InteractiveUplotChartProps) {
  const chartRef = useRef<uPlot | null>(null)
  
  // Get chart data
  const { plotData, dataViewport } = useChartData(config, samplingConfig ?? true)
  
  // Extract series names
  const seriesNames = useMemo(() => {
    if (!plotData) return []
    return plotData.series.map(series => 
      `${series.metadataLabel} - ${series.parameterInfo.parameterName}`
    )
  }, [plotData])
  
  // Transform data for selection hook
  const dataPoints = useMemo(() => {
    if (!plotData) return undefined
    return plotData.series.map(s => ({
      series: s.xValues.map((x, i) => ({ 
        x: config.xAxisParameter === 'timestamp' ? x / 1000 : x, 
        y: s.yValues[i] 
      })),
      name: s.metadataLabel
    }))
  }, [plotData, config.xAxisParameter])
  
  // Use selection hook
  const [selectionState, selectionActions] = useChartSelection(dataPoints, {
    onSelectionChange,
    autoDisableOnSelect: false,
  })
  
  // Use viewport hook
  const [viewport, viewportActions] = useChartViewport({
    initialViewport: initialViewport || dataViewport || undefined,
    onViewportChange,
  })
  
  // Update viewport when data viewport changes
  useEffect(() => {
    if (!viewport && dataViewport && enableViewportControl) {
      viewportActions.setViewport(dataViewport)
    }
  }, [dataViewport, viewport, viewportActions, enableViewportControl])
  
  // Handle chart creation
  const handleChartCreate = useCallback((chart: uPlot) => {
    chartRef.current = chart
    
    // Apply viewport if available
    if (viewport && enableViewportControl) {
      const xScale = chart.scales.x
      const yScale = chart.scales.y || chart.scales[chart.series[1]?.scale || 'y']
      
      if (xScale && yScale) {
        // For time series, convert to seconds
        const xMin = config.xAxisParameter === 'timestamp' ? viewport.xMin / 1000 : viewport.xMin
        const xMax = config.xAxisParameter === 'timestamp' ? viewport.xMax / 1000 : viewport.xMax
        
        chart.setScale('x', { min: xMin, max: xMax })
        
        // Set y scale for all y scales
        Object.keys(chart.scales).forEach(scale => {
          if (scale !== 'x') {
            chart.setScale(scale, { min: viewport.yMin, max: viewport.yMax })
          }
        })
      }
    }
  }, [viewport, enableViewportControl, config.xAxisParameter])
  
  // Handle selection events
  const handleSelect = useCallback((range: SelectionRange) => {
    // Adjust for timestamp
    if (config.xAxisParameter === 'timestamp') {
      range = {
        ...range,
        xMin: range.xMin * 1000,
        xMax: range.xMax * 1000,
      }
    }
    selectionActions.setSelectedRange(range)
  }, [selectionActions, config.xAxisParameter])
  
  const handleSelectionStart = useCallback(() => {
    selectionActions.setIsSelecting(true)
  }, [selectionActions])
  
  const handleSelectionEnd = useCallback(() => {
    selectionActions.setIsSelecting(false)
  }, [selectionActions])
  
  const handleSelectionClear = useCallback(() => {
    selectionActions.clearSelection()
  }, [selectionActions])
  
  // Handle zoom to selection
  const handleZoomToSelection = useCallback((range: SelectionRange) => {
    if (!enableViewportControl || !chartRef.current) return
    
    // Animate viewport to selection
    viewportActions.zoomToSelection(range)
    
    // Apply to chart
    if (chartRef.current) {
      const chart = chartRef.current
      
      // For time series, convert to seconds
      const xMin = config.xAxisParameter === 'timestamp' ? range.xMin / 1000 : range.xMin
      const xMax = config.xAxisParameter === 'timestamp' ? range.xMax / 1000 : range.xMax
      
      // Add padding
      const xPadding = (xMax - xMin) * 0.1
      const yPadding = (range.yMax - range.yMin) * 0.1
      
      chart.setScale('x', { 
        min: xMin - xPadding, 
        max: xMax + xPadding 
      })
      
      // Set y scale for all y scales
      Object.keys(chart.scales).forEach(scale => {
        if (scale !== 'x') {
          chart.setScale(scale, { 
            min: range.yMin - yPadding, 
            max: range.yMax + yPadding 
          })
        }
      })
    }
    
    // Clear selection after zoom
    selectionActions.clearSelection()
  }, [enableViewportControl, viewportActions, config.xAxisParameter, selectionActions])
  
  // Create selection plugin
  const selectionPlugin = useMemo(() => {
    if (!enableSelection && !enableZoomToSelection) return null
    
    const pluginOptions = {
      onSelect: handleSelect,
      onSelectionStart: handleSelectionStart,
      onSelectionEnd: handleSelectionEnd,
      onSelectionClear: handleSelectionClear,
      selectionColor: selectionOptions.color,
      selectionOpacity: selectionOptions.opacity,
      minSelectionSize: selectionOptions.minSize,
      enabled: selectionState.isSelectionMode,
    }
    
    if (enableZoomToSelection) {
      return createZoomToSelectionPlugin({
        ...pluginOptions,
        onZoom: handleZoomToSelection,
      })
    }
    
    return createSelectionPlugin(pluginOptions)
  }, [
    enableSelection,
    enableZoomToSelection,
    handleSelect,
    handleSelectionStart,
    handleSelectionEnd,
    handleSelectionClear,
    handleZoomToSelection,
    selectionOptions,
    selectionState.isSelectionMode,
  ])
  
  // Update chart viewport when viewport changes
  useEffect(() => {
    if (chartRef.current && viewport && enableViewportControl) {
      const chart = chartRef.current
      
      // For time series, convert to seconds
      const xMin = config.xAxisParameter === 'timestamp' ? viewport.xMin / 1000 : viewport.xMin
      const xMax = config.xAxisParameter === 'timestamp' ? viewport.xMax / 1000 : viewport.xMax
      
      chart.setScale('x', { min: xMin, max: xMax })
      
      // Set y scale for all y scales
      Object.keys(chart.scales).forEach(scale => {
        if (scale !== 'x') {
          chart.setScale(scale, { min: viewport.yMin, max: viewport.yMax })
        }
      })
    }
  }, [viewport, enableViewportControl, config.xAxisParameter])
  
  return (
    <div className="relative">
      {/* Selection Controls */}
      {(enableSelection || enableZoomToSelection) && (
        <div className="absolute top-2 right-2 z-[1002] max-w-sm">
          <SelectionControls
            selectionState={selectionState}
            selectionActions={selectionActions}
            enableZoomToSelection={enableZoomToSelection}
            seriesNames={seriesNames}
            onZoomToSelection={enableZoomToSelection ? handleZoomToSelection : undefined}
          />
        </div>
      )}
      
      {/* Reset Viewport Button */}
      {enableViewportControl && viewport && initialViewport && (
        <div className="absolute top-2 left-2 z-[1002]">
          <button
            onClick={viewportActions.resetViewport}
            className="px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 rounded-md transition-all"
            title="Reset zoom"
          >
            Reset Zoom
          </button>
        </div>
      )}
      
      {/* Chart */}
      <UplotChartWithData
        config={config}
        aspectRatio={aspectRatio}
        className={className}
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        padding={padding}
        samplingConfig={samplingConfig}
        additionalPlugins={selectionPlugin ? [selectionPlugin] : []}
      />
    </div>
  )
}