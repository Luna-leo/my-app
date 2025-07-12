'use client'

import { useState } from 'react'
import { Save, AlertCircle, Copy, RefreshCw } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'

interface SaveSessionDialogProps {
  open: boolean
  onClose: () => void
  onSave: (name: string, description: string, saveAsNew: boolean) => void
  currentName?: string
  currentDescription?: string
  hasData?: boolean
  hasCharts?: boolean
}

export function SaveSessionDialog({
  open,
  onClose,
  onSave,
  currentName = '',
  currentDescription = '',
  hasData = false,
  hasCharts = false
}: SaveSessionDialogProps) {
  const [name, setName] = useState(currentName)
  const [description, setDescription] = useState(currentDescription)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMode, setSaveMode] = useState<'update' | 'new'>(currentName ? 'update' : 'new')

  const handleSave = async () => {
    if (!name.trim() || (!hasData && !hasCharts)) return
    
    setIsSaving(true)
    try {
      await onSave(name.trim(), description.trim(), saveMode === 'new')
      onClose()
    } catch (error) {
      console.error('Failed to save session:', error)
    } finally {
      setIsSaving(false)
    }
  }

  // Reset form when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setName(currentName)
      setDescription(currentDescription)
      setSaveMode(currentName ? 'update' : 'new')
    }
    onClose()
  }

  const isEmpty = !hasData && !hasCharts

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Session</DialogTitle>
          <DialogDescription>
            Give your current workspace a name and description for easy identification later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          {isEmpty && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-800 dark:text-yellow-200 rounded-md">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <p className="text-sm">
                Cannot save an empty session. Add some data or create charts first.
              </p>
            </div>
          )}
          
          {currentName && (
            <div className="grid gap-3">
              <Label>Save Mode</Label>
              <RadioGroup value={saveMode} onValueChange={(value) => setSaveMode(value as 'update' | 'new')}>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="update" id="update" />
                  <Label htmlFor="update" className="flex items-center gap-2 font-normal cursor-pointer">
                    <RefreshCw className="h-4 w-4" />
                    Update current session &quot;{currentName}&quot;
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="new" id="new" />
                  <Label htmlFor="new" className="flex items-center gap-2 font-normal cursor-pointer">
                    <Copy className="h-4 w-4" />
                    Save as new session
                  </Label>
                </div>
              </RadioGroup>
            </div>
          )}
          
          <div className="grid gap-2">
            <Label htmlFor="name">Session Name</Label>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Production Analysis 2024"
              autoFocus
            />
          </div>
          
          <div className="grid gap-2">
            <Label htmlFor="description">Description (Optional)</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the purpose of this session..."
              rows={3}
            />
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Save className="h-4 w-4" />
              This will save:
            </p>
            <ul className="ml-6 mt-1 space-y-1">
              <li>• All current charts and their configurations</li>
              <li>• Selected data sources</li>
              <li>• Layout preferences</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!name.trim() || isSaving || isEmpty}
          >
            {isSaving ? 'Saving...' : 'Save Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}