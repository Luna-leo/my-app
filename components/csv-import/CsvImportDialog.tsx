'use client';

import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ChevronLeft, ChevronRight, Upload, Loader2 } from 'lucide-react';
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
  const [detectedDataRange, setDetectedDataRange] = useState<{ startTime: Date; endTime: Date } | null>(null);
  const [detectingRange, setDetectingRange] = useState(false);

  const handleFilesSelected = (files: File[]) => {
    setSelectedFiles(files);
    if (files.length > 0) {
      setStep('metadata');
    }
  };

  const detectDataRange = React.useCallback(async () => {
    console.log('detectDataRange called');
    console.log('selectedFiles:', selectedFiles.length);
    console.log('metadata.dataSource:', metadata.dataSource);
    
    if (selectedFiles.length === 0) return;
    
    setDetectingRange(true);
    setDetectedDataRange(null);
    setImportError(''); // Clear previous errors
    
    try {
      const dataSource: DataSource = {
        type: metadata.dataSource,
        encoding: metadata.dataSource === 'CASS' ? 'shift-jis' : 'utf-8'
      };
      
      console.log('Creating importer with dataSource:', dataSource);
      
      const importer = new CsvImporter();
      const range = await importer.detectDataRange(selectedFiles, dataSource);
      
      console.log('Detected range:', range);
      
      if (range) {
        setDetectedDataRange(range);
        // Set default data import period to detected range
        const formatDateTime = (date: Date) => {
          const pad = (n: number) => n.toString().padStart(2, '0');
          return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
        };
        
        setMetadata(prev => ({
          ...prev,
          dataStartTime: formatDateTime(range.startTime),
          dataEndTime: formatDateTime(range.endTime)
        }));
      } else {
        setImportError('データ期間を検出できませんでした。手動で期間を入力してください。');
      }
    } catch (error) {
      console.error('Failed to detect data range:', error);
      setImportError('データ期間の検出中にエラーが発生しました。エンコーディングの設定を確認してください。');
    } finally {
      setDetectingRange(false);
    }
  }, [selectedFiles, metadata.dataSource]);

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
          dataStartTime: metadata.dataStartTime ? new Date(metadata.dataStartTime) : undefined,
          dataEndTime: metadata.dataEndTime ? new Date(metadata.dataEndTime) : undefined,
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
    setDetectedDataRange(null);
    setDetectingRange(false);
    
    onOpenChange(false);
  };
  
  // Auto-detect data range on initial file selection
  React.useEffect(() => {
    if (selectedFiles.length > 0 && step === 'metadata' && !detectedDataRange && !detectingRange) {
      detectDataRange();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFiles, step]);


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Import CSV Data - DEBUG VERSION</DialogTitle>
          <DialogDescription>
            Import time series data from CSV files into the graph visualization system.
            <span className="text-red-500 font-bold"> [DEBUG MODE ACTIVE]</span>
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
              <div className="mb-4 p-4 bg-red-100 border-2 border-red-500 rounded">
                <p className="text-red-700 font-bold">デバッグ情報:</p>
                <p>step: {step}</p>
                <p>selectedFiles.length: {selectedFiles.length}</p>
                <p>selectedFiles[0]?.name: {selectedFiles[0]?.name || 'なし'}</p>
              </div>
              
              <div className="mb-4 p-4 bg-yellow-100 border-2 border-yellow-500 rounded">
                <button
                  type="button"
                  className="px-4 py-2 bg-green-500 text-white rounded"
                  onClick={() => {
                    alert('緑のボタンがクリックされました！');
                  }}
                >
                  緊急テストボタン（常に表示）
                </button>
              </div>
              
              {selectedFiles.length > 0 && (
                <>
                  <Alert className="mb-4">
                    <Upload className="h-4 w-4" />
                    <AlertDescription>
                      {selectedFiles.length} CSV file{selectedFiles.length > 1 ? 's' : ''} selected
                    </AlertDescription>
                  </Alert>
                  <div className="mb-4 flex flex-col items-center gap-2">
                    <button
                      type="button"
                      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
                      onClick={() => {
                        alert('純粋なHTMLボタンがクリックされました！');
                        console.log('Pure HTML button clicked!');
                      }}
                    >
                      テスト: 純粋なHTMLボタン
                    </button>
                    <Button
                      type="button"
                      variant="default"
                      onClick={() => {
                        alert('ボタンがクリックされました！');
                        console.log('Button clicked!');
                        console.log('detectDataRange type:', typeof detectDataRange);
                        console.log('detectDataRange:', detectDataRange);
                        try {
                          detectDataRange();
                        } catch (error) {
                          console.error('Error calling detectDataRange:', error);
                        }
                      }}
                      disabled={detectingRange}
                    >
                      {detectingRange ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          期間を検出中...
                        </>
                      ) : (
                        'データ期間を自動検出'
                      )}
                    </Button>
                    <div className="text-xs text-gray-500">
                      detectingRange: {String(detectingRange)}, 
                      type of detectDataRange: {typeof detectDataRange}
                    </div>
                  </div>
                </>
              )}
              {detectingRange && (
                <Alert className="mb-4">
                  <AlertDescription>
                    CSVファイルからデータ期間を検出中...
                  </AlertDescription>
                </Alert>
              )}
              {detectedDataRange && !detectingRange && (
                <Alert className="mb-4">
                  <AlertDescription>
                    <div>
                      <strong>検出されたデータ期間：</strong>
                    </div>
                    <div className="text-sm mt-1">
                      開始: {detectedDataRange.startTime.toLocaleString('ja-JP')}
                    </div>
                    <div className="text-sm">
                      終了: {detectedDataRange.endTime.toLocaleString('ja-JP')}
                    </div>
                  </AlertDescription>
                </Alert>
              )}
              {importError && step === 'metadata' && (
                <Alert className="mb-4" variant="destructive">
                  <AlertDescription>{importError}</AlertDescription>
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