'use client'

import { useCallback, useMemo } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { UplotChartWithData } from './UplotChartWithData'
import { useChartSelection } from '@/hooks/useChartSelection'
import { createSelectionPlugin, createZoomToSelectionPlugin, SelectionRange } from '@/lib/utils/uplotSelectionPlugin'
import { useChartInteraction } from '@/hooks/useChartInteraction'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'

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
  // Use selection hook
  const [selectionState, selectionActions] = useChartSelection(undefined, {
    onSelectionChange,
    autoDisableOnSelect: false,
  })

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
        <div className="absolute top-2 right-2 z-[1002] flex gap-2">
          <button
            onClick={selectionActions.toggleSelectionMode}
            className={`px-3 py-1 text-xs rounded transition-colors ${
              selectionState.isSelectionMode
                ? 'bg-blue-500 text-white hover:bg-blue-600'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }`}
          >
            {enableZoomToSelection ? 'Zoom Selection' : 'Box Selection'}
          </button>
          {selectionState.selectedRange && (
            <button
              onClick={selectionActions.clearSelection}
              className="px-3 py-1 text-xs bg-gray-200 text-gray-700 hover:bg-gray-300 rounded transition-colors"
            >
              Clear Selection
            </button>
          )}
        </div>
      )}

      {/* Selection Info */}
      {selectionState.selectedRange && (
        <div className="absolute top-12 right-2 z-[1002] bg-white border border-gray-300 rounded p-2 text-xs">
          <div className="font-semibold mb-1">Selected Range:</div>
          <div>X: [{selectionState.selectedRange.xMin.toFixed(2)}, {selectionState.selectedRange.xMax.toFixed(2)}]</div>
          <div>Y: [{selectionState.selectedRange.yMin.toFixed(2)}, {selectionState.selectedRange.yMax.toFixed(2)}]</div>
          {selectionState.selectedDataPoints.length > 0 && (
            <div className="mt-1">
              Points: {selectionState.selectedDataPoints.reduce((acc, s) => acc + s.points.length, 0)}
            </div>
          )}
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