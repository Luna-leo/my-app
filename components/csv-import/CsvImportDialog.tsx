'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Upload, AlertCircle } from 'lucide-react';
import { FileDropzone } from './FileDropzone';
import { MetadataForm, MetadataFormData } from './MetadataForm';
import { ImportProgress } from './ImportProgress';
import { CsvImporter, ImportProgress as ImportProgressType } from '@/lib/db/csv-import';
import { DataSource } from '@/lib/db/schema';

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImportComplete?: () => void;
}

type ImportStep = 'files' | 'metadata' | 'importing' | 'complete';

export function CsvImportDialog({ open, onOpenChange, onImportComplete }: CsvImportDialogProps) {
  const [step, setStep] = useState<ImportStep>('files');
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [metadata, setMetadata] = useState<MetadataFormData>({
    plant: '',
    machineNo: '',
    dataSource: 'CASS'
  });
  const [metadataErrors, setMetadataErrors] = useState<Partial<Record<keyof MetadataFormData, string>>>({});
  const [importProgress, setImportProgress] = useState<ImportProgressType | null>(null);
  const [importError, setImportError] = useState<string>('');
  const [importSuccess, setImportSuccess] = useState(false);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    if (files.length > 0) {
      setStep('metadata');
    }
  };

  const validateMetadata = (): boolean => {
    const errors: Partial<Record<keyof MetadataFormData, string>> = {};

    if (!metadata.plant.trim()) {
      errors.plant = 'Plant is required';
    }
    if (!metadata.machineNo.trim()) {
      errors.machineNo = 'Machine No is required';
    }

    setMetadataErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleImport = async () => {
    if (!validateMetadata()) {
      return;
    }

    setStep('importing');
    setImportError('');
    setImportSuccess(false);

    const dataSource: DataSource = {
      type: metadata.dataSource,
      encoding: metadata.dataSource === 'CASS' ? 'shift-jis' : 'utf-8'
    };

    const importer = new CsvImporter((progress) => {
      setImportProgress(progress);
    });

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
      );

      setImportSuccess(true);
      setImportProgress(null);
      setStep('complete');
      if (onImportComplete) {
        onImportComplete();
      }
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed');
      setImportProgress(null);
    }
  };

  const handleClose = () => {
    // Reset state
    setStep('files');
    setSelectedFiles([]);
    setMetadata({
      plant: '',
      machineNo: '',
      dataSource: 'CASS'
    });
    setMetadataErrors({});
    setImportProgress(null);
    setImportError('');
    setImportSuccess(false);
    
    onOpenChange(false);
  };

  const canGoBack = step === 'metadata';
  const canGoNext = step === 'files' && selectedFiles.length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import CSV Data</DialogTitle>
          <DialogDescription>
            Import time series data from CSV files into the graph visualization system.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4">
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
            </>
          )}

          {(step === 'importing' || step === 'complete') && (
            <ImportProgress
              progress={importProgress}
              error={importError}
              success={importSuccess}
            />
          )}
        </div>

        <DialogFooter>
          {step === 'files' && (
            <Button onClick={handleClose} variant="outline">
              Cancel
            </Button>
          )}

          {step === 'metadata' && (
            <>
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
            </>
          )}

          {step === 'importing' && (
            <Button disabled variant="outline">
              Importing...
            </Button>
          )}

          {step === 'complete' && (
            <Button onClick={handleClose}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}