'use client'

import { Badge } from '@/components/ui/badge'
import { PaginationControls } from '@/components/layout/PaginationControls'
import { LayoutOption } from '@/components/layout/LayoutSelector'

interface DataSelectionBarProps {
  selectedDataIds: number[]
  totalCharts: number
  layoutOption: LayoutOption | null
  paginationEnabled: boolean
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
}

export function DataSelectionBar({
  selectedDataIds,
  totalCharts,
  layoutOption,
  paginationEnabled,
  currentPage,
  totalPages,
  onPageChange
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

      {/* Right side: Pagination controls */}
      {layoutOption && paginationEnabled && totalPages > 1 && (
        <div className="flex-shrink-0 ml-4">
          <PaginationControls
            currentPage={currentPage}
            totalPages={totalPages}
            onPageChange={onPageChange}
            totalCharts={totalCharts}
            layoutOption={layoutOption}
          />
        </div>
      )}
    </div>
  )
}