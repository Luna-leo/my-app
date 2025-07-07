'use client'

import { WebGLPlotWithData } from '@/components/charts/WebGLPlotWithData'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CsvImportDialog } from '@/components/csv-import/CsvImportDialog'
import { DataSelectionDialog } from '@/components/data-selection/DataSelectionDialog'
import { CreateChartDialog, ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useState } from 'react'
import { Upload, Database, LineChart, FileSearch } from 'lucide-react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export default function Home() {
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [dataSelectionOpen, setDataSelectionOpen] = useState(false)
  const [createChartOpen, setCreateChartOpen] = useState(false)
  const [selectedDataIds, setSelectedDataIds] = useState<number[]>([])
  const [charts, setCharts] = useState<(ChartConfiguration & { id: string })[]>([])
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ open: boolean; chartId: string | null }>({
    open: false,
    chartId: null
  })


  const handleImportComplete = () => {
    // Refresh data or update plot after import
    console.log('CSV import completed successfully')
  }

  const handleCreateChart = (config: ChartConfiguration) => {
    const newChart = {
      ...config,
      id: Date.now().toString()
    }
    setCharts([...charts, newChart])
    setCreateChartOpen(false)
  }

  const handleEditChart = (chartId: string) => {
    // TODO: Implement edit functionality
    console.log('Edit chart:', chartId)
  }

  const handleDuplicateChart = (chartId: string) => {
    const chartToDuplicate = charts.find(c => c.id === chartId)
    if (chartToDuplicate) {
      const duplicatedChart = {
        ...chartToDuplicate,
        id: Date.now().toString(),
        title: `${chartToDuplicate.title} (Copy)`
      }
      setCharts([...charts, duplicatedChart])
    }
  }

  const handleDeleteChart = (chartId: string) => {
    setDeleteConfirmation({ open: true, chartId })
  }

  const confirmDelete = () => {
    if (deleteConfirmation.chartId) {
      setCharts(charts.filter(c => c.id !== deleteConfirmation.chartId))
    }
    setDeleteConfirmation({ open: false, chartId: null })
  }

  return (
    <>
      <div className="container mx-auto p-8">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Time Series Data Visualization</h1>
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
        
        {charts.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {charts.map((chart) => (
              <WebGLPlotWithData
                key={chart.id}
                config={chart}
                aspectRatio={2}
                className="w-full"
                onEdit={() => handleEditChart(chart.id)}
                onDuplicate={() => handleDuplicateChart(chart.id)}
                onDelete={() => handleDeleteChart(chart.id)}
              />
            ))}
          </div>
        ) : (
          <Card className="max-w-4xl mx-auto">
            <CardHeader>
              <CardTitle>No Chart Created</CardTitle>
              <CardDescription>
                Follow these steps to create a chart
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6 py-8">
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Import CSV Data</h3>
                    <p className="text-sm text-muted-foreground">
                      Use the &quot;Import CSV Data&quot; button to load your time series data
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Select Data Sources</h3>
                    <p className="text-sm text-muted-foreground">
                      Click &quot;Data Selection&quot; to choose which datasets to use
                    </p>
                  </div>
                </div>
                
                <div className="flex items-start gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold">Create Chart</h3>
                    <p className="text-sm text-muted-foreground">
                      Use &quot;Create Chart&quot; to configure X/Y axis parameters and generate your visualization
                    </p>
                  </div>
                </div>
                
                <div className="mt-8 flex justify-center">
                  <FileSearch className="h-16 w-16 text-muted-foreground/50" />
                </div>
              </div>
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
        onCreateChart={handleCreateChart}
      />
      
      <AlertDialog 
        open={deleteConfirmation.open} 
        onOpenChange={(open) => setDeleteConfirmation({ open, chartId: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. This will permanently delete the chart.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}