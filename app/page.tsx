'use client'

import { useEffect, useState, useCallback } from 'react'
import { CsvImportDialog } from '@/components/csv-import/CsvImportDialog'
import { DataSelectionDialog } from '@/components/data-selection/DataSelectionDialog'
import { CreateChartDialog, ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useChartDataContext } from '@/contexts/ChartDataContext'
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
import { AppHeader } from '@/components/layout/AppHeader'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import { ChartGrid } from '@/components/charts/ChartGrid'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { layoutService } from '@/lib/services/layoutService'

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
  const [importProgress, setImportProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [layoutOption, setLayoutOption] = useState<LayoutOption | null>(null)
  const { preloadChartData } = useChartDataContext()
  
  const loadWorkspaceAndCharts = useCallback(async () => {
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
      
      // Preload only first few charts for faster initial render
      if (convertedCharts.length > 0) {
        // Only preload first 4 charts, rest will load lazily
        const chartsToPreload = convertedCharts.slice(0, 4)
        await preloadChartData(chartsToPreload, {
          batchSize: 4,
          onProgress: (loaded, total) => {
            setImportProgress({ loaded, total })
          }
        })
        setImportProgress(null)
      }
    } catch (error) {
      console.error('Failed to load charts:', error)
    } finally {
      setLoading(false)
    }
  }, [preloadChartData])
  
  useEffect(() => {
    setMounted(true)
    loadWorkspaceAndCharts()
    
    // Load saved layout preference
    const savedLayout = layoutService.loadLayout()
    if (savedLayout) {
      setLayoutOption(savedLayout)
    }
  }, [loadWorkspaceAndCharts])


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

  const handleLayoutChange = (layout: LayoutOption | null) => {
    setLayoutOption(layout)
    layoutService.saveLayout(layout)
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
        
        // Preload only first few charts for faster initial render
        if (convertedCharts.length > 0) {
          setLoading(true)
          // Only preload first 4 charts, rest will load lazily
          const chartsToPreload = convertedCharts.slice(0, 4)
          await preloadChartData(chartsToPreload, {
            batchSize: 4,
            onProgress: (loaded, total) => {
              setImportProgress({ loaded, total })
            }
          })
          setImportProgress(null)
          setLoading(false)
        }
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
        <AppHeader
          onImportClick={() => setImportDialogOpen(true)}
          onDataSelectionClick={() => setDataSelectionOpen(true)}
          onCreateChartClick={() => setCreateChartOpen(true)}
          onExportClick={handleExportWorkspace}
          onImportWorkspaceClick={handleImportWorkspace}
          isCreateChartDisabled={selectedDataIds.length === 0}
          isExportDisabled={charts.length === 0}
          layoutOption={layoutOption}
          onLayoutChange={handleLayoutChange}
        />
        
        {loading ? (
          <LoadingState
            message="Loading charts..."
            progress={importProgress ? importProgress : undefined}
          />
        ) : charts.length > 0 ? (
          mounted && (
            <ChartGrid
              charts={charts}
              onEdit={handleEditChart}
              onDuplicate={handleDuplicateChart}
              onDelete={handleDeleteChart}
              layoutOption={layoutOption}
            />
          )
        ) : (
          <EmptyState />
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