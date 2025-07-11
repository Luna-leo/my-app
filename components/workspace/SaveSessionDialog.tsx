'use client'

import { useState } from 'react'
import { Save } from 'lucide-react'
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

interface SaveSessionDialogProps {
  open: boolean
  onClose: () => void
  onSave: (name: string, description: string) => void
  currentName?: string
  currentDescription?: string
}

export function SaveSessionDialog({
  open,
  onClose,
  onSave,
  currentName = '',
  currentDescription = ''
}: SaveSessionDialogProps) {
  const [name, setName] = useState(currentName)
  const [description, setDescription] = useState(currentDescription)
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    
    setIsSaving(true)
    try {
      await onSave(name.trim(), description.trim())
      onClose()
    } catch (error) {
      console.error('Failed to save session:', error)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Save Session</DialogTitle>
          <DialogDescription>
            Give your current workspace a name and description for easy identification later.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
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
            disabled={!name.trim() || isSaving}
          >
            {isSaving ? 'Saving...' : 'Save Session'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}