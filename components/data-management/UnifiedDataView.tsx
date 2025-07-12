'use client'

import { useState, useEffect, useMemo } from 'react'
import { useUnifiedData, DataLocation, UnifiedDataItem } from '@/lib/hooks/useUnifiedData'
import { DataCard } from './DataCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { Label } from '@/components/ui/label'
import { Search, Filter, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'
import { DataPreviewDialog } from './DataPreviewDialog'
import { ServerDataPreviewDialog } from './ServerDataPreviewDialog'
import { EditMetadataDialog } from './EditMetadataDialog'
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface UnifiedDataViewProps {
  selectedDataIds: number[]
  onSelectionChange: (ids: number[]) => void
  importCompleted?: boolean
  onImportCompletedReset?: () => void
}

type DownloadConfirmItem = UnifiedDataItem

export function UnifiedDataView({
  selectedDataIds: _, // eslint-disable-line @typescript-eslint/no-unused-vars
  onSelectionChange,
  importCompleted,
  onImportCompletedReset
}: UnifiedDataViewProps) {
  const { data, loading, refreshData } = useUnifiedData()
  const [searchQuery, setSearchQuery] = useState('')
  const [locationFilter, setLocationFilter] = useState<DataLocation | 'all'>('all')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  const [alerts, setAlerts] = useState<{ type: 'success' | 'error', message: string }[]>([])
  
  // Preview states
  const [previewData, setPreviewData] = useState<Metadata | null>(null)
  const [serverPreviewData, setServerPreviewData] = useState<{
    uploadId: string
    metadata: Record<string, unknown>
    data: Array<Record<string, unknown>>
    totalRecords: number
    previewLimit: number
  } | null>(null)
  
  // Edit state
  const [editMetadata, setEditMetadata] = useState<Metadata | null>(null)
  
  // Download confirmation dialog
  const [downloadConfirm, setDownloadConfirm] = useState<{
    item: DownloadConfirmItem | null,
    show: boolean
  }>({ item: null, show: false })
  
  // Delete confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{
    item: UnifiedDataItem | null,
    show: boolean
  }>({ item: null, show: false })

  // Filter data based on search and location
  const filteredData = useMemo(() => {
    return data.filter(item => {
      // Location filter
      if (locationFilter !== 'all' && item.location !== locationFilter) {
        return false
      }
      
      // Search filter
      if (searchQuery) {
        const searchLower = searchQuery.toLowerCase()
        
        const plantNm = item.metadata ? item.metadata.plant : item.serverData?.plantNm || ''
        const machineNo = item.metadata ? item.metadata.machineNo : item.serverData?.machineNo || ''
        const label = item.metadata ? item.metadata.label : item.serverData?.label || ''
        const event = item.metadata?.event || ''
        
        return (
          plantNm.toLowerCase().includes(searchLower) ||
          machineNo.toLowerCase().includes(searchLower) ||
          label?.toLowerCase().includes(searchLower) ||
          event?.toLowerCase().includes(searchLower)
        )
      }
      
      return true
    })
  }, [data, searchQuery, locationFilter])

  // Sync selected items with parent component
  useEffect(() => {
    const localIds = Array.from(selectedItems)
      .filter(id => id.startsWith('local-'))
      .map(id => parseInt(id.replace('local-', '')))
    onSelectionChange(localIds)
  }, [selectedItems, onSelectionChange])

  const handleSelectAll = () => {
    const allIds = filteredData.map(item => item.id)
    setSelectedItems(new Set(allIds))
  }

  const handleDeselectAll = () => {
    setSelectedItems(new Set())
  }

  const showAlert = (type: 'success' | 'error', message: string) => {
    setAlerts(prev => [...prev, { type, message }])
    setTimeout(() => {
      setAlerts(prev => prev.slice(1))
    }, 5000)
  }

  const handleUpload = async (item: UnifiedDataItem) => {

    if (!item.metadata) return

    try {
      setUploadProgress(prev => ({ ...prev, [item.id]: 0 }))
      
      // Get time series data
      const timeSeriesData = await db.timeSeries
        .where('metadataId')
        .equals(item.metadata.id!)
        .toArray()
      
      if (timeSeriesData.length === 0) {
        throw new Error('No time series data found')
      }

      // Calculate data periods
      const sortedData = timeSeriesData.sort((a, b) => 
        a.timestamp.getTime() - b.timestamp.getTime()
      )
      
      const dataPeriods: { start: string, end: string }[] = []
      let currentPeriod: { start: string, end: string } | null = null
      
      sortedData.forEach((data, index) => {
        const timeStr = data.timestamp.toISOString()
        if (!currentPeriod) {
          currentPeriod = { start: timeStr, end: timeStr }
        } else {
          const currentTime = data.timestamp.getTime()
          const lastTime = new Date(currentPeriod.end).getTime()
          const timeDiff = currentTime - lastTime
          
          if (timeDiff > 3600000) { // 1 hour gap
            dataPeriods.push(currentPeriod)
            currentPeriod = { start: timeStr, end: timeStr }
          } else {
            currentPeriod.end = timeStr
          }
        }
        
        if (index === sortedData.length - 1 && currentPeriod) {
          dataPeriods.push(currentPeriod)
        }
      })

      // Upload data
      const uploadData = {
        metadata: {
          ...item.metadata,
          importedAt: item.metadata.importedAt.toISOString(),
          dataStartTime: item.metadata.dataStartTime?.toISOString(),
          dataEndTime: item.metadata.dataEndTime?.toISOString(),
          startTime: item.metadata.startTime?.toISOString(),
          endTime: item.metadata.endTime?.toISOString()
        },
        timeSeriesData: timeSeriesData.map(ts => ({
          ...ts,
          timestamp: ts.timestamp.toISOString()
        })),
        dataPeriods: dataPeriods
      }

      const response = await fetch('/api/data/upload', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'demo-api-key-12345'
        },
        body: JSON.stringify(uploadData)
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Upload failed:', errorData)
        throw new Error(errorData.details || errorData.error || 'Upload failed')
      }

      const result = await response.json()
      
      setUploadProgress(prev => ({ ...prev, [item.id]: 100 }))
      
      if (result.duplicate) {
        showAlert('success', `Data already exists on server for ${item.metadata.plant} - ${item.metadata.machineNo}`)
      } else {
        showAlert('success', `Successfully uploaded ${item.metadata.plant} - ${item.metadata.machineNo}`)
      }
      
      // Wait a bit before refreshing to ensure server has processed the upload
      setTimeout(async () => {
        console.log('[UnifiedDataView] Refreshing data after upload')
        await refreshData()
      }, 500)
      
    } catch (error) {
      showAlert('error', `Failed to upload: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setTimeout(() => {
        setUploadProgress(prev => {
          const newProgress = { ...prev }
          delete newProgress[item.id]
          return newProgress
        })
      }, 1000)
    }
  }

  const handleDownload = async (item: UnifiedDataItem) => {
    if (!item.serverData) return
    setDownloadConfirm({ item, show: true })
  }

  const confirmDownload = async () => {
    const item = downloadConfirm.item
    if (!item?.serverData) return

    try {
      setDownloadProgress(prev => ({ ...prev, [item.id]: 0 }))
      setDownloadConfirm({ item: null, show: false })

      const response = await fetch(`/api/data/${item.serverData.uploadId}/download`)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Download failed:', errorData)
        throw new Error(errorData.details || errorData.error || 'Download failed')
      }

      const downloadedData = await response.json()
      console.log('[Download] Response data:', downloadedData)
      
      // Save to IndexedDB
      
      // Create metadata
      const metadata: Metadata = {
        dataKey: `${item.serverData.plantNm}_${item.serverData.machineNo}_${Date.now()}`,
        plant: item.serverData.plantNm,
        machineNo: item.serverData.machineNo,
        label: item.serverData.label,
        dataStartTime: new Date(item.serverData.startTime),
        dataEndTime: new Date(item.serverData.endTime),
        dataSource: 'CASS', // Use CASS as default for server downloads
        importedAt: new Date()
      }
      
      const metadataId = await db.metadata.add(metadata)
      
      // Save time series data
      if (!downloadedData.timeSeriesData || !Array.isArray(downloadedData.timeSeriesData)) {
        throw new Error('Invalid data format: timeSeriesData is missing or not an array')
      }
      
      const timeSeriesData = downloadedData.timeSeriesData.map((row: Record<string, unknown>) => ({
        ...row,
        metadataId: metadataId,
        timestamp: new Date(row.timestamp as string)
      }))
      
      await db.timeSeries.bulkAdd(timeSeriesData)

      setDownloadProgress(prev => ({ ...prev, [item.id]: 100 }))
      showAlert('success', `Successfully downloaded ${item.serverData.plantNm} - ${item.serverData.machineNo}`)
      await refreshData()
      
    } catch (error) {
      showAlert('error', `Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setTimeout(() => {
        setDownloadProgress(prev => {
          const newProgress = { ...prev }
          delete newProgress[item.id]
          return newProgress
        })
      }, 1000)
    }
  }

  const handlePreview = async (item: UnifiedDataItem) => {
    if (item.metadata) {
      setPreviewData(item.metadata)
    } else if (item.serverData) {
      // Fetch preview data from server
      try {
        const response = await fetch(`/api/data/${item.serverData.uploadId}/preview`)
        
        if (response.ok) {
          const data = await response.json()
          setServerPreviewData(data)
        }
      } catch {
        showAlert('error', 'Failed to load preview')
      }
    }
  }
  
  const handleEdit = (item: UnifiedDataItem) => {
    if (item.metadata) {
      setEditMetadata(item.metadata)
    }
  }
  
  const handleDelete = (item: UnifiedDataItem) => {
    if (item.metadata) {
      setDeleteConfirm({ item, show: true })
    }
  }
  
  const confirmDelete = async () => {
    const item = deleteConfirm.item
    if (!item?.metadata) return
    
    try {
      // Delete time series data
      await db.timeSeries.where('metadataId').equals(item.metadata.id!).delete()
      // Delete metadata
      await db.metadata.delete(item.metadata.id!)
      
      showAlert('success', `Successfully deleted ${item.metadata.plant} - ${item.metadata.machineNo}`)
      await refreshData()
      
      // Remove from selection if it was selected
      setSelectedItems(prev => {
        const newSelection = new Set(prev)
        newSelection.delete(item.id)
        return newSelection
      })
    } catch (error) {
      showAlert('error', `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
    } finally {
      setDeleteConfirm({ item: null, show: false })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Alerts */}
      <div className="space-y-2 mb-4 flex-shrink-0">
        {importCompleted && (
          <Alert>
            <CheckCircle className="h-4 w-4" />
            <AlertDescription>
              Data imported successfully! The new data is now available for selection.
              <Button
                variant="ghost"
                size="sm"
                className="ml-2"
                onClick={onImportCompletedReset}
              >
                Dismiss
              </Button>
            </AlertDescription>
          </Alert>
        )}
        {alerts.map((alert, index) => (
          <Alert key={index} variant={alert.type === 'error' ? 'destructive' : 'default'}>
            {alert.type === 'success' ? (
              <CheckCircle className="h-4 w-4" />
            ) : (
              <AlertCircle className="h-4 w-4" />
            )}
            <AlertDescription>{alert.message}</AlertDescription>
          </Alert>
        ))}
      </div>

      {/* Search and Filter */}
      <div className="space-y-4 mb-4 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by plant, machine, label, or event..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex items-center gap-4">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <RadioGroup
            value={locationFilter}
            onValueChange={(value) => setLocationFilter(value as DataLocation | 'all')}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="all" id="all" />
              <Label htmlFor="all">All</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="local" id="local" />
              <Label htmlFor="local">Local Only</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="server" id="server" />
              <Label htmlFor="server">Server Only</Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="synced" id="synced" />
              <Label htmlFor="synced">Synced</Label>
            </div>
          </RadioGroup>
        </div>
      </div>

      {/* Selection controls */}
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <span className="text-sm text-muted-foreground">
          {selectedItems.size} of {filteredData.length} selected
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleSelectAll}
            disabled={filteredData.length === 0}
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDeselectAll}
            disabled={selectedItems.size === 0}
          >
            Deselect All
          </Button>
        </div>
      </div>

      {/* Data list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="space-y-2 pr-4 pb-4">
          {filteredData.map(item => {
            const progress = uploadProgress[item.id] || downloadProgress[item.id]
            
            return (
              <div key={item.id}>
                <DataCard
                  item={item}
                  isSelected={selectedItems.has(item.id)}
                  onSelectionChange={(selected) => {
                    const newSelection = new Set(selectedItems)
                    if (selected) {
                      newSelection.add(item.id)
                    } else {
                      newSelection.delete(item.id)
                    }
                    setSelectedItems(newSelection)
                  }}
                  onUpload={() => handleUpload(item)}
                  onDownload={() => handleDownload(item)}
                  onPreview={() => handlePreview(item)}
                  onEdit={() => handleEdit(item)}
                  onDelete={() => handleDelete(item)}
                  isLoading={progress !== undefined}
                />
                {progress !== undefined && (
                  <Progress value={progress} className="mt-2" />
                )}
              </div>
            )
          })}
          
          {filteredData.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              No data found
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Preview Dialogs */}
      {previewData && (
        <DataPreviewDialog
          open={!!previewData}
          onOpenChange={(open) => !open && setPreviewData(null)}
          metadata={previewData}
        />
      )}

      {serverPreviewData && (
        <ServerDataPreviewDialog
          open={!!serverPreviewData}
          onOpenChange={(open) => !open && setServerPreviewData(null)}
          uploadId={serverPreviewData.uploadId}
          dataInfo={{
            plant: serverPreviewData.metadata.plant as string || '',
            machineNo: serverPreviewData.metadata.machineNo as string || '',
            label: serverPreviewData.metadata.label as string | undefined
          }}
        />
      )}

      {/* Edit Metadata Dialog */}
      {editMetadata && (
        <EditMetadataDialog
          open={!!editMetadata}
          onOpenChange={(open) => !open && setEditMetadata(null)}
          metadata={editMetadata}
          onUpdate={async () => {
            await refreshData()
            setEditMetadata(null)
            showAlert('success', 'Metadata updated successfully')
          }}
        />
      )}

      {/* Download Confirmation Dialog */}
      <Dialog open={downloadConfirm.show} onOpenChange={(open) => !open && setDownloadConfirm({ item: null, show: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Download Server Data</DialogTitle>
            <DialogDescription>
              This will download the data from the server and save it to your local storage. Do you want to continue?
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {downloadConfirm.item?.serverData && (
              <>
                <p className="text-sm">
                  <strong>Plant:</strong> {downloadConfirm.item.serverData.plantNm}
                </p>
                <p className="text-sm">
                  <strong>Machine:</strong> {downloadConfirm.item.serverData.machineNo}
                </p>
                {downloadConfirm.item.serverData.label && (
                  <p className="text-sm">
                    <strong>Label:</strong> {downloadConfirm.item.serverData.label}
                  </p>
                )}
                <p className="text-sm">
                  <strong>Records:</strong> {downloadConfirm.item.serverData.recordCount}
                </p>
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDownloadConfirm({ item: null, show: false })}
            >
              Cancel
            </Button>
            <Button onClick={confirmDownload}>
              Download
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm.show} onOpenChange={(open) => !open && setDeleteConfirm({ item: null, show: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Data</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this data? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {deleteConfirm.item?.metadata && (
              <>
                <p className="text-sm">
                  <strong>Plant:</strong> {deleteConfirm.item.metadata.plant}
                </p>
                <p className="text-sm">
                  <strong>Machine:</strong> {deleteConfirm.item.metadata.machineNo}
                </p>
                {deleteConfirm.item.metadata.label && (
                  <p className="text-sm">
                    <strong>Label:</strong> {deleteConfirm.item.metadata.label}
                  </p>
                )}
                {deleteConfirm.item.metadata.event && (
                  <p className="text-sm">
                    <strong>Event:</strong> {deleteConfirm.item.metadata.event}
                  </p>
                )}
              </>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm({ item: null, show: false })}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDelete}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}