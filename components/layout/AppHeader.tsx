import { Button } from '@/components/ui/button'
import { LineChart, Download, FolderOpen, Settings } from 'lucide-react'
import { DataButton } from './DataButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface AppHeaderProps {
  onDataClick: () => void
  onCreateChartClick: () => void
  onExportClick: () => void
  onImportWorkspaceClick: () => void
  isCreateChartDisabled: boolean
  isExportDisabled: boolean
}

export function AppHeader({
  onDataClick,
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
        <DataButton onClick={onDataClick} />
        <Button 
          onClick={onCreateChartClick} 
          variant="outline"
          disabled={isCreateChartDisabled}
        >
          <LineChart className="mr-2 h-4 w-4" />
          Chart
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={onExportClick}
              disabled={isExportDisabled}
            >
              <Download className="mr-2 h-4 w-4" />
              Export Workspace
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportWorkspaceClick}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Import Workspace
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}