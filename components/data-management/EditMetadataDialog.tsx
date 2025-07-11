'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'
import { Loader2 } from 'lucide-react'

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

  useEffect(() => {
    if (metadata) {
      setFormData({
        plant: metadata.plant || '',
        machineNo: metadata.machineNo || '',
        label: metadata.label || '',
        event: metadata.event || '',
        startTime: metadata.startTime ? new Date(metadata.startTime).toISOString().slice(0, 16) : '',
        endTime: metadata.endTime ? new Date(metadata.endTime).toISOString().slice(0, 16) : ''
      })
    }
  }, [metadata])

  const handleSave = async () => {
    if (!metadata) return

    try {
      setSaving(true)
      setError(null)

      await db.metadata.update(metadata.id!, {
        plant: formData.plant,
        machineNo: formData.machineNo,
        label: formData.label || undefined,
        event: formData.event || undefined,
        startTime: formData.startTime ? new Date(formData.startTime) : undefined,
        endTime: formData.endTime ? new Date(formData.endTime) : undefined
      })

      onUpdate()
      onOpenChange(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update metadata')
    } finally {
      setSaving(false)
    }
  }

  if (!metadata) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Metadata</DialogTitle>
          <DialogDescription>
            Update the metadata information for this dataset
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="plant" className="text-right">
              Plant
            </Label>
            <Input
              id="plant"
              value={formData.plant}
              onChange={(e) => setFormData({ ...formData, plant: e.target.value })}
              className="col-span-3"
              required
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="machineNo" className="text-right">
              Machine No
            </Label>
            <Input
              id="machineNo"
              value={formData.machineNo}
              onChange={(e) => setFormData({ ...formData, machineNo: e.target.value })}
              className="col-span-3"
              required
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="label" className="text-right">
              Label
            </Label>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              className="col-span-3"
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="event" className="text-right">
              Event
            </Label>
            <Input
              id="event"
              value={formData.event}
              onChange={(e) => setFormData({ ...formData, event: e.target.value })}
              className="col-span-3"
              placeholder="Optional"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="startTime" className="text-right">
              Start Time
            </Label>
            <Input
              id="startTime"
              type="datetime-local"
              value={formData.startTime}
              onChange={(e) => setFormData({ ...formData, startTime: e.target.value })}
              className="col-span-3"
            />
          </div>
          <div className="grid grid-cols-4 items-center gap-4">
            <Label htmlFor="endTime" className="text-right">
              End Time
            </Label>
            <Input
              id="endTime"
              type="datetime-local"
              value={formData.endTime}
              onChange={(e) => setFormData({ ...formData, endTime: e.target.value })}
              className="col-span-3"
            />
          </div>
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