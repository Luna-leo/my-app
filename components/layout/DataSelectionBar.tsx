'use client'

import { Badge } from '@/components/ui/badge'
import { PaginationControls } from '@/components/layout/PaginationControls'
import { ResolutionControls, ResolutionConfig } from '@/components/layout/ResolutionControls'
import { LayoutSelector, LayoutOption } from '@/components/layout/LayoutSelector'
import { ZoomSyncModeSelector } from '@/components/layout/ZoomSyncModeSelector'

interface DataSelectionBarProps {
  selectedDataIds: number[]
  selectedDataLabels?: Map<number, string>
  selectedDataColors?: Map<number, string>
  totalCharts: number
  layoutOption: LayoutOption | null
  onLayoutChange: (layout: LayoutOption | null) => void
  paginationEnabled: boolean
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  resolutionConfig: ResolutionConfig
  onResolutionConfigChange: (config: ResolutionConfig) => void
  dataPointsInfo?: {
    original: number
    sampled: number
    isLoading: boolean
  }
  isUpdatingResolution?: boolean
}

export function DataSelectionBar({
  selectedDataIds,
  selectedDataLabels,
  selectedDataColors,
  totalCharts,
  layoutOption,
  onLayoutChange,
  paginationEnabled,
  currentPage,
  totalPages,
  onPageChange,
  resolutionConfig,
  onResolutionConfigChange,
  dataPointsInfo,
  isUpdatingResolution
}: DataSelectionBarProps) {
  return (
    <div className="flex items-center justify-between py-2 px-4 bg-background/50">
      {/* Left side: Selected data badges */}
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <span className="text-xs text-muted-foreground flex-shrink-0">Data:</span>
        {selectedDataIds.length > 0 ? (
          <div className="flex gap-1 flex-wrap">
            {selectedDataIds.map(id => {
              const color = selectedDataColors?.get(id)
              return (
                <Badge 
                  key={id} 
                  variant="secondary" 
                  className="text-xs py-0 px-2"
                  style={color ? { 
                    backgroundColor: color,
                    color: 'white',
                    borderColor: color 
                  } : undefined}
                >
                  {selectedDataLabels?.get(id) || `ID: ${id}`}
                </Badge>
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground italic">None selected</span>
        )}
      </div>

      {/* Right side: Layout, Zoom Sync, Sampling and Pagination controls */}
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
        <LayoutSelector 
          value={layoutOption} 
          onChange={onLayoutChange} 
        />
        
        <ZoomSyncModeSelector />
        
        <ResolutionControls
          config={resolutionConfig}
          onChange={onResolutionConfigChange}
          dataPointsInfo={dataPointsInfo && !dataPointsInfo.isLoading ? {
            original: dataPointsInfo.original,
            sampled: dataPointsInfo.sampled
          } : undefined}
          isUpdating={isUpdatingResolution}
          chartCount={totalCharts}
        />
        
        {layoutOption && paginationEnabled && totalPages > 1 && (
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            totalCharts={totalCharts}
            layoutOption={layoutOption}
          />
        )}
      </div>
    </div>
  )
}