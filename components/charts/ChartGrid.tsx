'use client'

import { useRef, RefObject } from 'react'
import { getDataChartComponent } from '@/components/charts/ChartProvider'
import { LazyChart } from '@/components/charts/LazyChart'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { cn } from '@/lib/utils'
import { useDynamicGridAspectRatio } from '@/hooks/useDynamicGridAspectRatio'

interface ChartGridProps {
  charts: (ChartConfiguration & { id: string })[]
  onEdit: (chartId: string) => void
  onDuplicate: (chartId: string) => void
  onDelete: (chartId: string) => void
  layoutOption?: LayoutOption | null
  paginationEnabled?: boolean
  currentPage?: number
}

export function ChartGrid({ 
  charts, 
  onEdit, 
  onDuplicate, 
  onDelete, 
  layoutOption,
  paginationEnabled = false,
  currentPage = 1
}: ChartGridProps) {
  const ChartComponent = getDataChartComponent()
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Dynamic height calculations based on row count
  const getMinChartHeight = (rows: number) => {
    switch(rows) {
      case 1: return 300;
      case 2: return 200;
      case 3: return 150;
      case 4: return 120;
      default: return 150;
    }
  }
  
  // Calculate dynamic aspect ratio for fixed layouts
  const dynamicAspectRatio = useDynamicGridAspectRatio({
    layoutOption: layoutOption || null,
    containerRef: containerRef as RefObject<HTMLElement>,
    headerHeight: 280, // Fixed height: AppHeader + DataSelectionBar + margins
    gap: 16,
    minChartHeight: getMinChartHeight(layoutOption?.rows || 1)
  })

  // Create a mapping for all possible grid layouts to ensure Tailwind includes them
  const gridLayoutMap: Record<string, string> = {
    '1-1': 'grid-cols-1',
    '1-2': 'grid-cols-2',
    '1-3': 'grid-cols-3',
    '1-4': 'grid-cols-4',
    '2-1': 'grid-cols-1',
    '2-2': 'grid-cols-2',
    '2-3': 'grid-cols-3',
    '2-4': 'grid-cols-4',
    '3-1': 'grid-cols-1',
    '3-2': 'grid-cols-2',
    '3-3': 'grid-cols-3',
    '3-4': 'grid-cols-4',
    '4-1': 'grid-cols-1',
    '4-2': 'grid-cols-2',
    '4-3': 'grid-cols-3',
    '4-4': 'grid-cols-4',
  }

  const getGridClassName = () => {
    if (layoutOption) {
      const key = `${layoutOption.rows}-${layoutOption.cols}`
      return gridLayoutMap[key] || 'grid-cols-2'
    }
    // Default responsive layout
    return 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'
  }

  // Calculate the number of charts per page
  const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
  
  // Calculate visible charts based on pagination
  let visibleCharts: (ChartConfiguration & { id: string })[]
  if (paginationEnabled && layoutOption) {
    const startIndex = (currentPage - 1) * chartsPerPage
    const endIndex = startIndex + chartsPerPage
    visibleCharts = charts.slice(startIndex, endIndex)
  } else if (layoutOption) {
    // Without pagination, show only what fits in the layout
    visibleCharts = charts.slice(0, chartsPerPage)
  } else {
    // Show all charts in responsive mode
    visibleCharts = charts
  }
  
  // Determine aspect ratio: use dynamic for fixed layouts, default for responsive
  const aspectRatio = layoutOption ? dynamicAspectRatio : 1.5

  return (
    <div ref={containerRef} className={cn('grid gap-4', getGridClassName())}>
      {visibleCharts.map((chart, index) => {
        // First 4 charts load immediately, rest use lazy loading
        if (index < 4) {
          return (
            <ChartComponent
              key={chart.id}
              config={chart}
              aspectRatio={aspectRatio}
              className="w-full"
              onEdit={() => onEdit(chart.id)}
              onDuplicate={() => onDuplicate(chart.id)}
              onDelete={() => onDelete(chart.id)}
            />
          )
        } else {
          return (
            <LazyChart
              key={chart.id}
              config={chart}
              aspectRatio={aspectRatio}
              className="w-full"
              onEdit={() => onEdit(chart.id)}
              onDuplicate={() => onDuplicate(chart.id)}
              onDelete={() => onDelete(chart.id)}
              rootMargin="200px"
            />
          )
        }
      })}
    </div>
  )
}