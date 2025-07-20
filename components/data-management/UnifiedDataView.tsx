'use client'

import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
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
import { 
  UploadState, 
  createInitialUploadState, 
  updateUploadState,
  calculateProgressForStage,
  createProgressUpdater
} from '@/lib/utils/uploadUtils'
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
  selectedDataIds,
  onSelectionChange,
  importCompleted,
  onImportCompletedReset
}: UnifiedDataViewProps) {
  const { data, loading, refreshData } = useUnifiedData()
  const [searchQuery, setSearchQuery] = useState('')
  const [locationFilter, setLocationFilter] = useState<DataLocation | 'all'>('all')
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [uploadStates, setUploadStates] = useState<Record<string, UploadState>>({})
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({})
  const [deleteProgress, setDeleteProgress] = useState<Record<string, number>>({})
  const [alerts, setAlerts] = useState<{ type: 'success' | 'error' | 'info', message: string }[]>([])
  const [pendingAutoSelect, setPendingAutoSelect] = useState<string | null>(null)
  const workersRef = useRef<Map<string, Worker>>(new Map())
  const abortControllersRef = useRef<Map<string, AbortController>>(new Map())
  
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
    show: boolean,
    isDownloading: boolean,
    progress: number
  }>({ item: null, show: false, isDownloading: false, progress: 0 })
  
  // Delete confirmation dialog
  const [deleteConfirm, setDeleteConfirm] = useState<{
    item: UnifiedDataItem | null,
    show: boolean,
    isDeleting: boolean
  }>({ item: null, show: false, isDeleting: false })
  

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

  // Initialize selectedItems from selectedDataIds
  useEffect(() => {
    if (selectedDataIds.length > 0) {
      const initialSelection = new Set(
        selectedDataIds.map(id => `local-${id}`)
      )
      setSelectedItems(initialSelection)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sync selected items with parent component
  useEffect(() => {
    const localIds = Array.from(selectedItems)
      .filter(id => id.startsWith('local-'))
      .map(id => parseInt(id.replace('local-', '')))
    onSelectionChange(localIds)
  }, [selectedItems, onSelectionChange])

  // Auto-select downloaded data
  useEffect(() => {
    if (pendingAutoSelect && data.length > 0) {
      const downloadedItem = data.find(d => 
        d.metadata?.dataKey === pendingAutoSelect
      )
      if (downloadedItem) {
        setSelectedItems(prev => {
          const newSelection = new Set(prev)
          newSelection.add(downloadedItem.id)
          return newSelection
        })
        setPendingAutoSelect(null)
      }
    }
  }, [data, pendingAutoSelect])
  


  const handleSelectAll = () => {
    const allIds = filteredData.map(item => item.id)
    setSelectedItems(new Set(allIds))
  }

  const handleDeselectAll = () => {
    setSelectedItems(new Set())
  }

  const showAlert = useCallback((type: 'success' | 'error' | 'info', message: string) => {
    setAlerts(prev => [...prev, { type, message }])
    setTimeout(() => {
      setAlerts(prev => prev.slice(1))
    }, 5000)
  }, [])

  const handleUpload = useCallback(async (item: UnifiedDataItem) => {
    if (!item.metadata) return

    // Create abort controller for this upload
    const abortController = new AbortController()
    abortControllersRef.current.set(item.id, abortController)

    // Initialize upload state
    const initialState = createInitialUploadState()
    setUploadStates(prev => ({ ...prev, [item.id]: initialState }))

    // Create progress updater with debouncing
    const updateProgress = createProgressUpdater((state) => {
      setUploadStates(prev => ({ ...prev, [item.id]: state }))
    })

    try {
      // Stage 1: Preparing data (0-10%)
      updateProgress(updateUploadState(initialState, {
        stage: 'preparing',
        progress: 0,
        message: 'データを準備中...'
      }))

      // Get time series data from persisted chunks
      const { hybridDataService } = await import('@/lib/services/hybridDataService')
      const { createDataPersistenceService } = await import('@/lib/services/dataPersistenceService')
      
      const connection = await hybridDataService.getConnection()
      if (!connection) {
        throw new Error('DuckDB connection not available')
      }
      
      const persistenceService = createDataPersistenceService(connection)
      const { data: timeSeriesData, columns: parameterIds } = await persistenceService.getDataForUpload(item.metadata.id!)
      
      if (timeSeriesData.length === 0) {
        throw new Error('時系列データが見つかりません')
      }

      updateProgress(updateUploadState(initialState, {
        progress: 5,
        message: 'パラメータ情報を取得中...',
        totalRecords: timeSeriesData.length
      }))

      // Get parameters
      let parameters: { parameterId: string; parameterName: string; unit: string }[] = []
      if (parameterIds.length > 0) {
        const { plant, machineNo } = item.metadata
        const allParameters = await db.parameters
          .where('plant')
          .equals(plant)
          .and(p => p.machineNo === machineNo)
          .toArray()
        
        parameters = allParameters.filter(p => 
          parameterIds.includes(p.parameterId)
        )
      }
      
      if (parameters.length === 0) {
        throw new Error('有効なパラメータが見つかりません。CSVファイルをヘッダー情報付きで再インポートしてください。')
      }

      // Stage 2: Processing data with Web Worker (10-40%)
      updateProgress(updateUploadState(initialState, {
        stage: 'processing',
        progress: 10,
        message: `データを処理中... (0/${timeSeriesData.length}レコード)`,
        processedRecords: 0,
        totalRecords: timeSeriesData.length
      }))

      // Create and use Web Worker
      const worker = new Worker(
        new URL('../../workers/dataProcessing.worker.ts', import.meta.url),
        { type: 'module' }
      )
      workersRef.current.set(item.id, worker)

      const workerPromise = new Promise<Record<string, unknown>>((resolve, reject) => {
        worker.onmessage = (event) => {
          const { type, data, error, progress } = event.data

          if (type === 'PROGRESS') {
            const stageProgress = calculateProgressForStage('processing', progress)
            const processedRecords = Math.floor((progress / 100) * timeSeriesData.length)
            
            updateProgress(updateUploadState(initialState, {
              stage: 'processing',
              progress: stageProgress,
              message: `データを処理中... (${processedRecords}/${timeSeriesData.length}レコード)`,
              processedRecords,
              totalRecords: timeSeriesData.length
            }))
          } else if (type === 'DATA_PROCESSED') {
            resolve(data)
          } else if (type === 'ERROR') {
            reject(new Error(error))
          }
        }

        worker.onerror = (error) => {
          reject(new Error(`Worker error: ${error.message}`))
        }

        // Convert data format for worker
        const timeSeriesDataForWorker = timeSeriesData.map(row => ({
          metadataId: item.metadata.id!,
          timestamp: row.timestamp,
          data: Object.fromEntries(
            parameterIds.map(pid => [pid, row[pid] ?? null])
          )
        }))
        
        // Send data to worker
        worker.postMessage({
          type: 'PREPARE_UPLOAD',
          data: {
            id: item.id,
            timeSeriesData: timeSeriesDataForWorker,
            metadata: item.metadata,
            parameters
          }
        })
      })

      // Wait for worker to process data
      const uploadData = await workerPromise as {
        chunks: Array<{ index: number; total: number; data: unknown[] }>
        isChunked: boolean
        totalRecords: number
        metadata: Record<string, unknown>
        parameters: Array<{ parameterId: string; parameterName: string; unit: string }>
        dataPeriods: Array<{ start: string; end: string }>
      }

      // Check if aborted
      if (abortController.signal.aborted) {
        throw new Error('アップロードがキャンセルされました')
      }

      // Stage 3: Uploading to server (40-100%)
      const { chunks, isChunked, totalRecords } = uploadData

      if (isChunked) {
        // Upload chunks one by one
        let uploadedRecords = 0

        for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i]
          const chunkData = {
            metadata: uploadData.metadata,
            parameters: uploadData.parameters,
            timeSeriesData: chunk.data,
            chunkInfo: {
              index: chunk.index,
              total: chunk.total
            }
          }

          updateProgress(updateUploadState(initialState, {
            stage: 'uploading',
            progress: calculateProgressForStage('uploading', (i / chunks.length) * 100),
            message: `サーバーに送信中... (${uploadedRecords}/${totalRecords}レコード)`,
            processedRecords: uploadedRecords,
            totalRecords
          }))

          const response = await fetch('/api/data/upload', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'demo-api-key-12345'
            },
            body: JSON.stringify(chunkData),
            signal: abortController.signal
          })

          if (!response.ok) {
            const errorData = await response.json()
            throw new Error(errorData.details || errorData.error || 'アップロードに失敗しました')
          }

          const result = await response.json()
          console.log(`Chunk ${i + 1}/${chunks.length} response:`, result)

          uploadedRecords += chunk.data.length
          
          // Check if this was the final chunk and upload is complete
          if (result.complete && result.dataKey) {
            // Update local metadata with dataKey
            await db.metadata.update(item.metadata.id!, { dataKey: result.dataKey })
            showAlert('success', `${item.metadata.plant} - ${item.metadata.machineNo}のアップロードが完了しました`)
          }
        }
      } else {
        // Upload all data at once for small datasets
        updateProgress(updateUploadState(initialState, {
          stage: 'uploading',
          progress: 50,
          message: 'サーバーに送信中...',
          processedRecords: 0,
          totalRecords
        }))

        const singleChunkData = {
          metadata: uploadData.metadata,
          parameters: uploadData.parameters,
          timeSeriesData: chunks[0].data
        }

        const response = await fetch('/api/data/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'demo-api-key-12345'
          },
          body: JSON.stringify(singleChunkData),
          signal: abortController.signal
        })

        if (!response.ok) {
          const errorData = await response.json()
          throw new Error(errorData.details || errorData.error || 'アップロードに失敗しました')
        }

        const result = await response.json()
        
        // Update local metadata with dataKey if provided
        if (result.dataKey) {
          await db.metadata.update(item.metadata.id!, { dataKey: result.dataKey })
        }
        
        if (result.duplicate) {
          showAlert('success', `${item.metadata.plant} - ${item.metadata.machineNo}のデータは既にサーバーに存在します`)
        } else {
          showAlert('success', `${item.metadata.plant} - ${item.metadata.machineNo}のアップロードが完了しました`)
        }
      }

      // Complete
      updateProgress(updateUploadState(initialState, {
        stage: 'complete',
        progress: 100,
        message: 'アップロード完了'
      }))

      // Refresh data
      setTimeout(async () => {
        await refreshData()
      }, 500)

    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        showAlert('info', 'アップロードがキャンセルされました')
      } else {
        showAlert('error', `アップロードに失敗しました: ${error instanceof Error ? error.message : '不明なエラー'}`)
        
        updateProgress(updateUploadState(initialState, {
          stage: 'error',
          progress: 0,
          message: error instanceof Error ? error.message : 'エラーが発生しました'
        }))
      }
    } finally {
      // Cleanup
      setTimeout(() => {
        setUploadStates(prev => {
          const newStates = { ...prev }
          delete newStates[item.id]
          return newStates
        })
        setUploadProgress(prev => {
          const newProgress = { ...prev }
          delete newProgress[item.id]
          return newProgress
        })
        
        // Clean up worker
        const worker = workersRef.current.get(item.id)
        if (worker) {
          worker.terminate()
          workersRef.current.delete(item.id)
        }
        
        // Clean up abort controller
        abortControllersRef.current.delete(item.id)
      }, 3000)
    }
  }, [refreshData, showAlert])

  const handleCancelUpload = useCallback((itemId: string) => {
    const abortController = abortControllersRef.current.get(itemId)
    if (abortController) {
      abortController.abort()
    }
    
    const worker = workersRef.current.get(itemId)
    if (worker) {
      worker.terminate()
      workersRef.current.delete(itemId)
    }
    
    // Clean up states
    setUploadStates(prev => {
      const newStates = { ...prev }
      delete newStates[itemId]
      return newStates
    })
    
    setUploadProgress(prev => {
      const newProgress = { ...prev }
      delete newProgress[itemId]
      return newProgress
    })
    
    abortControllersRef.current.delete(itemId)
    showAlert('info', 'アップロードをキャンセルしました')
  }, [showAlert])

  const handleDownload = async (item: UnifiedDataItem) => {
    if (!item.serverData) return
    setDownloadConfirm({ item, show: true, isDownloading: false, progress: 0 })
  }

  const confirmDownload = async () => {
    const item = downloadConfirm.item
    if (!item?.serverData) return

    try {
      // Set downloading state
      setDownloadConfirm(prev => ({ ...prev, isDownloading: true, progress: 0 }))
      setDownloadProgress(prev => ({ ...prev, [item.id]: 0 }))

      const response = await fetch(`/api/data/${item.serverData.uploadId}/download`)
      
      // Update progress to 30% after fetch
      setDownloadConfirm(prev => ({ ...prev, progress: 30 }))
      setDownloadProgress(prev => ({ ...prev, [item.id]: 30 }))

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Download failed:', errorData)
        throw new Error(errorData.details || errorData.error || 'Download failed')
      }

      const downloadedData = await response.json()
      console.log('[Download] Response data:', downloadedData)
      
      // Update progress to 50% after parsing response
      setDownloadConfirm(prev => ({ ...prev, progress: 50 }))
      setDownloadProgress(prev => ({ ...prev, [item.id]: 50 }))
      
      // Check if data already exists in IndexedDB using dataKey
      if (downloadedData.metadata.dataKey) {
        const existingMetadata = await db.getMetadataByDataKey(downloadedData.metadata.dataKey)
        if (existingMetadata) {
          console.log(`[Download] Data with key ${downloadedData.metadata.dataKey} already exists, skipping`)
          showAlert('success', `Data already exists locally for ${item.serverData.plantNm} - ${item.serverData.machineNo}`)
          setDownloadConfirm({ item: null, show: false, isDownloading: false, progress: 0 })
          return
        }
      }
      
      // Update progress to 60% before saving to IndexedDB
      setDownloadConfirm(prev => ({ ...prev, progress: 60 }))
      setDownloadProgress(prev => ({ ...prev, [item.id]: 60 }))
      
      // Save to IndexedDB
      
      // Create metadata using server's dataKey
      const metadata: Metadata = {
        ...downloadedData.metadata,
        id: undefined,  // Exclude ID
        dataKey: downloadedData.metadata.dataKey || `${item.serverData.plantNm}_${item.serverData.machineNo}_${Date.now()}`,
        plant: item.serverData.plantNm,
        machineNo: item.serverData.machineNo,
        label: item.serverData.label,
        dataStartTime: downloadedData.metadata.dataStartTime ? new Date(downloadedData.metadata.dataStartTime) : new Date(item.serverData.startTime),
        dataEndTime: downloadedData.metadata.dataEndTime ? new Date(downloadedData.metadata.dataEndTime) : new Date(item.serverData.endTime),
        dataSource: downloadedData.metadata.dataSource || 'CASS',
        importedAt: new Date()
      }
      
      const metadataId = await db.metadata.add(metadata)
      
      // Save parameters
      if (downloadedData.parameters && Array.isArray(downloadedData.parameters)) {
        const { plantNm, machineNo } = item.serverData!
        const parameterPromises = downloadedData.parameters.map(async (param: { parameterId: string; parameterName: string; unit: string }) => {
          const existingParam = await db.parameters
            .where('[parameterId+plant+machineNo]')
            .equals([param.parameterId, plantNm, machineNo])
            .first()
          
          if (!existingParam) {
            await db.parameters.add({
              ...param,
              id: undefined,  // Exclude ID
              plant: plantNm,
              machineNo: machineNo
            })
          }
        })
        await Promise.all(parameterPromises)
        console.log(`[Download] Saved ${downloadedData.parameters.length} parameters for ${plantNm} - ${machineNo}`)
      } else {
        console.warn('[Download] No parameters found in downloaded data')
      }
      
      // Save time series data
      if (!downloadedData.timeSeriesData || !Array.isArray(downloadedData.timeSeriesData)) {
        throw new Error('Invalid data format: timeSeriesData is missing or not an array')
      }
      
      const timeSeriesData = downloadedData.timeSeriesData.map((row: Record<string, unknown>) => ({
        ...row,
        metadataId: metadataId,
        timestamp: new Date(row.timestamp as string)
      }))
      
      // Update progress to 80% before bulk insert
      setDownloadConfirm(prev => ({ ...prev, progress: 80 }))
      setDownloadProgress(prev => ({ ...prev, [item.id]: 80 }))
      
      await db.timeSeries.bulkAdd(timeSeriesData)
      
      // Update progress to 100%
      setDownloadConfirm(prev => ({ ...prev, progress: 100 }))
      setDownloadProgress(prev => ({ ...prev, [item.id]: 100 }))
      
      showAlert('success', `Successfully downloaded ${item.serverData.plantNm} - ${item.serverData.machineNo}`)
      
      // Set pending auto-select for after refresh
      setPendingAutoSelect(metadata.dataKey)
      
      await refreshData()
      
      // Close dialog after successful download
      setDownloadConfirm({ item: null, show: false, isDownloading: false, progress: 0 })
      
      // Clear download progress after a short delay
      setTimeout(() => {
        setDownloadProgress(prev => {
          const newProgress = { ...prev }
          delete newProgress[item.id]
          return newProgress
        })
      }, 1000)
      
    } catch (error) {
      showAlert('error', `Failed to download: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setDownloadConfirm(prev => ({ ...prev, isDownloading: false }))
      
      // Clear download progress on error
      setDownloadProgress(prev => {
        const newProgress = { ...prev }
        delete newProgress[item.id]
        return newProgress
      })
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
      setDeleteConfirm({ item, show: true, isDeleting: false })
    }
  }
  
  const confirmDelete = async () => {
    const item = deleteConfirm.item
    if (!item?.metadata) return
    
    try {
      // Set deleting state
      setDeleteConfirm(prev => ({ ...prev, isDeleting: true }))
      
      // Set delete progress
      setDeleteProgress(prev => ({ ...prev, [item.id]: 0 }))
      
      // Delete time series data
      await db.timeSeries.where('metadataId').equals(item.metadata.id!).delete()
      setDeleteProgress(prev => ({ ...prev, [item.id]: 50 }))
      
      // Delete metadata
      await db.metadata.delete(item.metadata.id!)
      setDeleteProgress(prev => ({ ...prev, [item.id]: 100 }))
      
      showAlert('success', `Successfully deleted ${item.metadata.plant} - ${item.metadata.machineNo}`)
      await refreshData()
      
      // Remove from selection if it was selected
      setSelectedItems(prev => {
        const newSelection = new Set(prev)
        newSelection.delete(item.id)
        return newSelection
      })
      
      // Close dialog after successful deletion
      setDeleteConfirm({ item: null, show: false, isDeleting: false })
    } catch (error) {
      showAlert('error', `Failed to delete: ${error instanceof Error ? error.message : 'Unknown error'}`)
      setDeleteConfirm(prev => ({ ...prev, isDeleting: false }))
    } finally {
      // Clear delete progress after a short delay
      setTimeout(() => {
        setDeleteProgress(prev => {
          const newProgress = { ...prev }
          delete newProgress[item.id]
          return newProgress
        })
      }, 1000)
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
            const progress = uploadProgress[item.id] || downloadProgress[item.id] || deleteProgress[item.id]
            const uploadState = uploadStates[item.id]
            
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
                  onCancelUpload={() => handleCancelUpload(item.id)}
                  isLoading={progress !== undefined}
                  uploadState={uploadState}
                />
                {progress !== undefined && !uploadState && (
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
      <Dialog open={downloadConfirm.show} onOpenChange={(open) => !open && !downloadConfirm.isDownloading && setDownloadConfirm({ item: null, show: false, isDownloading: false, progress: 0 })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{downloadConfirm.isDownloading ? 'Downloading Data...' : 'Download Server Data'}</DialogTitle>
            <DialogDescription>
              {downloadConfirm.isDownloading 
                ? 'Please wait while the data is being downloaded...' 
                : 'This will download the data from the server and save it to your local storage. Do you want to continue?'}
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
            {downloadConfirm.isDownloading && (
              <div className="space-y-2 py-4">
                <Progress value={downloadConfirm.progress} className="w-full" />
                <p className="text-sm text-center text-muted-foreground">
                  {downloadConfirm.progress}% complete
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDownloadConfirm({ item: null, show: false, isDownloading: false, progress: 0 })}
              disabled={downloadConfirm.isDownloading}
            >
              Cancel
            </Button>
            <Button 
              onClick={confirmDownload}
              disabled={downloadConfirm.isDownloading}
            >
              {downloadConfirm.isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading...
                </>
              ) : (
                'Download'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteConfirm.show} onOpenChange={(open) => !open && !deleteConfirm.isDeleting && setDeleteConfirm({ item: null, show: false, isDeleting: false })}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deleteConfirm.isDeleting ? 'Deleting Data...' : 'Delete Data'}</DialogTitle>
            <DialogDescription>
              {deleteConfirm.isDeleting 
                ? 'Please wait while the data is being deleted...' 
                : 'Are you sure you want to delete this data? This action cannot be undone.'}
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
            {deleteConfirm.isDeleting && (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteConfirm({ item: null, show: false, isDeleting: false })}
              disabled={deleteConfirm.isDeleting}
            >
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteConfirm.isDeleting}
            >
              {deleteConfirm.isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}