/**
 * Enhanced Worker Pool with parallel processing and load balancing
 * Supports multiple workers for improved performance on multi-core systems
 */

import { getMemoryStats } from './memoryMonitor';

export interface WorkerTask {
  id: string;
  type: 'SAMPLE_DATA' | 'TRANSFORM_DATA' | 'CALCULATE_VIEWPORT' | 'BATCH_PROCESS';
  payload: unknown;
  priority?: number;
  timeout?: number;
}

export interface WorkerResponse {
  id: string;
  type: 'SUCCESS' | 'ERROR';
  result?: unknown;
  error?: string;
  workerId?: number;
  executionTime?: number;
}

interface WorkerInfo {
  worker: Worker;
  id: number;
  busy: boolean;
  currentTask?: string;
  tasksCompleted: number;
  totalExecutionTime: number;
  averageExecutionTime: number;
}

interface TaskQueueItem {
  task: WorkerTask;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timestamp: number;
  attempts: number;
}

export class EnhancedWorkerPool {
  private workers: WorkerInfo[] = [];
  private taskQueue: TaskQueueItem[] = [];
  private pendingTasks = new Map<string, TaskQueueItem>();
  private workerCount: number;
  private maxQueueSize: number;
  private taskTimeouts = new Map<string, NodeJS.Timeout>();
  private isShuttingDown = false;
  private performanceMetrics = {
    totalTasks: 0,
    completedTasks: 0,
    failedTasks: 0,
    averageWaitTime: 0,
    averageExecutionTime: 0
  };

  constructor(options?: {
    workerCount?: number;
    maxQueueSize?: number;
    workerPath?: string;
    enableAdaptiveScaling?: boolean;
  }) {
    // Determine optimal worker count based on available cores
    const availableCores = navigator.hardwareConcurrency || 4;
    this.workerCount = options?.workerCount || Math.min(availableCores - 1, 4); // Reserve 1 core for main thread
    this.maxQueueSize = options?.maxQueueSize || 100;
    
    console.log(`[EnhancedWorkerPool] Initializing with ${this.workerCount} workers`);
    
    this.initializeWorkers(options?.workerPath || '/dataProcessing.worker.js');
    
    if (options?.enableAdaptiveScaling) {
      this.startAdaptiveScaling();
    }
  }

