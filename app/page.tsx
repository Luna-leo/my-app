'use client'

import { useEffect, useState, useCallback, useMemo, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { db } from '@/lib/db'
import { ensureMetadataHasDataKeys, getDatabaseInfo, fixWorkspaceIsActiveField } from '@/lib/utils/dbMigrationUtils'
import DatabaseDebugPanel from '@/components/debug/DatabaseDebugPanel'
import { StartupService } from '@/lib/services/startupService'
import { WelcomeDialog } from '@/components/startup/WelcomeDialog'
import { SaveSessionDialog } from '@/components/workspace/SaveSessionDialog'
import { WorkspaceListDialog } from '@/components/workspace/WorkspaceListDialog'
import { ExportWorkspaceDialog } from '@/components/workspace/ExportWorkspaceDialog'

function HomeContent() {
  const searchParams = useSearchParams()
  const [dataManagementOpen, setDataManagementOpen] = useState(false)
  const [createChartOpen, setCreateChartOpen] = useState(false)
  const [selectedDataKeys, setSelectedDataKeys] = useState<string[]>([])
  const [selectedDataIds, setSelectedDataIds] = useState<number[]>([]) // Keep for backward compatibility
  const [showDebugPanel, setShowDebugPanel] = useState(false)
  const [charts, setCharts] = useState<(ChartConfiguration & { id: string })[]>([])
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ open: boolean; chartId: string | null }>({
    open: false,
    chartId: null
  })
  const [editingChart, setEditingChart] = useState<(ChartConfiguration & { id: string }) | null>(null)
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [workspaceName, setWorkspaceName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  // const [importProgress, setImportProgress] = useState<{ loaded: number; total: number } | null>(null)
  const [layoutOption, setLayoutOption] = useState<LayoutOption | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [samplingConfig, setSamplingConfig] = useState<SamplingConfig>(DEFAULT_SAMPLING_CONFIG)
  const [isUpdatingSampling, setIsUpdatingSampling] = useState(false)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  const [selectedDataLabels, setSelectedDataLabels] = useState<Map<number, string>>(new Map())
  const [selectedDataColors, setSelectedDataColors] = useState<Map<number, string>>(new Map())
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false)
  const [showSaveSessionDialog, setShowSaveSessionDialog] = useState(false)
  const [showWorkspaceListDialog, setShowWorkspaceListDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [currentWorkspace, setCurrentWorkspace] = useState<{ id: string; name: string; description?: string } | null>(null)
  const { preloadChartData, clearCache } = useChartDataContext()
  
  const loadWorkspaceAndCharts = useCallback(async (startupOptions?: { mode?: 'clean' | 'restore', workspaceId?: string }) => {
    try {
      setLoading(true)
      console.log('[loadWorkspaceAndCharts] Starting with options:', startupOptions)
      
      // Clear cache before loading new workspace
      clearCache()
      
      let workspace
      
      if (startupOptions?.mode === 'clean') {
        console.log('[loadWorkspaceAndCharts] Clean start mode')
        
        // Clean up empty workspaces before creating a new one
        const deletedCount = await chartConfigService.cleanupEmptyWorkspaces()
        if (deletedCount > 0) {
          console.log(`[loadWorkspaceAndCharts] Cleaned up ${deletedCount} empty workspaces`)
        }
        
        // Create a new workspace for clean start
        workspace = await chartConfigService.createWorkspace(
          `Session ${new Date().toLocaleString()}`,
          'Clean start session'
        )
        await chartConfigService.switchWorkspace(workspace.id!)
      } else if (startupOptions?.workspaceId) {
        console.log('[loadWorkspaceAndCharts] Loading specific workspace:', startupOptions.workspaceId)
        // Load specific workspace
        const allWorkspaces = await chartConfigService.getAllWorkspaces()
        workspace = allWorkspaces.find(w => w.id === startupOptions.workspaceId)
        if (workspace) {
          await chartConfigService.switchWorkspace(workspace.id!)
        } else {
          // Fallback to default if workspace not found
          console.log('[loadWorkspaceAndCharts] Workspace not found, initializing default')
          workspace = await chartConfigService.initializeWorkspace()
        }
      } else {
        // Default restore mode
        console.log('[loadWorkspaceAndCharts] Default restore mode')
        workspace = await chartConfigService.initializeWorkspace()
      }
      
      console.log('[loadWorkspaceAndCharts] Loaded workspace:', workspace)
      
      setWorkspaceId(workspace.id!)
      setWorkspaceName(workspace.name || 'Unnamed Workspace')
      setCurrentWorkspace({ 
        id: workspace.id!, 
        name: workspace.name || 'Unnamed Workspace',
        description: workspace.description 
      })
      
      // Load selected data keys from workspace (skip for clean start)
      if (startupOptions?.mode !== 'clean' && workspace.selectedDataKeys && workspace.selectedDataKeys.length > 0) {
        setSelectedDataKeys(workspace.selectedDataKeys)
        
        // Convert data keys to IDs for backward compatibility
        const metadata = await db.getMetadataByDataKeys(workspace.selectedDataKeys)
        const ids = metadata.map(m => m.id!).filter(id => id !== undefined)
        setSelectedDataIds(ids)
      } else if (startupOptions?.mode !== 'clean') {
        // Migrate from chart-based selection if needed
        const migratedKeys = await chartConfigService.migrateSelectedDataFromCharts(workspace.id!)
        setSelectedDataKeys(migratedKeys)
        
        // Convert to IDs
        if (migratedKeys.length > 0) {
          const metadata = await db.getMetadataByDataKeys(migratedKeys)
          const ids = metadata.map(m => m.id!).filter(id => id !== undefined)
          setSelectedDataIds(ids)
        }
      } else {
        // Clean start - clear selections
        setSelectedDataKeys([])
        setSelectedDataIds([])
      }
      
      // Load charts (skip for clean start)
      if (startupOptions?.mode !== 'clean') {
        const savedCharts = await chartConfigService.loadChartConfigurations(workspace.id)
        const convertedCharts = savedCharts.map(chart => ({
          id: chart.id!,
          title: chart.title,
          chartType: chart.chartType,
          xAxisParameter: chart.xAxisParameter,
          yAxisParameters: chart.yAxisParameters
        }))
        setCharts(convertedCharts)
        console.log(`[Initial Load] Found ${convertedCharts.length} charts in workspace`)
      } else {
        setCharts([])
        console.log(`[Initial Load] Clean start - no charts loaded`)
      }
      
      setInitialLoadComplete(true)
    } catch (error) {
      console.error('Failed to load charts:', error)
    } finally {
      setLoading(false)
    }
  }, [clearCache])
  
  useEffect(() => {
    console.log('[Page] useEffect triggered, searchParams:', searchParams?.toString())
    setMounted(true)
    
    // Determine startup mode from URL parameters
    const startupOptions = StartupService.getEffectiveMode(searchParams)
    console.log('[Startup] Mode:', startupOptions)
    
    if (startupOptions.mode === 'interactive') {
      // Show welcome dialog for interactive mode
      setShowWelcomeDialog(true)
    } else {
      // Direct startup for other modes
      loadWorkspaceAndCharts({
        mode: startupOptions.mode === 'clean' ? 'clean' : 'restore',
        workspaceId: startupOptions.workspaceId
      })
    }
    
    // Load saved layout preference
    const savedLayout = layoutService.loadLayout()
    if (savedLayout) {
      setLayoutOption(savedLayout)
    }
    
    // Debug: Check metadata and fix if needed
    const checkAndFixMetadata = async () => {
      const info = await getDatabaseInfo()
      console.log('[Debug] Database info:', info)
      
      // Fix workspace isActive field type
      const fixedWorkspaces = await fixWorkspaceIsActiveField()
      if (fixedWorkspaces > 0) {
        console.log('[Debug] Fixed workspace isActive fields')
        const startupOptions = StartupService.getEffectiveMode(searchParams)
        await loadWorkspaceAndCharts({
          mode: startupOptions.mode === 'clean' ? 'clean' : 'restore',
          workspaceId: startupOptions.workspaceId
        })
        return
      }
      
      // DISABLED: This was deleting all saved sessions!
      // Clean up duplicate workspaces
      // if (info.workspacesCount > 1) {
      //   console.log('[Debug] Cleaning up duplicate workspaces...')
      //   const deleted = await cleanupDuplicateWorkspaces()
      //   if (deleted > 0) {
      //     const startupOptions = StartupService.getEffectiveMode(searchParams)
      //     await loadWorkspaceAndCharts({
      //       mode: startupOptions.mode === 'clean' ? 'clean' : 'restore',
      //       workspaceId: startupOptions.workspaceId
      //     })
      //     return
      //   }
      // }
      
      if (info.metadataCount > 0 && info.metadataWithDataKey === 0) {
        console.log('[Debug] Fixing metadata without dataKey...')
        const updated = await ensureMetadataHasDataKeys()
        console.log('[Debug] Fixed metadata:', updated)
        
        // Reload after fixing
        if (updated > 0) {
          const startupOptions = StartupService.getEffectiveMode(searchParams)
          loadWorkspaceAndCharts({
            mode: startupOptions.mode === 'clean' ? 'clean' : 'restore',
            workspaceId: startupOptions.workspaceId
          })
        }
      }
    }
    checkAndFixMetadata()
  }, [loadWorkspaceAndCharts, searchParams])

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

  // Handle selection change
  const handleSelectionChange = useCallback(async (newIds: number[]) => {
    setSelectedDataIds(newIds)
    
    // Convert IDs to data keys
    if (newIds.length > 0) {
      const metadata = await db.metadata.where('id').anyOf(newIds).toArray()
      console.log('[handleSelectionChange] metadata:', metadata)
      const dataKeys = metadata.map(m => m.dataKey).filter(key => key !== undefined)
      console.log('[handleSelectionChange] dataKeys:', dataKeys)
      setSelectedDataKeys(dataKeys)
      
      // Save to workspace
      await chartConfigService.updateActiveWorkspaceSelectedDataKeys(dataKeys)
    } else {
      setSelectedDataKeys([])
      await chartConfigService.updateActiveWorkspaceSelectedDataKeys([])
    }
  }, [])

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
  const dataPointsInfo = useDataPointsInfo(visibleCharts, samplingConfig, selectedDataIds);

  const handleExportWorkspace = async (filename: string) => {
    try {
      const jsonData = await chartConfigService.exportWorkspace(workspaceId)
      console.log('[Export] Workspace data:', JSON.parse(jsonData))
      const blob = new Blob([jsonData], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${filename}.json`
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
        const chartsWithData = visibleCharts.map(chart => ({
          ...chart,
          selectedDataIds: selectedDataIds
        }))
        await preloadChartData(chartsWithData, {
          batchSize: 4,
          onProgress: (loaded, total) => {
            console.log(`Sampling progress: ${loaded}/${total}`)
          }
        })
      } finally {
        setIsUpdatingSampling(false)
      }
    }
  }, [samplingConfig.targetPoints, visibleCharts, preloadChartData, initialLoadComplete, selectedDataIds])

  const handleWelcomeSelectWorkspace = async (workspaceId: string) => {
    setShowWelcomeDialog(false)
    await loadWorkspaceAndCharts({
      mode: 'restore',
      workspaceId
    })
  }

  const handleWelcomeCreateNew = async () => {
    setShowWelcomeDialog(false)
    await loadWorkspaceAndCharts({
      mode: 'clean'
    })
  }

  const handleSaveSession = async (name: string, description: string, saveAsNew: boolean) => {
    if (!workspaceId) return
    
    try {
      if (saveAsNew) {
        // Create a new workspace
        const newWorkspace = await chartConfigService.createWorkspace(name, description)
        
        // Update the new workspace with selected data keys
        await chartConfigService.updateWorkspace(newWorkspace.id!, {
          selectedDataKeys: selectedDataKeys
        })
        
        // Copy all charts from current workspace to new workspace
        const currentCharts = await chartConfigService.loadChartConfigurations(workspaceId)
        for (const chart of currentCharts) {
          await chartConfigService.saveChartConfiguration({
            ...chart,
            id: undefined, // Let the service generate a new ID
            workspaceId: newWorkspace.id!,
            createdAt: new Date(),
            updatedAt: new Date()
          })
        }
        
        // Switch to the new workspace
        await loadWorkspaceAndCharts({
          workspaceId: newWorkspace.id!
        })
        
        console.log('Session saved as new workspace successfully')
      } else {
        // Update existing workspace
        await chartConfigService.updateWorkspace(workspaceId, { 
          name, 
          description,
          selectedDataKeys: selectedDataKeys 
        })
        setWorkspaceName(name)
        setCurrentWorkspace({ 
          id: workspaceId, 
          name, 
          description 
        })
        console.log('Session updated successfully with data keys:', selectedDataKeys)
      }
    } catch (error) {
      console.error('Failed to save session:', error)
    }
  }

  const handleLoadSession = async (selectedWorkspaceId: string) => {
    if (selectedWorkspaceId === workspaceId) return
    
    await loadWorkspaceAndCharts({
      mode: 'restore',
      workspaceId: selectedWorkspaceId
    })
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
        setWorkspaceName(workspace.name || 'Imported Workspace')
        setCurrentWorkspace({ 
          id: workspace.id!, 
          name: workspace.name || 'Imported Workspace',
          description: workspace.description 
        })
        
        // Convert and set the imported charts
        const convertedCharts = importedCharts.map(chart => ({
          id: chart.id!,
          title: chart.title,
          chartType: chart.chartType,
          xAxisParameter: chart.xAxisParameter,
          yAxisParameters: chart.yAxisParameters
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
      <WelcomeDialog
        open={showWelcomeDialog}
        onSelectWorkspace={handleWelcomeSelectWorkspace}
        onCreateNew={handleWelcomeCreateNew}
      />
      
      <SaveSessionDialog
        open={showSaveSessionDialog}
        onClose={() => setShowSaveSessionDialog(false)}
        onSave={handleSaveSession}
        currentName={currentWorkspace?.name}
        currentDescription={currentWorkspace?.description}
        hasData={selectedDataKeys.length > 0}
        hasCharts={charts.length > 0}
      />
      
      <WorkspaceListDialog
        open={showWorkspaceListDialog}
        onClose={() => setShowWorkspaceListDialog(false)}
        onSelectWorkspace={handleLoadSession}
        currentWorkspaceId={workspaceId}
      />
      
      <ExportWorkspaceDialog
        open={showExportDialog}
        onClose={() => setShowExportDialog(false)}
        onExport={handleExportWorkspace}
        workspaceName={workspaceName || 'workspace'}
      />
      
      <div className="h-screen flex flex-col">
        <div className="container mx-auto p-8 pb-0 flex-shrink-0">
          <AppHeader
          onDataClick={() => setDataManagementOpen(true)}
          onCreateChartClick={() => setCreateChartOpen(true)}
          onExportClick={() => setShowExportDialog(true)}
          onImportWorkspaceClick={handleImportWorkspace}
          onSaveSessionClick={() => setShowSaveSessionDialog(true)}
          onLoadSessionClick={() => setShowWorkspaceListDialog(true)}
          isCreateChartDisabled={selectedDataIds.length === 0}
          isExportDisabled={charts.length === 0}
          workspaceName={workspaceName}
          hasDataOrCharts={selectedDataIds.length > 0 || charts.length > 0}
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
                  selectedDataIds={selectedDataIds}
                  onEdit={handleEditChart}
                  onDuplicate={handleDuplicateChart}
                  onDelete={handleDeleteChart}
                  layoutOption={layoutOption}
                  paginationEnabled={paginationEnabled}
                  currentPage={currentPage}
                  samplingConfig={samplingConfig}
                  enableProgressive={true}
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
        onSelectionChange={handleSelectionChange}
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
        selectedDataIds={selectedDataIds}
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
      
      {/* Debug Panel - Only visible when enabled */}
      {showDebugPanel && (
        <div className="fixed bottom-4 right-4 max-w-2xl max-h-[80vh] overflow-auto z-50 bg-background border rounded-lg shadow-lg">
          <div className="p-2 border-b flex justify-between items-center">
            <span className="text-sm font-semibold">Database Debug Panel</span>
            <button
              onClick={() => setShowDebugPanel(false)}
              className="text-sm px-2 py-1 hover:bg-gray-100 rounded"
            >
              Close
            </button>
          </div>
          <DatabaseDebugPanel />
        </div>
      )}
      
      {/* Debug Toggle Button */}
      <button
        onClick={() => setShowDebugPanel(!showDebugPanel)}
        className="fixed bottom-4 left-4 px-3 py-2 bg-gray-800 text-white text-xs rounded-md hover:bg-gray-700 z-50"
      >
        {showDebugPanel ? 'Hide' : 'Show'} Debug
      </button>
    </>
  )
}

export default function Home() {
  return (
    <Suspense fallback={<LoadingState />}>
      <HomeContent />
    </Suspense>
  )
}