'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'
import { Loader2 } from 'lucide-react'
import { calculateDataPeriodFromTimeSeries } from '@/lib/db/dataUtils'

interface EditMetadataDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  metadata: Metadata | null
  onUpdate: () => void
}

export function EditMetadataDialog({ open, onOpenChange, metadata, onUpdate }: EditMetadataDialogProps) {
  const [formData, setFormData] = useState({
    plant: '',
    machineNo: '',
    label: '',
    event: '',
    startTime: '',
    endTime: ''
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [calculatedDataPeriod, setCalculatedDataPeriod] = useState<{
    dataStartTime?: Date;
    dataEndTime?: Date;
  } | null>(null)
  const [autoSettingTimeRange, setAutoSettingTimeRange] = useState(false)

  // Helper function to format Date to local datetime-local input format
  const formatDateForInput = (date: Date | undefined): string => {
    if (!date) return ''
    const d = new Date(date)
    const year = d.getFullYear()
    const month = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hours = String(d.getHours()).padStart(2, '0')
    const minutes = String(d.getMinutes()).padStart(2, '0')
    const seconds = String(d.getSeconds()).padStart(2, '0')
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}`
  }

  // 0:00〜翌日5:59の時間範囲を自動設定
  const handleAutoSetTimeRange = async () => {
    if (!metadata?.id) return
    
    setAutoSettingTimeRange(true)
    try {
      // データの実際の開始時刻を取得
      const dataStart = calculatedDataPeriod?.dataStartTime || metadata.dataStartTime
      if (!dataStart) {
        setError('データの時間範囲が見つかりません')
        return
      }
      
      // 開始日の0:00:00を設定
      const startDate = new Date(dataStart)
      startDate.setHours(0, 0, 0, 0)
      
      // 翌日の5:59:59を設定
      const endDate = new Date(startDate)
      endDate.setDate(endDate.getDate() + 1)
      endDate.setHours(5, 59, 59, 999)
      
      setFormData({
        ...formData,
        startTime: formatDateForInput(startDate),
        endTime: formatDateForInput(endDate)
      })
      
      console.log('[EditMetadataDialog] Auto-set time range:', {
        startTime: startDate.toLocaleString(),
        endTime: endDate.toLocaleString()
      })
    } catch {
      setError('時間範囲の設定に失敗しました')
    } finally {
      setAutoSettingTimeRange(false)
    }
  }

  useEffect(() => {
    if (metadata) {
      setFormData({
        plant: metadata.plant || '',
        machineNo: metadata.machineNo || '',
        label: metadata.label || '',
        event: metadata.event || '',
        startTime: formatDateForInput(metadata.startTime),
        endTime: formatDateForInput(metadata.endTime)
      })
      
      // データ期間が未設定の場合、時系列データから計算
      if (metadata.id && (!metadata.dataStartTime || !metadata.dataEndTime)) {
        calculateDataPeriodFromTimeSeries(metadata.id).then(period => {
          if (period) {
            setCalculatedDataPeriod(period)
          }
        })
      } else {
        setCalculatedDataPeriod(null)
      }
    }
  }, [metadata])

  const handleSave = async () => {
    if (!metadata) return

    try {
      setSaving(true)
      setError(null)

      const updateData: Partial<Metadata> = {
        plant: formData.plant,
        machineNo: formData.machineNo,
        label: formData.label || undefined,
        event: formData.event || undefined,
        startTime: formData.startTime ? new Date(formData.startTime) : undefined,
        endTime: formData.endTime ? new Date(formData.endTime) : undefined
      }

      // データ期間が未設定で計算値がある場合、それも保存
      if (calculatedDataPeriod && !metadata.dataStartTime && !metadata.dataEndTime) {
        updateData.dataStartTime = calculatedDataPeriod.dataStartTime
        updateData.dataEndTime = calculatedDataPeriod.dataEndTime
      }

      await db.metadata.update(metadata.id!, updateData)

      onUpdate()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update metadata')
    } finally {
      setSaving(false)
    }
  }

  if (!metadata) return null

  const formatDate = (date?: Date) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString('ja-JP')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Edit Metadata</DialogTitle>
          <DialogDescription>
            Update the metadata information for this dataset
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="plant">
                Plant
              </Label>
              <Input
                id="plant"
                value={formData.plant}
                onChange={(e) => setFormData({ ...formData, plant: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machineNo">
                Machine No
              </Label>
              <Input
                id="machineNo"
                value={formData.machineNo}
                onChange={(e) => setFormData({ ...formData, machineNo: e.target.value })}
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <div>
              <Label htmlFor="label">
                Label
              </Label>
              <p className="text-xs text-gray-500 mt-1">グラフの凡例に利用されます。</p>
            </div>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="event">
              Event
            </Label>
            <Input
              id="event"
              value={formData.event}
              onChange={(e) => setFormData({ ...formData, event: e.target.value })}
              placeholder="Optional"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <Label>
                  時間範囲
                </Label>
                <p className="text-xs text-gray-500 mt-1">グラフに利用するデータ期間（未入力の場合、保存されているすべてのデータ期間を利用）</p>
              </div>
              {(calculatedDataPeriod || metadata?.dataStartTime) && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleAutoSetTimeRange}
                  disabled={autoSettingTimeRange}
                >
                  {autoSettingTimeRange ? (
                    <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  ) : null}
                  0:00〜翌日5:59に設定
                </Button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime" className="text-sm">
                  Start Time
                </Label>
                <Input
                  id="startTime"
                  type="datetime-local"
                  step="1"
                  value={formData.startTime}
                  onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endTime" className="text-sm">
                  End Time
                </Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  step="1"
                  value={formData.endTime}
                  onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* データ期間の表示（読み取り専用） */}
          {(metadata.dataStartTime || metadata.dataEndTime || calculatedDataPeriod) && (
            <div className="mt-4 pt-4 border-t space-y-4">
              <p className="text-sm font-medium text-gray-700">
                保存されているデータ期間（参考情報）
                {calculatedDataPeriod && <span className="text-xs font-normal text-gray-500 ml-1">- 実データから計算</span>}
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-sm text-gray-600">
                    開始時刻
                  </Label>
                  <div className="text-sm bg-gray-50 rounded px-3 py-2">
                    {formatDate(metadata.dataStartTime || calculatedDataPeriod?.dataStartTime)}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-sm text-gray-600">
                    終了時刻
                  </Label>
                  <div className="text-sm bg-gray-50 rounded px-3 py-2">
                    {formatDate(metadata.dataEndTime || calculatedDataPeriod?.dataEndTime)}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {error && (
          <div className="text-sm text-red-600 mb-4">
            {error}
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || !formData.plant || !formData.machineNo}
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}