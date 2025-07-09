'use client'

import { useState } from 'react'
import { Settings2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Input } from '@/components/ui/input'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'

interface SamplingControlsProps {
  config: SamplingConfig
  onChange: (config: SamplingConfig) => void
  dataPointsInfo?: {
    original: number
    sampled: number
  }
}

export function SamplingControls({ config, onChange, dataPointsInfo }: SamplingControlsProps) {
  const [open, setOpen] = useState(false)

  const handleEnabledChange = (checked: boolean | 'indeterminate') => {
    if (checked !== 'indeterminate') {
      onChange({ ...config, enabled: checked })
    }
  }

  const handleMethodChange = (method: SamplingConfig['method']) => {
    onChange({ ...config, method })
  }

  const handleTargetPointsChange = (value: string) => {
    const targetPoints = parseInt(value, 10)
    if (!isNaN(targetPoints) && targetPoints > 0) {
      onChange({ ...config, targetPoints })
    }
  }

  const handlePreserveExtremesChange = (checked: boolean) => {
    onChange({ ...config, preserveExtremes: checked })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="h-4 w-4" />
          <span>Sampling</span>
          {dataPointsInfo && (
            <span className="text-xs text-muted-foreground">
              {config.enabled ? (
                dataPointsInfo.sampled < dataPointsInfo.original ? (
                  `(${(dataPointsInfo.sampled / 1000).toFixed(1)}K/${(dataPointsInfo.original / 1000).toFixed(1)}K)`
                ) : (
                  `(${(dataPointsInfo.original / 1000).toFixed(1)}K)`
                )
              ) : (
                '(OFF)'
              )}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="start">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-medium">Sampling Settings</h3>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="sampling-enabled"
                checked={config.enabled}
                onCheckedChange={handleEnabledChange}
                aria-label="Enable sampling"
              />
              <Label htmlFor="sampling-enabled" className="text-sm">
                Enabled
              </Label>
            </div>
          </div>

          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="sampling-method" className={!config.enabled ? 'text-muted-foreground' : ''}>
                Method
              </Label>
              <Select
                value={config.method}
                onValueChange={handleMethodChange}
                disabled={!config.enabled}
              >
                <SelectTrigger id="sampling-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="lttb">LTTB (Recommended)</SelectItem>
                  <SelectItem value="nth">Nth Point</SelectItem>
                  <SelectItem value="minmax">Min/Max</SelectItem>
                  <SelectItem value="adaptive">Adaptive</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {config.method === 'lttb' && 'Preserves visual shape of time series data'}
                {config.method === 'nth' && 'Selects every nth point'}
                {config.method === 'minmax' && 'Captures peaks and valleys'}
                {config.method === 'adaptive' && 'Adjusts based on viewport'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="target-points" className={!config.enabled ? 'text-muted-foreground' : ''}>
                Target Points
              </Label>
              <Input
                id="target-points"
                type="number"
                value={config.targetPoints}
                onChange={(e) => handleTargetPointsChange(e.target.value)}
                disabled={!config.enabled}
                min="100"
                max="10000"
                step="100"
              />
              <p className="text-xs text-muted-foreground">
                Number of points after sampling
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <Checkbox
                id="preserve-extremes"
                checked={config.preserveExtremes}
                onCheckedChange={handlePreserveExtremesChange}
                disabled={!config.enabled}
              />
              <Label
                htmlFor="preserve-extremes"
                className={`text-sm ${!config.enabled ? 'text-muted-foreground' : ''}`}
              >
                Preserve extreme values
              </Label>
            </div>
          </div>

          {dataPointsInfo && (
            <div className="pt-2 border-t">
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {config.enabled && dataPointsInfo.sampled < dataPointsInfo.original
                    ? 'Status: Active'
                    : config.enabled
                    ? 'Status: Ready (data below threshold)'
                    : 'Status: Disabled'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {config.enabled && dataPointsInfo.sampled < dataPointsInfo.original
                    ? `Displaying ${dataPointsInfo.sampled.toLocaleString()} of ${dataPointsInfo.original.toLocaleString()} points (${Math.round((dataPointsInfo.sampled / dataPointsInfo.original) * 100)}%)`
                    : `Displaying all ${dataPointsInfo.original.toLocaleString()} points`}
                </p>
                {config.enabled && dataPointsInfo.sampled < dataPointsInfo.original && (
                  <div className="mt-2">
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-primary transition-all duration-300"
                        style={{ width: `${(dataPointsInfo.sampled / dataPointsInfo.original) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}