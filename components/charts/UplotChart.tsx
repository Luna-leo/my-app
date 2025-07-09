'use client'

import { useEffect, useRef, memo, useCallback } from 'react'
import uPlot from 'uplot'
import 'uplot/dist/uPlot.min.css'

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
      const chart = new uPlot(options, data, containerRef.current)
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
    createChart()
    
    return () => {
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
    if (!chartRef.current || !containerRef.current) return
    
    const resizeObserver = new ResizeObserver((entries) => {
      if (chartRef.current && entries[0]) {
        const { width, height } = entries[0].contentRect
        chartRef.current.setSize({ width, height })
      }
    })
    
    resizeObserver.observe(containerRef.current)
    
    return () => {
      resizeObserver.disconnect()
    }
  }, [])
  
  return (
    <div 
      ref={containerRef} 
      className={`w-full h-full ${className}`}
    />
  )
}

// Memoize component to prevent unnecessary re-renders
export const UplotChart = memo(UplotChartComponent, (prevProps, nextProps) => {
  // Custom comparison function
  return (
    prevProps.className === nextProps.className &&
    prevProps.onCreate === nextProps.onCreate &&
    prevProps.onDestroy === nextProps.onDestroy &&
    JSON.stringify(prevProps.data) === JSON.stringify(nextProps.data) &&
    JSON.stringify(prevProps.options) === JSON.stringify(nextProps.options)
  )
})