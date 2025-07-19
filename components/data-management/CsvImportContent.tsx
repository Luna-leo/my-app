'use client'

import React, { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Upload, Zap } from 'lucide-react'
import { FileDropzone } from '../csv-import/FileDropzone'
import { MetadataForm, MetadataFormData } from '../csv-import/MetadataForm'
import { ImportProgress } from '../csv-import/ImportProgress'
import { CsvImporter, ImportProgress as ImportProgressType, ImportResult } from '@/lib/db/csv-import'
import { DataSource } from '@/lib/db/schema'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Progress } from '@/components/ui/progress'
import { hybridDataService } from '@/lib/services/hybridDataService'
import { createDuckDBCsvImporter, DuckDBImportProgress } from '@/lib/services/duckdbCsvImporter'

interface CsvImportContentProps {
  onImportComplete?: () => void
}

type ImportStep = 'files' | 'metadata' | 'importing' | 'complete'

export function CsvImportContent({ onImportComplete }: CsvImportContentProps) {
  const [step, setStep] = useState<ImportStep>('files')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [metadata, setMetadata] = useState<MetadataFormData>({
    plant: '',
    machineNo: '',
    dataSource: 'CASS'
  })
  const [metadataErrors, setMetadataErrors] = useState<Partial<Record<keyof MetadataFormData, string>>>({})
  const [importProgress, setImportProgress] = useState<ImportProgressType | null>(null)
  const [importError, setImportError] = useState<string>('')
  const [detectingRange, setDetectingRange] = useState(false)
  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [useDuckDBImport, setUseDuckDBImport] = useState(false)
  const [duckDBProgress, setDuckDBProgress] = useState<DuckDBImportProgress | null>(null)

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files)
    if (files.length > 0) {
      setStep('metadata')
    }
  }

  const detectDataRange = async () => {
    if (selectedFiles.length === 0) return
    
    setDetectingRange(true)
    setImportError('')
    
    try {
      const dataSource: DataSource = {
        type: metadata.dataSource,
        encoding: metadata.dataSource === 'CASS' ? 'shift-jis' : 'utf-8'
      }
      
      const importer = new CsvImporter()
      const range = await importer.detectDataRange(selectedFiles, dataSource)
      
      if (range) {
        const formatDateTime = (date: Date) => {
          const pad = (n: number) => n.toString().padStart(2, '0')
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
        }
        
        setMetadata(prev => ({
          ...prev,
          dataStartTime: formatDateTime(range.startTime),
          dataEndTime: formatDateTime(range.endTime)
        }))
      } else {
        setImportError('データ期間を検出できませんでした。手動で期間を入力してください。')
      }
    } catch (error) {
      console.error('Failed to detect data range:', error)
      setImportError('データ期間の検出中にエラーが発生しました。')
    } finally {
      setDetectingRange(false)
    }
  }

  const validateMetadata = (): boolean => {
    const errors: Partial<Record<keyof MetadataFormData, string>> = {}

    if (!metadata.plant.trim()) {
      errors.plant = 'Plant is required'
    }
    if (!metadata.machineNo.trim()) {
      errors.machineNo = 'Machine No is required'
    }

    setMetadataErrors(errors)
    return Object.keys(errors).length === 0
  }

  const handleImport = async () => {
    if (!validateMetadata()) {
      return
    }

    setStep('importing')
    setImportError('')

    const dataSource: DataSource = {
      type: metadata.dataSource,
      encoding: metadata.dataSource === 'CASS' ? 'shift-jis' : 'utf-8'
    }

    if (useDuckDBImport && selectedFiles.length === 1) {
      // Use DuckDB direct import for single file
      try {
        await hybridDataService.initialize()
        const connection = await hybridDataService.getConnection()
        
        if (!connection) {
          throw new Error('Failed to get DuckDB connection')
        }

        const importer = createDuckDBCsvImporter(connection)
        
        const result = await importer.importCsv(
          selectedFiles[0],
          {
            plant: metadata.plant,
            machineNo: metadata.machineNo,
            label: metadata.label,
            event: metadata.event,
            startTime: metadata.startTime ? new Date(metadata.startTime) : undefined,
            endTime: metadata.endTime ? new Date(metadata.endTime) : undefined,
            dataStartTime: metadata.dataStartTime ? new Date(metadata.dataStartTime) : undefined,
            dataEndTime: metadata.dataEndTime ? new Date(metadata.dataEndTime) : undefined,
            dataSource: metadata.dataSource
          },
          dataSource,
          (progress) => setDuckDBProgress(progress)
        )

        setDuckDBProgress(null)
        
        if (result.success) {
          setStep('complete')
          setImportResult({
            success: true,
            metadataId: result.metadataId,
            counts: {
              parameters: result.columnCount,
              timeSeriesTotal: result.rowCount,
              timeSeriesImported: result.rowCount,
              timeSeriesSkipped: 0
            },
            errors: result.errors,
            warnings: [`DuckDB高速インポート: ${result.duration.toFixed(0)}ms`]
          })
          onImportComplete?.()
        } else {
          setImportError(result.errors.join(', '))
        }
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'DuckDB import failed')
        setDuckDBProgress(null)
      }
    } else {
      // Use traditional IndexedDB import
      const importer = new CsvImporter((progress) => {
        setImportProgress(progress)
      })

      try {
        const result = await importer.importFiles(
          selectedFiles,
          {
            plant: metadata.plant,
            machineNo: metadata.machineNo,
            label: metadata.label,
            event: metadata.event,
            startTime: metadata.startTime ? new Date(metadata.startTime) : undefined,
            endTime: metadata.endTime ? new Date(metadata.endTime) : undefined,
            dataStartTime: metadata.dataStartTime ? new Date(metadata.dataStartTime) : undefined,
            dataEndTime: metadata.dataEndTime ? new Date(metadata.dataEndTime) : undefined,
            dataSource: metadata.dataSource
          },
          dataSource
        )

        setImportProgress(null)
        setImportResult(result)
        
        if (result.success) {
          setStep('complete')
          onImportComplete?.()
        } else {
          setImportError(result.errors.join(', '))
        }
      } catch (error) {
        setImportError(error instanceof Error ? error.message : 'Import failed')
        setImportProgress(null)
      }
    }
  }

  const handleReset = () => {
    setStep('files')
    setSelectedFiles([])
    setMetadata({
      plant: '',
      machineNo: '',
      dataSource: 'CASS'
    })
    setMetadataErrors({})
    setImportProgress(null)
    setImportError('')
    setDetectingRange(false)
    setImportResult(null)
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {step === 'files' && (
        <FileDropzone
          onFilesSelected={handleFilesSelected}
          disabled={false}
        />
      )}

      {step === 'metadata' && (
        <div className="flex flex-col h-full">
          <div className="flex-1 overflow-y-auto px-1">
            {selectedFiles.length > 0 && (
              <Alert className="mb-4">
                <Upload className="h-4 w-4" />
                <AlertDescription>
                  {selectedFiles.length} CSV file{selectedFiles.length > 1 ? 's' : ''} selected
                </AlertDescription>
              </Alert>
            )}
            {importError && (
              <Alert className="mb-4" variant="destructive">
                <AlertDescription>{importError}</AlertDescription>
              </Alert>
            )}
            <MetadataForm
              value={metadata}
              onChange={setMetadata}
              errors={metadataErrors}
              onDetectDataRange={detectDataRange}
              detectingRange={detectingRange}
            />
            {selectedFiles.length === 1 && (
              <div className="mt-6 flex items-center justify-between p-4 bg-muted rounded-lg">
                <div className="flex items-center space-x-2">
                  <Zap className="h-5 w-5 text-yellow-600" />
                  <Label htmlFor="duckdb-import" className="text-sm font-medium">
                    DuckDB高速インポート（実験的）
                  </Label>
                </div>
                <Switch
                  id="duckdb-import"
                  checked={useDuckDBImport}
                  onCheckedChange={setUseDuckDBImport}
                />
              </div>
            )}
          </div>
          <div className="flex justify-between p-4 border-t bg-background">
            <Button
              onClick={() => setStep('files')}
              variant="outline"
            >
              <ChevronLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
            <Button onClick={handleImport}>
              Start Import
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {step === 'importing' && (
        <div className="flex-1 flex flex-col justify-center">
          {duckDBProgress ? (
            <div className="px-8">
              <div className="text-center mb-4">
                <Zap className="h-12 w-12 text-yellow-600 mx-auto mb-2 animate-pulse" />
                <h3 className="text-lg font-semibold">DuckDB高速インポート</h3>
                <p className="text-sm text-muted-foreground mt-1">{duckDBProgress.message}</p>
              </div>
              <Progress value={(duckDBProgress.current / duckDBProgress.total) * 100} className="mb-2" />
              <p className="text-center text-sm text-muted-foreground">
                {duckDBProgress.phase}
              </p>
            </div>
          ) : (
            <ImportProgress progress={importProgress} error={importError} />
          )}
          {importError && (
            <div className="mt-6 text-center">
              <Button onClick={handleReset} variant="outline">
                Try Again
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'complete' && importResult && (
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="text-center max-w-md">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Upload className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="mt-4 text-lg font-medium">Import Complete!</h3>
            
            <div className="mt-4 text-left space-y-2 bg-gray-50 p-4 rounded-md">
              <p className="text-sm">
                <span className="font-medium">Parameters imported:</span> {importResult.counts.parameters}
              </p>
              <p className="text-sm">
                <span className="font-medium">Time series records:</span> {importResult.counts.timeSeriesImported.toLocaleString()} of {importResult.counts.timeSeriesTotal.toLocaleString()}
              </p>
              {importResult.counts.timeSeriesSkipped > 0 && (
                <p className="text-sm text-orange-600">
                  <span className="font-medium">Records filtered:</span> {importResult.counts.timeSeriesSkipped.toLocaleString()} (outside date range)
                </p>
              )}
            </div>
            
            {importResult.warnings.length > 0 && (
              <div className="mt-4 text-left">
                <p className="text-sm font-medium text-orange-600 mb-1">Warnings:</p>
                <ul className="text-sm text-orange-600 list-disc list-inside">
                  {importResult.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <p className="mt-4 text-sm text-gray-500">
              Your CSV data has been successfully imported. You can now select the imported data for visualization.
            </p>
            
            <Button onClick={handleReset} className="mt-6" variant="outline">
              Import More Data
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}