import React from 'react'
import { AppHeader } from './AppHeader'
import { DataSelectionBar } from './DataSelectionBar'
import { LayoutOption } from './LayoutSelector'
import { ResolutionConfig } from './ResolutionControls'

interface AppLayoutProps {
  children: React.ReactNode
  onDataClick: () => void
  onCreateChartClick: () => void
  onExportClick: () => void
  onImportWorkspaceClick: () => void
  onSaveSessionClick: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onCreateNewSession: () => void
  isCreateChartDisabled: boolean
  currentWorkspace: { id: string; name: string; description?: string } | null
  hasDataOrCharts: boolean
  selectedDataIds: number[]
  selectedDataLabels: Map<number, string>
  selectedDataColors: Map<number, string>
  totalCharts: number
  layoutOption: LayoutOption | null
  onLayoutChange: (layout: LayoutOption | null) => void
  paginationEnabled: boolean
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  resolutionConfig: ResolutionConfig
  onResolutionConfigChange: (config: ResolutionConfig) => void
  dataPointsInfo: {
    totalPoints: number
    sampledPoints: number
    samplingRate: number
    isLoading: boolean
    original: number
    sampled: number
  }
  isUpdatingResolution: boolean
  mounted: boolean
}

export function AppLayout({
  children,
  onDataClick,
  onCreateChartClick,
  onExportClick,
  onImportWorkspaceClick,
  onSaveSessionClick,
  onSelectWorkspace,
  onCreateNewSession,
  isCreateChartDisabled,
  currentWorkspace,
  hasDataOrCharts,
  selectedDataIds,
  selectedDataLabels,
  selectedDataColors,
  totalCharts,
  layoutOption,
  onLayoutChange,
  paginationEnabled,
  currentPage,
  totalPages,
  onPageChange,
  resolutionConfig,
  onResolutionConfigChange,
  dataPointsInfo,
  isUpdatingResolution,
  mounted,
}: AppLayoutProps) {
  return (
    <div className="h-screen flex flex-col">
      <div className="container mx-auto p-4 pb-0 flex-shrink-0">
        <AppHeader
          onDataClick={onDataClick}
          onCreateChartClick={onCreateChartClick}
          onExportClick={onExportClick}
          onImportWorkspaceClick={onImportWorkspaceClick}
          onSaveSessionClick={onSaveSessionClick}
          onSelectWorkspace={onSelectWorkspace}
          onCreateNewSession={onCreateNewSession}
          isCreateChartDisabled={isCreateChartDisabled}
          currentWorkspace={currentWorkspace}
          hasDataOrCharts={hasDataOrCharts}
        />
      </div>
      
      {mounted && (
        <>
          <div className="container mx-auto px-4 flex-shrink-0">
            <DataSelectionBar
              selectedDataIds={selectedDataIds}
              selectedDataLabels={selectedDataLabels}
              selectedDataColors={selectedDataColors}
              totalCharts={totalCharts}
              layoutOption={layoutOption}
              onLayoutChange={onLayoutChange}
              paginationEnabled={paginationEnabled}
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={onPageChange}
              resolutionConfig={resolutionConfig}
              onResolutionConfigChange={onResolutionConfigChange}
              dataPointsInfo={dataPointsInfo}
              isUpdatingResolution={isUpdatingResolution}
            />
          </div>
          {children}
        </>
      )}
    </div>
  )
}