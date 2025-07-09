'use client'

import { Badge } from '@/components/ui/badge'
import { PaginationControls } from '@/components/layout/PaginationControls'
import { SamplingControls } from '@/components/layout/SamplingControls'
import { LayoutSelector, LayoutOption } from '@/components/layout/LayoutSelector'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'

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
  selectedDataLabels,
  selectedDataColors,
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
    <div className="flex items-center justify-between py-2 px-4 border rounded-lg bg-background/50">
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

      {/* Right side: Layout, Sampling and Pagination controls */}
      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
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