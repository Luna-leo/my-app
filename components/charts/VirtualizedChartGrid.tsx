'use client'

import { useRef, useState, useEffect, useCallback, useMemo, CSSProperties } from 'react'
import { FixedSizeGrid as Grid, GridChildComponentProps } from 'react-window'
import InfiniteLoader from 'react-window-infinite-loader'
import { getDataChartComponent } from '@/components/charts/ChartProvider'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'
import { DataResolution } from '@/hooks/useProgressiveChartData'

interface VirtualizedChartGridProps {
  charts: (ChartConfiguration & { id: string })[]
  selectedDataIds: number[]
  onEdit: (chartId: string) => void
  onDuplicate: (chartId: string) => void
  onDelete: (chartId: string) => void
  layoutOption?: LayoutOption | null
  samplingConfig?: SamplingConfig
  enableProgressive?: boolean
  enableWaterfall?: boolean
  waterfallDelay?: number
  onAllChartsLoaded?: () => void
  onChartLoaded?: (loadedCount: number) => void
  globalResolution?: DataResolution
  globalAutoUpgrade?: boolean
  enableBatchLoading?: boolean
  height?: number
  width?: number
}

interface ChartCellProps extends GridChildComponentProps {
  data: {
    charts: (ChartConfiguration & { id: string })[]
    selectedDataIds: number[]
    onEdit: (chartId: string) => void
    onDuplicate: (chartId: string) => void
    onDelete: (chartId: string) => void
    columnCount: number
    samplingConfig?: SamplingConfig
    enableProgressive?: boolean
    globalResolution?: DataResolution
    globalAutoUpgrade?: boolean
    maxAutoUpgradeResolution?: DataResolution
    loadedItems: Set<number>
    loadMoreItems: (startIndex: number, stopIndex: number) => Promise<void>
  }
}

const ChartCell = ({ columnIndex, rowIndex, style, data }: ChartCellProps) => {
  const {
    charts,
    selectedDataIds,
    onEdit,
    onDuplicate,
    onDelete,
    columnCount,
    samplingConfig,
    enableProgressive = true,
    globalResolution,
    globalAutoUpgrade,
    maxAutoUpgradeResolution,
    loadedItems
  } = data

  const chartIndex = rowIndex * columnCount + columnIndex
  const chart = charts[chartIndex]
  
  if (!chart) {
    return <div style={style} />
  }

  const ChartComponent = getDataChartComponent()
  const isLoaded = loadedItems.has(chartIndex)

  // Apply padding to create gap effect
  const paddedStyle: CSSProperties = {
    ...style,
    padding: 4 // 8px total gap between items
  }

  return (
    <div style={paddedStyle}>
      {isLoaded ? (
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
          globalResolution={globalResolution}
          globalAutoUpgrade={globalAutoUpgrade}
          maxAutoUpgradeResolution={maxAutoUpgradeResolution}
        />
      ) : (
        <div className="w-full h-full bg-muted animate-pulse rounded-lg" />
      )}
    </div>
  )
}

