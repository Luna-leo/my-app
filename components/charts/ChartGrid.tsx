'use client'

import { useRef, RefObject, useState, useEffect, useCallback } from 'react'
import { getDataChartComponent } from '@/components/charts/ChartProvider'
import { LazyChart } from '@/components/charts/LazyChart'
import { WaterfallChartLoader } from '@/components/charts/WaterfallChartLoader'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { cn } from '@/lib/utils'
import { useDynamicGridAspectRatio } from '@/hooks/useDynamicGridAspectRatio'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'

interface ChartGridProps {
  charts: (ChartConfiguration & { id: string })[]
  selectedDataIds: number[]
  onEdit: (chartId: string) => void
  onDuplicate: (chartId: string) => void
  onDelete: (chartId: string) => void
  layoutOption?: LayoutOption | null
  paginationEnabled?: boolean
  currentPage?: number
  samplingConfig?: SamplingConfig
  enableProgressive?: boolean
  enableWaterfall?: boolean
  waterfallDelay?: number
  onAllChartsLoaded?: () => void
  onChartLoaded?: (loadedCount: number) => void
}

export function ChartGrid({ 
  charts, 
  selectedDataIds,
  onEdit, 
  onDuplicate, 
  onDelete, 
  layoutOption,
  paginationEnabled = false,
  currentPage = 1,
  samplingConfig,
  enableProgressive = false,
  enableWaterfall = false,
  waterfallDelay = 500,
  onAllChartsLoaded,
  onChartLoaded
}: ChartGridProps) {
  const ChartComponent = getDataChartComponent(enableProgressive)
  const containerRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState<string>('100%')
  const [itemHeight, setItemHeight] = useState<string>('auto')
  
  // State to track which charts should be rendered (for old stagger mode)
  const [renderedCharts, setRenderedCharts] = useState<Set<number>>(new Set())
  
  // State for waterfall loading
  const [waterfallLoadedCharts, setWaterfallLoadedCharts] = useState<Set<number>>(new Set())
  const [currentWaterfallIndex, setCurrentWaterfallIndex] = useState(0)
  
  // Waterfall loading callback
  const handleWaterfallLoadComplete = useCallback((index: number) => {
    setWaterfallLoadedCharts(prev => {
      const newSet = new Set(prev)
      newSet.add(index)
      return newSet
    })
    
    // Trigger next chart after delay
    if (enableWaterfall) {
      setTimeout(() => {
        setCurrentWaterfallIndex(prev => prev + 1)
      }, waterfallDelay)
    }
  }, [enableWaterfall, waterfallDelay])
  
  // Notify parent of loading progress
  useEffect(() => {
    if (onChartLoaded && waterfallLoadedCharts.size > 0) {
      onChartLoaded(waterfallLoadedCharts.size)
    }
  }, [waterfallLoadedCharts.size, onChartLoaded])
  
  // Stagger the loading of the first 4 charts (old mode)
  useEffect(() => {
    if (enableWaterfall) {
      // In waterfall mode, start with first chart
      setCurrentWaterfallIndex(0)
      setWaterfallLoadedCharts(new Set())
    } else {
      // Old stagger mode
      const delays = [0, 100, 200, 300] // Stagger by 100ms each
      const timeouts: NodeJS.Timeout[] = []
      
      delays.forEach((delay, index) => {
        if (index < charts.length) {
          const timeout = setTimeout(() => {
            setRenderedCharts(prev => new Set(prev).add(index))
          }, delay)
          timeouts.push(timeout)
        }
      })
      
      return () => {
        timeouts.forEach(clearTimeout)
      }
    }
  }, [charts.length, enableWaterfall])
  
  // Calculate grid height to ensure it fits in the container
  useEffect(() => {
    if (!containerRef.current || !layoutOption) {
      setGridHeight('100%')
      return
    }
    
    const calculateGridHeight = () => {
      const container = containerRef.current
      if (!container || !container.parentElement) return
      
      const parentHeight = container.parentElement.clientHeight
      const gridGap = 16 // gap-4
      const totalGaps = (layoutOption.rows - 1) * gridGap
      const rowHeight = (parentHeight - totalGaps) / layoutOption.rows
      const totalHeight = rowHeight * layoutOption.rows + totalGaps
      
      setGridHeight(`${totalHeight}px`)
      setItemHeight(`${rowHeight}px`)
    }
    
    calculateGridHeight()
    
    const resizeObserver = new ResizeObserver(calculateGridHeight)
    if (containerRef.current.parentElement) {
      resizeObserver.observe(containerRef.current.parentElement)
    }
    
    return () => resizeObserver.disconnect()
  }, [layoutOption])
  
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
    gap: 16,
    minChartHeight: getMinChartHeight(layoutOption?.rows || 1),
    cardPadding: 52 // Card vertical padding: py-3(24px) + header(12px) + content(12px) + inner div(4px)
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
  
  // Check if all charts are loaded (for waterfall mode)
  useEffect(() => {
    if (enableWaterfall && waterfallLoadedCharts.size === visibleCharts.length && visibleCharts.length > 0 && onAllChartsLoaded) {
      onAllChartsLoaded()
    }
  }, [enableWaterfall, waterfallLoadedCharts.size, visibleCharts.length, onAllChartsLoaded])

  return (
    <div 
      ref={containerRef} 
      className={cn('grid gap-4', getGridClassName())}
      style={{ height: gridHeight }}
    >
      {visibleCharts.map((chart, index) => {
        if (enableWaterfall) {
          // Waterfall mode: load charts one by one
          return (
            <div key={chart.id} style={{ height: itemHeight }} className="w-full">
              <WaterfallChartLoader
                config={chart}
                selectedDataIds={selectedDataIds}
                aspectRatio={aspectRatio}
                className="w-full h-full"
                onEdit={() => onEdit(chart.id)}
                onDuplicate={() => onDuplicate(chart.id)}
                onDelete={() => onDelete(chart.id)}
                samplingConfig={samplingConfig}
                enableProgressive={enableProgressive}
                index={index}
                onLoadComplete={handleWaterfallLoadComplete}
                shouldLoad={index <= currentWaterfallIndex}
                showSkeleton={true}
              />
            </div>
          )
        } else {
          // Old mode: stagger first 4, lazy load rest
          if (index < 4) {
            // Only render if this chart's index has been added to renderedCharts
            if (!renderedCharts.has(index)) {
              // Return placeholder to maintain grid layout
              return <div key={chart.id} className="w-full" style={{ height: itemHeight, aspectRatio: layoutOption ? undefined : aspectRatio }} />
            }
            
            return (
              <div key={chart.id} style={{ height: itemHeight }} className="w-full">
                <ChartComponent
                  config={chart}
                  selectedDataIds={selectedDataIds}
                  aspectRatio={aspectRatio}
                  className="w-full h-full"
                  onEdit={() => onEdit(chart.id)}
                  onDuplicate={() => onDuplicate(chart.id)}
                  onDelete={() => onDelete(chart.id)}
                  samplingConfig={samplingConfig}
                  enableProgressive={enableProgressive}
                />
              </div>
            )
          } else {
            return (
              <div key={chart.id} style={{ height: itemHeight }} className="w-full">
                <LazyChart
                  config={chart}
                  selectedDataIds={selectedDataIds}
                  aspectRatio={aspectRatio}
                  className="w-full h-full"
                  onEdit={() => onEdit(chart.id)}
                  onDuplicate={() => onDuplicate(chart.id)}
                  onDelete={() => onDelete(chart.id)}
                  rootMargin="200px"
                  samplingConfig={samplingConfig}
                />
              </div>
            )
          }
        }
      })}
    </div>
  )
}