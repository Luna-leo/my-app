'use client';

import React from 'react';
import { Progress } from '@/components/ui/progress';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { ImportProgress as ImportProgressType } from '@/lib/db/csv-import';

interface ImportProgressProps {
  progress: ImportProgressType | null;
  error?: string;
  success?: boolean;
}

export function ImportProgress({ progress, error, success }: ImportProgressProps) {
  if (!progress && !error && !success) {
    return null;
  }

  const getProgressPercentage = () => {
    if (!progress || progress.total === 0) return 0;
    return (progress.current / progress.total) * 100;
  };

  const getPhaseLabel = (phase: ImportProgressType['phase']) => {
    switch (phase) {
      case 'parsing':
        return 'Parsing CSV files';
      case 'processing':
        return 'Processing data';
      case 'saving':
        return 'Saving to database';
      default:
        return 'Processing';
    }
  };

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-4 w-4" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {success && !progress && (
        <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm">Import completed successfully!</span>
        </div>
      )}

      {progress && (
        <>
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin text-primary" />
            <span className="text-sm font-medium">
              {getPhaseLabel(progress.phase)}
            </span>
          </div>

          <Progress value={getProgressPercentage()} className="h-2" />

          <p className="text-xs text-muted-foreground">
            {progress.message}
          </p>

          {progress.phase === 'parsing' && progress.total > 1 && (
            <p className="text-xs text-muted-foreground">
              File {progress.current} of {progress.total}
            </p>
          )}
        </>
      )}
    </div>
  );
}