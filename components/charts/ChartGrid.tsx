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
import { DataResolution } from '@/hooks/useProgressiveChartData'

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
  globalResolution?: DataResolution
  globalAutoUpgrade?: boolean
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
  onChartLoaded,
  globalResolution,
  globalAutoUpgrade
}: ChartGridProps) {
  const ChartComponent = getDataChartComponent(enableProgressive)
  const containerRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState<string>('100%')
  const [itemHeight, setItemHeight] = useState<string>('auto')
  
  // Calculate the number of charts per page early
  const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
  
  // State to track which charts should be rendered (for old stagger mode)
  const [renderedCharts, setRenderedCharts] = useState<Set<number>>(new Set())
  
  // State for waterfall loading
  const [waterfallLoadedCharts, setWaterfallLoadedCharts] = useState<Set<number>>(new Set())
  const [currentWaterfallIndex, setCurrentWaterfallIndex] = useState(0)
  
  // Calculate global index for charts when pagination is enabled
  const getGlobalChartIndex = useCallback((localIndex: number) => {
    if (paginationEnabled && layoutOption) {
      const chartsPerPage = layoutOption.rows * layoutOption.cols
      return (currentPage - 1) * chartsPerPage + localIndex
    }
    return localIndex
  }, [paginationEnabled, layoutOption, currentPage])
  
  // Waterfall loading callback
  const handleWaterfallLoadComplete = useCallback((localIndex: number) => {
    console.log('[ChartGrid] handleWaterfallLoadComplete called for localIndex:', localIndex, 'currentWaterfallIndex:', currentWaterfallIndex)
    const globalIndex = getGlobalChartIndex(localIndex)
    setWaterfallLoadedCharts(prev => {
      const newSet = new Set(prev)
      newSet.add(globalIndex)
      console.log('[ChartGrid] waterfallLoadedCharts updated:', Array.from(newSet))
      return newSet
    })
    
    // Trigger next chart after delay
    if (enableWaterfall) {
      console.log('[ChartGrid] Scheduling next chart load after', waterfallDelay, 'ms')
      setTimeout(() => {
        setCurrentWaterfallIndex(prev => {
          const next = prev + 1
          console.log('[ChartGrid] Incrementing waterfall index from', prev, 'to', next)
          return next
        })
      }, waterfallDelay)
    }
  }, [enableWaterfall, waterfallDelay, getGlobalChartIndex])
  
  // Notify parent of loading progress
  useEffect(() => {
    if (onChartLoaded) {
      // Count only the charts loaded on the current page
      const pageStartIndex = paginationEnabled && layoutOption ? (currentPage - 1) * chartsPerPage : 0
      const visibleCount = paginationEnabled && layoutOption 
        ? Math.min(chartsPerPage, charts.length - pageStartIndex)
        : Math.min(chartsPerPage, charts.length)
      
      let loadedOnCurrentPage = 0
      for (let i = 0; i < visibleCount; i++) {
        const globalIndex = getGlobalChartIndex(i)
        if (waterfallLoadedCharts.has(globalIndex)) {
          loadedOnCurrentPage++
        }
      }
      
      onChartLoaded(loadedOnCurrentPage)
    }
  }, [waterfallLoadedCharts, onChartLoaded, layoutOption, paginationEnabled, currentPage, charts.length, chartsPerPage, getGlobalChartIndex])
  
  // Reset waterfall loading when charts array changes or page changes
  useEffect(() => {
    console.log(`[ChartGrid] Reset effect triggered - enableWaterfall: ${enableWaterfall}, chartsLength: ${charts.length}, currentPage: ${currentPage}`)
    if (enableWaterfall) {
      // Reset the current waterfall index when page changes
      console.log('[ChartGrid] Resetting waterfall index to 0')
      setCurrentWaterfallIndex(0)
      // Clear loaded charts for the current page when page changes
      if (paginationEnabled) {
        console.log('[ChartGrid] Clearing waterfall loaded charts')
        setWaterfallLoadedCharts(new Set())
      }
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
  }, [charts.length, enableWaterfall, currentPage, paginationEnabled]) // Reset when page changes
  
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
  
  // Check if all visible charts are loaded (for waterfall mode)
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
          const shouldLoad = index <= currentWaterfallIndex
          console.log('[ChartGrid] Rendering chart', index, 'id:', chart.id, 'shouldLoad:', shouldLoad, 'currentWaterfallIndex:', currentWaterfallIndex)
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
                shouldLoad={shouldLoad}
                globalResolution={globalResolution}
                globalAutoUpgrade={globalAutoUpgrade}
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
                  globalResolution={globalResolution}
                  globalAutoUpgrade={globalAutoUpgrade}
                />
              </div>
            )
          }
        }
      })}
    </div>
  )
}