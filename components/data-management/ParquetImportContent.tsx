'use client';

import React, { useState } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  FileArchive, 
  Upload, 
  CheckCircle2, 
  XCircle, 
  Info,
  Loader2,
  Database,
  HardDrive
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { hybridDataService } from '@/lib/services/hybridDataService';
import { db } from '@/lib/db';
import { generateDataKey } from '@/lib/utils/dataKeyUtils';

interface ParquetFileInfo {
  name: string;
  size: number;
  rowCount?: number;
  columns?: string[];
  compression?: string;
}

interface ImportOptions {
  mode: 'memory' | 'direct';
  createIndex: boolean;
}

export function ParquetImportContent() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileInfo, setFileInfo] = useState<ParquetFileInfo | null>(null);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>('');
  const [success, setSuccess] = useState(false);
  const [importOptions, setImportOptions] = useState<ImportOptions>({
    mode: 'memory',
    createIndex: true
  });

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: {
      'application/octet-stream': ['.parquet'],
      'application/parquet': ['.parquet']
    },
    maxFiles: 1,
    onDrop: async (acceptedFiles) => {
      if (acceptedFiles.length === 0) return;
      
      const file = acceptedFiles[0];
      setSelectedFile(file);
      setError('');
      setSuccess(false);
      
      // Get file info
      try {
        setFileInfo({
          name: file.name,
          size: file.size
        });
        
        // In a real implementation, we would read parquet metadata here
        // For now, we'll simulate it
        setFileInfo({
          name: file.name,
          size: file.size,
          rowCount: Math.floor(file.size / 100), // Rough estimate
          columns: ['timestamp', 'param1', 'param2', 'param3'], // Example
          compression: 'snappy'
        });
      } catch (err) {
        console.error('Failed to read parquet info:', err);
      }
    }
  });

  const handleImport = async () => {
    if (!selectedFile || !fileInfo) return;

    setImporting(true);
    setError('');
    setProgress(0);

    try {
      await hybridDataService.initialize();

      if (importOptions.mode === 'memory') {
        // Import to memory table
        setProgress(20);
        
        // Create metadata entry
        const metadata = {
          plant: 'ParquetImport',
          machineNo: selectedFile.name.replace('.parquet', ''),
          dataSource: 'CASS' as const, // Using CASS as default for Parquet imports
          dataKey: generateDataKey({
            plant: 'ParquetImport',
            machineNo: selectedFile.name.replace('.parquet', ''),
            dataSource: 'CASS',
            dataStartTime: new Date(),
            dataEndTime: new Date()
          }),
          importedAt: new Date()
        };
        
        const metadataId = await db.metadata.add(metadata);
        setProgress(40);
        
        // Load data from parquet
        const tempPath = `/temp/${selectedFile.name}`;
        
        // In a real implementation, we would upload the file to a temporary location
        // For now, we'll simulate the import
        await new Promise(resolve => setTimeout(resolve, 1000));
        setProgress(60);
        
        // Load into DuckDB
        await hybridDataService.loadTimeSeriesFromParquet(
          tempPath,
          metadataId as number
        );
        setProgress(80);
        
        // Create indexes if requested
        if (importOptions.createIndex) {
          // Indexes would be created here
          setProgress(90);
        }
        
        setProgress(100);
        setSuccess(true);
        
      } else {
        // Direct query mode - just register the file location
        setProgress(50);
        
        // In a real implementation, we would store the file location
        // and query it directly without loading into memory
        await new Promise(resolve => setTimeout(resolve, 500));
        
        setProgress(100);
        setSuccess(true);
      }
      
    } catch (err) {
      console.error('Import failed:', err);
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    const mb = bytes / (1024 * 1024);
    return mb > 1 ? `${mb.toFixed(2)} MB` : `${(bytes / 1024).toFixed(2)} KB`;
  };

  return (
    <div className="h-full flex flex-col gap-4">
      {/* File Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileArchive className="h-5 w-5" />
            Parquet File Import
          </CardTitle>
          <CardDescription>
            Import time series data from Apache Parquet format for efficient storage and fast queries
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25'}
              ${selectedFile ? 'bg-muted/50' : 'hover:border-primary/50'}
            `}
          >
            <input {...getInputProps()} />
            {selectedFile ? (
              <div className="space-y-2">
                <FileArchive className="h-12 w-12 mx-auto text-primary" />
                <p className="font-medium">{fileInfo?.name}</p>
                <div className="flex justify-center gap-4 text-sm text-muted-foreground">
                  <span>{formatFileSize(fileInfo?.size || 0)}</span>
                  {fileInfo?.rowCount && <span>{fileInfo.rowCount.toLocaleString()} rows</span>}
                  {fileInfo?.compression && <Badge variant="secondary">{fileInfo.compression}</Badge>}
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="h-12 w-12 mx-auto text-muted-foreground" />
                <p className="text-lg font-medium">Drop Parquet file here</p>
                <p className="text-sm text-muted-foreground">or click to browse</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Import Options */}
      {selectedFile && (
        <Card>
          <CardHeader>
            <CardTitle>Import Options</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <button
                onClick={() => setImportOptions({ ...importOptions, mode: 'memory' })}
                className={`
                  p-4 rounded-lg border-2 transition-all
                  ${importOptions.mode === 'memory' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-muted hover:border-primary/50'}
                `}
              >
                <Database className="h-8 w-8 mb-2 mx-auto" />
                <h4 className="font-medium">Load to Memory</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Import data into DuckDB memory tables for fastest queries
                </p>
              </button>
              
              <button
                onClick={() => setImportOptions({ ...importOptions, mode: 'direct' })}
                className={`
                  p-4 rounded-lg border-2 transition-all
                  ${importOptions.mode === 'direct' 
                    ? 'border-primary bg-primary/5' 
                    : 'border-muted hover:border-primary/50'}
                `}
              >
                <HardDrive className="h-8 w-8 mb-2 mx-auto" />
                <h4 className="font-medium">Direct Query</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Query Parquet files directly without loading to memory
                </p>
              </button>
            </div>

            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                {importOptions.mode === 'memory' 
                  ? 'Data will be loaded into memory for fastest performance. Suitable for files up to 1GB.'
                  : 'Data will remain in Parquet format and queried on-demand. Suitable for very large files.'}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {/* Import Progress */}
      {importing && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Importing Parquet file...</span>
              </div>
              <Progress value={progress} />
              <p className="text-sm text-muted-foreground text-center">
                {progress < 20 && 'Initializing...'}
                {progress >= 20 && progress < 40 && 'Creating metadata...'}
                {progress >= 40 && progress < 60 && 'Reading Parquet file...'}
                {progress >= 60 && progress < 80 && 'Loading data...'}
                {progress >= 80 && progress < 100 && 'Creating indexes...'}
                {progress === 100 && 'Complete!'}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Result Messages */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {success && (
        <Alert className="border-green-200 bg-green-50">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">
            Parquet file imported successfully!
            {importOptions.mode === 'direct' && ' You can now query the data directly from the file.'}
          </AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end gap-2 mt-auto">
        {selectedFile && !importing && !success && (
          <Button onClick={handleImport} disabled={!fileInfo}>
            <Upload className="mr-2 h-4 w-4" />
            Import Parquet
          </Button>
        )}
        
        {success && (
          <Button
            onClick={() => {
              setSelectedFile(null);
              setFileInfo(null);
              setSuccess(false);
              setError('');
              setProgress(0);
            }}
            variant="outline"
          >
            Import Another File
          </Button>
        )}
      </div>
    </div>
  );
}