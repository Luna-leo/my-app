import { useState, useCallback } from 'react'
import { chartConfigService } from '@/lib/services/chartConfigurationService'
import { ChartConfiguration as DBChartConfiguration } from '@/lib/db/schema'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { db } from '@/lib/db'
import { useChartDataContext } from '@/contexts/ChartDataContext'

interface WorkspaceData {
  id: string
  name: string
  description?: string
}

interface StartupOptions {
  mode?: 'clean' | 'restore'
  workspaceId?: string
}

interface UseWorkspaceManagementProps {
  onSelectedDataKeysChange: (keys: string[]) => void
  onSelectedDataIdsChange: (ids: number[]) => void
  setIsPreloadingData: (loading: boolean) => void
  setPreloadProgress: (progress: { loaded: number; total: number }) => void
  setInitialLoadComplete: (complete: boolean) => void
}

export function useWorkspaceManagement({
  onSelectedDataKeysChange,
  onSelectedDataIdsChange,
  setIsPreloadingData,
  setPreloadProgress,
  setInitialLoadComplete,
}: UseWorkspaceManagementProps) {
  const [workspaceId, setWorkspaceId] = useState<string>('')
  const [workspaceName, setWorkspaceName] = useState<string>('')
  const [currentWorkspace, setCurrentWorkspace] = useState<WorkspaceData | null>(null)
  const [loading, setLoading] = useState(true)
  const [charts, setCharts] = useState<(ChartConfiguration & { id: string })[]>([])
  
  const { preloadChartData, clearCache } = useChartDataContext()

  const loadWorkspaceAndCharts = useCallback(async (startupOptions?: StartupOptions) => {
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
      console.log('[loadWorkspaceAndCharts] Workspace selectedDataKeys:', workspace.selectedDataKeys)
      
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
        console.log('[loadWorkspaceAndCharts] Loading selected data keys from workspace:', workspace.selectedDataKeys)
        onSelectedDataKeysChange(workspace.selectedDataKeys)
        
        // Convert data keys to IDs for backward compatibility
        const metadata = await db.getMetadataByDataKeys(workspace.selectedDataKeys)
        console.log('[loadWorkspaceAndCharts] Retrieved metadata:', metadata)
        const ids = metadata.map(m => m.id!).filter(id => id !== undefined)
        console.log('[loadWorkspaceAndCharts] Converted data keys to IDs:', ids)
        onSelectedDataIdsChange(ids)
        currentSelectedDataIds = ids
      } else if (startupOptions?.mode !== 'clean') {
        // Migrate from chart-based selection if needed
        console.log('[loadWorkspaceAndCharts] Attempting to migrate selected data from charts')
        const migratedKeys = await chartConfigService.migrateSelectedDataFromCharts(workspace.id!)
        console.log('[loadWorkspaceAndCharts] Migrated keys:', migratedKeys)
        onSelectedDataKeysChange(migratedKeys)
        
        // Convert to IDs
        if (migratedKeys.length > 0) {
          const metadata = await db.getMetadataByDataKeys(migratedKeys)
          const ids = metadata.map(m => m.id!).filter(id => id !== undefined)
          console.log('[loadWorkspaceAndCharts] Migrated IDs:', ids)
          onSelectedDataIdsChange(ids)
          currentSelectedDataIds = ids
        }
      } else {
        // Clean start - clear selections
        console.log('[loadWorkspaceAndCharts] Clean start mode - clearing selections')
        onSelectedDataKeysChange([])
        onSelectedDataIdsChange([])
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
          }
          
          console.log(`[Initial Load] Data preloading complete`)
          setIsPreloadingData(false)
        }
        
        // Now set the charts (data is already cached)
        setCharts(convertedCharts)
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
      onSelectedDataKeysChange([])
      onSelectedDataIdsChange([])
    } finally {
      console.log('[loadWorkspaceAndCharts] Finally block - cleaning up')
      setLoading(false)
      setIsPreloadingData(false)
      console.log('[loadWorkspaceAndCharts] Cleanup complete')
    }
  }, [
    clearCache,
    onSelectedDataIdsChange,
    onSelectedDataKeysChange,
    preloadChartData,
    setInitialLoadComplete,
    setIsPreloadingData,
    setPreloadProgress,
  ])

  const saveSession = useCallback(async (
    name: string, 
    description: string, 
    saveAsNew: boolean,
    selectedDataKeys: string[],
    currentCharts: (ChartConfiguration & { id: string })[]
  ) => {
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
  }, [workspaceId, loadWorkspaceAndCharts])

  const importWorkspace = useCallback(async (jsonData: string) => {
    const { workspace, charts: importedCharts } = await chartConfigService.importWorkspace(jsonData)
    
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
    
    console.log(`[Import] Workspace imported with ${convertedCharts.length} charts`)
    setLoading(false)
    
    setInitialLoadComplete(true)
  }, [clearCache, setInitialLoadComplete])

  const exportWorkspace = useCallback(async (filename: string) => {
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
  }, [workspaceId])

  return {
    workspaceId,
    workspaceName,
    currentWorkspace,
    loading,
    charts,
    setCharts,
    loadWorkspaceAndCharts,
    saveSession,
    importWorkspace,
    exportWorkspace,
  }
}