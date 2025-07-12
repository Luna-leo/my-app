'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
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
import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'
import { Search, Calendar, Factory, Cpu, CheckCircle, Eye, Edit, Trash2 } from 'lucide-react'
import { DataPreviewDialog } from './DataPreviewDialog'
import { EditMetadataDialog } from './EditMetadataDialog'

interface DataSelectionContentProps {
  selectedDataIds: number[]
  onSelectionChange: (ids: number[]) => void
  importCompleted: boolean
  onImportCompletedReset: () => void
}

export function DataSelectionContent({ 
  selectedDataIds, 
  onSelectionChange,
  importCompleted,
  onImportCompletedReset
}: DataSelectionContentProps) {
  const [metadata, setMetadata] = useState<Metadata[]>([])
  const [filteredMetadata, setFilteredMetadata] = useState<Metadata[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [loading, setLoading] = useState(true)
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [previewMetadata, setPreviewMetadata] = useState<Metadata | null>(null)
  const [editMetadata, setEditMetadata] = useState<Metadata | null>(null)
  const [deleteMetadata, setDeleteMetadata] = useState<Metadata | null>(null)

  // Load metadata from IndexedDB
  useEffect(() => {
    const loadMetadata = async () => {
      try {
        setLoading(true)
        const data = await db.metadata.toArray()
        // Sort by importedAt date, oldest first (so newest appears at bottom)
        const sortedData = data.sort((a, b) => {
          const dateA = a.importedAt ? new Date(a.importedAt).getTime() : 0
          const dateB = b.importedAt ? new Date(b.importedAt).getTime() : 0
          return dateA - dateB
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
  }, [importCompleted])

  const handleDelete = async () => {
    if (!deleteMetadata) return

    try {
      // Delete time series data
      await db.timeSeries.where('metadataId').equals(deleteMetadata.id!).delete()
      // Delete metadata
      await db.metadata.delete(deleteMetadata.id!)
      
      // Reload data
      const data = await db.metadata.toArray()
      const sortedData = data.sort((a, b) => {
        const dateA = a.importedAt ? new Date(a.importedAt).getTime() : 0
        const dateB = b.importedAt ? new Date(b.importedAt).getTime() : 0
        return dateA - dateB
      })
      setMetadata(sortedData)
      setFilteredMetadata(sortedData)
      
      // Remove from selection if selected
      if (selectedDataIds.includes(deleteMetadata.id!)) {
        onSelectionChange(selectedDataIds.filter(id => id !== deleteMetadata.id!))
      }
      
      setDeleteMetadata(null)
    } catch (error) {
      console.error('Failed to delete data:', error)
    }
  }

  // Scroll to bottom when import is completed
  useEffect(() => {
    if (importCompleted && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight
    }
  }, [importCompleted, filteredMetadata])

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
      onSelectionChange([...selectedDataIds, id])
    } else {
      onSelectionChange(selectedDataIds.filter(dataId => dataId !== id))
    }
  }

  const handleSelectAll = () => {
    const allIds = filteredMetadata.map(item => item.id!).filter(id => id !== undefined)
    onSelectionChange(allIds)
  }

  const handleDeselectAll = () => {
    onSelectionChange([])
  }

  const formatDate = (date?: Date) => {
    if (!date) return 'N/A'
    return new Date(date).toLocaleString('ja-JP')
  }

  return (
    <div className="h-full flex flex-col gap-4">
      {importCompleted && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            CSV import completed successfully! New data is now available for selection below.
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
            disabled={loading}
          >
            Select All
          </Button>
          <Button 
            onClick={handleDeselectAll} 
            variant="outline" 
            size="sm"
            disabled={loading || selectedDataIds.length === 0}
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
                className={`flex items-start space-x-3 p-3 rounded-lg border hover:bg-gray-50 cursor-pointer ${
                  importCompleted && item.importedAt && 
                  new Date(item.importedAt).getTime() > Date.now() - 5000
                    ? 'border-green-300 bg-green-50' 
                    : ''
                }`}
                onClick={() => {
                  handleSelectionChange(item.id!, !selectedDataIds.includes(item.id!))
                  if (importCompleted) {
                    onImportCompletedReset()
                  }
                }}
              >
                <Checkbox
                  id={`data-${item.id}`}
                  checked={selectedDataIds.includes(item.id!)}
                  onCheckedChange={(checked) => {
                    handleSelectionChange(item.id!, checked as boolean)
                    if (importCompleted) {
                      onImportCompletedReset()
                    }
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-1"
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
                      {formatDate(item.startTime)} ~ {formatDate(item.endTime)}
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
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8"
                    onClick={() => setEditMetadata(item)}
                    title="Edit metadata"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                    onClick={() => setDeleteMetadata(item)}
                    title="Delete data"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
      
      <DataPreviewDialog
        open={!!previewMetadata}
        onOpenChange={(open) => !open && setPreviewMetadata(null)}
        metadata={previewMetadata}
      />
      
      <EditMetadataDialog
        open={!!editMetadata}
        onOpenChange={(open) => !open && setEditMetadata(null)}
        metadata={editMetadata}
        onUpdate={async () => {
          // Reload data after update
          const data = await db.metadata.toArray()
          const sortedData = data.sort((a, b) => {
            const dateA = a.importedAt ? new Date(a.importedAt).getTime() : 0
            const dateB = b.importedAt ? new Date(b.importedAt).getTime() : 0
            return dateA - dateB
          })
          setMetadata(sortedData)
          setFilteredMetadata(sortedData)
        }}
      />
      
      <AlertDialog open={!!deleteMetadata} onOpenChange={(open) => !open && setDeleteMetadata(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Data</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this data? This will permanently delete all associated time series data.
              {deleteMetadata && (
                <div className="mt-4 p-3 bg-gray-50 rounded-md">
                  <span className="block font-medium">{deleteMetadata.plant} - {deleteMetadata.machineNo}</span>
                  {deleteMetadata.label && <span className="block text-sm text-gray-600">Label: {deleteMetadata.label}</span>}
                  {deleteMetadata.event && <span className="block text-sm text-gray-600">Event: {deleteMetadata.event}</span>}
                </div>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-red-600 hover:bg-red-700 focus:ring-red-600"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}