  private initializeWorkers(workerPath: string) {
    for (let i = 0; i < this.workerCount; i++) {
      try {
        const worker = new Worker(workerPath);
        const workerInfo: WorkerInfo = {
          worker,
          id: i,
          busy: false,
          tasksCompleted: 0,
          totalExecutionTime: 0,
          averageExecutionTime: 0
        };

        // Set up message handler
        worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
          this.handleWorkerMessage(workerInfo, event.data);
        });

        // Set up error handler
        worker.addEventListener('error', (error) => {
          console.error(`[Worker ${i}] Error:`, error);
          this.handleWorkerError(workerInfo, error);
        });

        this.workers.push(workerInfo);
      } catch (error) {
        console.error(`[EnhancedWorkerPool] Failed to create worker ${i}:`, error);
      }
    }
  }

  private handleWorkerMessage(workerInfo: WorkerInfo, response: WorkerResponse) {
    const taskItem = this.pendingTasks.get(response.id);
    if (!taskItem) return;

    // Clear timeout
    const timeout = this.taskTimeouts.get(response.id);
    if (timeout) {
      clearTimeout(timeout);
      this.taskTimeouts.delete(response.id);
    }

    // Update worker stats
    workerInfo.busy = false;
    workerInfo.currentTask = undefined;
    workerInfo.tasksCompleted++;
    
    if (response.executionTime) {
      workerInfo.totalExecutionTime += response.executionTime;
      workerInfo.averageExecutionTime = workerInfo.totalExecutionTime / workerInfo.tasksCompleted;
    }

    // Update performance metrics
    this.performanceMetrics.completedTasks++;
    const waitTime = Date.now() - taskItem.timestamp;
    this.performanceMetrics.averageWaitTime = 
      (this.performanceMetrics.averageWaitTime * (this.performanceMetrics.completedTasks - 1) + waitTime) / 
      this.performanceMetrics.completedTasks;

    if (response.executionTime) {
      this.performanceMetrics.averageExecutionTime = 
        (this.performanceMetrics.averageExecutionTime * (this.performanceMetrics.completedTasks - 1) + response.executionTime) / 
        this.performanceMetrics.completedTasks;
    }

    // Resolve or reject the task
    if (response.type === 'SUCCESS') {
      taskItem.resolve(response.result);
    } else {
      taskItem.reject(new Error(response.error || 'Unknown error'));
      this.performanceMetrics.failedTasks++;
    }

    this.pendingTasks.delete(response.id);
    
    // Process next task in queue
    this.processNextTask();
  }

  private handleWorkerError(workerInfo: WorkerInfo, error: Event | ErrorEvent) {
    console.error(`[Worker ${workerInfo.id}] Fatal error, restarting worker`);
    
    // Mark current task as failed if any
    if (workerInfo.currentTask) {
      const taskItem = this.pendingTasks.get(workerInfo.currentTask);
      if (taskItem) {
        taskItem.reject(new Error('Worker crashed'));
        this.pendingTasks.delete(workerInfo.currentTask);
        this.performanceMetrics.failedTasks++;
      }
    }

    // Restart the worker
    workerInfo.worker.terminate();
    try {
      workerInfo.worker = new Worker('/dataProcessing.worker.js');
      workerInfo.busy = false;
      workerInfo.currentTask = undefined;
      
      // Re-setup handlers
      workerInfo.worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(workerInfo, event.data);
      });
      
      workerInfo.worker.addEventListener('error', (e) => {
        this.handleWorkerError(workerInfo, e);
      });
      
      // Process next task
      this.processNextTask();
    } catch (e) {
      console.error(`[Worker ${workerInfo.id}] Failed to restart:`, e);
      // Remove worker from pool
      const index = this.workers.indexOf(workerInfo);
      if (index > -1) {
        this.workers.splice(index, 1);
      }
    }
  }

  async execute<T>(task: WorkerTask): Promise<T> {
    if (this.isShuttingDown) {
      throw new Error('Worker pool is shutting down');
    }

    if (this.taskQueue.length >= this.maxQueueSize) {
      throw new Error('Task queue is full');
    }

    this.performanceMetrics.totalTasks++;

    return new Promise((resolve, reject) => {
      const taskItem: TaskQueueItem = {
        task,
        resolve: (value: unknown) => resolve(value as T),
        reject,
        timestamp: Date.now(),
        attempts: 0
      };

      this.pendingTasks.set(task.id, taskItem);

      // Set timeout if specified
      if (task.timeout) {
        const timeout = setTimeout(() => {
          const item = this.pendingTasks.get(task.id);
          if (item) {
            item.reject(new Error('Task timeout'));
            this.pendingTasks.delete(task.id);
            this.performanceMetrics.failedTasks++;
            
            // Find and free the worker
            const worker = this.workers.find(w => w.currentTask === task.id);
            if (worker) {
              worker.busy = false;
              worker.currentTask = undefined;
              this.processNextTask();
            }
          }
        }, task.timeout);
        
        this.taskTimeouts.set(task.id, timeout);
      }

      // Add to queue or execute immediately
      const availableWorker = this.findAvailableWorker();
      if (availableWorker) {
        this.executeTask(availableWorker, taskItem);
      } else {
        this.enqueueTask(taskItem);
      }
    });
  }

  private findAvailableWorker(): WorkerInfo | null {
    // Find least busy worker (by average execution time)
    let bestWorker: WorkerInfo | null = null;
    let lowestAvgTime = Infinity;

    for (const worker of this.workers) {
      if (!worker.busy) {
        if (worker.averageExecutionTime < lowestAvgTime) {
          bestWorker = worker;
          lowestAvgTime = worker.averageExecutionTime;
        }
      }
    }

    return bestWorker;
  }

  private enqueueTask(taskItem: TaskQueueItem) {
    // Priority queue implementation
    const priority = taskItem.task.priority || 0;
    let insertIndex = this.taskQueue.length;

    for (let i = 0; i < this.taskQueue.length; i++) {
      if ((this.taskQueue[i].task.priority || 0) < priority) {
        insertIndex = i;
        break;
      }
    }

    this.taskQueue.splice(insertIndex, 0, taskItem);
  }

  private processNextTask() {
    if (this.taskQueue.length === 0 || this.isShuttingDown) return;

    const availableWorker = this.findAvailableWorker();
    if (!availableWorker) return;

    const taskItem = this.taskQueue.shift();
    if (taskItem) {
      this.executeTask(availableWorker, taskItem);
    }
  }

  private executeTask(worker: WorkerInfo, taskItem: TaskQueueItem) {
    worker.busy = true;
    worker.currentTask = taskItem.task.id;
    taskItem.attempts++;

    // Send task to worker
    worker.worker.postMessage({
      ...taskItem.task,
      workerId: worker.id,
      timestamp: Date.now()
    });
  }

  /**
   * Get current pool statistics
   */
  getStats() {
    const busyWorkers = this.workers.filter(w => w.busy).length;
    const workerStats = this.workers.map(w => ({
      id: w.id,
      busy: w.busy,
      tasksCompleted: w.tasksCompleted,
      averageExecutionTime: w.averageExecutionTime
    }));

    return {
      activeWorkers: this.workers.length,
      busyWorkers,
      idleWorkers: this.workers.length - busyWorkers,
      queueLength: this.taskQueue.length,
      pendingTasks: this.pendingTasks.size,
      performanceMetrics: { ...this.performanceMetrics },
      workerStats
    };
  }

  /**
   * Adaptive scaling based on workload and memory pressure
   */
  private startAdaptiveScaling() {
    setInterval(async () => {
      const stats = this.getStats();
      const memStats = await getMemoryStats();

      // Scale down if memory pressure is high
      if (memStats.pressure === 'high' || memStats.pressure === 'critical') {
        if (this.workers.length > 1) {
          const idleWorker = this.workers.find(w => !w.busy);
          if (idleWorker) {
            this.removeWorker(idleWorker);
            console.log(`[EnhancedWorkerPool] Scaled down to ${this.workers.length} workers due to memory pressure`);
          }
        }
      }
      // Scale up if queue is growing and we have capacity
      else if (stats.queueLength > 10 && stats.busyWorkers === stats.activeWorkers) {
        if (this.workers.length < (navigator.hardwareConcurrency || 4) - 1) {
          this.addWorker();
          console.log(`[EnhancedWorkerPool] Scaled up to ${this.workers.length} workers due to high load`);
        }
      }
      // Scale down if workers are idle
      else if (stats.idleWorkers > 2 && this.workers.length > 2) {
        const mostIdleWorker = [...this.workers]
          .filter(w => !w.busy)
          .sort((a, b) => a.tasksCompleted - b.tasksCompleted)[0];
        
        if (mostIdleWorker) {
          this.removeWorker(mostIdleWorker);
          console.log(`[EnhancedWorkerPool] Scaled down to ${this.workers.length} workers due to low load`);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  private addWorker() {
    const workerId = Math.max(...this.workers.map(w => w.id)) + 1;
    try {
      const worker = new Worker('/dataProcessing.worker.js');
      const workerInfo: WorkerInfo = {
        worker,
        id: workerId,
        busy: false,
        tasksCompleted: 0,
        totalExecutionTime: 0,
        averageExecutionTime: 0
      };

      worker.addEventListener('message', (event: MessageEvent<WorkerResponse>) => {
        this.handleWorkerMessage(workerInfo, event.data);
      });

      worker.addEventListener('error', (error) => {
        this.handleWorkerError(workerInfo, error);
      });

      this.workers.push(workerInfo);
    } catch (error) {
      console.error(`[EnhancedWorkerPool] Failed to add worker:`, error);
    }
  }

  private removeWorker(workerInfo: WorkerInfo) {
    if (workerInfo.busy) return; // Don't remove busy workers

    const index = this.workers.indexOf(workerInfo);
    if (index > -1) {
      workerInfo.worker.terminate();
      this.workers.splice(index, 1);
    }
  }

  /**
   * Gracefully shutdown the pool
   */
  async shutdown() {
    console.log('[EnhancedWorkerPool] Shutting down...');
    this.isShuttingDown = true;

    // Cancel all pending tasks
    for (const [, taskItem] of this.pendingTasks) {
      taskItem.reject(new Error('Worker pool shutdown'));
    }
    this.pendingTasks.clear();

    // Clear timeouts
    for (const [, timeout] of this.taskTimeouts) {
      clearTimeout(timeout);
    }
    this.taskTimeouts.clear();

    // Wait for current tasks to complete (with timeout)
    const shutdownTimeout = 5000;
    const startTime = Date.now();
    
    while (this.workers.some(w => w.busy) && Date.now() - startTime < shutdownTimeout) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Terminate all workers
    for (const workerInfo of this.workers) {
      workerInfo.worker.terminate();
    }
    this.workers = [];

    console.log('[EnhancedWorkerPool] Shutdown complete');
  }
}

// Singleton instance
let enhancedWorkerPoolInstance: EnhancedWorkerPool | null = null;

export function getEnhancedWorkerPool(options?: {
  workerCount?: number;
  maxQueueSize?: number;
  enableAdaptiveScaling?: boolean;
}): EnhancedWorkerPool {
  if (!enhancedWorkerPoolInstance) {
    enhancedWorkerPoolInstance = new EnhancedWorkerPool(options);
  }
  return enhancedWorkerPoolInstance;
}

export async function shutdownEnhancedWorkerPool() {
  if (enhancedWorkerPoolInstance) {
    await enhancedWorkerPoolInstance.shutdown();
    enhancedWorkerPoolInstance = null;
  }
}