export function VirtualizedChartGrid({
  charts,
  selectedDataIds,
  onEdit,
  onDuplicate,
  onDelete,
  layoutOption,
  samplingConfig,
  enableProgressive = true,
  // enableWaterfall = false,
  // waterfallDelay = 500,
  onAllChartsLoaded,
  onChartLoaded,
  globalResolution,
  globalAutoUpgrade,
  // enableBatchLoading = false,
  height,
  width
}: VirtualizedChartGridProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [containerSize, setContainerSize] = useState({ width: width || 0, height: height || 0 })
  const [loadedItems, setLoadedItems] = useState<Set<number>>(new Set())

  // Calculate grid dimensions
  const columnCount = layoutOption?.cols || Math.min(4, Math.ceil(Math.sqrt(charts.length)))
  const rowCount = Math.ceil(charts.length / columnCount)

  // Calculate cell dimensions
  const columnWidth = Math.floor(containerSize.width / columnCount)
  const rowHeight = layoutOption 
    ? Math.floor(containerSize.height / (layoutOption.rows || 1))
    : Math.max(200, Math.floor(columnWidth / 1.5)) // Maintain aspect ratio

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return

    const updateSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect()
        setContainerSize({
          width: width || rect.width,
          height: height || rect.height || window.innerHeight - rect.top - 100
        })
      }
    }

    updateSize()

    const resizeObserver = new ResizeObserver(updateSize)
    resizeObserver.observe(containerRef.current)

    if (containerRef.current.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement)
    }

    return () => resizeObserver.disconnect()
  }, [width, height])

  // Calculate max auto-upgrade resolution
  const maxAutoUpgradeResolution = useMemo((): DataResolution => {
    if (layoutOption) {
      const gridSize = layoutOption.rows * layoutOption.cols
      return gridSize >= 9 ? 'normal' : 'high'
    }
    return charts.length >= 9 ? 'normal' : 'high'
  }, [layoutOption, charts.length])

  // Item loading for InfiniteLoader
  const loadMoreItems = useCallback(async (startIndex: number, stopIndex: number) => {
    const newLoadedItems = new Set(loadedItems)
    
    for (let i = startIndex; i <= stopIndex; i++) {
      newLoadedItems.add(i)
    }
    
    setLoadedItems(newLoadedItems)
    
    // Notify parent
    if (onChartLoaded) {
      onChartLoaded(newLoadedItems.size)
    }
    
    if (newLoadedItems.size === charts.length && onAllChartsLoaded) {
      onAllChartsLoaded()
    }
  }, [loadedItems, charts.length, onChartLoaded, onAllChartsLoaded])

  // Check if item is loaded
  const isItemLoaded = useCallback((index: number) => {
    return loadedItems.has(index)
  }, [loadedItems])

  // Prepare data for grid cells
  const itemData = useMemo(() => ({
    charts,
    selectedDataIds,
    onEdit,
    onDuplicate,
    onDelete,
    columnCount,
    samplingConfig,
    enableProgressive,
    globalResolution,
    globalAutoUpgrade,
    maxAutoUpgradeResolution,
    loadedItems,
    loadMoreItems
  }), [
    charts,
    selectedDataIds,
    onEdit,
    onDuplicate,
    onDelete,
    columnCount,
    samplingConfig,
    enableProgressive,
    globalResolution,
    globalAutoUpgrade,
    maxAutoUpgradeResolution,
    loadedItems,
    loadMoreItems
  ])

  // Reset loaded items when charts change
  useEffect(() => {
    setLoadedItems(new Set())
  }, [charts])

  if (containerSize.width === 0 || containerSize.height === 0) {
    return (
      <div ref={containerRef} className="w-full h-full flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full h-full overflow-hidden">
      <InfiniteLoader
        isItemLoaded={isItemLoaded}
        itemCount={charts.length}
        loadMoreItems={loadMoreItems}
        minimumBatchSize={columnCount * 2} // Load 2 rows at a time
        threshold={columnCount} // Start loading 1 row before end
      >
        {({ onItemsRendered, ref }) => (
          <Grid
            ref={ref}
            columnCount={columnCount}
            columnWidth={columnWidth}
            height={containerSize.height}
            rowCount={rowCount}
            rowHeight={rowHeight}
            width={containerSize.width}
            onItemsRendered={({
              visibleRowStartIndex,
              visibleRowStopIndex,
              visibleColumnStartIndex,
              visibleColumnStopIndex
            }) => {
              // Convert grid coordinates to linear indices
              const startIndex = visibleRowStartIndex * columnCount + visibleColumnStartIndex
              const stopIndex = visibleRowStopIndex * columnCount + visibleColumnStopIndex
              
              onItemsRendered({
                overscanStartIndex: Math.max(0, startIndex - columnCount),
                overscanStopIndex: Math.min(charts.length - 1, stopIndex + columnCount),
                visibleStartIndex: startIndex,
                visibleStopIndex: Math.min(charts.length - 1, stopIndex)
              })
            }}
            itemData={itemData}
            overscanRowCount={2}
            overscanColumnCount={1}
            className="scrollbar-thin scrollbar-thumb-gray-400 scrollbar-track-gray-100"
          >
            {ChartCell}
          </Grid>
        )}
      </InfiniteLoader>
    </div>
  )
}