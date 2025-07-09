'use client'

import { getDataChartComponent } from '@/components/charts/ChartProvider'
import { LazyChart } from '@/components/charts/LazyChart'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { cn } from '@/lib/utils'

interface ChartGridProps {
  charts: (ChartConfiguration & { id: string })[]
  onEdit: (chartId: string) => void
  onDuplicate: (chartId: string) => void
  onDelete: (chartId: string) => void
  layoutOption?: LayoutOption | null
}

export function ChartGrid({ charts, onEdit, onDuplicate, onDelete, layoutOption }: ChartGridProps) {
  const ChartComponent = getDataChartComponent()

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

  // Calculate the number of visible charts based on layout
  const maxVisibleCharts = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
  const visibleCharts = charts.slice(0, maxVisibleCharts)

  return (
    <div className={cn('grid gap-4', getGridClassName())}>
      {visibleCharts.map((chart, index) => {
        // First 4 charts load immediately, rest use lazy loading
        if (index < 4) {
          return (
            <ChartComponent
              key={chart.id}
              config={chart}
              aspectRatio={1.5}
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
              aspectRatio={1.5}
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