import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { Trash2, Copy, Edit, Loader2, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { DataResolution } from '@/hooks/useProgressiveChartData'

interface ChartMenuProps {
  isHovered?: boolean
  enableProgressive?: boolean
  globalResolution?: DataResolution
  resolution?: DataResolution
  isUpgrading?: boolean
  onResolutionChange?: (resolution: string) => void
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  className?: string
}

const resolutionInfo: Record<DataResolution, { label: string; description: string }> = {
  preview: { label: 'Preview', description: '100 pts/dataset - Ultra fast' },
  normal: { label: 'Normal', description: '500 pts/dataset - Balanced' },
  high: { label: 'High-Res', description: '1,000 pts/dataset - Detailed' },
  full: { label: 'Full', description: 'All points - Maximum detail' }
}

function ChartMenuComponent({
  isHovered = false,
  enableProgressive = false,
  globalResolution,
  resolution = 'normal',
  isUpgrading = false,
  onResolutionChange,
  onEdit,
  onDuplicate,
  onDelete,
  className
}: ChartMenuProps) {
  // Don't render if no actions available
  if (!onEdit && !onDuplicate && !onDelete && (!enableProgressive || globalResolution)) {
    return null
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "absolute top-2 right-2 h-8 w-8 transition-opacity",
            isHovered ? "opacity-100" : "opacity-30 hover:opacity-100",
            className
          )}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        {enableProgressive && !globalResolution && onResolutionChange && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                {isUpgrading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Resolution: {resolutionInfo[resolution].label}
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                <DropdownMenuRadioGroup value={resolution} onValueChange={onResolutionChange}>
                  {Object.entries(resolutionInfo).map(([key, info]) => (
                    <DropdownMenuRadioItem key={key} value={key} className="flex flex-col items-start py-2">
                      <span className="font-medium">{info.label}</span>
                      <span className="text-xs text-muted-foreground">{info.description}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
          </>
        )}
        {onEdit && (
          <DropdownMenuItem onClick={onEdit}>
            <Edit className="mr-2 h-4 w-4" />
            Edit
          </DropdownMenuItem>
        )}
        {onDuplicate && (
          <DropdownMenuItem onClick={onDuplicate}>
            <Copy className="mr-2 h-4 w-4" />
            Duplicate
          </DropdownMenuItem>
        )}
        {onDelete && (
          <DropdownMenuItem onClick={onDelete} className="text-destructive">
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export const ChartMenu = memo(ChartMenuComponent)