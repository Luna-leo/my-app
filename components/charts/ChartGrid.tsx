'use client'

import { getDataChartComponent } from '@/components/charts/ChartProvider'
import { LazyChart } from '@/components/charts/LazyChart'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'

interface ChartGridProps {
  charts: (ChartConfiguration & { id: string })[]
  onEdit: (chartId: string) => void
  onDuplicate: (chartId: string) => void
  onDelete: (chartId: string) => void
}

export function ChartGrid({ charts, onEdit, onDuplicate, onDelete }: ChartGridProps) {
  const ChartComponent = getDataChartComponent()

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {charts.map((chart, index) => {
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