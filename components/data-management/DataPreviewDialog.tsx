'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ScrollArea } from '@/components/ui/scroll-area'
import { db } from '@/lib/db'
import { Metadata, TimeSeriesData, ParameterInfo } from '@/lib/db/schema'
import { Loader2 } from 'lucide-react'

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Data Preview</DialogTitle>
          <DialogDescription>
            {metadata.plant} - {metadata.machineNo}
            {metadata.label && ` - ${metadata.label}`}
            {metadata.event && ` (${metadata.event})`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
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
            <ScrollArea className="h-full">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead rowSpan={3} className="w-[50px]">#</TableHead>
                    {columns.map(col => (
                      <TableHead key={col} className="text-center">
                        <div className="text-xs font-normal">{col}</div>
                      </TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {columns.map(col => (
                      <TableHead key={col} className="text-center">
                        <div className="text-xs font-normal">
                          {parameters[col]?.parameterName || '-'}
                        </div>
                      </TableHead>
                    ))}
                  </TableRow>
                  <TableRow>
                    {columns.map(col => (
                      <TableHead key={col} className="text-center">
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
                      <TableCell className="font-medium">{index + 1}</TableCell>
                      {columns.map(col => (
                        <TableCell key={col}>
                          {row.data[col] !== undefined ? String(row.data[col]) : '-'}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          )}
        </div>

        <div className="text-sm text-gray-500 pt-4 border-t">
          Showing first {data.length} rows of data
        </div>
      </DialogContent>
    </Dialog>
  )
}