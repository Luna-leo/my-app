'use client'

import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { LayoutOption } from './LayoutSelector'

interface PaginationControlsProps {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  totalCharts: number
  layoutOption: LayoutOption | null
}

export function PaginationControls({
  currentPage,
  totalPages,
  onPageChange,
  totalCharts,
  layoutOption
}: PaginationControlsProps) {
  const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : totalCharts
  const startIndex = (currentPage - 1) * chartsPerPage + 1
  const endIndex = Math.min(currentPage * chartsPerPage, totalCharts)

  // Don't render if there's only one page
  if (totalPages <= 1) {
    return null
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage - 1)}
          disabled={currentPage === 1}
          className="h-8 w-8"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1 text-sm">
          <span className="font-medium">{currentPage}</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-muted-foreground">{totalPages}</span>
        </div>

        <Button
          variant="outline"
          size="icon"
          onClick={() => onPageChange(currentPage + 1)}
          disabled={currentPage === totalPages}
          className="h-8 w-8"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="h-4 w-[1px] bg-border" />

      <div className="text-sm text-muted-foreground">
        Showing {startIndex}-{endIndex} of {totalCharts} charts
      </div>
    </div>
  )
}