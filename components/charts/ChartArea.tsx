import React from 'react'
import { ChartGrid } from './ChartGrid'
import { ChartLoadingProgress } from './ChartLoadingProgress'
import { LoadingState } from '@/components/common/LoadingState'
import { EmptyState } from '@/components/common/EmptyState'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'
import { LayoutOption } from '@/components/layout/LayoutSelector'
import { ResolutionConfig } from '@/components/layout/ResolutionControls'

interface ChartAreaProps {
  loading: boolean
  isPreloadingData: boolean
  preloadProgress: { loaded: number; total: number }
  charts: (ChartConfiguration & { id: string })[]
  selectedDataIds: number[]
  showLoadingProgress: boolean
  totalChartsToLoad: number
  waterfallLoadedCharts: number
  layoutOption: LayoutOption | null
  paginationEnabled: boolean
  currentPage: number
  samplingConfig: SamplingConfig
  resolutionConfig: ResolutionConfig
  onEdit: (chartId: string) => void
  onDuplicate: (chartId: string) => void
  onDelete: (chartId: string) => void
  onAllChartsLoaded: () => void
  onChartLoaded: (count: number) => void
}

export function ChartArea({
  loading,
  isPreloadingData,
  preloadProgress,
  charts,
  selectedDataIds,
  showLoadingProgress,
  totalChartsToLoad,
  waterfallLoadedCharts,
  layoutOption,
  paginationEnabled,
  currentPage,
  samplingConfig,
  resolutionConfig,
  onEdit,
  onDuplicate,
  onDelete,
  onAllChartsLoaded,
  onChartLoaded,
}: ChartAreaProps) {
  if (loading || isPreloadingData) {
    return (
      <div className="container mx-auto p-4 flex-1">
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
          <LoadingState message="Loading charts..." />
        )}
      </div>
    )
  }

  if (charts.length === 0) {
    return (
      <div className="container mx-auto p-4 flex-1">
        <EmptyState />
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 pb-4 flex-1 overflow-hidden">
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
        onEdit={onEdit}
        onDuplicate={onDuplicate}
        onDelete={onDelete}
        layoutOption={layoutOption}
        paginationEnabled={paginationEnabled}
        currentPage={currentPage}
        samplingConfig={samplingConfig}
        enableProgressive={true}
        enableWaterfall={true}
        waterfallDelay={300}
        globalResolution={resolutionConfig.applyToAll && resolutionConfig.mode === 'manual' ? resolutionConfig.resolution : undefined}
        globalAutoUpgrade={resolutionConfig.mode === 'auto'}
        onAllChartsLoaded={onAllChartsLoaded}
        onChartLoaded={onChartLoaded}
        enableBatchLoading={true}
      />
    </div>
  )
}