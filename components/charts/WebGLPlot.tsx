'use client'

import { useEffect, useRef, useState } from 'react'

interface WebGLPlotProps {
  aspectRatio?: number // width / height ratio, default 2
  lineColor?: { r: number; g: number; b: number; a?: number }
  updateFunction?: (data: Array<{x: number, y: number}>, frame: number) => Array<{x: number, y: number}>
  className?: string
}

// Dynamic import for TimeChart to avoid SSR issues
const loadTimeChart = () => import('timechart')

export function WebGLPlotComponent({
  aspectRatio = 2,
  lineColor = { r: 0.1, g: 0.5, b: 0.9, a: 1 },
  updateFunction,
  className = ''
}: WebGLPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const frameRef = useRef(0)
  const updateFunctionRef = useRef(updateFunction)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const dataRef = useRef<Array<{x: number, y: number}>>([])
  const [isChartReady, setIsChartReady] = useState(false)

  // Update the ref whenever updateFunction changes
  useEffect(() => {
    updateFunctionRef.current = updateFunction
  }, [updateFunction])

  // Handle resize with ResizeObserver
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const width = entry.contentRect.width
        const height = width / aspectRatio
        setDimensions({ width, height })
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [aspectRatio])

  // Initialize TimeChart
  useEffect(() => {
    if (dimensions.width === 0) return

    let timeoutId: NodeJS.Timeout
    let disposed = false

    const initChart = async () => {
      try {
        // Wait a bit to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100))
        
        if (disposed) return
        
        // Ensure element is available
        if (!canvasRef.current || !(canvasRef.current instanceof HTMLElement)) {
          console.error('Canvas ref is not an HTML element, retrying...')
          // Retry after a short delay
          timeoutId = setTimeout(() => {
            if (!disposed) initChart()
          }, 100)
          return
        }

        // Initialize data with sine wave
        if (dataRef.current.length === 0) {
          const numPoints = Math.round(dimensions.width)
          const freq = 0.001
          const amp = 0.5
          for (let i = 0; i < numPoints; i++) {
            const x = i / numPoints * 2 - 1 // Normalize to -1 to 1 range
            const y = Math.sin(2 * Math.PI * i * freq) * amp
            dataRef.current.push({ x, y })
          }
        }

        // Load TimeChart module
        const TimeChartModule = await loadTimeChart()
        const TimeChart = TimeChartModule.default || TimeChartModule.core || TimeChartModule.TimeChart

        // Create TimeChart if it doesn't exist
        if (!chartRef.current) {
          // Convert color from 0-1 range to CSS color
          const cssColor = `rgba(${Math.round(lineColor.r * 255)}, ${Math.round(lineColor.g * 255)}, ${Math.round(lineColor.b * 255)}, ${lineColor.a || 1})`
          
          if (!canvasRef.current) {
            console.error('canvasRef.current is null at TimeChart creation')
            return
          }
          
          chartRef.current = new TimeChart(canvasRef.current, {
            series: [{
              data: dataRef.current,
              color: cssColor,
              lineWidth: 2,
              name: 'Line'
            }],
            xRange: { min: -1, max: 1 },
            yRange: { min: -1, max: 1 }
          })
          
          setIsChartReady(true)
        }

        // Handle resize
        if (chartRef.current && dimensions.width > 0) {
          canvasRef.current.style.width = `${dimensions.width}px`
          canvasRef.current.style.height = `${dimensions.height}px`
        }
      } catch (err) {
        console.error('Failed to initialize TimeChart:', err)
      }
    }

    initChart()

    // Cleanup function
    return () => {
      disposed = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [dimensions, lineColor])

  // Animation loop
  useEffect(() => {
    if (!chartRef.current || !isChartReady) return

    // Default update function if none provided
    const defaultUpdate = (data: Array<{x: number, y: number}>, frame: number) => {
      const freq = 0.001
      const amp = 0.5
      const speed = 0.02
      
      return data.map((point, i) => ({
        x: point.x,
        y: Math.sin(2 * Math.PI * i * freq + frame * speed) * amp
      }))
    }

    // Animation loop
    const animate = () => {
      frameRef.current++
      
      if (chartRef.current && dataRef.current) {
        // Update data
        if (updateFunctionRef.current) {
          dataRef.current = updateFunctionRef.current(dataRef.current, frameRef.current)
        } else {
          dataRef.current = defaultUpdate(dataRef.current, frameRef.current)
        }
        
        // Update chart
        chartRef.current.options.series[0].data = dataRef.current
        chartRef.current.update()
      }
      
      animationRef.current = requestAnimationFrame(animate)
    }

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    
    // Start new animation
    animate()

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [dimensions, isChartReady])

  // Cleanup chart on unmount
  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.dispose()
      }
    }
  }, [])

  return (
    <div 
      ref={containerRef} 
      className={`w-full ${className}`}
      style={{ height: dimensions.height || 'auto' }}
    >
      <div
        ref={canvasRef}
        className="border border-border rounded-lg w-full h-full"
      />
    </div>
  )
}