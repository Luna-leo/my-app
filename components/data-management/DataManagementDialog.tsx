'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Database, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CsvImportContent } from './CsvImportContent'
import { UnifiedDataView } from './UnifiedDataView'

interface DataManagementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedDataIds: number[]
  onSelectionChange: (ids: number[]) => void
  onImportComplete?: () => void
}

export function DataManagementDialog({
  open,
  onOpenChange,
  selectedDataIds,
  onSelectionChange,
  onImportComplete
}: DataManagementDialogProps) {
  const [activeTab, setActiveTab] = useState('data')
  const [importCompleted, setImportCompleted] = useState(false)
  // Local state for selection - only commit on Apply
  const [localSelectedIds, setLocalSelectedIds] = useState<number[]>(selectedDataIds)

  // Reset state when dialog is opened/closed
  useEffect(() => {
    if (open) {
      // When opening, sync local state with parent state
      console.log('[DataManagementDialog] Opening with selectedDataIds:', selectedDataIds)
      setLocalSelectedIds(selectedDataIds)
    } else {
      // When closing, reset states
      setImportCompleted(false)
      setActiveTab('data')
    }
  }, [open, selectedDataIds])

  const handleImportComplete = () => {
    setImportCompleted(true)
    setActiveTab('data')
    if (onImportComplete) {
      onImportComplete()
    }
  }

  const handleApply = () => {
    console.log('[DataManagementDialog] Applying selection:', localSelectedIds)
    onSelectionChange(localSelectedIds)
    onOpenChange(false)
  }

  const handleCancel = () => {
    console.log('[DataManagementDialog] Cancelling, reverting to original selection:', selectedDataIds)
    setLocalSelectedIds(selectedDataIds)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(newOpen) => {
      if (!newOpen) {
        // If closing via ESC or backdrop click, treat as cancel
        handleCancel()
      } else {
        onOpenChange(newOpen)
      }
    }}>
      <DialogContent className="sm:max-w-[900px] h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Data Management</DialogTitle>
          <DialogDescription>
            Manage your time series data - view all data, import CSV files, and sync with server.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-6 pb-4 overflow-hidden">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="data" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              All Data
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import CSV
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            <TabsContent value="data" className="h-full data-[state=active]:flex data-[state=active]:flex-col">
              <UnifiedDataView
                selectedDataIds={localSelectedIds}
                onSelectionChange={setLocalSelectedIds}
                importCompleted={importCompleted}
                onImportCompletedReset={() => setImportCompleted(false)}
              />
            </TabsContent>

            <TabsContent value="import" className="h-full mt-4 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
              <CsvImportContent
                onImportComplete={handleImportComplete}
              />
            </TabsContent>
          </div>
        </Tabs>

        <DialogFooter className="px-6 py-4 border-t">
          <Button variant="outline" onClick={handleCancel}>
            Cancel
          </Button>
          <Button onClick={handleApply}>
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}