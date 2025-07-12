'use client'

import { useEffect, useRef, memo, useCallback } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'
// Remove unused imports

interface UplotChartProps {
  data: uPlot.AlignedData
  options: uPlot.Options
  onCreate?: (chart: uPlot) => void
  onDestroy?: (chart: uPlot) => void
  className?: string
}

function UplotChartComponent({
  data,
  options,
  onCreate,
  onDestroy,
  className = ''
}: UplotChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<uPlot | null>(null)
  
  // Create chart
  const createChart = useCallback(() => {
    if (!containerRef.current || chartRef.current) return
    
    try {
      // Get the actual container dimensions
      const rect = containerRef.current.getBoundingClientRect()
      const actualWidth = rect.width || options.width
      const actualHeight = rect.height || options.height
      
      // Create options with actual dimensions
      const chartOptions = {
        ...options,
        width: actualWidth,
        height: actualHeight
      }
      
      const chart = new uPlot(chartOptions, data, containerRef.current)
      chartRef.current = chart
      
      if (onCreate) {
        onCreate(chart)
      }
    } catch (error) {
      console.error('[UplotChart] Error creating chart:', error)
    }
  }, [data, options, onCreate])
  
  // Update chart data
  const updateChart = useCallback(() => {
    if (!chartRef.current) return
    
    try {
      chartRef.current.setData(data, false)
    } catch (error) {
      console.error('[UplotChart] Error updating chart:', error)
    }
  }, [data])
  
  // Initialize chart
  useEffect(() => {
    // Delay chart creation to ensure container is properly sized
    const timeoutId = setTimeout(() => {
      createChart()
    }, 0)
    
    return () => {
      clearTimeout(timeoutId)
      if (chartRef.current) {
        if (onDestroy) {
          onDestroy(chartRef.current)
        }
        chartRef.current.destroy()
        chartRef.current = null
      }
    }
  }, [createChart, onDestroy])
  
  // Update data when it changes
  useEffect(() => {
    if (chartRef.current) {
      updateChart()
    }
  }, [data, updateChart])
  
  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return
    
    const resizeObserver = new ResizeObserver((entries) => {
      if (entries[0]) {
        const { width, height } = entries[0].contentRect
        
        // Only update if we have valid dimensions
        if (width > 0 && height > 0) {
          if (chartRef.current) {
            chartRef.current.setSize({ width, height })
          } else {
            // If chart doesn't exist yet but we have dimensions, try creating it
            createChart()
          }
        }
      }
    })
    
    resizeObserver.observe(containerRef.current)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [createChart])
  
  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full ${className}`}
    />
  )
}

// Memoize component to prevent unnecessary re-renders
export const UplotChart = memo(UplotChartComponent, (prevProps, nextProps) => {
  // Custom comparison function - optimized for performance
  if (
    prevProps.className !== nextProps.className ||
    prevProps.onCreate !== nextProps.onCreate ||
    prevProps.onDestroy !== nextProps.onDestroy
  ) {
    return false;
  }
  
  // Efficient data comparison
  if (prevProps.data === nextProps.data) {
    // Same reference, no change
  } else if (!prevProps.data || !nextProps.data) {
    return false;
  } else if (prevProps.data.length !== nextProps.data.length) {
    return false;
  } else {
    // For very large datasets, consider implementing a version-based check
    // For now, assume data has changed if references are different
    return false;
  }
  
  // For options, check common properties that change
  if (prevProps.options === nextProps.options) {
    return true;
  }
  
  if (!prevProps.options || !nextProps.options) {
    return false;
  }
  
  // Check key option properties that typically change
  return (
    prevProps.options.width === nextProps.options.width &&
    prevProps.options.height === nextProps.options.height &&
    prevProps.options.title === nextProps.options.title &&
    prevProps.options.series?.length === nextProps.options.series?.length
  );
})