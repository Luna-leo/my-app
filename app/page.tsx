'use client'

import { useEffect, useState } from 'react'
import { getDataChartComponent } from '@/components/charts/ChartProvider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { CsvImportDialog } from '@/components/csv-import/CsvImportDialog'
import { DataSelectionDialog } from '@/components/data-selection/DataSelectionDialog'
import { CreateChartDialog, ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { Upload, Database, LineChart, Download, FolderOpen, FileSearch } from 'lucide-react'
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
import { chartConfigService } from '@/lib/services/chartConfigurationService'
import { ChartConfiguration as DBChartConfiguration } from '@/lib/db/schema'

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
  const [editingChart, setEditingChart] = useState<(ChartConfiguration & { id: string }) | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [loading, setLoading] = useState(true)
  
  useEffect(() => {
    setMounted(true)
    loadWorkspaceAndCharts()
  }, [])

  const loadWorkspaceAndCharts = async () => {
    try {
      setLoading(true)
      const workspace = await chartConfigService.initializeWorkspace()
      setWorkspaceId(workspace.id!)
      
      const savedCharts = await chartConfigService.loadChartConfigurations(workspace.id)
      const convertedCharts = savedCharts.map(chart => ({
        id: chart.id!,
        title: chart.title,
        chartType: chart.chartType,
        xAxisParameter: chart.xAxisParameter,
        yAxisParameters: chart.yAxisParameters,
        selectedDataIds: chart.selectedDataIds
      }))
      setCharts(convertedCharts)
    } catch (error) {
      console.error('Failed to load charts:', error)
    } finally {
      setLoading(false)
    }
  }


  const handleImportComplete = () => {
    // Refresh data or update plot after import
    console.log('CSV import completed successfully')
  }

  const handleCreateChart = async (config: ChartConfiguration) => {
    const newChart = {
      ...config,
      id: Date.now().toString(),
      chartType: config.chartType || 'line' as const
    }
    setCharts([...charts, newChart])
    setCreateChartOpen(false)
    
    // Save to database
    const dbConfig: DBChartConfiguration = {
      ...newChart,
      workspaceId,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    await chartConfigService.saveChartConfiguration(dbConfig)
  }

  const handleEditChart = (chartId: string) => {
    const chartToEdit = charts.find(c => c.id === chartId)
    if (chartToEdit) {
      setEditingChart(chartToEdit)
      setEditDialogOpen(true)
    }
  }
  
  const handleUpdateChart = async (updatedChart: ChartConfiguration & { id: string }) => {
    setCharts(charts.map(c => c.id === updatedChart.id ? updatedChart : c))
    setEditingChart(null)
    setEditDialogOpen(false)
    
    // Save to database
    const dbConfig: DBChartConfiguration = {
      ...updatedChart,
      workspaceId,
      createdAt: new Date(), // This will be overwritten by the service if it exists
      updatedAt: new Date()
    }
    await chartConfigService.saveChartConfigurationDebounced(dbConfig)
  }

  const handleDuplicateChart = async (chartId: string) => {
    const chartToDuplicate = charts.find(c => c.id === chartId)
    if (chartToDuplicate) {
      const duplicatedChart = {
        ...chartToDuplicate,
        id: Date.now().toString(),
        title: `${chartToDuplicate.title} (Copy)`
      }
      setCharts([...charts, duplicatedChart])
      
      // Save to database
      const dbConfig: DBChartConfiguration = {
        ...duplicatedChart,
        workspaceId,
        createdAt: new Date(),
        updatedAt: new Date()
      }
      await chartConfigService.saveChartConfiguration(dbConfig)
    }
  }

  const handleDeleteChart = (chartId: string) => {
    setDeleteConfirmation({ open: true, chartId })
  }

  const confirmDelete = async () => {
    if (deleteConfirmation.chartId) {
      setCharts(charts.filter(c => c.id !== deleteConfirmation.chartId))
      await chartConfigService.deleteChartConfiguration(deleteConfirmation.chartId)
    }
    setDeleteConfirmation({ open: false, chartId: null })
  }

  const handleExportWorkspace = async () => {
    try {
      const jsonData = await chartConfigService.exportWorkspace(workspaceId)
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `workspace-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export workspace:', error)
    }
  }

  const handleImportWorkspace = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0]
      if (!file) return
      
      try {
        const text = await file.text()
        const { workspace, charts: importedCharts } = await chartConfigService.importWorkspace(text)
        
        // Switch to the imported workspace
        await chartConfigService.switchWorkspace(workspace.id!)
        setWorkspaceId(workspace.id!)
        
        // Convert and set the imported charts
        const convertedCharts = importedCharts.map(chart => ({
          id: chart.id!,
          title: chart.title,
          chartType: chart.chartType,
          xAxisParameter: chart.xAxisParameter,
          yAxisParameters: chart.yAxisParameters,
          selectedDataIds: chart.selectedDataIds
        }))
        setCharts(convertedCharts)
      } catch (error) {
        console.error('Failed to import workspace:', error)
        alert('Failed to import workspace. Please check the file format.')
      }
    }
    
    input.click()
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
            <Button
              onClick={handleExportWorkspace}
              variant="outline"
              disabled={charts.length === 0}
            >
              <Download className="mr-2 h-4 w-4" />
              Export
            </Button>
            <Button
              onClick={handleImportWorkspace}
              variant="outline"
            >
              <FolderOpen className="mr-2 h-4 w-4" />
              Import
            </Button>
          </div>
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading charts...</p>
            </div>
          </div>
        ) : charts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {mounted && charts.map((chart) => {
              const ChartComponent = getDataChartComponent();
              return (
                <ChartComponent
                  key={chart.id}
                  config={chart}
                  aspectRatio={1.5}
                  className="w-full"
                  onEdit={() => handleEditChart(chart.id)}
                  onDuplicate={() => handleDuplicateChart(chart.id)}
                  onDelete={() => handleDeleteChart(chart.id)}
                />
              );
            })}
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
      
      <CreateChartDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        selectedDataIds={editingChart?.selectedDataIds || []}
        onCreateChart={() => {}}
        editMode={true}
        chartToEdit={editingChart || undefined}
        onUpdateChart={handleUpdateChart}
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