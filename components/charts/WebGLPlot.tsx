'use client'

import { useEffect, useRef } from 'react'
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot'

interface WebGLPlotProps {
  width?: number
  height?: number
  lineColor?: { r: number; g: number; b: number; a?: number }
  updateFunction?: (line: WebglLine, frame: number) => void
}

export function WebGLPlotComponent({
  width = 800,
  height = 400,
  lineColor = { r: 0.1, g: 0.5, b: 0.9, a: 1 },
  updateFunction
}: WebGLPlotProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animationRef = useRef<number>()
  const frameRef = useRef(0)

  useEffect(() => {
    if (!canvasRef.current) return

    const canvas = canvasRef.current
    const devicePixelRatio = window.devicePixelRatio || 1
    
    // Set canvas dimensions
    canvas.width = width * devicePixelRatio
    canvas.height = height * devicePixelRatio
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    // Create WebGL plot
    const wglp = new WebglPlot(canvas)

    // Create line
    const color = new ColorRGBA(lineColor.r, lineColor.g, lineColor.b, lineColor.a || 1)
    const line = new WebglLine(color, Math.round(canvas.width))
    line.arrangeX()
    
    // Initialize line with sine wave
    const freq = 0.001
    const amp = 0.5
    for (let i = 0; i < line.numPoints; i++) {
      const y = Math.sin(2 * Math.PI * i * freq) * amp
      line.setY(i, y)
    }

    wglp.addLine(line)

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
      
      if (updateFunction) {
        updateFunction(line, frameRef.current)
      } else {
        defaultUpdate(line, frameRef.current)
      }
      
      wglp.update()
      animationRef.current = requestAnimationFrame(animate)
    }

    animate()

    // Cleanup
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [width, height, lineColor, updateFunction])

  return (
    <canvas
      ref={canvasRef}
      className="border border-border rounded-lg"
    />
  )
}