'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'
import { Search, Calendar, Factory, Cpu, Eye, Upload, Loader2, CheckCircle } from 'lucide-react'
import { DataPreviewDialog } from './DataPreviewDialog'

export function UploadContent() {
  const [metadata, setMetadata] = useState<Metadata[]>([])
  const [filteredMetadata, setFilteredMetadata] = useState<Metadata[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const [selectedDataIds, setSelectedDataIds] = useState<number[]>([])
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [previewMetadata, setPreviewMetadata] = useState<Metadata | null>(null)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string } | null>(null)

  // Load metadata from IndexedDB
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true)
        const data = await db.metadata.toArray()
        // Sort by importedAt date, newest first
        const sortedData = data.sort((a, b) => {
          const dateA = a.importedAt ? new Date(a.importedAt).getTime() : 0
          const dateB = b.importedAt ? new Date(b.importedAt).getTime() : 0
          return dateB - dateA
        })
        setMetadata(sortedData)
        setFilteredMetadata(sortedData)
      } catch (error) {
        console.error('Failed to load metadata:', error)
      } finally {
        setLoading(false)
      }
    }

    loadMetadata()
  }, [])

  // Filter metadata based on search term
  useEffect(() => {
    const filtered = metadata.filter(item => {
      const searchLower = searchTerm.toLowerCase()
      return (
        item.plant.toLowerCase().includes(searchLower) ||
        item.machineNo.toLowerCase().includes(searchLower) ||
        (item.label && item.label.toLowerCase().includes(searchLower)) ||
        (item.event && item.event.toLowerCase().includes(searchLower))
      )
    })
    setFilteredMetadata(filtered)
  }, [searchTerm, metadata])

  const handleSelectionChange = (id: number, checked: boolean) => {
    if (checked) {
      setSelectedDataIds([...selectedDataIds, id])
    } else {
      setSelectedDataIds(selectedDataIds.filter(dataId => dataId !== id))
    }
  }

  const handleSelectAll = () => {
    const allIds = filteredMetadata.map(item => item.id!).filter(id => id !== undefined)
    setSelectedDataIds(allIds)
  }

  const handleDeselectAll = () => {
    setSelectedDataIds([])
  }

  const formatDate = (date?: Date) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString('ja-JP')
  }

  const handleUpload = async () => {
    if (selectedDataIds.length === 0) {
      setUploadResult({ success: false, message: 'Please select at least one dataset to upload' })
      return
    }

    setIsUploading(true)
    setUploadProgress(0)
    setUploadResult(null)

    try {
      // Process each selected dataset
      const totalItems = selectedDataIds.length
      let successCount = 0

      for (let i = 0; i < selectedDataIds.length; i++) {
        const metadataId = selectedDataIds[i]
        const metadata = await db.metadata.get(metadataId)
        
        if (!metadata) continue

        setUploadProgress(Math.floor((i / totalItems) * 50))

        // Get parameters
        const parameters = await db.getParametersByPlantAndMachine(
          metadata.plant,
          metadata.machineNo
        )

        // Get time series data
        const timeSeriesData = await db.getTimeSeriesData(metadata.id!)

        setUploadProgress(Math.floor(((i + 0.5) / totalItems) * 100))

        // Prepare upload payload (exclude ID fields)
        const payload = {
          metadata: {
            ...metadata,
            id: undefined,  // Exclude ID
            startTime: metadata.startTime?.toISOString(),
            endTime: metadata.endTime?.toISOString(),
            dataStartTime: metadata.dataStartTime?.toISOString(),
            dataEndTime: metadata.dataEndTime?.toISOString(),
            importedAt: metadata.importedAt.toISOString()
          },
          parameters: parameters.map(p => ({
            ...p,
            id: undefined  // Exclude ID
          })),
          timeSeriesData: timeSeriesData.map(item => ({
            ...item,
            id: undefined,  // Exclude ID
            timestamp: item.timestamp.toISOString()
          }))
        }

        // Upload to server
        const response = await fetch('/api/data/upload', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'demo-api-key-12345'
          },
          body: JSON.stringify(payload)
        })

        if (response.ok) {
          successCount++
        }

        setUploadProgress(Math.floor(((i + 1) / totalItems) * 100))
      }

      setUploadResult({
        success: true,
        message: `Successfully uploaded ${successCount} of ${totalItems} dataset(s)`
      })
      
      // Clear selection after successful upload
      setSelectedDataIds([])
    } catch (err) {
      console.error('Upload error:', err)
      setUploadResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to upload data'
      })
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="flex flex-col h-full gap-4">
      {uploadResult && (
        <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : ""}>
          <CheckCircle className={`h-4 w-4 ${uploadResult.success ? "text-green-600" : ""}`} />
          <AlertDescription className={uploadResult.success ? "text-green-800" : ""}>
            {uploadResult.message}
          </AlertDescription>
        </Alert>
      )}

      {/* Search input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          placeholder="Search by plant, machine, label, or event..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Selection controls */}
      <div className="flex justify-between items-center">
        <span className="text-sm text-gray-600">
          {selectedDataIds.length} of {filteredMetadata.length} selected
        </span>
        <div className="space-x-2">
          <Button 
            onClick={handleSelectAll} 
            variant="outline" 
            size="sm"
            disabled={loading || isUploading}
          >
            Select All
          </Button>
          <Button 
            onClick={handleDeselectAll} 
            variant="outline" 
            size="sm"
            disabled={loading || selectedDataIds.length === 0 || isUploading}
          >
            Deselect All
          </Button>
        </div>
      </div>

      {/* Data list */}
      <div className="flex-1 overflow-hidden border rounded-md">
        <div ref={scrollContainerRef} className="h-full overflow-y-auto p-4">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            Loading data sources...
          </div>
        ) : filteredMetadata.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No data sources found
          </div>
        ) : (
          <div className="space-y-3">
            {filteredMetadata.map((item) => (
              <div 
                key={item.id} 
                className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer"
                onClick={() => handleSelectionChange(item.id!, !selectedDataIds.includes(item.id!))}
              >
                <Checkbox
                  id={`data-${item.id}`}
                  checked={selectedDataIds.includes(item.id!)}
                  onCheckedChange={(checked) => handleSelectionChange(item.id!, checked as boolean)}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
                  disabled={isUploading}
                />
                <div className="flex-1 space-y-1">
                  <Label 
                    htmlFor={`data-${item.id}`}
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
                  
                  {item.event && (
                    <p className="text-xs text-gray-600">Event: {item.event}</p>
                  )}
                  
                  <div className="flex items-center gap-1 text-xs text-gray-500">
                    <Calendar className="h-3 w-3" />
                    <span>
                      {formatDate(item.dataStartTime)} ~ {formatDate(item.dataEndTime)}
                    </span>
                  </div>
                  
                  <p className="text-xs text-gray-500">
                    Source: {item.dataSource} | Imported: {formatDate(item.importedAt)}
                  </p>
                </div>
                <div className="flex flex-col gap-1" onClick={(e) => e.stopPropagation()}>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setPreviewMetadata(item)}
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

      {/* Upload progress */}
      {isUploading && (
        <div className="space-y-2">
          <Progress value={uploadProgress} />
          <p className="text-sm text-center text-muted-foreground">
            Uploading... {uploadProgress}%
          </p>
        </div>
      )}

      {/* Upload button */}
      <div className="flex-shrink-0 flex justify-end">
        <Button
          onClick={handleUpload}
          disabled={selectedDataIds.length === 0 || isUploading}
          className="min-w-[120px]"
        >
          {isUploading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Uploading...
            </>
          ) : (
            <>
              <Upload className="mr-2 h-4 w-4" />
              Upload
            </>
          )}
        </Button>
      </div>
      
      <DataPreviewDialog
        open={!!previewMetadata}
        onOpenChange={(open) => !open && setPreviewMetadata(null)}
        metadata={previewMetadata}
      />
    </div>
  )
}