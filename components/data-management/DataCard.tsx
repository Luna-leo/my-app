'use client'

import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { 
  Factory, 
  Cpu, 
  Calendar, 
  Cloud, 
  HardDrive,
  Upload, 
  Download, 
  Eye,
  RefreshCw,
  Loader2,
  Trash2,
  Edit,
  X,
  Database,
  FileArchive,
  Undo2,
  AlertCircle
} from 'lucide-react'
import { UnifiedDataItem } from '@/lib/hooks/useUnifiedData'
import { UploadState, formatTimeRemaining } from '@/lib/utils/uploadUtils'
import { Progress } from '@/components/ui/progress'

interface DataCardProps {
  item: UnifiedDataItem
  isSelected: boolean
  onSelectionChange: (selected: boolean) => void
  onUpload?: () => void
  onDownload?: () => void
  onPreview?: () => void
  onEdit?: () => void
  onDelete?: () => void
  onCancelUpload?: () => void
  onPersist?: () => void
  onRestore?: () => void
  onClearPersistence?: () => void
  isLoading?: boolean
  uploadState?: UploadState
  persistenceLoading?: boolean
}

export function DataCard({
  item,
  isSelected,
  onSelectionChange,
  onUpload,
  onDownload,
  onPreview,
  onEdit,
  onDelete,
  onCancelUpload,
  onPersist,
  onRestore,
  onClearPersistence,
  isLoading = false,
  uploadState,
  persistenceLoading = false
}: DataCardProps) {
  const getBorderColor = () => {
    switch (item.location) {
      case 'local':
        return 'border-blue-500'
      case 'server':
        return 'border-green-500'
      case 'synced':
        return 'border-gray-400'
      default:
        return 'border-gray-200'
    }
  }

  const getLocationIcon = () => {
    switch (item.location) {
      case 'local':
        return <HardDrive className="h-4 w-4 text-blue-500" />
      case 'server':
        return <Cloud className="h-4 w-4 text-green-500" />
      case 'synced':
        return <RefreshCw className="h-4 w-4 text-gray-500" />
    }
  }

  const getLocationBadge = () => {
    switch (item.location) {
      case 'local':
        return <Badge variant="secondary" className="bg-blue-100 text-blue-700">Local Only</Badge>
      case 'server':
        return <Badge variant="secondary" className="bg-green-100 text-green-700">Server Only</Badge>
      case 'synced':
        return (
          <Badge variant="secondary" className="bg-gray-100 text-gray-700">
            Synced {item.syncStatus?.isOutdated && '(Local newer)'}
          </Badge>
        )
    }
  }

  const displayData = item.metadata || item.serverData
  if (!displayData) return null

  const plantNm = item.metadata ? item.metadata.plant : item.serverData?.plantNm || ''
  const machineNo = item.metadata ? item.metadata.machineNo : item.serverData?.machineNo || ''
  const label = item.metadata ? item.metadata.label : item.serverData?.label
  const event = item.metadata?.event
  
  const formatDate = (date: string | Date | undefined | null) => {
    if (!date) return ''
    
    try {
      const dateObj = date instanceof Date ? date : new Date(date)
      // Check if date is valid
      if (isNaN(dateObj.getTime())) {
        return ''
      }
      
      return dateObj.toLocaleDateString('ja-JP', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit'
      })
    } catch {
      return ''
    }
  }

  const getDateRange = () => {
    if (item.metadata) {
      const startTime = item.metadata.dataStartTime || item.metadata.startTime
      const endTime = item.metadata.dataEndTime || item.metadata.endTime
      if (startTime && endTime) {
        const formattedStart = formatDate(startTime)
        const formattedEnd = formatDate(endTime)
        if (formattedStart && formattedEnd) {
          return `${formattedStart} ~ ${formattedEnd}`
        }
      }
    } else if (item.serverData) {
      const formattedStart = formatDate(item.serverData.startTime)
      const formattedEnd = formatDate(item.serverData.endTime)
      if (formattedStart && formattedEnd) {
        return `${formattedStart} ~ ${formattedEnd}`
      }
    }
    return ''
  }

  const getHoverBgColor = () => {
    switch (item.location) {
      case 'local':
        return 'hover:bg-blue-50'
      case 'server':
        return 'hover:bg-green-50'
      case 'synced':
        return 'hover:bg-gray-50'
      default:
        return 'hover:bg-gray-50'
    }
  }

  const getSelectedBgColor = () => {
    switch (item.location) {
      case 'local':
        return 'bg-blue-100'
      case 'server':
        return 'bg-green-100'
      case 'synced':
        return 'bg-gray-100'
      default:
        return 'bg-gray-100'
    }
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <Card 
      className={cn(
        "p-4 transition-all duration-200 border-2 cursor-pointer",
        getBorderColor(),
        isSelected ? getSelectedBgColor() : getHoverBgColor(),
        "hover:shadow-md"
      )}
      onClick={(e) => {
        // Prevent selection when clicking on buttons
        const target = e.target as HTMLElement
        if (target.closest('button')) return
        
        // For server-only data, show download dialog instead of selection
        if (item.location === 'server' && onDownload) {
          onDownload()
        } else {
          onSelectionChange(!isSelected)
        }
      }}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={isSelected}
          onCheckedChange={(checked) => {
            // For server-only data, show download dialog instead of selection
            if (item.location === 'server' && onDownload) {
              onDownload()
            } else {
              onSelectionChange(checked as boolean)
            }
          }}
          disabled={isLoading || item.location === 'server'}
          onClick={(e) => e.stopPropagation()}
        />
        
        <div className="flex-1 space-y-3">
          <div className="flex items-start justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Factory className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{plantNm}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Cpu className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium">{machineNo}</span>
                </div>
                {getLocationIcon()}
              </div>
              
              {(label || event) && (
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {label && <span>Label: {label}</span>}
                  {event && <span>Event: {event}</span>}
                </div>
              )}
              
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>{getDateRange()}</span>
              </div>
              
              <div className="flex items-center gap-2">
                {getLocationBadge()}
                {item.location === 'local' && item.metadata && !item.inMemory && (
                  <Badge variant="secondary" className="bg-orange-100 text-orange-700">
                    <AlertCircle className="h-3 w-3 mr-1" />
                    メモリ未ロード
                  </Badge>
                )}
                {item.metadata && (
                  <span className="text-xs text-muted-foreground">
                    Imported: {formatDate(item.metadata.importedAt)}
                  </span>
                )}
                {item.serverData && !item.metadata && (
                  <span className="text-xs text-muted-foreground">
                    Uploaded: {formatDate(item.serverData.uploadDate)}
                  </span>
                )}
              </div>
              
              {/* Persistence Status */}
              {item.persistenceStatus && (
                <div className="mt-2 p-2 bg-muted/50 rounded-md space-y-1">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">永続化済み</span>
                    {item.persistenceStatus.compressionRatio !== undefined && (
                      <Badge variant="secondary" className="text-xs">
                        圧縮率 {Math.round(item.persistenceStatus.compressionRatio * 100)}%
                      </Badge>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FileArchive className="h-3 w-3" />
                      <span>{item.persistenceStatus.chunkCount} チャンク</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <HardDrive className="h-3 w-3" />
                      <span>{formatBytes(item.persistenceStatus.totalSize)}</span>
                    </div>
                    {item.persistenceStatus.lastPersisted && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        <span>{formatDate(item.persistenceStatus.lastPersisted)}</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-2">
              {onPreview && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onPreview}
                  disabled={isLoading}
                >
                  <Eye className="h-4 w-4" />
                </Button>
              )}
              
              {item.metadata && onEdit && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onEdit}
                  disabled={isLoading}
                >
                  <Edit className="h-4 w-4" />
                </Button>
              )}
              
              {item.metadata && onDelete && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDelete}
                  disabled={isLoading}
                  className="text-destructive hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
              
              {item.location === 'local' && onUpload && !uploadState && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onUpload}
                  disabled={isLoading}
                  className="gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4" />
                  )}
                  Upload
                </Button>
              )}
              
              {/* Persistence actions for local data */}
              {item.location === 'local' && item.metadata && (
                <>
                  {!item.persistenceStatus?.isPersisted && onPersist && (
                    item.inMemory ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={onPersist}
                        disabled={isLoading || persistenceLoading}
                        className="gap-2"
                      >
                        {persistenceLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Database className="h-4 w-4" />
                        )}
                        永続化
                      </Button>
                    ) : (
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <AlertCircle className="h-4 w-4 text-warning" />
                        <span>メモリ未ロード</span>
                      </div>
                    )
                  )}
                  
                  {item.persistenceStatus?.isPersisted && (
                    <>
                      {onRestore && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onRestore}
                          disabled={isLoading || persistenceLoading}
                          className="gap-2"
                        >
                          {persistenceLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Undo2 className="h-4 w-4" />
                          )}
                          復元
                        </Button>
                      )}
                      
                      {onClearPersistence && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={onClearPersistence}
                          disabled={isLoading || persistenceLoading}
                          className="gap-2 text-destructive hover:text-destructive"
                        >
                          {persistenceLoading ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          永続化削除
                        </Button>
                      )}
                    </>
                  )}
                </>
              )}
              
              {item.location === 'server' && onDownload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onDownload}
                  disabled={isLoading}
                  className="gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  Download
                </Button>
              )}
              
              {item.location === 'synced' && item.syncStatus?.isOutdated && onUpload && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onUpload}
                  disabled={isLoading}
                  className="gap-2"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Update
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Upload progress UI */}
      {uploadState && (
        <div className="mt-3 space-y-2 border-t pt-3">
          <div className="flex justify-between items-center text-sm">
            <span className="font-medium">{uploadState.message}</span>
            <div className="flex items-center gap-2">
              {uploadState.stage === 'uploading' && uploadState.estimatedTime && (
                <span className="text-xs text-muted-foreground">
                  残り{formatTimeRemaining(uploadState.estimatedTime)}
                </span>
              )}
              <span className="font-medium">{uploadState.progress}%</span>
              {uploadState.stage !== 'complete' && uploadState.stage !== 'error' && onCancelUpload && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onCancelUpload}
                  className="h-6 w-6"
                >
                  <X className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
          <Progress value={uploadState.progress} className="h-2" />
          {uploadState.processedRecords !== undefined && uploadState.totalRecords && (
            <div className="text-xs text-muted-foreground">
              {uploadState.processedRecords.toLocaleString()} / {uploadState.totalRecords.toLocaleString()} レコード処理済み
            </div>
          )}
        </div>
      )}
    </Card>
  )
}