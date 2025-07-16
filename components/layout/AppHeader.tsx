import { Button } from '@/components/ui/button'
import { LineChart } from 'lucide-react'
import { DataButton } from './DataButton'
import { SessionCombobox } from './SessionCombobox'

interface AppHeaderProps {
  onDataClick: () => void
  onCreateChartClick: () => void
  onExportClick: () => void
  onImportWorkspaceClick: () => void
  onSaveSessionClick: () => void
  onSelectWorkspace: (workspaceId: string) => void
  onCreateNewSession: () => void
  isCreateChartDisabled: boolean
  currentWorkspace: { id: string; name: string; description?: string } | null
  hasDataOrCharts?: boolean
}

export function AppHeader({
  onDataClick,
  onCreateChartClick,
  onExportClick,
  onImportWorkspaceClick,
  onSaveSessionClick,
  onSelectWorkspace,
  onCreateNewSession,
  isCreateChartDisabled,
  currentWorkspace,
  hasDataOrCharts = false
}: AppHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-4">
        <h1 className="text-4xl font-bold">Time Series Data Visualization</h1>
      </div>
      <div className="flex gap-2">
        <SessionCombobox
          currentWorkspace={currentWorkspace}
          onSelectWorkspace={onSelectWorkspace}
          onCreateNewSession={onCreateNewSession}
          onSaveSession={onSaveSessionClick}
          onExportSession={onExportClick}
          onImportSession={onImportWorkspaceClick}
          hasDataOrCharts={hasDataOrCharts}
        />
        <DataButton onClick={onDataClick} />
        <Button 
          onClick={onCreateChartClick} 
          variant="outline"
          disabled={isCreateChartDisabled}
        >
          <LineChart className="mr-2 h-4 w-4" />
          Chart
        </Button>
      </div>
    </div>
  )
}