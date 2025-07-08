'use client'

import { useEffect, useRef, useState } from 'react'
import { useChartDimensions, AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'

// Dynamic import for Plotly to avoid SSR issues

interface PlotlyChartProps {
  aspectRatio?: number | AspectRatioPreset // width / height ratio, default 1.3
  lineColor?: { r: number; g: number; b: number; a?: number }
  updateFunction?: (data: Array<{x: number, y: number}>, frame: number) => Array<{x: number, y: number}>
  className?: string
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
}

export function PlotlyChartComponent({
  aspectRatio = 1.3,
  lineColor = { r: 0.1, g: 0.5, b: 0.9, a: 1 },
  updateFunction,
  className = ''
}: PlotlyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const frameRef = useRef(0)
  const updateFunctionRef = useRef(updateFunction)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const dataRef = useRef<Array<{x: number, y: number}>>([])
  const [isPlotlyReady, setIsPlotlyReady] = useState(false)
  const plotlyRef = useRef<typeof import('plotly.js-gl2d-dist')>(null)
  const hasPlotRef = useRef(false)

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

  // Initialize Plotly
  useEffect(() => {
    if (dimensions.width === 0) return

    let timeoutId: NodeJS.Timeout
    let disposed = false

    const initPlot = async () => {
      try {
        // Wait a bit to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100))
        
        if (disposed) return
        
        // Ensure element is available
        if (!plotRef.current || !(plotRef.current instanceof HTMLElement)) {
          console.error('Plot ref is not an HTML element, retrying...')
          // Retry after a short delay
          timeoutId = setTimeout(() => {
            if (!disposed) initPlot()
          }, 100)
          return
        }

        // Initialize data with sine wave
        if (dataRef.current.length === 0) {
          const numPoints = Math.min(500, Math.round(dimensions.width)) // Limit points for performance
          const freq = 0.001
          const amp = 0.5
          for (let i = 0; i < numPoints; i++) {
            const x = i / numPoints * 2 - 1 // Normalize to -1 to 1 range
            const y = Math.sin(2 * Math.PI * i * freq) * amp
            dataRef.current.push({ x, y })
          }
        }

        // Load Plotly module
        const Plotly = await import('plotly.js-gl2d-dist')
        plotlyRef.current = Plotly

        // Create plot if it doesn't exist
        if (!hasPlotRef.current) {
          // Convert color from 0-1 range to CSS color
          const cssColor = `rgba(${Math.round(lineColor.r * 255)}, ${Math.round(lineColor.g * 255)}, ${Math.round(lineColor.b * 255)}, ${lineColor.a || 1})`
          
          const trace = {
            x: dataRef.current.map(d => d.x),
            y: dataRef.current.map(d => d.y),
            type: 'scattergl' as const,
            mode: 'lines' as const,
            line: {
              color: cssColor,
              width: 2
            },
            name: 'Line'
          }

          const layout = {
            xaxis: { 
              range: [-1, 1],
              title: { text: '' },
              zeroline: false,
              automargin: false
            },
            yaxis: { 
              range: [-1, 1],
              title: { text: '' },
              zeroline: false,
              automargin: false
            },
            margin: { t: 40, r: 10, b: 30, l: 40, pad: 0 },
            showlegend: false,
            hovermode: false as const,
            dragmode: 'pan' as const,
            paper_bgcolor: 'transparent',
            plot_bgcolor: 'transparent',
            autosize: false,
            width: dimensions.width,
            height: dimensions.height,
            title: {
              text: '',
              font: { size: 1 },
              pad: { t: 0, r: 0, b: 0, l: 0 }
            }
          }

          const config = {
            displayModeBar: 'hover' as const,
            displaylogo: false,
            responsive: false,
            scrollZoom: true,
            modeBarButtonsToRemove: ['toImage'] // Remove download button if not needed
          }

          try {
            await Plotly.newPlot(plotRef.current, [trace], layout, config)
            hasPlotRef.current = true
            setIsPlotlyReady(true)
          } catch (plotError) {
            console.error('Failed to create Plotly chart:', plotError)
            // Try a simpler plot without WebGL
            const fallbackTrace = { ...trace, type: 'scatter' as const }
            await Plotly.newPlot(plotRef.current, [fallbackTrace], layout, config)
            hasPlotRef.current = true
            setIsPlotlyReady(true)
          }
        }

        // Handle resize
        if (plotlyRef.current && dimensions.width > 0 && dimensions.height > 0) {
          await plotlyRef.current.Plots.resize(plotRef.current)
        }
      } catch (err) {
        console.error('Failed to initialize Plotly:', err)
      }
    }

    initPlot()

    // Cleanup function
    return () => {
      disposed = true
      if (timeoutId) clearTimeout(timeoutId)
    }
  }, [dimensions, lineColor])

  // Animation loop
  useEffect(() => {
    if (!plotlyRef.current || !isPlotlyReady || !plotRef.current) return

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

    let lastUpdateTime = 0
    const targetFPS = 30 // Limit to 30 FPS
    const frameInterval = 1000 / targetFPS
    let isUpdating = false

    // Animation loop with throttling
    const animate = (currentTime: number) => {
      const deltaTime = currentTime - lastUpdateTime
      
      if (deltaTime >= frameInterval && !isUpdating) {
        isUpdating = true
        lastUpdateTime = currentTime
        frameRef.current++
        
        try {
          if (plotlyRef.current && plotRef.current && dataRef.current && hasPlotRef.current) {
            // Update data
            if (updateFunctionRef.current) {
              dataRef.current = updateFunctionRef.current(dataRef.current, frameRef.current)
            } else {
              dataRef.current = defaultUpdate(dataRef.current, frameRef.current)
            }
            
            // Update plot more efficiently using restyle
            const update = {
              x: [dataRef.current.map(d => d.x)],
              y: [dataRef.current.map(d => d.y)]
            }
            
            plotlyRef.current.restyle(plotRef.current, update, [0])
          }
        } catch (error) {
          console.error('Error updating plot:', error)
          // Stop animation on error
          if (animationRef.current) {
            cancelAnimationFrame(animationRef.current)
            animationRef.current = undefined
          }
          return
        } finally {
          isUpdating = false
        }
      }
      
      animationRef.current = requestAnimationFrame(animate)
    }

    // Cancel any existing animation
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current)
    }
    
    // Only start animation if updateFunction is provided
    if (updateFunctionRef.current) {
      animationRef.current = requestAnimationFrame(animate)
    }

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isPlotlyReady])

  // Cleanup plot on unmount
  useEffect(() => {
    return () => {
      // Cancel animation first
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
        animationRef.current = undefined
      }
      // Then cleanup plot
      const plot = plotRef.current
      const plotly = plotlyRef.current
      if (plotly && plot && hasPlotRef.current) {
        try {
          plotly.purge(plot)
          hasPlotRef.current = false
        } catch (error) {
          console.error('Error purging plot:', error)
        }
      }
    }
  }, [])

  return (
    <div 
      ref={containerRef} 
      className={`w-full ${className}`}
      style={{ 
        height: dimensions.isReady ? dimensions.height : 'auto', 
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      <div
        ref={plotRef}
        className="border border-border rounded-lg [&_.modebar]:!z-[1000] [&_.modebar-container]:!absolute [&_.modebar-container]:!top-1 [&_.modebar-container]:!right-1"
        style={{ 
          width: dimensions.width || '100%', 
          height: dimensions.height || '100%', 
          boxSizing: 'border-box',
          position: 'absolute',
          top: 0,
          left: 0
        }}
      />
    </div>
  )
}