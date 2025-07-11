'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { db } from '@/lib/db'
import { Metadata, TimeSeriesData, ParameterInfo } from '@/lib/db/schema'
import { Loader2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface DataPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  metadata: Metadata | null
}

export function DataPreviewDialog({ open, onOpenChange, metadata }: DataPreviewDialogProps) {
  const [data, setData] = useState<TimeSeriesData[]>([])
  const [parameters, setParameters] = useState<Record<string, ParameterInfo>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !metadata) return

    const loadData = async () => {
      try {
        setLoading(true)
        setError(null)
        
        // Load first 100 rows of data for preview
        const timeSeriesData = await db.timeSeries
          .where('metadataId')
          .equals(metadata.id!)
          .limit(100)
          .toArray()
        
        setData(timeSeriesData)
        
        // Load parameter information
        if (timeSeriesData.length > 0) {
          const parameterIds = Object.keys(timeSeriesData[0].data)
          const parameterInfos = await db.parameters
            .where('plant')
            .equals(metadata.plant)
            .and(p => p.machineNo === metadata.machineNo)
            .toArray()
          
          const paramMap: Record<string, ParameterInfo> = {}
          parameterInfos.forEach(p => {
            if (parameterIds.includes(p.parameterId)) {
              paramMap[p.parameterId] = p
            }
          })
          setParameters(paramMap)
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [open, metadata])

  if (!metadata) return null

  // Extract columns from the actual data
  const columns = data.length > 0 ? Object.keys(data[0].data) : []

  const handleExportCsv = () => {
    if (!metadata || data.length === 0) return

    // Create CSV content with 3-row header
    const csvRows: string[] = []
    
    // Header row 1: Parameter IDs
    csvRows.push(['#', ...columns].join(','))
    
    // Header row 2: Parameter names
    const paramNames = columns.map(col => parameters[col]?.parameterName || '-')
    csvRows.push(['', ...paramNames].join(','))
    
    // Header row 3: Units
    const units = columns.map(col => parameters[col]?.unit || '-')
    csvRows.push(['', ...units].join(','))
    
    // Data rows
    data.forEach((row, index) => {
      const values = columns.map(col => {
        const value = row.data[col]
        return value !== undefined && value !== null ? String(value) : ''
      })
      csvRows.push([index + 1, ...values].join(','))
    })
    
    // Create blob and download
    const csvContent = csvRows.join('\n')
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    
    // Generate filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
    const filename = `${metadata.plant}_${metadata.machineNo}_${timestamp}.csv`
    
    // Trigger download
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Data Preview</DialogTitle>
          <DialogDescription>
            {metadata.plant} - {metadata.machineNo}
            {metadata.label && ` - ${metadata.label}`}
            {metadata.event && ` (${metadata.event})`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center text-red-600 py-8">
              Error: {error}
            </div>
          ) : data.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No data available
            </div>
          ) : (
            <div className="h-full overflow-auto relative">
              <Table className="min-w-max">
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={3} className="sticky left-0 z-10 bg-white w-[50px]">#</TableHead>
                    {columns.map(col => (
                      <TableHead key={col} className="text-center min-w-[100px]">
                        <div className="text-xs font-normal">{col}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {columns.map(col => (
                      <TableHead key={col} className="text-center min-w-[100px]">
                        <div className="text-xs font-normal">
                          {parameters[col]?.parameterName || '-'}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {columns.map(col => (
                      <TableHead key={col} className="text-center min-w-[100px]">
                        <div className="text-xs font-normal">
                          {parameters[col]?.unit || '-'}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.map((row, index) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium sticky left-0 z-10 bg-white">{index + 1}</TableCell>
                      {columns.map(col => (
                        <TableCell key={col} className="text-right min-w-[100px]">
                          {row.data[col] !== undefined ? String(row.data[col]) : '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <span className="text-sm text-gray-500">
            Showing first {data.length} rows of data
          </span>
          <Button
            onClick={handleExportCsv}
            variant="outline"
            size="sm"
            disabled={data.length === 0}
          >
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}