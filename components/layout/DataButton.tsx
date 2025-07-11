import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Database, Upload, Download, Cloud, CheckCircle } from 'lucide-react'

interface DataButtonProps {
  onDataSelectionClick: () => void
  onImportClick: () => void
  onDownloadClick?: () => void
  onUploadClick?: () => void
}

export function DataButton({
  onDataSelectionClick,
  onImportClick,
  onDownloadClick,
  onUploadClick
}: DataButtonProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button>
          <Database className="mr-2 h-4 w-4" />
          Data
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Data Management</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onDataSelectionClick}>
          <CheckCircle className="mr-2 h-4 w-4" />
          <span>Data Selection</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onImportClick}>
          <Upload className="mr-2 h-4 w-4" />
          <span>Import CSV</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem 
          onClick={onDownloadClick}
          disabled={!onDownloadClick}
          className={!onDownloadClick ? 'opacity-50' : ''}
        >
          <Download className="mr-2 h-4 w-4" />
          <span>Download from Server</span>
          {!onDownloadClick && (
            <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span>
          )}
        </DropdownMenuItem>
        <DropdownMenuItem 
          onClick={onUploadClick}
          disabled={!onUploadClick}
          className={!onUploadClick ? 'opacity-50' : ''}
        >
          <Cloud className="mr-2 h-4 w-4" />
          <span>Upload to Server</span>
          {!onUploadClick && (
            <span className="ml-auto text-xs text-muted-foreground">Coming Soon</span>
          )}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}