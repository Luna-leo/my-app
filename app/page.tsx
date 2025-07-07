'use client'

import { WebGLPlotComponent } from '@/components/charts/WebGLPlot'
import { WebGLPlotWithData } from '@/components/charts/WebGLPlotWithData'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CsvImportDialog } from '@/components/csv-import/CsvImportDialog'
import { DataSelectionDialog } from '@/components/data-selection/DataSelectionDialog'
import { CreateChartDialog, ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useState } from 'react'
import { WebglLine } from 'webgl-plot'
import { Upload, Database, LineChart } from 'lucide-react'

export default function Home() {
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [dataSelectionOpen, setDataSelectionOpen] = useState(false)
  const [createChartOpen, setCreateChartOpen] = useState(false)
  const [selectedDataIds, setSelectedDataIds] = useState<number[]>([])
  const [chartConfig, setChartConfig] = useState<ChartConfiguration | null>(null)

  const updateFunction = (line: WebglLine, frame: number) => {
    const speed = 0.02
    const noise = 0.05
    const frequency = 0.001
    const amplitude = 0.5
    
    for (let i = 0; i < line.numPoints; i++) {
      const y = Math.sin(2 * Math.PI * i * frequency + frame * speed) * amplitude
      const yNoise = (Math.random() - 0.5) * noise
      line.setY(i, y + yNoise)
    }
  }

  const handleImportComplete = () => {
    // Refresh data or update plot after import
    console.log('CSV import completed successfully')
  }

  return (
    <>
      <div className="container mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">WebGL Plot with shadcn/ui</h1>
          <div className="flex gap-2">
            <Button onClick={() => setImportDialogOpen(true)}>
              <Upload className="mr-2 h-4 w-4" />
              Import CSV Data
            </Button>
            <Button onClick={() => setDataSelectionOpen(true)} variant="outline">
              <Database className="mr-2 h-4 w-4" />
              Data Selection
            </Button>
            <Button 
              onClick={() => setCreateChartOpen(true)} 
              variant="outline"
              disabled={selectedDataIds.length === 0}
            >
              <LineChart className="mr-2 h-4 w-4" />
              Create Chart
            </Button>
          </div>
        </div>
        
        {chartConfig ? (
          <WebGLPlotWithData
            config={chartConfig}
            aspectRatio={2}
            className="max-w-4xl mx-auto"
          />
        ) : (
          <Card className="max-w-4xl mx-auto">
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
        )}

      </div>

      <CsvImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImportComplete={handleImportComplete}
      />
      
      <DataSelectionDialog
        open={dataSelectionOpen}
        onOpenChange={setDataSelectionOpen}
        selectedDataIds={selectedDataIds}
        onSelectionChange={setSelectedDataIds}
      />
      
      <CreateChartDialog
        open={createChartOpen}
        onOpenChange={setCreateChartOpen}
        selectedDataIds={selectedDataIds}
        onCreateChart={setChartConfig}
      />
    </>
  )
}