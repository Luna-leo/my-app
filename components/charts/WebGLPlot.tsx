'use client'

import { useEffect, useRef, useState } from 'react'
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot'

interface WebGLPlotProps {
  aspectRatio?: number // width / height ratio, default 2
  lineColor?: { r: number; g: number; b: number; a?: number }
  updateFunction?: (line: WebglLine, frame: number) => void
  className?: string
}

export function WebGLPlotComponent({
  aspectRatio = 2,
  lineColor = { r: 0.1, g: 0.5, b: 0.9, a: 1 },
  updateFunction,
  className = ''
}: WebGLPlotProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number | undefined>(undefined)
  const frameRef = useRef(0)
  const wglpRef = useRef<WebglPlot | null>(null)
  const lineRef = useRef<WebglLine | null>(null)
  const updateFunctionRef = useRef(updateFunction)
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })

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

  // Initialize WebGL plot and handle dimension changes only
  useEffect(() => {
    if (!canvasRef.current || dimensions.width === 0) return

    const canvas = canvasRef.current
    const devicePixelRatio = window.devicePixelRatio || 1
    
    // Set canvas dimensions
    canvas.width = dimensions.width * devicePixelRatio
    canvas.height = dimensions.height * devicePixelRatio
    canvas.style.width = `${dimensions.width}px`
    canvas.style.height = `${dimensions.height}px`

    // Create WebGL plot if it doesn't exist
    if (!wglpRef.current) {
      wglpRef.current = new WebglPlot(canvas)
      
      // Create line
      const color = new ColorRGBA(lineColor.r, lineColor.g, lineColor.b, lineColor.a || 1)
      const line = new WebglLine(color, Math.round(canvas.width))
      line.arrangeX()
      lineRef.current = line
      
      // Initialize line with sine wave
      const freq = 0.001
      const amp = 0.5
      for (let i = 0; i < line.numPoints; i++) {
        const y = Math.sin(2 * Math.PI * i * freq) * amp
        line.setY(i, y)
      }
      
      wglpRef.current.addLine(line)
    } else {
      // Only update dimensions, don't recreate lines
      wglpRef.current.viewport(0, 0, canvas.width, canvas.height)
      
      // Only recreate line if canvas width actually changed significantly
      if (lineRef.current && Math.abs(lineRef.current.numPoints - canvas.width) > 10) {
        // Clear and recreate with new dimensions
        wglpRef.current.clear()
        
        const color = new ColorRGBA(lineColor.r, lineColor.g, lineColor.b, lineColor.a || 1)
        const line = new WebglLine(color, Math.round(canvas.width))
        line.arrangeX()
        lineRef.current = line
        
        // Re-initialize with sine wave
        const freq = 0.001
        const amp = 0.5
        for (let i = 0; i < line.numPoints; i++) {
          const y = Math.sin(2 * Math.PI * i * freq) * amp
          line.setY(i, y)
        }
        
        wglpRef.current.addLine(line)
      }
    }
  }, [dimensions, lineColor]) // Note: removed updateFunction from dependencies

  // Separate effect for animation loop
  useEffect(() => {
    if (!wglpRef.current || !lineRef.current) return

    // Default update function if none provided
    const defaultUpdate = (line: WebglLine, frame: number) => {
      const freq = 0.001
      const amp = 0.5
      const speed = 0.02
      
      for (let i = 0; i < line.numPoints; i++) {
        const y = Math.sin(2 * Math.PI * i * freq + frame * speed) * amp
        line.setY(i, y)
      }
    }

    // Animation loop
    const animate = () => {
      frameRef.current++
      
      if (lineRef.current && wglpRef.current) {
        // Use the ref to get the latest update function
        if (updateFunctionRef.current) {
          updateFunctionRef.current(lineRef.current, frameRef.current)
        } else {
          defaultUpdate(lineRef.current, frameRef.current)
        }
        
        wglpRef.current.update()
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
  }, [dimensions]) // Only restart animation when dimensions change

  return (
    <div 
      ref={containerRef} 
      className={`w-full ${className}`}
      style={{ height: dimensions.height || 'auto' }}
    >
      <canvas
        ref={canvasRef}
        className="border border-border rounded-lg w-full h-full"
      />
    </div>
  )
}