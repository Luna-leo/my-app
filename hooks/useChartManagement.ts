import { useState, useCallback } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { ChartConfiguration as DBChartConfiguration } from '@/lib/db/schema'
import { chartConfigService } from '@/lib/services/chartConfigurationService'
import { useChartDataContext } from '@/contexts/ChartDataContext'

interface UseChartManagementProps {
  workspaceId: string
  layoutOption: any
  currentPage: number
  paginationEnabled: boolean
  setTotalChartsToLoad: (total: number) => void
  setShowLoadingProgress: (show: boolean) => void
  setWaterfallLoadedCharts: (count: number | ((prev: number) => number)) => void
}

export function useChartManagement({
  workspaceId,
  layoutOption,
  currentPage,
  paginationEnabled,
  setTotalChartsToLoad,
  setShowLoadingProgress,
  setWaterfallLoadedCharts,
}: UseChartManagementProps) {
  const [charts, setCharts] = useState<(ChartConfiguration & { id: string })[]>([])
  const [editingChart, setEditingChart] = useState<(ChartConfiguration & { id: string }) | null>(null)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ open: boolean; chartId: string | null }>({
    open: false,
    chartId: null
  })
  
  const { clearChartCache } = useChartDataContext()

  const createChart = useCallback(async (config: ChartConfiguration) => {
    const newChart = {
      ...config,
      id: Date.now().toString(),
      chartType: config.chartType || 'line' as const
    }
    const newCharts = [...charts, newChart]
    setCharts(newCharts)
    
    // Update waterfall loading state for the new chart
    const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : newCharts.length
    const startIndex = paginationEnabled && layoutOption ? (currentPage - 1) * chartsPerPage : 0
    const visibleChartCount = Math.min(chartsPerPage, Math.max(0, newCharts.length - startIndex))
    
    setTotalChartsToLoad(visibleChartCount)
    setShowLoadingProgress(true)
    
    // Reset waterfall loaded count to ensure new chart gets loaded
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
    
    return newChart
  }, [charts, layoutOption, currentPage, paginationEnabled, workspaceId, setTotalChartsToLoad, setShowLoadingProgress, setWaterfallLoadedCharts])

  const updateChart = useCallback(async (updatedChart: ChartConfiguration & { id: string }) => {
    setCharts(charts.map(c => c.id === updatedChart.id ? updatedChart : c))
    setEditingChart(null)
    
    // Save to database
    const dbConfig: DBChartConfiguration = {
      ...updatedChart,
      workspaceId,
      createdAt: new Date(), // This will be overwritten by the service if it exists
      updatedAt: new Date()
    }
    await chartConfigService.saveChartConfigurationDebounced(dbConfig)
  }, [charts, workspaceId])

  const duplicateChart = useCallback(async (chartId: string) => {
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
  }, [charts, layoutOption, currentPage, paginationEnabled, workspaceId, setTotalChartsToLoad, setShowLoadingProgress])

  const deleteChart = useCallback(async (chartId: string) => {
    // Clear the cache for this chart first
    clearChartCache(chartId)
    
    const newCharts = charts.filter(c => c.id !== chartId)
    setCharts(newCharts)
    
    // Update waterfall loading state after deletion
    if (newCharts.length > 0) {
      const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : newCharts.length
      const startIndex = paginationEnabled && layoutOption ? (currentPage - 1) * chartsPerPage : 0
      const visibleChartCount = Math.min(chartsPerPage, Math.max(0, newCharts.length - startIndex))
      setTotalChartsToLoad(visibleChartCount)
    } else {
      setTotalChartsToLoad(0)
      setShowLoadingProgress(false)
      setWaterfallLoadedCharts(0)
    }
    
    await chartConfigService.deleteChartConfiguration(chartId)
  }, [charts, clearChartCache, layoutOption, currentPage, paginationEnabled, setTotalChartsToLoad, setShowLoadingProgress, setWaterfallLoadedCharts])

  const handleEditChart = useCallback((chartId: string) => {
    const chartToEdit = charts.find(c => c.id === chartId)
    if (chartToEdit) {
      setEditingChart(chartToEdit)
    }
  }, [charts])

  const handleDeleteChart = useCallback((chartId: string) => {
    setDeleteConfirmation({ open: true, chartId })
  }, [])

  const confirmDelete = useCallback(async () => {
    if (deleteConfirmation.chartId) {
      await deleteChart(deleteConfirmation.chartId)
    }
    setDeleteConfirmation({ open: false, chartId: null })
  }, [deleteConfirmation.chartId, deleteChart])

  return {
    charts,
    setCharts,
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
  }
}