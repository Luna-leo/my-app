'use client'

import { Badge } from '@/components/ui/badge'
import { PaginationControls } from '@/components/layout/PaginationControls'
import { SamplingControls } from '@/components/layout/SamplingControls'
import { LayoutSelector, LayoutOption } from '@/components/layout/LayoutSelector'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'

interface DataSelectionBarProps {
  selectedDataIds: number[]
  totalCharts: number
  layoutOption: LayoutOption | null
  onLayoutChange: (layout: LayoutOption | null) => void
  paginationEnabled: boolean
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  samplingConfig: SamplingConfig
  onSamplingConfigChange: (config: SamplingConfig) => void
  dataPointsInfo?: {
    original: number
    sampled: number
    isLoading: boolean
  }
  isUpdatingSampling?: boolean
}

export function DataSelectionBar({
  selectedDataIds,
  totalCharts,
  layoutOption,
  onLayoutChange,
  paginationEnabled,
  currentPage,
  totalPages,
  onPageChange,
  samplingConfig,
  onSamplingConfigChange,
  dataPointsInfo,
  isUpdatingSampling
}: DataSelectionBarProps) {
  return (
    <div className="flex items-center justify-between p-4 border rounded-lg bg-background/50">
      {/* Left side: Selected data badges */}
      <div className="flex items-center gap-2 flex-1">
        <span className="text-sm text-muted-foreground mr-2">Selected Data:</span>
        {selectedDataIds.length > 0 ? (
          <div className="flex gap-2 flex-wrap">
            {selectedDataIds.map(id => (
              <Badge key={id} variant="secondary">
                ID: {id}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-sm text-muted-foreground italic">No data selected</span>
        )}
      </div>

      {/* Right side: Layout, Sampling and Pagination controls */}
      <div className="flex items-center gap-2 flex-shrink-0 ml-4">
        <LayoutSelector 
          value={layoutOption} 
          onChange={onLayoutChange} 
        />
        
        <SamplingControls
          config={samplingConfig}
          onChange={onSamplingConfigChange}
          dataPointsInfo={dataPointsInfo && !dataPointsInfo.isLoading ? {
            original: dataPointsInfo.original,
            sampled: dataPointsInfo.sampled
          } : undefined}
          isUpdating={isUpdatingSampling}
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