/**
 * Worker pool for managing Web Workers efficiently
 * Provides load balancing and automatic worker lifecycle management
 */

import { WorkerMessage, WorkerResponse } from '@/workers/dataProcessing.worker';

interface WorkerInstance {
  worker: Worker;
  busy: boolean;
  taskCount: number;
}

interface PendingTask {
  message: WorkerMessage;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
  onProgress?: (progress: number) => void;
}

export class WorkerPool {
  private workers: WorkerInstance[] = [];
  private taskQueue: PendingTask[] = [];
  private maxWorkers: number;
  private workerScript: string;
  
  constructor(workerScript: string, maxWorkers?: number) {
    this.workerScript = workerScript;
    this.maxWorkers = maxWorkers || navigator.hardwareConcurrency || 4;
    this.initializeWorkers();
  }
  
  private initializeWorkers() {
    // Create initial worker pool
    const initialWorkers = Math.min(2, this.maxWorkers); // Start with 2 workers
    for (let i = 0; i < initialWorkers; i++) {
      this.createWorker();
    }
  }
  
  private createWorker(): WorkerInstance {
    // For Next.js compatibility, create worker with absolute URL
    const worker = new Worker(
      new URL('../../workers/dataProcessing.worker.ts', import.meta.url),
      { type: 'module' }
    );
    
    const instance: WorkerInstance = {
      worker,
      busy: false,
      taskCount: 0
    };
    
    this.workers.push(instance);
    return instance;
  }
  
  private getAvailableWorker(): WorkerInstance | null {
    // Find idle worker
    let availableWorker = this.workers.find(w => !w.busy);
    
    // If no idle worker and we can create more
    if (!availableWorker && this.workers.length < this.maxWorkers) {
      availableWorker = this.createWorker();
    }
    
    // If still no worker, find the one with least tasks
    if (!availableWorker) {
      availableWorker = this.workers.reduce((prev, curr) => 
        prev.taskCount < curr.taskCount ? prev : curr
      );
    }
    
    return availableWorker;
  }
  
  async execute<T>(
    message: WorkerMessage,
    onProgress?: (progress: number) => void
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const task: PendingTask = {
        message,
        resolve: (value: unknown) => resolve(value as T),
        reject,
        onProgress
      };
      
      this.taskQueue.push(task);
      this.processTasks();
    });
  }
  
  private processTasks() {
    while (this.taskQueue.length > 0) {
      const worker = this.getAvailableWorker();
      if (!worker) break;
      
      const task = this.taskQueue.shift();
      if (!task) break;
      
      this.executeTask(worker, task);
    }
  }
  
  private executeTask(workerInstance: WorkerInstance, task: PendingTask) {
    workerInstance.busy = true;
    workerInstance.taskCount++;
    
    const messageHandler = (event: MessageEvent<WorkerResponse>) => {
      const response = event.data;
      
      if (response.id !== task.message.data.id) return;
      
      switch (response.type) {
        case 'DATA_PROCESSED':
          workerInstance.worker.removeEventListener('message', messageHandler);
          workerInstance.worker.removeEventListener('error', errorHandler);
          workerInstance.busy = false;
          task.resolve(response.data);
          this.processTasks(); // Process next task
          break;
          
        case 'ERROR':
          workerInstance.worker.removeEventListener('message', messageHandler);
          workerInstance.worker.removeEventListener('error', errorHandler);
          workerInstance.busy = false;
          task.reject(new Error(response.error));
          this.processTasks();
          break;
          
        case 'PROGRESS':
          if (task.onProgress) {
            task.onProgress(response.progress);
          }
          break;
      }
    };
    
    const errorHandler = (error: ErrorEvent) => {
      workerInstance.worker.removeEventListener('message', messageHandler);
      workerInstance.worker.removeEventListener('error', errorHandler);
      workerInstance.busy = false;
      task.reject(error);
      this.processTasks();
    };
    
    workerInstance.worker.addEventListener('message', messageHandler);
    workerInstance.worker.addEventListener('error', errorHandler);
    workerInstance.worker.postMessage(task.message);
  }
  
  terminate() {
    this.workers.forEach(({ worker }) => worker.terminate());
    this.workers = [];
    this.taskQueue = [];
  }
  
  getStats() {
    return {
      workerCount: this.workers.length,
      busyWorkers: this.workers.filter(w => w.busy).length,
      queueLength: this.taskQueue.length,
      totalTasks: this.workers.reduce((sum, w) => sum + w.taskCount, 0)
    };
  }
}

// Singleton instance
let workerPoolInstance: WorkerPool | null = null;

export function getWorkerPool(): WorkerPool {
  if (!workerPoolInstance) {
    workerPoolInstance = new WorkerPool('/workers/dataProcessing.worker.ts');
  }
  return workerPoolInstance;
}

export function terminateWorkerPool() {
  if (workerPoolInstance) {
    workerPoolInstance.terminate();
    workerPoolInstance = null;
  }
}