'use client'

import { useRef, RefObject, useState, useEffect, useCallback, useMemo } from 'react'
import { getDataChartComponent } from '@/components/charts/ChartProvider'
import { LazyChart } from '@/components/charts/LazyChart'
import { WaterfallChartLoader } from '@/components/charts/WaterfallChartLoader'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { cn } from '@/lib/utils'
import { useDynamicGridAspectRatio } from '@/hooks/useDynamicGridAspectRatio'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'
import { DataResolution } from '@/hooks/useProgressiveChartData'
import { useBatchChartData } from '@/hooks/useBatchChartData'

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
  enableBatchLoading?: boolean
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
  enableProgressive = true,
  enableWaterfall = false,
  waterfallDelay = 500,
  onAllChartsLoaded,
  onChartLoaded,
  globalResolution,
  globalAutoUpgrade,
  enableBatchLoading = false
}: ChartGridProps) {
  const ChartComponent = getDataChartComponent()
  const containerRef = useRef<HTMLDivElement>(null)
  const [gridHeight, setGridHeight] = useState<string>('100%')
  const [itemHeight, setItemHeight] = useState<string>('auto')
  
  // Calculate the number of charts per page early
  const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
  
  // Calculate visible charts based on pagination - moved up to avoid reference errors
  const visibleCharts = useMemo(() => {
    if (paginationEnabled && layoutOption) {
      const startIndex = (currentPage - 1) * chartsPerPage
      const endIndex = startIndex + chartsPerPage
      return charts.slice(startIndex, endIndex)
    } else if (layoutOption) {
      // Without pagination, show only what fits in the layout
      return charts.slice(0, chartsPerPage)
    } else {
      // Show all charts in responsive mode
      return charts
    }
  }, [charts, paginationEnabled, layoutOption, currentPage, chartsPerPage])
  
  // Prepare charts with selectedDataIds for batch loading
  const chartsWithData = useMemo(() => {
    return visibleCharts.map(chart => ({
      ...chart,
      selectedDataIds
    }))
  }, [visibleCharts, selectedDataIds])
  
  // Use batch loading if enabled
  const batchDataResult = useBatchChartData(chartsWithData, {
    enabled: enableBatchLoading && !enableWaterfall, // Don't use batch loading with waterfall mode
    enableSampling: samplingConfig,
    onProgress: (loaded, total) => {
      console.log(`[ChartGrid] Batch loading progress: ${loaded}/${total}`)
    }
  })
  
  // Log batch loading results
  useEffect(() => {
    if (enableBatchLoading && batchDataResult.dataMap.size > 0) {
      console.log(`[ChartGrid] Batch loaded data for ${batchDataResult.dataMap.size} charts`)
    }
  }, [enableBatchLoading, batchDataResult.dataMap])
  
  // State to track which charts should be rendered (for old stagger mode)
  const [renderedCharts, setRenderedCharts] = useState<Set<number>>(new Set())
  
  // State for waterfall loading - using chart IDs instead of indices
  const [waterfallLoadedCharts, setWaterfallLoadedCharts] = useState<Map<string, boolean>>(new Map())
  const [currentWaterfallIndex, setCurrentWaterfallIndex] = useState(0)
  
  // Waterfall loading callback
  const handleWaterfallLoadComplete = useCallback((localIndex: number, chartId: string) => {
    setWaterfallLoadedCharts(prev => {
      const newMap = new Map(prev)
      newMap.set(chartId, true)
      return newMap
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
    if (onChartLoaded) {
      // Count loaded charts on the current page
      const loadedOnCurrentPage = visibleCharts.filter(chart => 
        waterfallLoadedCharts.get(chart.id) === true
      ).length
      
      onChartLoaded(loadedOnCurrentPage)
    }
  }, [waterfallLoadedCharts, onChartLoaded, visibleCharts])
  
  // Reset waterfall loading when charts array changes or page changes
  useEffect(() => {
    if (enableWaterfall) {
      // When charts change, check if we need to load new charts
      setWaterfallLoadedCharts(prev => {
        const newMap = new Map(prev)
        // Remove charts that no longer exist
        for (const [chartId] of newMap) {
          if (!charts.find(c => c.id === chartId)) {
            newMap.delete(chartId)
          }
        }
        return newMap
      })
      
      // Reset currentWaterfallIndex when charts change
      setCurrentWaterfallIndex(0)
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
  }, [charts, enableWaterfall, currentPage, paginationEnabled]) // Watch full charts array for changes
  
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
      const gridGap = 0 // gap-0
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
    gap: 0,
    minChartHeight: getMinChartHeight(layoutOption?.rows || 1),
    cardPadding: 0 // No padding with p-0
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
  
  // visibleCharts already calculated above with useMemo
  
  // Ensure currentWaterfallIndex covers all visible charts that need loading
  useEffect(() => {
    if (enableWaterfall && visibleCharts.length > 0) {
      // Find the last unloaded chart index
      let lastUnloadedIndex = -1
      visibleCharts.forEach((chart, index) => {
        if (!waterfallLoadedCharts.get(chart.id)) {
          lastUnloadedIndex = index
        }
      })
      
      // If there are unloaded charts, ensure currentWaterfallIndex reaches them
      if (lastUnloadedIndex >= 0 && currentWaterfallIndex < lastUnloadedIndex) {
        // Start loading from the first unloaded chart
        const firstUnloadedIndex = visibleCharts.findIndex(chart => !waterfallLoadedCharts.get(chart.id))
        if (firstUnloadedIndex >= 0) {
          setCurrentWaterfallIndex(firstUnloadedIndex)
        }
      }
    }
  }, [enableWaterfall, visibleCharts, waterfallLoadedCharts, currentWaterfallIndex])
  
  // Determine aspect ratio: use dynamic for fixed layouts, default for responsive
  const aspectRatio = layoutOption ? dynamicAspectRatio : 1.5
  
  // Calculate maximum auto-upgrade resolution based on chart count
  const calculateMaxAutoUpgradeResolution = useCallback((): DataResolution => {
    const chartCount = visibleCharts.length;
    
    // For 16 or more charts (4x4 grid), limit to 'normal'
    if (chartCount >= 16) {
      return 'normal';
    }
    // For 9-15 charts (3x3 to 3x5), also limit to 'normal' for better performance
    if (chartCount >= 9) {
      return 'normal';
    }
    // For 8 or fewer charts, allow up to 'high'
    return 'high';
  }, [visibleCharts.length]);
  
  const maxAutoUpgradeResolution = calculateMaxAutoUpgradeResolution();
  
  // Check if all visible charts are loaded (for waterfall mode)
  useEffect(() => {
    if (enableWaterfall && visibleCharts.length > 0 && onAllChartsLoaded) {
      const allLoaded = visibleCharts.every(chart => waterfallLoadedCharts.get(chart.id) === true)
      if (allLoaded) {
        onAllChartsLoaded()
      }
    }
  }, [enableWaterfall, waterfallLoadedCharts, visibleCharts, onAllChartsLoaded])

  return (
    <div 
      ref={containerRef} 
      className={cn('grid gap-0', getGridClassName())}
      style={{ height: gridHeight }}
    >
      {visibleCharts.map((chart, index) => {
        if (enableWaterfall) {
          // Waterfall mode: load charts one by one
          const isAlreadyLoaded = waterfallLoadedCharts.get(chart.id) === true
          const shouldLoad = isAlreadyLoaded || index <= currentWaterfallIndex
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
                onLoadComplete={(index) => handleWaterfallLoadComplete(index, chart.id)}
                shouldLoad={shouldLoad}
                globalResolution={globalResolution}
                globalAutoUpgrade={globalAutoUpgrade}
                maxAutoUpgradeResolution={maxAutoUpgradeResolution}
                showSkeleton={true}
                isAlreadyLoaded={isAlreadyLoaded}
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
                  maxAutoUpgradeResolution={maxAutoUpgradeResolution}
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
                  maxAutoUpgradeResolution={maxAutoUpgradeResolution}
                />
              </div>
            )
          }
        }
      })}
    </div>
  )
}