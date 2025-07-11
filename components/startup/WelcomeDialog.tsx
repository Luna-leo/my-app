'use client'

import { useState, useEffect } from 'react'
import { Plus, FolderOpen, Clock } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { chartConfigService } from '@/lib/services/chartConfigurationService'
import { Workspace } from '@/lib/db/schema'
import { formatDistanceToNow } from 'date-fns'
import { StartupService } from '@/lib/services/startupService'

interface WelcomeDialogProps {
  open: boolean
  onSelectWorkspace: (workspaceId: string) => void
  onCreateNew: () => void
}

export function WelcomeDialog({ open, onSelectWorkspace, onCreateNew }: WelcomeDialogProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [loading, setLoading] = useState(true)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  useEffect(() => {
    const loadWorkspaces = async () => {
      try {
        const allWorkspaces = await chartConfigService.getAllWorkspaces()
        // Sort by updatedAt, most recent first
        const sorted = allWorkspaces.sort((a, b) => {
          const dateA = new Date(a.updatedAt).getTime()
          const dateB = new Date(b.updatedAt).getTime()
          return dateB - dateA
        })
        setWorkspaces(sorted.slice(0, 5)) // Show only 5 most recent
      } catch (error) {
        console.error('Failed to load workspaces:', error)
      } finally {
        setLoading(false)
      }
    }

    if (open) {
      loadWorkspaces()
    }
  }, [open])

  const handleSelect = (workspaceId: string) => {
    if (dontShowAgain) {
      StartupService.saveDefaultMode('restore')
    }
    onSelectWorkspace(workspaceId)
  }

  const handleCreateNew = () => {
    if (dontShowAgain) {
      // When creating new from welcome dialog, still use 'restore' as default
      // because we want to restore the newly created session on next visit
      StartupService.saveDefaultMode('restore')
    }
    onCreateNew()
  }

  return (
    <Dialog open={open}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Welcome Back</DialogTitle>
          <DialogDescription>
            Choose a recent workspace or start fresh
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 my-4">
          {/* New Session Button */}
          <Button
            onClick={handleCreateNew}
            variant="outline"
            className="w-full justify-start h-auto p-4"
          >
            <Plus className="mr-3 h-5 w-5 text-primary" />
            <div className="text-left">
              <div className="font-medium">Start New Session</div>
              <div className="text-sm text-muted-foreground">
                Begin with a clean workspace
              </div>
            </div>
          </Button>

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">
                Or continue with
              </span>
            </div>
          </div>

          {/* Recent Workspaces */}
          {loading ? (
            <div className="text-center py-4 text-muted-foreground">
              Loading workspaces...
            </div>
          ) : workspaces.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No recent workspaces found
            </div>
          ) : (
            <div className="space-y-2">
              {workspaces.map(workspace => (
                <Button
                  key={workspace.id}
                  onClick={() => handleSelect(workspace.id!)}
                  variant="outline"
                  className="w-full justify-start h-auto p-3"
                >
                  <FolderOpen className="mr-3 h-4 w-4 text-muted-foreground" />
                  <div className="flex-1 text-left">
                    <div className="font-medium">{workspace.name}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(workspace.updatedAt), { addSuffix: true })}
                      {workspace.description && (
                        <>
                          <span>•</span>
                          <span>{workspace.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                </Button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center space-x-2 mt-4 pt-4 border-t">
          <Checkbox 
            id="dontShow" 
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked as boolean)}
          />
          <Label 
            htmlFor="dontShow" 
            className="text-sm font-normal cursor-pointer"
          >
            Don&apos;t show this dialog again (use my selection as default)
          </Label>
        </div>
      </DialogContent>
    </Dialog>
  )
}