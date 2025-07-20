import { useState, useCallback, useMemo, useEffect } from 'react'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { layoutService } from '@/lib/services/layoutService'
import { ResolutionConfig } from '@/components/layout/ResolutionControls'
import { SamplingConfig, DEFAULT_SAMPLING_CONFIG } from '@/lib/utils/chartDataSampling'

interface UseLayoutAndPaginationProps {
  charts: any[]
}

export function useLayoutAndPagination({ charts }: UseLayoutAndPaginationProps) {
  const [layoutOption, setLayoutOption] = useState<LayoutOption | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [samplingConfig] = useState<SamplingConfig>(DEFAULT_SAMPLING_CONFIG)
  const [isUpdatingSampling] = useState(false)
  const [resolutionConfig, setResolutionConfig] = useState<ResolutionConfig>({
    mode: 'auto',
    resolution: 'preview',
    applyToAll: true
  })

  // Load saved layout preference on mount
  useEffect(() => {
    const savedLayout = layoutService.loadLayout()
    if (savedLayout) {
      setLayoutOption(savedLayout)
    }
  }, [])

  // Calculate pagination info
  const chartsPerPage = layoutOption ? layoutOption.rows * layoutOption.cols : charts.length
  const totalPages = Math.ceil(charts.length / chartsPerPage)
  const paginationEnabled = layoutOption?.paginationEnabled ?? false

  // Ensure current page is valid
  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [currentPage, totalPages])

  // Calculate visible charts for pagination
  const visibleCharts = useMemo(() => {
    if (!paginationEnabled || !layoutOption) {
      return charts
    }
    const startIndex = (currentPage - 1) * chartsPerPage
    const endIndex = startIndex + chartsPerPage
    return charts.slice(startIndex, endIndex)
  }, [charts, paginationEnabled, layoutOption, currentPage, chartsPerPage])

  const handleLayoutChange = useCallback((layout: LayoutOption | null) => {
    setLayoutOption(layout)
    layoutService.saveLayout(layout)
    // Reset to first page when layout changes
    setCurrentPage(1)
  }, [])

  const handleResolutionConfigChange = useCallback(async (newConfig: ResolutionConfig) => {
    setResolutionConfig(newConfig)
    // Note: When applyToAll is true, all charts will automatically update
    // through the globalResolution prop. No need for batch processing here.
  }, [])

  return {
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
  }
}