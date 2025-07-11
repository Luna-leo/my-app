'use client'

import React, { useState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react'
import { FileDropzone } from '../csv-import/FileDropzone'
import { MetadataForm, MetadataFormData } from '../csv-import/MetadataForm'
import { ImportProgress } from '../csv-import/ImportProgress'
import { CsvImporter, ImportProgress as ImportProgressType } from '@/lib/db/csv-import'
import { DataSource } from '@/lib/db/schema'

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

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files)
    if (files.length > 0) {
      setStep('metadata')
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

    const importer = new CsvImporter((progress) => {
      setImportProgress(progress)
    })

    try {
      await importer.importFiles(
        selectedFiles,
        {
          plant: metadata.plant,
          machineNo: metadata.machineNo,
          label: metadata.label,
          event: metadata.event,
          startTime: metadata.startTime ? new Date(metadata.startTime) : undefined,
          endTime: metadata.endTime ? new Date(metadata.endTime) : undefined,
          dataSource: metadata.dataSource
        },
        dataSource
      )

      setImportProgress(null)
      setStep('complete')
      if (onImportComplete) {
        onImportComplete()
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed')
      setImportProgress(null)
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
  }

  return (
    <div className="h-full flex flex-col">
      {step === 'files' && (
        <FileDropzone
          onFilesSelected={handleFilesSelected}
          disabled={false}
        />
      )}

      {step === 'metadata' && (
        <>
          {selectedFiles.length > 0 && (
            <Alert className="mb-4">
              <Upload className="h-4 w-4" />
              <AlertDescription>
                {selectedFiles.length} CSV file{selectedFiles.length > 1 ? 's' : ''} selected
              </AlertDescription>
            </Alert>
          )}
          <MetadataForm
            value={metadata}
            onChange={setMetadata}
            errors={metadataErrors}
          />
          <div className="flex justify-between mt-6">
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
        </>
      )}

      {step === 'importing' && (
        <div className="flex-1 flex flex-col justify-center">
          <ImportProgress progress={importProgress} error={importError} />
          {importError && (
            <div className="mt-6 text-center">
              <Button onClick={handleReset} variant="outline">
                Try Again
              </Button>
            </div>
          )}
        </div>
      )}

      {step === 'complete' && (
        <div className="flex-1 flex flex-col justify-center items-center">
          <div className="text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <Upload className="h-6 w-6 text-green-600" />
            </div>
            <h3 className="mt-4 text-lg font-medium">Import Complete!</h3>
            <p className="mt-2 text-sm text-gray-500">
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