'use client'

import { useState, useEffect } from 'react'
import { WebGLPlotComponent } from '@/components/charts/WebGLPlot'
import { PlotlyChartComponent } from '@/components/charts/PlotlyChart'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { setChartEngine, getChartEngine } from '@/lib/chartConfig'
import { ArrowLeftRight } from 'lucide-react'

export default function ChartComparisonPage() {
  const [currentEngine, setCurrentEngine] = useState<'timechart' | 'plotly'>('timechart')
  
  // Only access chart engine on client side
  useEffect(() => {
    setCurrentEngine(getChartEngine())
  }, [])
  
  const toggleEngine = () => {
    const newEngine = currentEngine === 'timechart' ? 'plotly' : 'timechart'
    setChartEngine(newEngine)
    setCurrentEngine(newEngine)
    // Reload to apply changes
    window.location.reload()
  }
  
  // Custom update function for animation (disabled by default for performance)
  const updateFunction = null // Set to a function to enable animation
  
  // Example animation function (uncomment to enable):
  // const updateFunction = (data: Array<{x: number, y: number}>, frame: number) => {
  //   const freq = 0.002
  //   const amp = 0.7
  //   const speed = 0.01
  //   
  //   return data.map((point, i) => ({
  //     x: point.x,
  //     y: Math.sin(2 * Math.PI * i * freq + frame * speed) * amp * Math.cos(frame * speed * 0.5)
  //   }))
  // }
  
  return (
    <div className="container mx-auto p-8">
      <div className="mb-8">
        <h1 className="text-4xl font-bold mb-4">Chart Engine Comparison</h1>
        <p className="text-muted-foreground mb-4">
          Compare TimeChart and Plotly.js implementations side by side
        </p>
        <Button onClick={toggleEngine} variant="outline">
          <ArrowLeftRight className="mr-2 h-4 w-4" />
          Switch to {currentEngine === 'timechart' ? 'Plotly' : 'TimeChart'} (Current: {currentEngine})
        </Button>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>TimeChart Implementation</CardTitle>
            <CardDescription>WebGL-based using TimeChart library</CardDescription>
          </CardHeader>
          <CardContent>
            <WebGLPlotComponent
              aspectRatio={2}
              lineColor={{ r: 0.2, g: 0.6, b: 1.0, a: 1 }}
              updateFunction={updateFunction}
              className="w-full"
            />
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader>
            <CardTitle>Plotly.js Implementation</CardTitle>
            <CardDescription>WebGL-based using Plotly.js with scattergl</CardDescription>
          </CardHeader>
          <CardContent>
            <PlotlyChartComponent
              aspectRatio={2}
              lineColor={{ r: 1.0, g: 0.2, b: 0.2, a: 1 }}
              updateFunction={updateFunction}
              className="w-full"
            />
          </CardContent>
        </Card>
      </div>
      
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Feature Comparison</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold mb-2">TimeChart</h3>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Specialized for time series data</li>
                  <li>Built-in pan and zoom</li>
                  <li>Optimized for real-time updates</li>
                  <li>Smaller bundle size</li>
                  <li>Limited customization options</li>
                </ul>
              </div>
              <div>
                <h3 className="font-semibold mb-2">Plotly.js</h3>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>General-purpose charting library</li>
                  <li>Extensive customization options</li>
                  <li>Rich interaction features</li>
                  <li>Built-in modebar tools</li>
                  <li>Larger bundle size</li>
                  <li>WebGL mode for performance</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}