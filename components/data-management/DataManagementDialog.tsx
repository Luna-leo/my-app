'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CheckCircle, Upload, Download, Cloud } from 'lucide-react'
import { CsvImportContent } from './CsvImportContent'
import { DataSelectionContent } from './DataSelectionContent'
import { UploadContent } from './UploadContent'
import { DownloadContent } from './DownloadContent'

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
  const [activeTab, setActiveTab] = useState('selection')
  const [importCompleted, setImportCompleted] = useState(false)

  // Reset state when dialog is closed
  useEffect(() => {
    if (!open) {
      setImportCompleted(false)
      setActiveTab('selection')
    }
  }, [open])

  const handleImportComplete = () => {
    setImportCompleted(true)
    setActiveTab('selection')
    if (onImportComplete) {
      onImportComplete()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[800px] h-[92vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle>Data Management</DialogTitle>
          <DialogDescription>
            Manage your time series data - select data for visualization, import new CSV files, or sync with server.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col px-6 pb-4 overflow-hidden">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="selection" className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4" />
              Data Selection
            </TabsTrigger>
            <TabsTrigger value="import" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Import CSV
            </TabsTrigger>
            <TabsTrigger value="download" className="flex items-center gap-2">
              <Download className="h-4 w-4" />
              Download
            </TabsTrigger>
            <TabsTrigger value="upload" className="flex items-center gap-2">
              <Cloud className="h-4 w-4" />
              Upload
            </TabsTrigger>
          </TabsList>

          <div className="flex-1 overflow-hidden mt-4">
            <TabsContent value="selection" className="h-full data-[state=active]:flex data-[state=active]:flex-col">
              <DataSelectionContent
                selectedDataIds={selectedDataIds}
                onSelectionChange={onSelectionChange}
                importCompleted={importCompleted}
                onImportCompletedReset={() => setImportCompleted(false)}
              />
            </TabsContent>

            <TabsContent value="import" className="h-full mt-4 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
              <CsvImportContent
                onImportComplete={handleImportComplete}
              />
            </TabsContent>

            <TabsContent value="download" className="h-full data-[state=active]:flex data-[state=active]:flex-col">
              <DownloadContent />
            </TabsContent>

            <TabsContent value="upload" className="h-full data-[state=active]:flex data-[state=active]:flex-col">
              <UploadContent />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}