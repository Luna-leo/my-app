'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { WebGLPlotWithData } from '@/components/charts/WebGLPlotWithData'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { Button } from '@/components/ui/button'

export default function CoordinateTestPage() {
  // Create a test configuration with mock data
  const [zoomLevel, setZoomLevel] = useState(1)
  
  const testConfig: ChartConfiguration = {
    title: 'Coordinate System Test',
    xAxisParameter: 'timestamp',
    yAxisParameters: ['test-param-1'],
    selectedDataIds: [1], // Mock metadata ID
    chartType: 'line'
  }

  return (
    <div className="container mx-auto p-8 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>WebGL Plot Coordinate System Test</CardTitle>
          <CardDescription>
            Testing clipping and cursor alignment with zoom and pan
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-4">
              <Button onClick={() => setZoomLevel(z => Math.min(z * 1.5, 10))}>
                Zoom In
              </Button>
              <Button onClick={() => setZoomLevel(z => Math.max(z / 1.5, 0.1))}>
                Zoom Out
              </Button>
              <Button onClick={() => setZoomLevel(1)}>
                Reset Zoom
              </Button>
              <span className="text-sm text-muted-foreground">
                Zoom Level: {zoomLevel.toFixed(2)}x
              </span>
            </div>
            
            <div className="border rounded-lg p-4 bg-muted/50">
              <h3 className="font-semibold mb-2">Instructions:</h3>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Use mouse wheel to zoom in/out at cursor position</li>
                <li>Click and drag to pan the chart</li>
                <li>Hover over data points to see tooltips</li>
                <li>Check that data is clipped to the plot area when zoomed</li>
                <li>Verify that cursor crosshairs align with actual data points</li>
              </ul>
            </div>
            
            <div className="relative">
              <WebGLPlotWithData 
                config={testConfig}
                aspectRatio={2}
                className="w-full"
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}