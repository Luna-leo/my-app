'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'
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

interface ExportWorkspaceDialogProps {
  open: boolean
  onClose: () => void
  onExport: (filename: string) => void
  workspaceName?: string
}

export function ExportWorkspaceDialog({
  open,
  onClose,
  onExport,
  workspaceName = 'workspace'
}: ExportWorkspaceDialogProps) {
  const defaultFilename = `${workspaceName.toLowerCase().replace(/\s+/g, '-')}-${new Date().toISOString().split('T')[0]}`
  const [filename, setFilename] = useState(defaultFilename)
  const [isExporting, setIsExporting] = useState(false)

  const handleExport = async () => {
    if (!filename.trim()) return
    
    setIsExporting(true)
    try {
      // Remove .json extension if user added it
      const cleanFilename = filename.trim().replace(/\.json$/i, '')
      await onExport(cleanFilename)
      onClose()
    } catch (error) {
      console.error('Failed to export workspace:', error)
    } finally {
      setIsExporting(false)
    }
  }

  // Reset filename when dialog opens
  const handleOpenChange = (newOpen: boolean) => {
    if (newOpen) {
      setFilename(defaultFilename)
    }
    onClose()
  }

  // Validate filename - allow alphanumeric, spaces, hyphens, underscores
  const isValidFilename = (name: string) => {
    return /^[a-zA-Z0-9\s\-_]+$/.test(name)
  }

  const filenameError = filename && !isValidFilename(filename) 
    ? 'Filename can only contain letters, numbers, spaces, hyphens, and underscores' 
    : ''

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Export Workspace</DialogTitle>
          <DialogDescription>
            Choose a filename for your workspace export. The file will be saved as JSON format.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="filename">Filename</Label>
            <div className="flex items-center gap-2">
              <Input
                id="filename"
                value={filename}
                onChange={(e) => setFilename(e.target.value)}
                placeholder="workspace-export"
                autoFocus
                className={filenameError ? 'border-destructive' : ''}
              />
              <span className="text-sm text-muted-foreground">.json</span>
            </div>
            {filenameError && (
              <p className="text-sm text-destructive">{filenameError}</p>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            <p className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              This will export:
            </p>
            <ul className="ml-6 mt-1 space-y-1">
              <li>• All charts and their configurations</li>
              <li>• Selected data sources</li>
              <li>• Layout preferences</li>
              <li>• Workspace metadata</li>
            </ul>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={!filename.trim() || isExporting || !!filenameError}
          >
            {isExporting ? 'Exporting...' : 'Export'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}