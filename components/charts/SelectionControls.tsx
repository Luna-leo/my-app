'use client'

import { SelectionRange, formatSelectionRange, exportSelectedData } from '@/hooks/useChartSelection'
import { ChartSelectionState, ChartSelectionActions } from '@/hooks/useChartSelection'
import { useState } from 'react'
import {
  Crosshair2Icon,
  ZoomInIcon,
  DownloadIcon,
  Cross2Icon,
  InfoCircledIcon,
} from '@radix-ui/react-icons'

interface SelectionControlsProps {
  selectionState: ChartSelectionState
  selectionActions: ChartSelectionActions
  enableZoomToSelection?: boolean
  seriesNames?: string[]
  onZoomToSelection?: (range: SelectionRange) => void
  className?: string
}

export function SelectionControls({
  selectionState,
  selectionActions,
  enableZoomToSelection = false,
  seriesNames = [],
  onZoomToSelection,
  className = '',
}: SelectionControlsProps) {
  const [showExportMenu, setShowExportMenu] = useState(false)

  const handleExportCSV = () => {
    const data = exportSelectedData(selectionState.selectedDataPoints, {
      format: 'csv',
      includeHeaders: true,
      seriesNames,
    })
    
    // Create download
    const blob = new Blob([data], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'selected-data.csv'
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  const handleExportJSON = () => {
    const data = exportSelectedData(selectionState.selectedDataPoints, {
      format: 'json',
      seriesNames,
    })
    
    // Create download
    const blob = new Blob([data], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'selected-data.json'
    a.click()
    URL.revokeObjectURL(url)
    setShowExportMenu(false)
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {/* Main Controls */}
      <div className="flex items-center gap-2">
        {/* Selection Mode Toggle */}
        <button
          onClick={selectionActions.toggleSelectionMode}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
            selectionState.isSelectionMode
              ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-sm'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300'
          }`}
          title={selectionState.isSelectionMode ? 'Disable selection mode' : 'Enable selection mode'}
        >
          {enableZoomToSelection ? (
            <>
              <ZoomInIcon className="w-3.5 h-3.5" />
              <span>Zoom Selection</span>
            </>
          ) : (
            <>
              <Crosshair2Icon className="w-3.5 h-3.5" />
              <span>Box Selection</span>
            </>
          )}
        </button>

        {/* Zoom to Selection Button */}
        {enableZoomToSelection && selectionState.selectedRange && onZoomToSelection && (
          <button
            onClick={() => onZoomToSelection(selectionState.selectedRange!)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-green-500 text-white hover:bg-green-600 rounded-md transition-all shadow-sm"
            title="Zoom to selected range"
          >
            <ZoomInIcon className="w-3.5 h-3.5" />
            <span>Apply Zoom</span>
          </button>
        )}

        {/* Clear Selection */}
        {selectionState.selectedRange && (
          <button
            onClick={selectionActions.clearSelection}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 rounded-md transition-all"
            title="Clear selection"
          >
            <Cross2Icon className="w-3.5 h-3.5" />
            <span>Clear</span>
          </button>
        )}

        {/* Export Button */}
        {selectionState.selectedRange && selectionState.selectedDataPoints.length > 0 && (
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-300 rounded-md transition-all"
              title="Export selected data"
            >
              <DownloadIcon className="w-3.5 h-3.5" />
              <span>Export</span>
            </button>
            
            {showExportMenu && (
              <div className="absolute top-full mt-1 right-0 bg-white border border-gray-300 rounded-md shadow-lg z-10">
                <button
                  onClick={handleExportCSV}
                  className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 transition-colors"
                >
                  Export as CSV
                </button>
                <button
                  onClick={handleExportJSON}
                  className="block w-full text-left px-4 py-2 text-xs hover:bg-gray-50 transition-colors border-t border-gray-200"
                >
                  Export as JSON
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Selection Info */}
      {selectionState.selectedRange && (
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
          <div className="flex items-start gap-2">
            <InfoCircledIcon className="w-4 h-4 text-gray-500 flex-shrink-0 mt-0.5" />
            <div className="flex-1 space-y-1">
              <div className="text-xs font-medium text-gray-700">Selected Range</div>
              <div className="text-xs text-gray-600 font-mono">
                {formatSelectionRange(selectionState.selectedRange)}
              </div>
              {selectionState.selectedDataPoints.length > 0 && (
                <div className="text-xs text-gray-600">
                  <span className="font-medium">Points selected:</span>{' '}
                  {selectionState.selectedDataPoints.reduce((acc, s) => acc + s.points.length, 0)}
                  {' across '}
                  {selectionState.selectedDataPoints.length}
                  {' series'}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Selection Mode Indicator */}
      {selectionState.isSelectionMode && !selectionState.selectedRange && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
          <div className="flex items-center gap-2">
            <InfoCircledIcon className="w-4 h-4 text-blue-500" />
            <div className="text-xs text-blue-700">
              Click and drag on the chart to select a region
            </div>
          </div>
        </div>
      )}
    </div>
  )
}