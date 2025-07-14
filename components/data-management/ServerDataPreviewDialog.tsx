'use client'

import { useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

interface ServerDataPreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  uploadId: string | null
  dataInfo: {
    plant: string
    machineNo: string
    label?: string
  } | null
}

interface ServerDataResponse {
  metadata: Record<string, unknown>
  parameters: Array<{
    parameterId: string
    parameterName: string
    unit?: string
  }>
  timeSeriesData: Array<{
    timestamp: string | Date
    data?: Record<string, unknown>
    [key: string]: unknown
  }>
}

export function ServerDataPreviewDialog({ 
  open, 
  onOpenChange, 
  uploadId,
  dataInfo 
}: ServerDataPreviewDialogProps) {
  const [data, setData] = useState<ServerDataResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    const loadData = async () => {
      if (!uploadId) return

      try {
        setLoading(true)
        setError(null)

        const response = await fetch(`/api/data/${uploadId}/download`, {
          headers: {
            'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'demo-api-key-12345'
          }
        })

        if (!response.ok) {
          throw new Error('Failed to fetch data from server')
        }

        const serverData = await response.json()
        setData(serverData)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    if (open && uploadId) {
      loadData()
    }
  }, [open, uploadId])

  // Extract columns from the actual data
  const columns = data && data.timeSeriesData.length > 0 
    ? Object.keys(data.timeSeriesData[0].data || data.timeSeriesData[0]).filter(key => key !== 'timestamp' && key !== 'id')
    : []

  const handleExportCSV = async (exportAll: boolean = false) => {
    if (!data || !dataInfo) return

    try {
      setExportLoading(true)
      
      const exportData = exportAll ? data.timeSeriesData : data.timeSeriesData.slice(0, 100)
      
      // Create CSV content with 3-row header
      const csvRows: string[] = []
      
      // Header row 1: Parameter IDs
      csvRows.push(['Timestamp', ...columns].join(','))
      
      // Header row 2: Parameter names
      const paramNames = columns.map(col => {
        const param = data.parameters.find(p => p.parameterId === col)
        return param?.parameterName || '-'
      })
      csvRows.push(['', ...paramNames].join(','))
      
      // Header row 3: Units
      const units = columns.map(col => {
        const param = data.parameters.find(p => p.parameterId === col)
        return param?.unit || '-'
      })
      csvRows.push(['', ...units].join(','))
      
      // Data rows
      exportData.forEach((row) => {
        const timestamp = new Date(row.timestamp as string).toLocaleString('ja-JP')
        const values = columns.map(col => {
          const value = row.data?.[col] ?? row[col]
          return value !== undefined && value !== null ? String(value) : ''
        })
        csvRows.push([timestamp, ...values].join(','))
      })
      
      // Create blob and download with BOM for proper encoding
      const csvContent = csvRows.join('\n')
      const BOM = '\uFEFF'
      const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = URL.createObjectURL(blob)
      
      // Generate filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5)
      const filename = `${dataInfo.plant}_${dataInfo.machineNo}_${timestamp}.csv`
      
      // Trigger download
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Export error:', err)
    } finally {
      setExportLoading(false)
    }
  }

  const displayData = data ? data.timeSeriesData.slice(0, 100) : []

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Data Preview (Server)</DialogTitle>
          <DialogDescription>
            {dataInfo && (
              <>
                {dataInfo.plant} - {dataInfo.machineNo}
                {dataInfo.label && ` - ${dataInfo.label}`}
              </>
            )}
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
          ) : !data || displayData.length === 0 ? (
            <div className="text-center text-gray-500 py-8">
              No data available
            </div>
          ) : (
            <div className="h-full overflow-auto relative">
              <table className="min-w-max relative">
                <thead className="sticky top-0 z-20 before:content-[''] before:absolute before:-top-4 before:left-0 before:right-0 before:h-4 before:bg-white after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gray-200">
                  <tr className="bg-white">
                    <th rowSpan={3} className="sticky left-0 z-30 bg-white min-w-[180px] px-2 py-1 text-left font-medium">Timestamp</th>
                    {columns.map(col => (
                      <th key={col} className="bg-white text-right min-w-[100px] px-2 py-1">
                        <div className="text-xs font-normal">{col}</div>
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-white">
                    {columns.map(col => {
                      const param = data.parameters.find(p => p.parameterId === col)
                      return (
                        <th key={col} className="bg-white text-right min-w-[100px] px-2 py-1">
                          <div className="text-xs font-normal">
                            {param?.parameterName || '-'}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                  <tr className="bg-white">
                    {columns.map(col => {
                      const param = data.parameters.find(p => p.parameterId === col)
                      return (
                        <th key={col} className="bg-white text-right min-w-[100px] px-2 py-1">
                          <div className="text-xs font-normal">
                            {param?.unit || '-'}
                          </div>
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {displayData.map((row, index) => (
                    <tr key={index} className="border-b hover:bg-gray-50">
                      <td className="font-medium sticky left-0 z-10 bg-white text-left min-w-[180px] px-2 py-2">
                        {new Date(row.timestamp as string).toLocaleString('ja-JP')}
                      </td>
                      {columns.map(col => (
                        <td key={col} className="text-right min-w-[100px] px-2 py-2">
                          {(row.data?.[col] ?? row[col]) !== undefined ? String(row.data?.[col] ?? row[col]) : '-'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <span className="text-sm text-gray-500">
            {data && `Showing first ${displayData.length} rows of ${data.timeSeriesData.length.toLocaleString()} rows`}
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={!data || displayData.length === 0 || exportLoading}
              >
                {exportLoading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Export CSV
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={() => handleExportCSV(false)}>
                Export displayed data ({displayData.length} rows)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportCSV(true)}>
                Export all data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DialogContent>
    </Dialog>
  )
}