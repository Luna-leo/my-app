'use client'

import { useState, useEffect } from 'react'
import { zoomSyncService, ZoomSyncMode } from '@/lib/services/zoomSyncService'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Link2, Link2Off, Axis3D } from 'lucide-react'

const syncModes: { value: ZoomSyncMode; label: string; icon: React.ReactNode; description: string }[] = [
  {
    value: 'independent',
    label: '独立ズーム',
    icon: <Link2Off className="h-4 w-4" />,
    description: '各グラフが独立してズーム'
  },
  {
    value: 'x-axis-only',
    label: 'X軸同期',
    icon: <Link2 className="h-4 w-4" />,
    description: '時間軸のみ同期'
  },
  {
    value: 'full-sync',
    label: '完全同期',
    icon: <Axis3D className="h-4 w-4" />,
    description: 'X軸・Y軸両方を同期'
  }
]

export function ZoomSyncModeSelector() {
  const [mode, setMode] = useState<ZoomSyncMode>(zoomSyncService.getSyncMode())

  useEffect(() => {
    const handleModeChange = (newMode: ZoomSyncMode) => {
      setMode(newMode)
    }

    zoomSyncService.addModeChangeListener(handleModeChange)
    return () => {
      zoomSyncService.removeModeChangeListener(handleModeChange)
    }
  }, [])

  const handleChange = (value: ZoomSyncMode) => {
    setMode(value)
    zoomSyncService.setSyncMode(value)
  }

  const currentMode = syncModes.find(m => m.value === mode)

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">ズーム同期:</span>
      <Select value={mode} onValueChange={handleChange}>
        <SelectTrigger className="w-[140px] h-8">
          <SelectValue>
            <div className="flex items-center gap-2">
              {currentMode?.icon}
              <span className="text-sm">{currentMode?.label}</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {syncModes.map((syncMode) => (
            <SelectItem key={syncMode.value} value={syncMode.value}>
              <div className="flex items-center gap-2">
                {syncMode.icon}
                <div>
                  <div className="font-medium">{syncMode.label}</div>
                  <div className="text-xs text-muted-foreground">{syncMode.description}</div>
                </div>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}