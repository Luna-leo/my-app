'use client'

import { useState } from 'react'
import { Settings2, Loader2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  Alert,
  AlertDescription,
} from '@/components/ui/alert'
import { Checkbox } from '@/components/ui/checkbox'
import { DataResolution } from '@/hooks/useProgressiveChartData'

export type ResolutionMode = 'auto' | 'manual'

export interface ResolutionConfig {
  mode: ResolutionMode
  resolution: DataResolution
  applyToAll: boolean
}

interface ResolutionControlsProps {
  config: ResolutionConfig
  onChange: (config: ResolutionConfig) => void
  dataPointsInfo?: {
    original: number
    sampled: number
  }
  isUpdating?: boolean
  chartCount?: number
}

const RESOLUTION_INFO: Record<DataResolution, { label: string; points: number | null; description: string }> = {
  preview: {
    label: 'Preview',
    points: 500,
    description: 'Fast initial display'
  },
  normal: {
    label: 'Normal',
    points: 2000,
    description: 'Balanced quality and performance'
  },
  high: {
    label: 'High',
    points: 5000,
    description: 'Detailed view'
  },
  full: {
    label: 'Full',
    points: null,
    description: 'All data points (use with caution)'
  }
}

export function ResolutionControls({ 
  config, 
  onChange, 
  dataPointsInfo, 
  isUpdating,
  chartCount = 1
}: ResolutionControlsProps) {
  const [open, setOpen] = useState(false)
  const [showFullWarning, setShowFullWarning] = useState(false)

  const handleModeChange = (mode: ResolutionMode) => {
    onChange({ 
      ...config, 
      mode,
      resolution: mode === 'auto' ? 'preview' : config.resolution
    })
  }

  const handleResolutionChange = (resolution: DataResolution) => {
    if (resolution === 'full' && config.applyToAll && chartCount > 1) {
      setShowFullWarning(true)
    }
    onChange({ ...config, resolution })
  }

  const handleApplyToAllChange = (checked: boolean | 'indeterminate') => {
    if (checked !== 'indeterminate') {
      onChange({ ...config, applyToAll: checked })
    }
  }

  const getStatusText = () => {
    if (isUpdating) return 'Updating...'
    if (config.mode === 'auto') return 'Auto'
    return RESOLUTION_INFO[config.resolution].label
  }

  const getPointsDisplay = () => {
    if (!dataPointsInfo) return null
    
    const resInfo = RESOLUTION_INFO[config.resolution]
    if (config.mode === 'manual' && resInfo.points) {
      const displayPoints = Math.min(dataPointsInfo.original, resInfo.points)
      return `(${(displayPoints / 1000).toFixed(1)}K/${(dataPointsInfo.original / 1000).toFixed(1)}K)`
    } else if (config.resolution === 'full') {
      return `(${(dataPointsInfo.original / 1000).toFixed(1)}K)`
    }
    return null
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          {isUpdating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Settings2 className="h-4 w-4" />
          )}
          <span>Resolution</span>
          <span className="text-xs text-muted-foreground">
            {getStatusText()} {getPointsDisplay()}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Resolution Settings</h3>
            {chartCount > 1 && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="apply-to-all"
                  checked={config.applyToAll}
                  onCheckedChange={handleApplyToAllChange}
                />
                <Label htmlFor="apply-to-all" className="text-sm">
                  Apply to all charts
                </Label>
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="resolution-mode">Mode</Label>
              <Select
                value={config.mode}
                onValueChange={handleModeChange}
              >
                <SelectTrigger id="resolution-mode">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto (Progressive Loading)</SelectItem>
                  <SelectItem value="manual">Manual</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {config.mode === 'auto' 
                  ? 'Automatically upgrades resolution for better quality'
                  : 'Fixed resolution level'}
              </p>
            </div>

            {config.mode === 'manual' && (
              <div className="space-y-2">
                <Label htmlFor="resolution-level">Resolution Level</Label>
                <Select
                  value={config.resolution}
                  onValueChange={handleResolutionChange}
                >
                  <SelectTrigger id="resolution-level">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(RESOLUTION_INFO).map(([key, info]) => (
                      <SelectItem key={key} value={key}>
                        <div className="flex items-center justify-between w-full">
                          <span>{info.label}</span>
                          {info.points && (
                            <span className="text-xs text-muted-foreground ml-2">
                              ({info.points.toLocaleString()} pts)
                            </span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  {RESOLUTION_INFO[config.resolution].description}
                </p>
              </div>
            )}

            {showFullWarning && config.resolution === 'full' && (
              <Alert className="border-orange-200 bg-orange-50">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-sm">
                  <strong>Warning:</strong> Full resolution with {chartCount} charts may cause performance issues.
                  {dataPointsInfo && (
                    <span className="block mt-1">
                      Total points: ~{((dataPointsInfo.original * chartCount) / 1000000).toFixed(1)}M
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {dataPointsInfo && (
            <div className="pt-2 border-t">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  Data Points
                </p>
                <p className="text-xs text-muted-foreground">
                  Original: {dataPointsInfo.original.toLocaleString()} points
                  {config.mode === 'manual' && RESOLUTION_INFO[config.resolution].points && (
                    <span className="block">
                      Display: {Math.min(dataPointsInfo.original, RESOLUTION_INFO[config.resolution].points!).toLocaleString()} points
                    </span>
                  )}
                </p>
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}