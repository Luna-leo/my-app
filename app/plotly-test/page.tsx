'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function PlotlyTestPage() {
  const plotRef = useRef<HTMLDivElement>(null)
  const [status, setStatus] = useState('Loading Plotly...')
  const [error, setError] = useState<string | null>(null)
  
  useEffect(() => {
    const initPlot = async () => {
      try {
        // Import Plotly
        const Plotly = await import('plotly.js-gl2d-dist')
        setStatus('Plotly loaded, creating plot...')
        
        if (!plotRef.current) {
          setError('Plot container not ready')
          return
        }
        
        // Simple static data
        const trace = {
          x: [1, 2, 3, 4, 5],
          y: [2, 4, 3, 5, 6],
          type: 'scattergl' as const,
          mode: 'lines+markers' as const,
          name: 'Test Data'
        }
        
        const layout = {
          title: { text: 'Simple Plotly Test' },
          xaxis: { title: { text: 'X Axis' } },
          yaxis: { title: { text: 'Y Axis' } },
          margin: { t: 60, r: 30, b: 60, l: 60 }
        }
        
        const config = {
          displayModeBar: true,
          responsive: true
        }
        
        // Create plot
        await Plotly.newPlot(plotRef.current, [trace], layout, config)
        setStatus('Plot created successfully!')
        
      } catch (err) {
        console.error('Failed to create plot:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('Failed to create plot')
      }
    }
    
    initPlot()
    
    // Cleanup
    return () => {
      if (plotRef.current && (window as any).Plotly) {
        try {
          (window as any).Plotly.purge(plotRef.current)
        } catch (e) {
          console.error('Error cleaning up plot:', e)
        }
      }
    }
  }, [])
  
  return (
    <div className="container mx-auto p-8">
      <h1 className="text-4xl font-bold mb-8">Plotly.js Simple Test</h1>
      
      <Card>
        <CardHeader>
          <CardTitle>Basic Plotly Chart</CardTitle>
          <CardDescription>Status: {status}</CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded text-red-700">
              Error: {error}
            </div>
          )}
          <div 
            ref={plotRef} 
            className="w-full h-[400px] border border-gray-200 rounded"
          />
        </CardContent>
      </Card>
      
      <div className="mt-8">
        <Card>
          <CardHeader>
            <CardTitle>Debugging Information</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              <li>Container mounted: {plotRef.current ? 'Yes' : 'No'}</li>
              <li>Plotly available: {typeof (window as any).Plotly !== 'undefined' ? 'Yes' : 'No'}</li>
              <li>WebGL support: {typeof WebGLRenderingContext !== 'undefined' ? 'Yes' : 'No'}</li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}