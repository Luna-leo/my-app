'use client';

import React, { useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, File, Folder } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  disabled?: boolean;
  className?: string;
}

export function FileDropzone({ onFilesSelected, disabled, className }: FileDropzoneProps) {
  const onDrop = useCallback((acceptedFiles: File[]) => {
    const csvFiles = acceptedFiles.filter(file => 
      file.name.toLowerCase().endsWith('.csv')
    );
    
    if (csvFiles.length > 0) {
      onFilesSelected(csvFiles);
    } else {
      alert('Please select CSV files only');
    }
  }, [onFilesSelected]);

  const { getRootProps, getInputProps, isDragActive, acceptedFiles } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv']
    },
    multiple: true,
    disabled
  });

  const handleFolderSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const csvFiles = files.filter(file => 
      file.name.toLowerCase().endsWith('.csv')
    );
    
    if (csvFiles.length > 0) {
      onFilesSelected(csvFiles);
    }
  };

  return (
    <div className={cn("space-y-4", className)}>
      <div
        {...getRootProps()}
        className={cn(
          "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
          isDragActive ? "border-primary bg-primary/5" : "border-border hover:border-primary/50",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      >
        <input {...getInputProps()} />
        <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
        {isDragActive ? (
          <p className="text-lg font-medium">Drop the CSV files here...</p>
        ) : (
          <>
            <p className="text-lg font-medium">Drag & drop CSV files here</p>
            <p className="text-sm text-muted-foreground mt-2">or click to select files</p>
          </>
        )}
      </div>

      <div className="flex items-center justify-center">
        <label className="cursor-pointer">
          <input
            type="file"
            onChange={handleFolderSelect}
            {...({webkitdirectory: "", directory: ""} as any)}
            multiple
            accept=".csv"
            className="hidden"
            disabled={disabled}
          />
          <div className={cn(
            "flex items-center gap-2 px-4 py-2 border rounded-md hover:bg-accent transition-colors",
            disabled && "opacity-50 cursor-not-allowed"
          )}>
            <Folder className="h-4 w-4" />
            <span className="text-sm">Select Folder</span>
          </div>
        </label>
      </div>

      {acceptedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-sm font-medium">Selected files:</p>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {acceptedFiles.map((file, index) => (
              <div key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                <File className="h-4 w-4" />
                <span>{file.name}</span>
                <span className="text-xs">({(file.size / 1024).toFixed(1)} KB)</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}