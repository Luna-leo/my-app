'use client'

import { useState, useEffect } from 'react'
import { FolderOpen, Clock, Trash2, BarChart3, Database } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { chartConfigService } from '@/lib/services/chartConfigurationService'
import { Workspace } from '@/lib/db/schema'
import { formatDistanceToNow } from 'date-fns'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

interface WorkspaceListDialogProps {
  open: boolean
  onClose: () => void
  onSelectWorkspace: (workspaceId: string) => void
  currentWorkspaceId?: string
}

export function WorkspaceListDialog({
  open,
  onClose,
  onSelectWorkspace,
  currentWorkspaceId
}: WorkspaceListDialogProps) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([])
  const [workspaceStats, setWorkspaceStats] = useState<Record<string, { dataCount: number; chartCount: number }>>({})
  const [loading, setLoading] = useState(true)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    open: boolean
    workspace: Workspace | null
  }>({ open: false, workspace: null })

  const loadWorkspaces = async () => {
    try {
      setLoading(true)
      const allWorkspaces = await chartConfigService.getAllWorkspaces()
      // Sort by updatedAt, most recent first
      const sorted = allWorkspaces.sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime()
        const dateB = new Date(b.updatedAt).getTime()
        return dateB - dateA
      })
      setWorkspaces(sorted)
      
      // Load stats for each workspace
      const stats: Record<string, { dataCount: number; chartCount: number }> = {}
      const nonEmptyWorkspaces: Workspace[] = []
      
      for (const workspace of sorted) {
        if (workspace.id) {
          const workspaceStats = await chartConfigService.getWorkspaceStats(workspace.id)
          stats[workspace.id] = workspaceStats
          
          // Include workspace if it has data or charts, or if it's the current workspace
          if (workspaceStats.dataCount > 0 || workspaceStats.chartCount > 0 || workspace.isActive) {
            nonEmptyWorkspaces.push(workspace)
          }
        }
      }
      
      setWorkspaceStats(stats)
      setWorkspaces(nonEmptyWorkspaces)
    } catch (error) {
      console.error('Failed to load workspaces:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (open) {
      loadWorkspaces()
    }
  }, [open])

  const handleSelect = async (workspace: Workspace) => {
    if (workspace.id === currentWorkspaceId) {
      onClose()
      return
    }
    
    onSelectWorkspace(workspace.id!)
    onClose()
  }

  const handleDelete = async (workspace: Workspace) => {
    setDeleteConfirmation({ open: true, workspace })
  }

  const confirmDelete = async () => {
    if (!deleteConfirmation.workspace) return
    
    try {
      // Delete the workspace
      await chartConfigService.deleteWorkspace(deleteConfirmation.workspace.id!)
      
      // Reload the list
      await loadWorkspaces()
      
      // If we deleted the current workspace, switch to another one
      if (deleteConfirmation.workspace.id === currentWorkspaceId && workspaces.length > 1) {
        const remainingWorkspaces = workspaces.filter(w => w.id !== deleteConfirmation.workspace!.id)
        if (remainingWorkspaces.length > 0) {
          onSelectWorkspace(remainingWorkspaces[0].id!)
        }
      }
    } catch (error) {
      console.error('Failed to delete workspace:', error)
    } finally {
      setDeleteConfirmation({ open: false, workspace: null })
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Saved Sessions</DialogTitle>
            <DialogDescription>
              Select a previously saved session to load
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="h-[400px] pr-4">
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">
                Loading sessions...
              </div>
            ) : workspaces.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No saved sessions found
              </div>
            ) : (
              <div className="space-y-2">
                {workspaces.map(workspace => (
                  <div
                    key={workspace.id}
                    className={`group relative p-3 rounded-lg border hover:bg-accent/50 transition-colors ${
                      workspace.id === currentWorkspaceId ? 'border-primary bg-accent/30' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleSelect(workspace)}
                      className="w-full text-left"
                    >
                      <div className="flex items-start gap-3">
                        <FolderOpen className="h-5 w-5 mt-0.5 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium">
                            {workspace.name}
                            {workspace.id === currentWorkspaceId && (
                              <span className="ml-2 text-xs text-primary">(Current)</span>
                            )}
                          </div>
                          {workspace.description && (
                            <div className="text-sm text-muted-foreground mt-1">
                              {workspace.description}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground mt-2 flex items-center gap-4">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              Updated {formatDistanceToNow(new Date(workspace.updatedAt), { addSuffix: true })}
                            </div>
                            {workspace.id && workspaceStats[workspace.id] && (
                              <>
                                <div className="flex items-center gap-1">
                                  <Database className="h-3 w-3" />
                                  {workspaceStats[workspace.id].dataCount} data
                                </div>
                                <div className="flex items-center gap-1">
                                  <BarChart3 className="h-3 w-3" />
                                  {workspaceStats[workspace.id].chartCount} charts
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </button>
                    
                    {/* Action buttons */}
                    <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(workspace)
                        }}
                        disabled={workspace.id === currentWorkspaceId}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </ScrollArea>

          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={onClose}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteConfirmation.open}
        onOpenChange={(open) => !open && setDeleteConfirmation({ open: false, workspace: null })}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Session?</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deleteConfirmation.workspace?.name}&quot;? 
              This will permanently delete all charts and configurations in this session.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}