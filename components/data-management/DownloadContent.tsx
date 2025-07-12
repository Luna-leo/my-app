'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { db } from '@/lib/db'
import { Calendar, Factory, Cpu, Download, Loader2, CheckCircle, AlertCircle, Eye } from 'lucide-react'
import { ServerDataPreviewDialog } from './ServerDataPreviewDialog'

interface UploadedData {
  uploadId: string
  dataKey?: string
  plant: string
  machineNo: string
  label?: string
  dataStartTime: string
  dataEndTime: string
  parameterCount: number
  recordCount: number
  uploadedAt: string
}

interface UploadedDataFromAPI {
  uploadId: string
  dataKey?: string
  plantNm: string
  machineNo: string
  label?: string
  startTime: string
  endTime: string
  parameterCount: number
  recordCount: number
  uploadDate: string
}

export function DownloadContent() {
  const [uploadedData, setUploadedData] = useState<UploadedData[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const [isDownloading, setIsDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState(0)
  const [downloadResult, setDownloadResult] = useState<{ success: boolean; message: string } | null>(null)
  const [previewUploadId, setPreviewUploadId] = useState<string | null>(null)
  const [previewDataInfo, setPreviewDataInfo] = useState<{ plant: string; machineNo: string; label?: string } | null>(null)

  // Load uploaded data from server
  useEffect(() => {
    const loadUploadedData = async () => {
      try {
        setLoading(true)
        const response = await fetch('/api/data/list', {
          headers: {
            'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'demo-api-key-12345'
          }
        })

        if (response.ok) {
          const responseData = await response.json()
          // Transform the data to match component expectations
          const transformedData = (responseData.data || []).map((item: UploadedDataFromAPI) => ({
            uploadId: item.uploadId,
            dataKey: item.dataKey,
            plant: item.plantNm,
            machineNo: item.machineNo,
            label: item.label,
            dataStartTime: item.startTime,
            dataEndTime: item.endTime,
            parameterCount: item.parameterCount,
            recordCount: item.recordCount,
            uploadedAt: item.uploadDate
          }))
          setUploadedData(transformedData)
        } else {
          console.error('Failed to fetch uploaded data')
        }
      } catch (error) {
        console.error('Failed to load uploaded data:', error)
      } finally {
        setLoading(false)
      }
    }

    loadUploadedData()
  }, [])

  const handleSelectionChange = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds([...selectedIds, id])
    } else {
      setSelectedIds(selectedIds.filter(uploadId => uploadId !== id))
    }
  }

  const handleSelectAll = () => {
    const allIds = uploadedData.map(item => item.uploadId)
    setSelectedIds(allIds)
  }

  const handleDeselectAll = () => {
    setSelectedIds([])
  }

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString('ja-JP')
  }

  const handleDownload = async () => {
    if (selectedIds.length === 0) {
      setDownloadResult({ success: false, message: 'Please select at least one dataset to download' })
      return
    }

    setIsDownloading(true)
    setDownloadProgress(0)
    setDownloadResult(null)

    try {
      const totalItems = selectedIds.length
      let successCount = 0
      const errors: string[] = []

      for (let i = 0; i < selectedIds.length; i++) {
        const uploadId = selectedIds[i]
        
        setDownloadProgress(Math.floor((i / totalItems) * 50))

        try {
          // Fetch data from server
          const response = await fetch(`/api/data/${uploadId}/download`, {
            headers: {
              'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'demo-api-key-12345'
            }
          })

          if (!response.ok) {
            throw new Error(`Failed to download: ${response.statusText}`)
          }

          setDownloadProgress(Math.floor(((i + 0.5) / totalItems) * 100))

          const data = await response.json()
          
          // Check if data already exists in IndexedDB using dataKey
          if (data.metadata.dataKey) {
            const existingMetadata = await db.getMetadataByDataKey(data.metadata.dataKey)
            if (existingMetadata) {
              console.log(`Data with key ${data.metadata.dataKey} already exists, skipping`)
              continue
            }
          }

          // Save to IndexedDB with full transaction
          await db.transaction('rw', db.metadata, db.parameters, db.timeSeries, async () => {
            // Save metadata (exclude ID to allow auto-increment)
            const metadataId = await db.metadata.add({
              ...data.metadata,
              id: undefined,  // Exclude ID
              startTime: data.metadata.startTime ? new Date(data.metadata.startTime) : undefined,
              endTime: data.metadata.endTime ? new Date(data.metadata.endTime) : undefined,
              dataStartTime: data.metadata.dataStartTime ? new Date(data.metadata.dataStartTime) : undefined,
              dataEndTime: data.metadata.dataEndTime ? new Date(data.metadata.dataEndTime) : undefined,
              importedAt: new Date()
            })

            // Check for existing parameters and reuse them
            const parameterPromises = data.parameters.map(async (param: { parameterId: string; parameterName: string; unit: string; plant: string; machineNo: string }) => {
              const existingParam = await db.parameters
                .where('[parameterId+plant+machineNo]')
                .equals([param.parameterId, param.plant, param.machineNo])
                .first()
              
              if (!existingParam) {
                await db.parameters.add({
                  ...param,
                  id: undefined  // Exclude ID
                })
              }
            })
            await Promise.all(parameterPromises)

            // Save time series data (convert to correct format)
            const timeSeriesData = data.timeSeriesData.map((item: { timestamp: string; [key: string]: unknown }) => {
              // eslint-disable-next-line @typescript-eslint/no-unused-vars
              const { timestamp, id, ...parameterValues } = item;
              return {
                metadataId,
                timestamp: new Date(timestamp),
                data: parameterValues  // Store parameter values in 'data' field
              };
            });
            await db.timeSeries.bulkAdd(timeSeriesData)
          })

          successCount++
        } catch (err) {
          console.error(`Failed to download ${uploadId}:`, err)
          errors.push(`${uploadId}: ${err instanceof Error ? err.message : 'Unknown error'}`)
        }

        setDownloadProgress(Math.floor(((i + 1) / totalItems) * 100))
      }

      if (errors.length > 0 && successCount === 0) {
        setDownloadResult({
          success: false,
          message: `All downloads failed. First error: ${errors[0]}`
        })
      } else {
        setDownloadResult({
          success: true,
          message: `Successfully downloaded ${successCount} of ${totalItems} dataset(s)${errors.length > 0 ? ` (${errors.length} failed)` : ''}`
        })
      }
      
      // Clear selection after successful download
      setSelectedIds([])
    } catch (err) {
      console.error('Download error:', err)
      setDownloadResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to download data'
      })
    } finally {
      setIsDownloading(false)
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {downloadResult && (
        <Alert className={downloadResult.success ? "border-green-200 bg-green-50" : ""}>
          {downloadResult.success ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <AlertCircle className="h-4 w-4" />
          )}
          <AlertDescription className={downloadResult.success ? "text-green-800" : ""}>
            {downloadResult.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Selection controls */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">
          {selectedIds.length} of {uploadedData.length} selected
        </span>
        <div className="space-x-2">
          <Button 
            onClick={handleSelectAll} 
            variant="outline" 
            size="sm"
            disabled={loading || isDownloading}
          >
            Select All
          </Button>
          <Button 
            onClick={handleDeselectAll} 
            variant="outline" 
            size="sm"
            disabled={loading || selectedIds.length === 0 || isDownloading}
          >
            Deselect All
          </Button>
        </div>
      </div>

      {/* Data list */}
      <div className="flex-1 overflow-hidden border rounded-md">
        <div className="h-full overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Loading server data...
          </div>
        ) : uploadedData.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No data available on server
          </div>
        ) : (
          <div className="space-y-3">
            {uploadedData.map((item) => (
              <div 
                key={item.uploadId} 
                className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer"
                onClick={() => handleSelectionChange(item.uploadId, !selectedIds.includes(item.uploadId))}
              >
                <Checkbox
                  id={`upload-${item.uploadId}`}
                  checked={selectedIds.includes(item.uploadId)}
                  onCheckedChange={(checked) => handleSelectionChange(item.uploadId, checked as boolean)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                  disabled={isDownloading}
                />
                <div className="flex-1 space-y-1">
                  <Label 
                    htmlFor={`upload-${item.uploadId}`}
                    className="text-sm font-medium cursor-pointer"
                  >
                    <div className="flex items-center gap-2">
                      <Factory className="h-3 w-3" />
                      {item.plant}
                      <Cpu className="h-3 w-3" />
                      {item.machineNo}
                    </div>
                  </Label>
                  
                  {item.label && (
                    <p className="text-xs text-gray-600">Label: {item.label}</p>
                  )}
                  
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {formatDate(item.dataStartTime)} ~ {formatDate(item.dataEndTime)}
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-500">
                    Parameters: {item.parameterCount} | Records: {item.recordCount.toLocaleString()}
                  </p>
                  
                  <p className="text-xs text-gray-500">
                    Uploaded: {formatDate(item.uploadedAt)}
                  </p>
                  
                  <p className="text-xs text-gray-400">
                    ID: {item.uploadId}
                  </p>
                </div>
                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => {
                      setPreviewUploadId(item.uploadId)
                      setPreviewDataInfo({
                        plant: item.plant,
                        machineNo: item.machineNo,
                        label: item.label
                      })
                    }}
                    title="Preview data"
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>

      {/* Download progress */}
      {isDownloading && (
        <div className="space-y-2">
          <Progress value={downloadProgress} />
          <p className="text-sm text-center text-muted-foreground">
            Downloading... {downloadProgress}%
          </p>
        </div>
      )}

      {/* Download button */}
      <div className="flex-shrink-0 flex justify-end">
        <Button
          onClick={handleDownload}
          disabled={selectedIds.length === 0 || isDownloading}
          className="min-w-[120px]"
        >
          {isDownloading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Downloading...
            </>
          ) : (
            <>
              <Download className="mr-2 h-4 w-4" />
              Download
            </>
          )}
        </Button>
      </div>
      
      <ServerDataPreviewDialog
        open={!!previewUploadId}
        onOpenChange={(open) => {
          if (!open) {
            setPreviewUploadId(null)
            setPreviewDataInfo(null)
          }
        }}
        uploadId={previewUploadId}
        dataInfo={previewDataInfo}
      />
    </div>
  )
}