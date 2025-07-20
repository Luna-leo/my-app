/**
 * Progress Tracker Service
 * 
 * Manages import progress tracking and reporting
 * Extracted from duckdbCsvImporter.ts
 */

export type ImportPhase = 'preparing' | 'importing' | 'indexing' | 'completed';

export interface ImportProgress {
  current: number;
  total: number;
  phase: ImportPhase;
  message: string;
  percentage?: number;
  startTime?: number;
  estimatedTimeRemaining?: number;
}

export interface ProgressTrackerOptions {
  onProgress?: (progress: ImportProgress) => void;
  throttleMs?: number;
}

export class ProgressTracker {
  private onProgress?: (progress: ImportProgress) => void;
  private throttleMs: number;
  private lastProgressTime: number = 0;
  private startTime: number;
  private progressHistory: Array<{ time: number; value: number }> = [];

  constructor(options: ProgressTrackerOptions = {}) {
    this.onProgress = options.onProgress;
    this.throttleMs = options.throttleMs || 100; // Default 100ms throttle
    this.startTime = Date.now();
  }

  /**
   * Update progress
   */
  updateProgress(progress: Partial<ImportProgress>): void {
    const now = Date.now();
    
    // Throttle progress updates
    if (now - this.lastProgressTime < this.throttleMs && progress.phase !== 'completed') {
      return;
    }

    // Calculate percentage
    let percentage = 0;
    if (progress.current !== undefined && progress.total !== undefined && progress.total > 0) {
      percentage = Math.round((progress.current / progress.total) * 100);
    }

    // Track progress history for time estimation
    if (percentage > 0) {
      this.progressHistory.push({ time: now, value: percentage });
      
      // Keep only last 10 progress points
      if (this.progressHistory.length > 10) {
        this.progressHistory.shift();
      }
    }

    // Calculate estimated time remaining
    const estimatedTimeRemaining = this.calculateEstimatedTime(percentage);

    const fullProgress: ImportProgress = {
      current: progress.current || 0,
      total: progress.total || 0,
      phase: progress.phase || 'preparing',
      message: progress.message || '',
      percentage,
      startTime: this.startTime,
      estimatedTimeRemaining
    };

    this.lastProgressTime = now;
    this.onProgress?.(fullProgress);
  }

  /**
   * Calculate estimated time remaining
   */
  private calculateEstimatedTime(currentPercentage: number): number | undefined {
    if (this.progressHistory.length < 2 || currentPercentage === 0 || currentPercentage === 100) {
      return undefined;
    }

    // Calculate average speed from recent progress
    const recentHistory = this.progressHistory.slice(-5);
    const firstPoint = recentHistory[0];
    const lastPoint = recentHistory[recentHistory.length - 1];
    
    const progressDiff = lastPoint.value - firstPoint.value;
    const timeDiff = lastPoint.time - firstPoint.time;
    
    if (progressDiff <= 0 || timeDiff <= 0) {
      return undefined;
    }

    // Calculate speed (percentage per millisecond)
    const speed = progressDiff / timeDiff;
    
    // Calculate remaining percentage
    const remainingPercentage = 100 - currentPercentage;
    
    // Calculate estimated time (in milliseconds)
    const estimatedTime = remainingPercentage / speed;
    
    return Math.round(estimatedTime);
  }

  /**
   * Set phase with automatic message
   */
  setPhase(phase: ImportPhase, customMessage?: string): void {
    const messages: Record<ImportPhase, string> = {
      preparing: 'Preparing import...',
      importing: 'Importing data...',
      indexing: 'Creating indexes...',
      completed: 'Import completed successfully'
    };

    this.updateProgress({
      phase,
      message: customMessage || messages[phase]
    });
  }

  /**
   * Update file progress
   */
  updateFileProgress(
    currentFile: number,
    totalFiles: number,
    fileName: string,
    fileProgress?: number
  ): void {
    const overallProgress = ((currentFile - 1) + (fileProgress || 0) / 100) / totalFiles;
    
    this.updateProgress({
      current: overallProgress * 100,
      total: 100,
      phase: 'importing',
      message: `Importing ${fileName} (${currentFile}/${totalFiles})${
        fileProgress !== undefined ? ` - ${fileProgress}%` : ''
      }`
    });
  }

  /**
   * Update batch progress
   */
  updateBatchProgress(
    currentBatch: number,
    totalBatches: number,
    currentRow: number,
    totalRows: number
  ): void {
    this.updateProgress({
      current: currentRow,
      total: totalRows,
      phase: 'importing',
      message: `Processing batch ${currentBatch}/${totalBatches} (${currentRow}/${totalRows} rows)`
    });
  }

  /**
   * Complete progress tracking
   */
  complete(message?: string, stats?: {
    rowCount: number;
    duration: number;
    fileCount?: number;
  }): void {
    const duration = Date.now() - this.startTime;
    
    let finalMessage = message || 'Import completed successfully';
    
    if (stats) {
      finalMessage = `Import completed: ${stats.rowCount.toLocaleString()} rows`;
      if (stats.fileCount) {
        finalMessage += ` from ${stats.fileCount} files`;
      }
      finalMessage += ` in ${this.formatDuration(stats.duration || duration)}`;
    }

    this.updateProgress({
      current: 100,
      total: 100,
      phase: 'completed',
      message: finalMessage
    });
  }

  /**
   * Report error
   */
  reportError(error: Error | string): void {
    const errorMessage = error instanceof Error ? error.message : error;
    
    this.updateProgress({
      phase: 'completed',
      message: `Import failed: ${errorMessage}`
    });
  }

  /**
   * Format duration for display
   */
  private formatDuration(ms: number): string {
    if (ms < 1000) {
      return `${ms}ms`;
    } else if (ms < 60000) {
      return `${(ms / 1000).toFixed(1)}s`;
    } else {
      const minutes = Math.floor(ms / 60000);
      const seconds = Math.floor((ms % 60000) / 1000);
      return `${minutes}m ${seconds}s`;
    }
  }

  /**
   * Reset progress tracker
   */
  reset(): void {
    this.startTime = Date.now();
    this.progressHistory = [];
    this.lastProgressTime = 0;
  }
}