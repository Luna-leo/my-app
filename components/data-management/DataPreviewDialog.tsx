'use client'

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { db } from '@/lib/db'
import { Metadata, TimeSeriesData, ParameterInfo } from '@/lib/db/schema'
import { Loader2, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { hybridDataService } from '@/lib/services/hybridDataService'

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
  const [exportLoading, setExportLoading] = useState(false)

  useEffect(() => {
    if (!open || !metadata) return

    // Set loading state immediately for better UX
    setLoading(true)
    setError(null)
    
    // Clear previous data when switching between different metadata
    setData([])
    setParameters({})
    
    // Delay loading to avoid unnecessary DB access for quick open/close
    const loadTimer = setTimeout(async () => {
      try {
        console.log('[DataPreviewDialog] Loading data for metadata:', metadata.id);
        
        // Initialize HybridDataService
        await hybridDataService.initialize();
        const connection = await hybridDataService.getConnection();
        
        let timeSeriesData: TimeSeriesData[] = [];
        
        // Try to load from DuckDB first
        if (connection) {
          const tableName = `timeseries_${metadata.id}`;
          
          try {
            // Check if table exists in DuckDB
            const tableExists = await connection.query(`
              SELECT COUNT(*) as count 
              FROM information_schema.tables 
              WHERE table_name = '${tableName}'
            `);
            
            const exists = tableExists.toArray()[0]?.count > 0;
            console.log(`[DataPreviewDialog] DuckDB table ${tableName} exists:`, exists);
            
            if (exists) {
              // Load data from DuckDB
              const result = await connection.query(`
                SELECT * FROM ${tableName}
                ORDER BY timestamp
                LIMIT 100
              `);
              
              const duckdbData = result.toArray();
              console.log(`[DataPreviewDialog] Loaded ${duckdbData.length} rows from DuckDB`);
              
              // Convert DuckDB data to TimeSeriesData format
              timeSeriesData = duckdbData.map((row: Record<string, unknown>) => {
                const { metadata_id, timestamp, ...dataColumns } = row;
                return {
                  metadataId: metadata_id as number,
                  timestamp: new Date(timestamp as string),
                  data: dataColumns as Record<string, number | null>
                };
              });
            }
          } catch (err) {
            console.warn('[DataPreviewDialog] Failed to load from DuckDB:', err);
          }
        }
        
        // Fall back to IndexedDB if no data from DuckDB
        if (timeSeriesData.length === 0) {
          console.log('[DataPreviewDialog] Falling back to IndexedDB');
          timeSeriesData = await db.timeSeries
            .where('metadataId')
            .equals(metadata.id!)
            .limit(100)
            .toArray();
          console.log(`[DataPreviewDialog] Loaded ${timeSeriesData.length} rows from IndexedDB`);
        }
        
        setData(timeSeriesData);
        
        // Load parameter information
        if (timeSeriesData.length > 0) {
          const parameterIds = Object.keys(timeSeriesData[0].data);
          const parameterInfos = await db.parameters
            .where('plant')
            .equals(metadata.plant)
            .and(p => p.machineNo === metadata.machineNo)
            .toArray();
          
          const paramMap: Record<string, ParameterInfo> = {};
          parameterInfos.forEach(p => {
            if (parameterIds.includes(p.parameterId)) {
              paramMap[p.parameterId] = p;
            }
          });
          setParameters(paramMap);
        }
      } catch (err) {
        console.error('[DataPreviewDialog] Error loading data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    }, 300); // 300ms delay

    // Cleanup function to cancel loading if dialog is closed quickly
    return () => {
      clearTimeout(loadTimer)
      setLoading(false)
    }
  }, [open, metadata])

  if (!metadata) return null

  // Extract columns from the actual data
  const columns = data.length > 0 ? Object.keys(data[0].data) : []

  const handleExportCsv = async (exportAll: boolean = false) => {
    if (!metadata) return

    setExportLoading(true)
    
    try {
      let exportData = data
      
      // Load all data if exportAll is true
      if (exportAll) {
        const connection = await hybridDataService.getConnection();
        const tableName = `timeseries_${metadata.id}`;
        
        if (connection) {
          try {
            // Check if table exists in DuckDB
            const tableExists = await connection.query(`
              SELECT COUNT(*) as count 
              FROM information_schema.tables 
              WHERE table_name = '${tableName}'
            `);
            
            const exists = tableExists.toArray()[0]?.count > 0;
            
            if (exists) {
              // Load all data from DuckDB
              const result = await connection.query(`
                SELECT * FROM ${tableName}
                ORDER BY timestamp
              `);
              
              const duckdbData = result.toArray();
              
              // Convert DuckDB data to TimeSeriesData format
              exportData = duckdbData.map((row: Record<string, unknown>) => {
                const { metadata_id, timestamp, ...dataColumns } = row;
                return {
                  metadataId: metadata_id as number,
                  timestamp: new Date(timestamp as string),
                  data: dataColumns as Record<string, number | null>
                };
              });
            } else {
              // Fall back to IndexedDB
              exportData = await db.timeSeries
                .where('metadataId')
                .equals(metadata.id!)
                .toArray();
            }
          } catch (err) {
            console.warn('[DataPreviewDialog] Failed to export from DuckDB:', err);
            // Fall back to IndexedDB
            exportData = await db.timeSeries
              .where('metadataId')
              .equals(metadata.id!)
              .toArray();
          }
        } else {
          // Fall back to IndexedDB
          exportData = await db.timeSeries
            .where('metadataId')
            .equals(metadata.id!)
            .toArray();
        }
      }
      
      if (exportData.length === 0) {
        alert('No data to export')
        return
      }

      // Create CSV content with 3-row header
      const csvRows: string[] = []
    
    // Header row 1: Parameter IDs
    csvRows.push(['Timestamp', ...columns].join(','))
    
    // Header row 2: Parameter names
    const paramNames = columns.map(col => parameters[col]?.parameterName || '-')
    csvRows.push(['', ...paramNames].join(','))
    
    // Header row 3: Units
    const units = columns.map(col => parameters[col]?.unit || '-')
    csvRows.push(['', ...units].join(','))
    
    // Data rows
    exportData.forEach((row) => {
      const timestamp = new Date(row.timestamp).toLocaleString('ja-JP')
      const values = columns.map(col => {
        const value = row.data[col]
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
    const filename = `${metadata.plant}_${metadata.machineNo}_${timestamp}.csv`
    
    // Trigger download
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
    } finally {
      setExportLoading(false)
    }
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
              <table className="min-w-max relative">
                <thead className="sticky top-0 z-20 before:content-[''] before:absolute before:-top-4 before:left-0 before:right-0 before:h-4 before:bg-white after:content-[''] after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-gray-200">
                  <tr className="bg-white">
                    <th rowSpan={3} className="sticky left-0 z-30 bg-white min-w-[180px] px-2 py-1 text-left font-medium">Timestamp</th>
                    {columns.map(col => (
                      <th key={`id-${col}`} className="bg-white text-right min-w-[100px] px-2 py-1">
                        <div className="text-xs font-normal">{col}</div>
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-white">
                    {columns.map(col => (
                      <th key={`name-${col}`} className="bg-white text-right min-w-[100px] px-2 py-1">
                        <div className="text-xs font-normal">
                          {parameters[col]?.parameterName || '-'}
                        </div>
                      </th>
                    ))}
                  </tr>
                  <tr className="bg-white">
                    {columns.map(col => (
                      <th key={`unit-${col}`} className="bg-white text-right min-w-[100px] px-2 py-1">
                        <div className="text-xs font-normal">
                          {parameters[col]?.unit || '-'}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, index) => (
                    <tr key={row.id || `row-${index}`} className="border-b hover:bg-gray-50">
                      <td className="font-medium sticky left-0 z-10 bg-white text-left min-w-[180px] px-2 py-2">
                        {new Date(row.timestamp).toLocaleString('ja-JP')}
                      </td>
                      {columns.map(col => (
                        <td key={col} className="text-right min-w-[100px] px-2 py-2">
                          {row.data[col] !== undefined ? String(row.data[col]) : '-'}
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
            Showing first {data.length} rows of data
          </span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                disabled={data.length === 0 || exportLoading}
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
              <DropdownMenuItem onClick={() => handleExportCsv(false)}>
                Export displayed data ({data.length} rows)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleExportCsv(true)}>
                Export all data
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </DialogContent>
    </Dialog>
  )
}