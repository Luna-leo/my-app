'use client'

import { useEffect, useState, useCallback, useMemo, Suspense, useRef } from 'react'
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
import { ChartLoadingProgress } from '@/components/charts/ChartLoadingProgress'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { DataSelectionBar } from '@/components/layout/DataSelectionBar'
import { layoutService } from '@/lib/services/layoutService'
import { SamplingConfig, DEFAULT_SAMPLING_CONFIG } from '@/lib/utils/chartDataSampling'
import { ResolutionConfig } from '@/components/layout/ResolutionControls'
import { useDataPointsInfo } from '@/hooks/useDataPointsInfo'
import { metadataService } from '@/lib/services/metadataService'
import { colorService } from '@/lib/services/colorService'
import { db } from '@/lib/db'
import { ensureMetadataHasDataKeys, getDatabaseInfo, fixWorkspaceIsActiveField, cleanupDuplicateActiveWorkspaces, ensureOneWorkspaceActive } from '@/lib/utils/dbMigrationUtils'
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
  const [samplingConfig] = useState<SamplingConfig>(DEFAULT_SAMPLING_CONFIG)
  const [isUpdatingSampling] = useState(false)
  const [resolutionConfig, setResolutionConfig] = useState<ResolutionConfig>({
    mode: 'auto',
    resolution: 'preview',
    applyToAll: true
  })
  const [, setInitialLoadComplete] = useState(false)
  const [selectedDataLabels, setSelectedDataLabels] = useState<Map<number, string>>(new Map())
  const [selectedDataColors, setSelectedDataColors] = useState<Map<number, string>>(new Map())
  const [showWelcomeDialog, setShowWelcomeDialog] = useState(false)
  const [showSaveSessionDialog, setShowSaveSessionDialog] = useState(false)
  const [showWorkspaceListDialog, setShowWorkspaceListDialog] = useState(false)
  const [showExportDialog, setShowExportDialog] = useState(false)
  const [currentWorkspace, setCurrentWorkspace] = useState<{ id: string; name: string; description?: string } | null>(null)
  const [waterfallLoadedCharts, setWaterfallLoadedCharts] = useState(0)
  const [totalChartsToLoad, setTotalChartsToLoad] = useState(0)
  const [showLoadingProgress, setShowLoadingProgress] = useState(false)
  const [isPreloadingData, setIsPreloadingData] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState({ loaded: 0, total: 0 })
  const { preloadChartData, clearCache, clearChartCache } = useChartDataContext()
  
  // Add ref to track last searchParams
  const lastSearchParamsRef = useRef('')
  
  // Calculate pagination info
  const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
  const totalPages = Math.ceil(charts.length / chartsPerPage)
  const paginationEnabled = layoutOption?.paginationEnabled ?? false
  
  const loadWorkspaceAndCharts = async (startupOptions?: { mode?: 'clean' | 'restore', workspaceId?: string }) => {
    // Don't check isInitializingRef here - let the caller handle it
    console.log('[loadWorkspaceAndCharts] Starting...')
    
    try {
      setLoading(true)
      console.log('[loadWorkspaceAndCharts] Starting with options:', startupOptions)
      
      // Clear cache before loading new workspace
      clearCache()
      
      let workspace
      
      if (startupOptions?.mode === 'clean') {
        console.log('[loadWorkspaceAndCharts] Clean start mode')
        
        // Clean up empty workspaces before creating a new one
        try {
          const deletedCount = await chartConfigService.cleanupEmptyWorkspaces()
          if (deletedCount > 0) {
            console.log(`[loadWorkspaceAndCharts] Cleaned up ${deletedCount} empty workspaces`)
          }
        } catch (error) {
          console.error('[loadWorkspaceAndCharts] Error cleaning up empty workspaces:', error)
          // Continue with clean start even if cleanup fails
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
      
      console.log('[loadWorkspaceAndCharts] Setting workspace state...')
      setWorkspaceId(workspace.id!)
      setWorkspaceName(workspace.name || 'Unnamed Workspace')
      setCurrentWorkspace({ 
        id: workspace.id!, 
        name: workspace.name || 'Unnamed Workspace',
        description: workspace.description 
      })
      console.log('[loadWorkspaceAndCharts] Workspace state set')
      
      // Load selected data keys from workspace (skip for clean start)
      let currentSelectedDataIds: number[] = []
      
      if (startupOptions?.mode !== 'clean' && workspace.selectedDataKeys && workspace.selectedDataKeys.length > 0) {
        setSelectedDataKeys(workspace.selectedDataKeys)
        
        // Convert data keys to IDs for backward compatibility
        const metadata = await db.getMetadataByDataKeys(workspace.selectedDataKeys)
        const ids = metadata.map(m => m.id!).filter(id => id !== undefined)
        setSelectedDataIds(ids)
        currentSelectedDataIds = ids
      } else if (startupOptions?.mode !== 'clean') {
        // Migrate from chart-based selection if needed
        const migratedKeys = await chartConfigService.migrateSelectedDataFromCharts(workspace.id!)
        setSelectedDataKeys(migratedKeys)
        
        // Convert to IDs
        if (migratedKeys.length > 0) {
          const metadata = await db.getMetadataByDataKeys(migratedKeys)
          const ids = metadata.map(m => m.id!).filter(id => id !== undefined)
          setSelectedDataIds(ids)
          currentSelectedDataIds = ids
        }
      } else {
        // Clean start - clear selections
        setSelectedDataKeys([])
        setSelectedDataIds([])
        currentSelectedDataIds = []
      }
      
      // Load charts (skip for clean start)
      if (startupOptions?.mode !== 'clean') {
        console.log('[loadWorkspaceAndCharts] Loading charts from workspace...')
        const savedCharts = await chartConfigService.loadChartConfigurations(workspace.id)
        console.log('[loadWorkspaceAndCharts] Loaded charts:', savedCharts.length)
        
        const convertedCharts = savedCharts.map(chart => ({
          id: chart.id!,
          title: chart.title,
          chartType: chart.chartType,
          xAxisParameter: chart.xAxisParameter,
          yAxisParameters: chart.yAxisParameters
        }))
        console.log(`[Initial Load] Found ${convertedCharts.length} charts in workspace`)
        
        // Preload data for all charts before displaying them
        if (convertedCharts.length > 0 && currentSelectedDataIds.length > 0) {
          setIsPreloadingData(true)
          setPreloadProgress({ loaded: 0, total: convertedCharts.length })
          
          console.log(`[Initial Load] Preloading data for ${convertedCharts.length} charts with ${currentSelectedDataIds.length} data IDs`)
          
          // Prepare chart configurations for preloading
          const chartsWithData = convertedCharts.map(chart => ({
            ...chart,
            selectedDataIds: currentSelectedDataIds
          }))
          
          try {
            await preloadChartData(chartsWithData, {
              onProgress: (loaded, total) => {
                console.log(`[Preload Progress] ${loaded}/${total} charts`)
                setPreloadProgress({ loaded, total })
              }
            })
          } catch (preloadError) {
            console.error('[Initial Load] Error preloading chart data:', preloadError)
            // Continue without preloading - charts will load individually
          }
          
          console.log(`[Initial Load] Data preloading complete`)
          setIsPreloadingData(false)
        }
        
        // Now set the charts (data is already cached)
        setCharts(convertedCharts)
        
        // Set up waterfall loading progress
        if (convertedCharts.length > 0) {
          // Calculate visible charts based on pagination
          const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : convertedCharts.length
          const startIndex = (currentPage - 1) * chartsPerPage
          const visibleChartCount = paginationEnabled && layoutOption 
            ? Math.min(chartsPerPage, Math.max(0, convertedCharts.length - startIndex))
            : convertedCharts.length
          
          setTotalChartsToLoad(visibleChartCount)
          setWaterfallLoadedCharts(0)
          setShowLoadingProgress(true)
        }
      } else {
        setCharts([])
        console.log(`[Initial Load] Clean start - no charts loaded`)
      }
      
      console.log('[loadWorkspaceAndCharts] Setting initial load complete')
      setInitialLoadComplete(true)
      console.log('[loadWorkspaceAndCharts] Function completed successfully')
    } catch (error) {
      console.error('Failed to load charts:', error)
      // Set some reasonable defaults on error
      setCharts([])
      setWorkspaceId('')
      setWorkspaceName('Default Workspace')
      setCurrentWorkspace(null)
      setSelectedDataKeys([])
      setSelectedDataIds([])
    } finally {
      // Always ensure loading is set to false
      console.log('[loadWorkspaceAndCharts] Finally block - cleaning up')
      setLoading(false)
      setIsPreloadingData(false)
      setShowLoadingProgress(false)
      // Don't reset isInitializingRef here - let the caller handle it
      console.log('[loadWorkspaceAndCharts] Cleanup complete')
    }
  }
  
  useEffect(() => {
    console.log('[Page] useEffect triggered, searchParams:', searchParams?.toString())
    
    // Skip if already mounted and searchParams haven't changed
    if (mounted) {
      const currentParams = searchParams?.toString() || ''
      if (lastSearchParamsRef.current === currentParams) {
        console.log('[Page] Already mounted with same params, skipping')
        return
      }
    }
    
    setMounted(true)
    lastSearchParamsRef.current = searchParams?.toString() || ''
    
    // Initialize the app
    const initializeApp = async () => {
      
      // Set a timeout to prevent infinite loading state
      const loadingTimeout = setTimeout(() => {
        console.error('[Page] Initialization timeout - forcing loading to false')
        setLoading(false)
      }, 10000) // 10 second timeout
      
      try {
        // Load saved layout preference first
        const savedLayout = layoutService.loadLayout()
        if (savedLayout) {
          setLayoutOption(savedLayout)
        }
        
        // Skip database checks if URL parameter is set
        const skipDbChecks = searchParams?.get('skipDbChecks') === 'true'
        
        if (!skipDbChecks) {
          // Check and fix database issues before proceeding
          try {
            console.log('[Page] Starting database checks...')
            const info = await getDatabaseInfo()
            console.log('[Debug] Database info:', info)
            
            // First clean up duplicate active workspaces
            console.log('[Page] Cleaning up duplicate active workspaces...')
            try {
              const cleaned = await cleanupDuplicateActiveWorkspaces()
              if (cleaned > 0) {
                console.log(`[Debug] Deactivated ${cleaned} duplicate active workspaces`)
              }
            } catch (cleanupError) {
              console.error('[Page] Error cleaning up duplicate active workspaces:', cleanupError)
            }
            
            // Then fix workspace isActive field type if needed
            console.log('[Page] Checking workspace isActive fields...')
            try {
              const fixedWorkspaces = await fixWorkspaceIsActiveField()
              if (fixedWorkspaces > 0) {
                console.log('[Debug] Fixed workspace isActive fields')
              }
            } catch (fixError) {
              console.error('[Page] Error fixing workspace isActive fields:', fixError)
              
              // If it's a constraint error, log more details
              if (fixError instanceof Error && fixError.name === 'ConstraintError') {
                console.error('[Page] Constraint error details:', {
                  message: fixError.message,
                  stack: fixError.stack
                })
                console.log('[Page] This error might be due to database corruption.')
                console.log('[Page] You can skip database checks by adding ?skipDbChecks=true to the URL')
                
                // Try a simpler approach as fallback
                console.log('[Page] Attempting simpler workspace fix...')
                try {
                  const ensured = await ensureOneWorkspaceActive()
                  if (ensured) {
                    console.log('[Page] Successfully ensured one workspace is active')
                  } else {
                    console.log('[Page] Could not ensure active workspace, but continuing anyway')
                  }
                } catch (ensureError) {
                  console.error('[Page] Even the simple fix failed:', ensureError)
                }
              }
              
              // Continue without fixing - the app should still work
              console.log('[Page] Continuing despite the error...')
            }
            
            // Fix metadata without dataKey if needed
            if (info.metadataCount > 0 && info.metadataWithDataKey === 0) {
              console.log('[Debug] Fixing metadata without dataKey...')
              const updated = await ensureMetadataHasDataKeys()
              console.log('[Debug] Fixed metadata:', updated)
            }
            
            console.log('[Page] Database checks completed')
          } catch (dbError) {
            console.error('[Page] Database check error:', dbError)
            console.log('[Page] Continuing without database checks...')
            // Continue initialization even if database checks fail
          }
        } else {
          console.log('[Page] Skipping database checks (skipDbChecks=true)')
        }
        
        // Now determine startup mode and proceed
        const startupOptions = StartupService.getEffectiveMode(searchParams)
        console.log('[Startup] Mode:', startupOptions)
        
        if (startupOptions.mode === 'interactive') {
          // Show welcome dialog for interactive mode
          // IMPORTANT: Set loading to false when showing the dialog
          console.log('[Page] Showing welcome dialog, setting loading to false')
          setLoading(false)
          setShowWelcomeDialog(true)
        } else {
          // Direct startup for other modes
          console.log('[Page] Starting direct load with options:', {
            mode: startupOptions.mode === 'clean' ? 'clean' : 'restore',
            workspaceId: startupOptions.workspaceId
          })
          
          try {
            await loadWorkspaceAndCharts({
              mode: startupOptions.mode === 'clean' ? 'clean' : 'restore',
              workspaceId: startupOptions.workspaceId
            })
            console.log('[Page] Direct load completed')
          } catch (loadError) {
            console.error('[Page] Error during loadWorkspaceAndCharts:', loadError)
            // Ensure loading is false on error
            setLoading(false)
          }
        }
      } catch (error) {
        console.error('[Page] Initialization error:', error)
        console.error('[Page] Error stack:', error instanceof Error ? error.stack : 'No stack trace')
        // Ensure loading is false on error
        setLoading(false)
      } finally {
        // Clear the timeout
        clearTimeout(loadingTimeout)
        console.log('[Page] Initialization complete')
      }
    }
    
    // Run initialization
    initializeApp()
    
    // No cleanup needed
  }, [searchParams]) // Only re-run if searchParams change

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
  
  // Reset waterfall loading when page changes
  useEffect(() => {
    if (paginationEnabled && charts.length > 0) {
      setWaterfallLoadedCharts(0)
      const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
      const startIndex = (currentPage - 1) * chartsPerPage
      const visibleChartCount = Math.min(chartsPerPage, Math.max(0, charts.length - startIndex))
      setTotalChartsToLoad(visibleChartCount)
      setShowLoadingProgress(true)
    }
  }, [currentPage, charts.length, layoutOption, paginationEnabled])

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
    const newCharts = [...charts, newChart]
    setCharts(newCharts)
    setCreateChartOpen(false)
    
    // Update waterfall loading state for the new chart
    const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : newCharts.length
    const startIndex = paginationEnabled && layoutOption ? (currentPage - 1) * chartsPerPage : 0
    const visibleChartCount = Math.min(chartsPerPage, Math.max(0, newCharts.length - startIndex))
    
    setTotalChartsToLoad(visibleChartCount)
    setShowLoadingProgress(true)
    
    // Reset waterfall loaded count to ensure new chart gets loaded
    // The ChartGrid will automatically handle the new chart in its waterfall sequence
    setWaterfallLoadedCharts(prev => {
      // Keep the count of already loaded charts, but ensure it's not more than the new visible count
      return Math.min(prev, visibleChartCount - 1)
    })
    
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
      const newCharts = [...charts, duplicatedChart]
      setCharts(newCharts)
      
      // Update waterfall loading state to ensure the duplicated chart gets loaded
      const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : newCharts.length
      const startIndex = paginationEnabled && layoutOption ? (currentPage - 1) * chartsPerPage : 0
      const visibleChartCount = Math.min(chartsPerPage, Math.max(0, newCharts.length - startIndex))
      
      setTotalChartsToLoad(visibleChartCount)
      setShowLoadingProgress(true)
      
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
      // Clear the cache for this chart first
      clearChartCache(deleteConfirmation.chartId)
      
      const newCharts = charts.filter(c => c.id !== deleteConfirmation.chartId)
      setCharts(newCharts)
      
      // Update waterfall loading state after deletion
      if (newCharts.length > 0) {
        const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : newCharts.length
        const startIndex = paginationEnabled && layoutOption ? (currentPage - 1) * chartsPerPage : 0
        const visibleChartCount = Math.min(chartsPerPage, Math.max(0, newCharts.length - startIndex))
        setTotalChartsToLoad(visibleChartCount)
        // Don't reset waterfall loaded charts count - let ChartGrid handle it
        // The ChartGrid component will automatically remove the deleted chart from its internal map
        // and continue loading from where it left off
      } else {
        setTotalChartsToLoad(0)
        setShowLoadingProgress(false)
        setWaterfallLoadedCharts(0)
      }
      
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

  // Handle resolution config changes
  const handleResolutionConfigChange = useCallback(async (newConfig: ResolutionConfig) => {
    setResolutionConfig(newConfig)
    
    // Note: When applyToAll is true, all charts will automatically update
    // through the globalResolution prop. No need for batch processing here.
  }, [])

  const handleWelcomeSelectWorkspace = async (workspaceId: string) => {
    setShowWelcomeDialog(false)
    try {
      await loadWorkspaceAndCharts({
        mode: 'restore',
        workspaceId
      })
    } catch (error) {
      console.error('[handleWelcomeSelectWorkspace] Error loading workspace:', error)
      // Ensure loading is false even on error
      setLoading(false)
      // Optionally show error to user or retry
    }
  }

  const handleWelcomeCreateNew = async () => {
    setShowWelcomeDialog(false)
    try {
      await loadWorkspaceAndCharts({
        mode: 'clean'
      })
    } catch (error) {
      console.error('[handleWelcomeCreateNew] Error creating new workspace:', error)
      // Ensure loading is false even on error
      setLoading(false)
      // Optionally show error to user or retry
    }
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
                resolutionConfig={resolutionConfig}
                onResolutionConfigChange={handleResolutionConfigChange}
                dataPointsInfo={dataPointsInfo}
                isUpdatingResolution={isUpdatingSampling}
              />
            </div>
            {loading || isPreloadingData ? (
              <div className="container mx-auto p-8 flex-1">
                {isPreloadingData ? (
                  <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-4">
                      <h3 className="text-lg font-semibold mb-2">Loading workspace data...</h3>
                      <p className="text-sm text-muted-foreground">
                        Preparing your charts for optimal performance
                      </p>
                    </div>
                    <ChartLoadingProgress
                      totalCharts={preloadProgress.total}
                      loadedCharts={preloadProgress.loaded}
                      showEstimatedTime={true}
                    />
                  </div>
                ) : (
                  <LoadingState
                    message="Loading charts..."
                  />
                )}
              </div>
            ) : charts.length > 0 ? (
              <div className="container mx-auto px-8 pb-8 flex-1 overflow-hidden">
                {showLoadingProgress && (
                  <div className="mb-4">
                    <ChartLoadingProgress
                      totalCharts={totalChartsToLoad}
                      loadedCharts={waterfallLoadedCharts}
                      showEstimatedTime={true}
                    />
                  </div>
                )}
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
                  enableWaterfall={true}
                  waterfallDelay={300}
                  globalResolution={resolutionConfig.applyToAll && resolutionConfig.mode === 'manual' ? resolutionConfig.resolution : undefined}
                  globalAutoUpgrade={resolutionConfig.mode === 'auto'}
                  onAllChartsLoaded={() => {
                    setShowLoadingProgress(false)
                  }}
                  onChartLoaded={(count) => {
                    setWaterfallLoadedCharts(count)
                    // Update total charts to load dynamically based on visible charts
                    const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
                    const startIndex = paginationEnabled && layoutOption ? (currentPage - 1) * chartsPerPage : 0
                    const visibleChartCount = Math.min(chartsPerPage, Math.max(0, charts.length - startIndex))
                    setTotalChartsToLoad(visibleChartCount)
                  }}
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