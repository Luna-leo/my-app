'use client'

import { useEffect, useState, Suspense, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { LoadingState } from '@/components/common/LoadingState'
import { useDataPointsInfo } from '@/hooks/useDataPointsInfo'
import { useAutoSaveWorkspace } from '@/hooks/useAutoSaveWorkspace'
import { initializeApp } from '@/lib/utils/appInitializer'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'

// Custom hooks
import { useWorkspaceManagement } from '@/hooks/useWorkspaceManagement'
import { useChartManagement } from '@/hooks/useChartManagement'
import { useDialogManagement } from '@/hooks/useDialogManagement'
import { useDataSelection } from '@/hooks/useDataSelection'
import { useLayoutAndPagination } from '@/hooks/useLayoutAndPagination'

// Components
import { AppLayout } from '@/components/layout/AppLayout'
import { ChartArea } from '@/components/charts/ChartArea'
import { DialogsContainer } from '@/components/dialogs/DialogsContainer'

function HomeContent() {
  const searchParams = useSearchParams()
  const [mounted, setMounted] = useState(false)
  const [isPreloadingData, setIsPreloadingData] = useState(false)
  const [preloadProgress, setPreloadProgress] = useState({ loaded: 0, total: 0 })
  const [showLoadingProgress, setShowLoadingProgress] = useState(false)
  const [totalChartsToLoad, setTotalChartsToLoad] = useState(0)
  const [waterfallLoadedCharts, setWaterfallLoadedCharts] = useState(0)
  const [initialLoadComplete, setInitialLoadComplete] = useState(false)
  
  // Use custom hooks
  const {
    selectedDataKeys,
    setSelectedDataKeys,
    selectedDataIds,
    setSelectedDataIds,
    selectedDataLabels,
    selectedDataColors,
    handleSelectionChange,
  } = useDataSelection()
  
  const dialogProps = useDialogManagement()
  
  const {
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
  } = useWorkspaceManagement({
    onSelectedDataKeysChange: setSelectedDataKeys,
    onSelectedDataIdsChange: setSelectedDataIds,
    setIsPreloadingData,
    setPreloadProgress,
    setInitialLoadComplete,
  })
  
  const {
    layoutOption,
    currentPage,
    setCurrentPage,
    samplingConfig,
    isUpdatingSampling,
    resolutionConfig,
    chartsPerPage,
    totalPages,
    paginationEnabled,
    visibleCharts,
    handleLayoutChange,
    handleResolutionConfigChange,
  } = useLayoutAndPagination({ charts })
  
  const {
    editingChart,
    setEditingChart,
    deleteConfirmation,
    setDeleteConfirmation,
    createChart,
    updateChart,
    duplicateChart,
    handleEditChart,
    handleDeleteChart,
    confirmDelete,
  } = useChartManagement({
    workspaceId,
    charts,
    setCharts,
    layoutOption,
    currentPage,
    paginationEnabled,
    setTotalChartsToLoad,
    setShowLoadingProgress,
    setWaterfallLoadedCharts,
  })
  
  // Get data points info for visible charts
  const rawDataPointsInfo = useDataPointsInfo(visibleCharts, samplingConfig, selectedDataIds)
  const dataPointsInfo = {
    totalPoints: rawDataPointsInfo.original,
    sampledPoints: rawDataPointsInfo.sampled,
    samplingRate: rawDataPointsInfo.original > 0 ? rawDataPointsInfo.sampled / rawDataPointsInfo.original : 1,
    isLoading: rawDataPointsInfo.isLoading,
    // For ResolutionControls compatibility
    original: rawDataPointsInfo.original,
    sampled: rawDataPointsInfo.sampled
  }
  
  // Auto-save workspace
  useAutoSaveWorkspace({
    workspace: currentWorkspace ? {
      id: currentWorkspace.id,
      name: currentWorkspace.name,
      description: currentWorkspace.description,
      isActive: true,
      selectedDataKeys,
      createdAt: new Date(),
      updatedAt: new Date()
    } : null,
    selectedDataKeys,
    enabled: !!currentWorkspace && !loading
  })
  
  // Add ref to track last searchParams
  const lastSearchParamsRef = useRef('')
  
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
    const doInitialize = async () => {
      try {
        const result = await initializeApp(searchParams)
        
        if (result.mode === 'interactive') {
          // Show welcome dialog for interactive mode
          console.log('[Page] Showing welcome dialog')
          dialogProps.setShowWelcomeDialog(true)
        } else {
          // Direct startup for other modes
          console.log('[Page] Starting direct load with options:', result)
          
          try {
            await loadWorkspaceAndCharts({
              mode: result.mode,
              workspaceId: result.workspaceId
            })
            console.log('[Page] Direct load completed')
          } catch (loadError) {
            console.error('[Page] Error during loadWorkspaceAndCharts:', loadError)
          }
        }
      } catch (error) {
        console.error('[Page] Initialization error:', error)
      }
    }
    
    // Run initialization
    doInitialize()
  }, [searchParams, loadWorkspaceAndCharts, mounted, dialogProps]) // Only re-run if searchParams change
  
  // Reset waterfall loading when page changes
  useEffect(() => {
    if (paginationEnabled && charts.length > 0) {
      setWaterfallLoadedCharts(0)
      const startIndex = (currentPage - 1) * chartsPerPage
      const visibleChartCount = Math.min(chartsPerPage, Math.max(0, charts.length - startIndex))
      setTotalChartsToLoad(visibleChartCount)
      setShowLoadingProgress(true)
    }
  }, [currentPage, charts.length, chartsPerPage, paginationEnabled])
  
  // Set up waterfall loading when charts are loaded initially
  useEffect(() => {
    if (initialLoadComplete && charts.length > 0) {
      const chartsPerPageCalc = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
      const startIndex = (currentPage - 1) * chartsPerPageCalc
      const visibleChartCount = paginationEnabled && layoutOption 
        ? Math.min(chartsPerPageCalc, Math.max(0, charts.length - startIndex))
        : charts.length
      
      setTotalChartsToLoad(visibleChartCount)
      setWaterfallLoadedCharts(0)
      setShowLoadingProgress(true)
    }
  }, [initialLoadComplete, charts.length, layoutOption, currentPage, paginationEnabled])

  const handleImportComplete = () => {
    console.log('CSV import completed successfully')
  }

  const handleCreateChart = async (config: ChartConfiguration) => {
    await createChart(config)
    dialogProps.setCreateChartOpen(false)
  }

  const handleWelcomeSelectWorkspace = async (workspaceId: string) => {
    dialogProps.setShowWelcomeDialog(false)
    await loadWorkspaceAndCharts({
      mode: 'restore',
      workspaceId
    })
  }

  const handleWelcomeCreateNew = async () => {
    dialogProps.setShowWelcomeDialog(false)
    await loadWorkspaceAndCharts({
      mode: 'clean'
    })
  }

  const handleSaveSession = async (name: string, description: string, saveAsNew: boolean) => {
    await saveSession(name, description, saveAsNew, selectedDataKeys, charts)
  }

  const handleLoadSession = async (selectedWorkspaceId: string) => {
    if (selectedWorkspaceId === workspaceId) return
    await loadWorkspaceAndCharts({
      mode: 'restore',
      workspaceId: selectedWorkspaceId
    })
  }
  
  const handleSelectWorkspace = async (selectedWorkspaceId: string) => {
    await handleLoadSession(selectedWorkspaceId)
  }
  
  const handleCreateNewSession = () => {
    window.location.href = '/?clean=true'
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
        await importWorkspace(text)
      } catch (error) {
        console.error('Failed to import workspace:', error)
        alert('Failed to import workspace. Please check the file format.')
      }
    }
    
    input.click()
  }

  return (
    <>
      <DialogsContainer
        {...dialogProps}
        selectedDataIds={selectedDataIds}
        onSelectionChange={handleSelectionChange}
        onImportComplete={handleImportComplete}
        onCreateChart={handleCreateChart}
        editingChart={editingChart}
        setEditingChart={setEditingChart}
        onUpdateChart={updateChart}
        onWelcomeSelectWorkspace={handleWelcomeSelectWorkspace}
        onWelcomeCreateNew={handleWelcomeCreateNew}
        onSaveSession={handleSaveSession}
        currentWorkspace={currentWorkspace}
        hasData={selectedDataKeys.length > 0}
        hasCharts={charts.length > 0}
        onSelectWorkspace={handleLoadSession}
        currentWorkspaceId={workspaceId}
        onExport={exportWorkspace}
        workspaceName={workspaceName || 'workspace'}
        deleteConfirmation={deleteConfirmation}
        setDeleteConfirmation={setDeleteConfirmation}
        onConfirmDelete={confirmDelete}
      />
      
      <AppLayout
        onDataClick={() => dialogProps.setDataManagementOpen(true)}
        onCreateChartClick={() => dialogProps.setCreateChartOpen(true)}
        onExportClick={() => dialogProps.setShowExportDialog(true)}
        onImportWorkspaceClick={handleImportWorkspace}
        onSaveSessionClick={() => dialogProps.setShowSaveSessionDialog(true)}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateNewSession={handleCreateNewSession}
        isCreateChartDisabled={selectedDataIds.length === 0}
        currentWorkspace={currentWorkspace}
        hasDataOrCharts={selectedDataIds.length > 0 || charts.length > 0}
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
        mounted={mounted}
      >
        <ChartArea
          loading={loading}
          isPreloadingData={isPreloadingData}
          preloadProgress={preloadProgress}
          charts={charts}
          selectedDataIds={selectedDataIds}
          showLoadingProgress={showLoadingProgress}
          totalChartsToLoad={totalChartsToLoad}
          waterfallLoadedCharts={waterfallLoadedCharts}
          layoutOption={layoutOption}
          paginationEnabled={paginationEnabled}
          currentPage={currentPage}
          samplingConfig={samplingConfig}
          resolutionConfig={resolutionConfig}
          onEdit={handleEditChart}
          onDuplicate={duplicateChart}
          onDelete={handleDeleteChart}
          onAllChartsLoaded={() => setShowLoadingProgress(false)}
          onChartLoaded={(count) => {
            setWaterfallLoadedCharts(count)
            const startIndex = paginationEnabled && layoutOption ? (currentPage - 1) * chartsPerPage : 0
            const visibleChartCount = Math.min(chartsPerPage, Math.max(0, charts.length - startIndex))
            setTotalChartsToLoad(visibleChartCount)
          }}
        />
      </AppLayout>
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