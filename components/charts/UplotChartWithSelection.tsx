'use client'

import { useCallback, useMemo } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { UplotChartWithData } from './UplotChartWithData'
import { useChartSelection } from '@/hooks/useChartSelection'
import { createSelectionPlugin, createZoomToSelectionPlugin, SelectionRange } from '@/lib/utils/uplotSelectionPlugin'
import { useChartInteraction } from '@/hooks/useChartInteraction'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'
import { SelectionControls } from './SelectionControls'
import { useChartData } from '@/hooks/useChartDataOptimized'

interface UplotChartWithSelectionProps {
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
  enableSelection?: boolean
  enableZoomToSelection?: boolean
  onSelectionChange?: (range: SelectionRange | null) => void
  selectionOptions?: {
    color?: string
    opacity?: number
    minSize?: number
  }
}

export function UplotChartWithSelection({
  config,
  aspectRatio,
  className = '',
  onEdit,
  onDuplicate,
  onDelete,
  padding,
  samplingConfig,
  enableSelection = false,
  enableZoomToSelection = false,
  onSelectionChange,
  selectionOptions = {},
}: UplotChartWithSelectionProps) {
  // Get chart data for series names
  const { plotData } = useChartData(config, samplingConfig ?? true)
  
  // Extract series names
  const seriesNames = useMemo(() => {
    if (!plotData) return []
    return plotData.series.map(series => 
      `${series.metadataLabel} - ${series.parameterInfo.parameterName}`
    )
  }, [plotData])
  
  // Use selection hook
  const [selectionState, selectionActions] = useChartSelection(
    plotData ? plotData.series.map(s => ({ series: s.xValues.map((x, i) => ({ x, y: s.yValues[i] })), name: s.metadataLabel })) : undefined,
    {
      onSelectionChange,
      autoDisableOnSelect: false,
    }
  )

  // Handle selection events
  const handleSelect = useCallback((range: SelectionRange) => {
    selectionActions.setSelectedRange(range)
  }, [selectionActions])

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
  const handleZoom = useCallback((range: SelectionRange) => {
    // This will be implemented when we connect to the chart interaction hook
    console.log('Zoom to selection:', range)
  }, [])

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
        onZoom: handleZoom,
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
    handleZoom,
    selectionOptions,
    selectionState.isSelectionMode,
  ])

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
            onZoomToSelection={enableZoomToSelection ? handleZoom : undefined}
          />
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