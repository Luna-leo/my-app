'use client'

import { useEffect, useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'
import { Search, Calendar, Factory, Cpu, CheckCircle } from 'lucide-react'

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
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}