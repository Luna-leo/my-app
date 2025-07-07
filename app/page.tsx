'use client'

import { WebGLPlotComponent } from '@/components/charts/WebGLPlot'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useState } from 'react'
import { WebglLine } from 'webgl-plot'

export default function Home() {
  const [isPaused, setIsPaused] = useState(false)
  const [frequency, setFrequency] = useState(0.001)
  const [amplitude, setAmplitude] = useState(0.5)

  const updateFunction = (line: WebglLine, frame: number) => {
    if (isPaused) return
    
    const speed = 0.02
    const noise = 0.05
    
    for (let i = 0; i < line.numPoints; i++) {
      const y = Math.sin(2 * Math.PI * i * frequency + frame * speed) * amplitude
      const yNoise = (Math.random() - 0.5) * noise
      line.setY(i, y + yNoise)
    }
  }

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-4xl font-bold mb-8">WebGL Plot with shadcn/ui</h1>
      
      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Real-time WebGL Plot</CardTitle>
            <CardDescription>
              High-performance plotting using WebGL with customizable parameters
            </CardDescription>
          </CardHeader>
          <CardContent>
            <WebGLPlotComponent
              aspectRatio={2}
              lineColor={{ r: 0.2, g: 0.6, b: 1.0, a: 1 }}
              updateFunction={updateFunction}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Controls</CardTitle>
            <CardDescription>
              Adjust the plot parameters in real-time
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <Button
                onClick={() => setIsPaused(!isPaused)}
                variant={isPaused ? "default" : "secondary"}
              >
                {isPaused ? "Resume" : "Pause"}
              </Button>
              <Button
                onClick={() => {
                  setFrequency(0.001)
                  setAmplitude(0.5)
                }}
                variant="outline"
              >
                Reset
              </Button>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Frequency: {frequency.toFixed(4)}
              </label>
              <input
                type="range"
                min="0.0001"
                max="0.01"
                step="0.0001"
                value={frequency}
                onChange={(e) => setFrequency(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">
                Amplitude: {amplitude.toFixed(2)}
              </label>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.1"
                value={amplitude}
                onChange={(e) => setAmplitude(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>

            <div className="mt-6 p-4 bg-muted rounded-lg">
              <h4 className="font-medium mb-2">Features:</h4>
              <ul className="text-sm space-y-1 text-muted-foreground">
                <li>• Real-time WebGL rendering</li>
                <li>• 60 FPS performance</li>
                <li>• Interactive controls</li>
                <li>• Customizable colors and parameters</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader>
          <CardTitle>Integration Details</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="prose prose-sm text-muted-foreground">
            <p>
              This demo showcases the integration of <strong>webgl-plot</strong> for high-performance
              data visualization with <strong>shadcn/ui</strong> components for a modern UI.
            </p>
            <p className="mt-2">
              The WebGL plot renders thousands of data points at 60 FPS, while shadcn/ui provides
              accessible, customizable components with Tailwind CSS styling.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}