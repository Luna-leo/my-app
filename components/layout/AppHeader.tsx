import { Button } from '@/components/ui/button'
import { Upload, Database, LineChart, Download, FolderOpen } from 'lucide-react'

interface AppHeaderProps {
  onImportClick: () => void
  onDataSelectionClick: () => void
  onCreateChartClick: () => void
  onExportClick: () => void
  onImportWorkspaceClick: () => void
  isCreateChartDisabled: boolean
  isExportDisabled: boolean
}

export function AppHeader({
  onImportClick,
  onDataSelectionClick,
  onCreateChartClick,
  onExportClick,
  onImportWorkspaceClick,
  isCreateChartDisabled,
  isExportDisabled
}: AppHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <h1 className="text-4xl font-bold">Time Series Data Visualization</h1>
      <div className="flex gap-2">
        <Button onClick={onImportClick}>
          <Upload className="mr-2 h-4 w-4" />
          Import CSV Data
        </Button>
        <Button onClick={onDataSelectionClick} variant="outline">
          <Database className="mr-2 h-4 w-4" />
          Data Selection
        </Button>
        <Button 
          onClick={onCreateChartClick} 
          variant="outline"
          disabled={isCreateChartDisabled}
        >
          <LineChart className="mr-2 h-4 w-4" />
          Create Chart
        </Button>
        <Button
          onClick={onExportClick}
          variant="outline"
          disabled={isExportDisabled}
        >
          <Download className="mr-2 h-4 w-4" />
          Export
        </Button>
        <Button
          onClick={onImportWorkspaceClick}
          variant="outline"
        >
          <FolderOpen className="mr-2 h-4 w-4" />
          Import
        </Button>
      </div>
    </div>
  )
}