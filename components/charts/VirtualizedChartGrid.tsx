'use client'

import { useRef, memo } from 'react'
import { FixedSizeGrid as Grid, GridChildComponentProps } from 'react-window'
import { getDataChartComponent } from '@/components/charts/ChartProvider'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { cn } from '@/lib/utils'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'

interface VirtualizedChartGridProps {
  charts: (ChartConfiguration & { id: string })[]
  selectedDataIds: number[]
  onEdit: (chartId: string) => void
  onDuplicate: (chartId: string) => void
  onDelete: (chartId: string) => void
  layoutOption: LayoutOption
  samplingConfig?: SamplingConfig
  enableProgressive?: boolean
  height: number
  width: number
}

interface CellData {
  charts: (ChartConfiguration & { id: string })[]
  selectedDataIds: number[]
  onEdit: (chartId: string) => void
  onDuplicate: (chartId: string) => void
  onDelete: (chartId: string) => void
  samplingConfig?: SamplingConfig
  enableProgressive?: boolean
  columnCount: number
}

const Cell = memo(({ columnIndex, rowIndex, style, data }: GridChildComponentProps<CellData>) => {
  const {
    charts,
    selectedDataIds,
    onEdit,
    onDuplicate,
    onDelete,
    samplingConfig,
    enableProgressive,
    columnCount
  } = data

  const chartIndex = rowIndex * columnCount + columnIndex
  const chart = charts[chartIndex]

  if (!chart) {
    return <div style={style} />
  }

  const ChartComponent = getDataChartComponent()

  return (
    <div style={style} className="p-2">
      <ChartComponent
        config={chart}
        selectedDataIds={selectedDataIds}
        aspectRatio={1.5}
        className="w-full h-full"
        onEdit={() => onEdit(chart.id)}
        onDuplicate={() => onDuplicate(chart.id)}
        onDelete={() => onDelete(chart.id)}
        samplingConfig={samplingConfig}
        enableProgressive={enableProgressive}
      />
    </div>
  )
})

Cell.displayName = 'VirtualizedChartCell'

export function VirtualizedChartGrid({
  charts,
  selectedDataIds,
  onEdit,
  onDuplicate,
  onDelete,
  layoutOption,
  samplingConfig,
  enableProgressive = true,
  height,
  width
}: VirtualizedChartGridProps) {
  const gridRef = useRef<Grid>(null)
  
  const columnCount = layoutOption.cols
  const rowCount = Math.ceil(charts.length / columnCount)
  
  // Calculate item dimensions including padding
  const gap = 16 // 4 * 4px (gap-4)
  const columnWidth = (width - gap * (columnCount - 1)) / columnCount
  const rowHeight = (height - gap * (rowCount - 1)) / layoutOption.rows
  
  const itemData: CellData = {
    charts,
    selectedDataIds,
    onEdit,
    onDuplicate,
    onDelete,
    samplingConfig,
    enableProgressive,
    columnCount
  }

  // Handle scroll to specific chart (currently unused but may be needed for future features)
  // const scrollToChart = useCallback((chartIndex: number) => {
  //   if (gridRef.current) {
  //     const rowIndex = Math.floor(chartIndex / columnCount)
  //     const columnIndex = chartIndex % columnCount
  //     gridRef.current.scrollToItem({
  //       columnIndex,
  //       rowIndex,
  //       align: 'center'
  //     })
  //   }
  // }, [columnCount])

  return (
    <Grid
      ref={gridRef}
      columnCount={columnCount}
      columnWidth={columnWidth}
      height={height}
      rowCount={rowCount}
      rowHeight={rowHeight}
      width={width}
      itemData={itemData}
      className={cn("scrollbar-thin scrollbar-thumb-gray-300")}
      overscanRowCount={1}
      overscanColumnCount={1}
    >
      {Cell}
    </Grid>
  )
}

// Hook to determine if virtualization should be used
export function useVirtualization(chartCount: number, threshold: number = 16) {
  return chartCount > threshold
}