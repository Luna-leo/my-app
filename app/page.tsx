'use client'

import { useEffect, useState, useCallback, useMemo } from 'react'
import { DataManagementDialog } from '@/components/data-management/DataManagementDialog'
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
import { DataSelectionBar } from '@/components/layout/DataSelectionBar'
import { layoutService } from '@/lib/services/layoutService'
import { SamplingConfig, DEFAULT_SAMPLING_CONFIG } from '@/lib/utils/chartDataSampling'
import { useDataPointsInfo } from '@/hooks/useDataPointsInfo'
import { metadataService } from '@/lib/services/metadataService'
import { colorService } from '@/lib/services/colorService'

export default function Home() {
  const [dataManagementOpen, setDataManagementOpen] = useState(false)
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
  // const [importProgress, setImportProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [layoutOption, setLayoutOption] = useState<LayoutOption | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [samplingConfig, setSamplingConfig] = useState<SamplingConfig>(DEFAULT_SAMPLING_CONFIG)
  const [isUpdatingSampling, setIsUpdatingSampling] = useState(false)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [selectedDataLabels, setSelectedDataLabels] = useState<Map<number, string>>(new Map())
  const [selectedDataColors, setSelectedDataColors] = useState<Map<number, string>>(new Map())
  const { preloadChartData, clearCache } = useChartDataContext()
  
  const loadWorkspaceAndCharts = useCallback(async () => {
    try {
      setLoading(true)
      // Clear cache before loading new workspace
      clearCache()
      
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
      
      // Don't preload any charts initially - let them load lazily
      console.log(`[Initial Load] Found ${convertedCharts.length} charts in workspace`)
      setInitialLoadComplete(true)
    } catch (error) {
      console.error('Failed to load charts:', error)
    } finally {
      setLoading(false)
    }
  }, [clearCache])
  
  useEffect(() => {
    setMounted(true)
    loadWorkspaceAndCharts()
    
    // Load saved layout preference
    const savedLayout = layoutService.loadLayout()
    if (savedLayout) {
      setLayoutOption(savedLayout)
    }
  }, [loadWorkspaceAndCharts])

  // Fetch labels and colors when selectedDataIds change
  useEffect(() => {
    const fetchLabelsAndColors = async () => {
      if (selectedDataIds.length > 0) {
        const labels = await metadataService.getLabelsForIds(selectedDataIds)
        const colors = colorService.getColorsForDataIds(selectedDataIds)
        setSelectedDataLabels(labels)
        setSelectedDataColors(colors)
      } else {
        setSelectedDataLabels(new Map())
        setSelectedDataColors(new Map())
      }
    }
    fetchLabelsAndColors()
  }, [selectedDataIds])

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
        title: chartToDuplicate.title
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
    // Reset to first page when layout changes
    setCurrentPage(1)
  }

  // Calculate pagination info
  const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
  const totalPages = Math.ceil(charts.length / chartsPerPage)
  const paginationEnabled = layoutOption?.paginationEnabled ?? false

  // Ensure current page is valid
  if (currentPage > totalPages && totalPages > 0) {
    setCurrentPage(1)
  }

  // Calculate visible charts for pagination
  const visibleCharts = useMemo(() => {
    if (!paginationEnabled || !layoutOption) {
      return charts;
    }
    const startIndex = (currentPage - 1) * chartsPerPage;
    const endIndex = startIndex + chartsPerPage;
    return charts.slice(startIndex, endIndex);
  }, [charts, paginationEnabled, layoutOption, currentPage, chartsPerPage]);

  // Get data points info for visible charts
  const dataPointsInfo = useDataPointsInfo(visibleCharts, samplingConfig);

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

  // Handle sampling config changes with batch processing
  const handleSamplingConfigChange = useCallback(async (newConfig: SamplingConfig) => {
    setSamplingConfig(newConfig)
    
    // Skip batch update during initial load
    if (!initialLoadComplete) {
      return
    }
    
    // Only trigger batch update if sampling is enabled and target points actually changed
    if (newConfig.enabled && newConfig.targetPoints !== samplingConfig.targetPoints) {
      setIsUpdatingSampling(true)
      
      try {
        // Use the same batch processing as initial load
        await preloadChartData(visibleCharts, {
          batchSize: 4,
          onProgress: (loaded, total) => {
            console.log(`Sampling progress: ${loaded}/${total}`)
          }
        })
      } finally {
        setIsUpdatingSampling(false)
      }
    }
  }, [samplingConfig.targetPoints, visibleCharts, preloadChartData, initialLoadComplete])

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
        
        // Clear all caches before loading new workspace
        clearCache()
        
        // Reset initial load state for new workspace
        setInitialLoadComplete(false)
        
        // Don't preload any charts initially - let them load lazily
        // This prevents memory issues with large workspaces
        console.log(`[Import] Workspace imported with ${convertedCharts.length} charts`)
        setLoading(false)
        
        setInitialLoadComplete(true)
      } catch (error) {
        console.error('Failed to import workspace:', error)
        alert('Failed to import workspace. Please check the file format.')
      }
    }
    
    input.click()
  }

  return (
    <>
      <div className="h-screen flex flex-col">
        <div className="container mx-auto p-8 pb-0 flex-shrink-0">
          <AppHeader
          onDataClick={() => setDataManagementOpen(true)}
          onCreateChartClick={() => setCreateChartOpen(true)}
          onExportClick={handleExportWorkspace}
          onImportWorkspaceClick={handleImportWorkspace}
          isCreateChartDisabled={selectedDataIds.length === 0}
          isExportDisabled={charts.length === 0}
        />
        </div>
        
        {mounted && (
          <>
            <div className="container mx-auto px-8 flex-shrink-0">
              <DataSelectionBar
                selectedDataIds={selectedDataIds}
                selectedDataLabels={selectedDataLabels}
                selectedDataColors={selectedDataColors}
                totalCharts={charts.length}
                layoutOption={layoutOption}
                onLayoutChange={handleLayoutChange}
                paginationEnabled={paginationEnabled}
                currentPage={currentPage}
                totalPages={totalPages}
                onPageChange={setCurrentPage}
                samplingConfig={samplingConfig}
                onSamplingConfigChange={handleSamplingConfigChange}
                dataPointsInfo={dataPointsInfo}
                isUpdatingSampling={isUpdatingSampling}
              />
            </div>
            {loading ? (
              <div className="container mx-auto p-8 flex-1">
                <LoadingState
                  message="Loading charts..."
                />
              </div>
            ) : charts.length > 0 ? (
              <div className="container mx-auto px-8 pb-8 flex-1 overflow-hidden">
                <ChartGrid
                  charts={charts}
                  onEdit={handleEditChart}
                  onDuplicate={handleDuplicateChart}
                  onDelete={handleDeleteChart}
                  layoutOption={layoutOption}
                  paginationEnabled={paginationEnabled}
                  currentPage={currentPage}
                  samplingConfig={samplingConfig}
                />
              </div>
            ) : (
              <div className="container mx-auto p-8 flex-1">
                <EmptyState />
              </div>
            )}
          </>
        )}
      </div>

      <DataManagementDialog
        open={dataManagementOpen}
        onOpenChange={setDataManagementOpen}
        selectedDataIds={selectedDataIds}
        onSelectionChange={setSelectedDataIds}
        onImportComplete={handleImportComplete}
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