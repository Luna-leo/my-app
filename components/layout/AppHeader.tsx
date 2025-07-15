import { Button } from '@/components/ui/button'
import { LineChart, Download, FolderOpen, Settings, Plus, Save, RefreshCw } from 'lucide-react'
import { DataButton } from './DataButton'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'

interface AppHeaderProps {
  onDataClick: () => void
  onCreateChartClick: () => void
  onExportClick: () => void
  onImportWorkspaceClick: () => void
  onSaveSessionClick: () => void
  onLoadSessionClick: () => void
  onRedrawChartsClick?: () => void
  isCreateChartDisabled: boolean
  isExportDisabled: boolean
  isRedrawChartsDisabled?: boolean
  workspaceName?: string
  hasDataOrCharts?: boolean
}

export function AppHeader({
  onDataClick,
  onCreateChartClick,
  onExportClick,
  onImportWorkspaceClick,
  onSaveSessionClick,
  onLoadSessionClick,
  onRedrawChartsClick,
  isCreateChartDisabled,
  isExportDisabled,
  isRedrawChartsDisabled = false,
  workspaceName,
  hasDataOrCharts = false
}: AppHeaderProps) {
  return (
    <div className="flex justify-between items-center mb-4">
      <div className="flex items-center gap-4">
        <h1 className="text-4xl font-bold">Time Series Data Visualization</h1>
        {workspaceName && (
          <span className="text-sm text-muted-foreground">
            {workspaceName}
          </span>
        )}
      </div>
      <div className="flex gap-2">
        {hasDataOrCharts && (
          <Button 
            variant="outline"
            onClick={() => window.location.href = '/?clean=true'}
          >
            <Plus className="mr-2 h-4 w-4" />
            New Session
          </Button>
        )}
        <DataButton onClick={onDataClick} />
        <Button 
          onClick={onCreateChartClick} 
          variant="outline"
          disabled={isCreateChartDisabled}
        >
          <LineChart className="mr-2 h-4 w-4" />
          Chart
        </Button>
        {onRedrawChartsClick && (
          <Button 
            onClick={onRedrawChartsClick} 
            variant="outline"
            disabled={isRedrawChartsDisabled}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Redraw Charts
          </Button>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onSaveSessionClick}>
              <Save className="mr-2 h-4 w-4" />
              Save Session
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onLoadSessionClick}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Load Session
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              onClick={onExportClick}
              disabled={isExportDisabled}
            >
              <Download className="mr-2 h-4 w-4" />
              Export to File
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportWorkspaceClick}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Import from File
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => window.location.href = '/settings'}>
              <Settings className="mr-2 h-4 w-4" />
              Application Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}