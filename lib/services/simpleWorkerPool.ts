/**
 * Simplified worker pool for basic data processing
 */

export interface SimpleWorkerMessage {
  type: 'SAMPLE_DATA';
  data: {
    id: string;
    rawData: unknown[];
    targetPoints: number;
    samplingConfig?: {
      data?: unknown[];
      dataByMetadata?: Record<string, unknown[]>;
      samplingConfig: unknown;
      samplingParameter: unknown;
    };
  };
}

export interface SimpleWorkerResponse {
  type: 'DATA_PROCESSED' | 'ERROR';
  data?: unknown;
  error?: string;
  id: string;
}

export class SimpleWorkerPool {
  private worker: Worker | null = null;
  private pendingRequests = new Map<string, {
    resolve: (value: unknown) => void;
    reject: (error: unknown) => void;
  }>();
  
  constructor() {
    this.initWorker();
  }
  
  private initWorker() {
    try {
      // Use the public worker file for now
      const workerUrl = '/dataProcessing.worker.js';
      this.worker = new Worker(workerUrl);
      
      this.worker.addEventListener('message', (event: MessageEvent<SimpleWorkerResponse>) => {
        const { id, type, data, error } = event.data;
        const pending = this.pendingRequests.get(id);
        
        if (pending) {
          if (type === 'ERROR') {
            pending.reject(new Error(error || 'Unknown error'));
          } else {
            pending.resolve(data);
          }
          this.pendingRequests.delete(id);
        }
      });
      
      this.worker.addEventListener('error', (error) => {
        console.error('Worker error:', error);
        // Reject all pending requests
        for (const [, { reject }] of this.pendingRequests) {
          reject(error);
        }
        this.pendingRequests.clear();
      });
    } catch (error) {
      console.error('Failed to initialize worker:', error);
    }
  }
  
  async execute<T>(message: SimpleWorkerMessage): Promise<T> {
    if (!this.worker) {
      // Fallback to main thread processing
      return this.fallbackProcessing(message) as T;
    }
    return new Promise((resolve, reject) => {
      const id = message.data.id;
      this.pendingRequests.set(id, { 
        resolve: (value: unknown) => resolve(value as T), 
        reject 
      });
      this.worker!.postMessage(message);
    });
  }
  
  private fallbackProcessing(message: SimpleWorkerMessage): unknown {
    switch (message.type) {
      case 'SAMPLE_DATA': {
        const { rawData, targetPoints } = message.data;
        const step = Math.max(1, Math.floor(rawData.length / targetPoints));
        const sampled = [];
        
        for (let i = 0; i < rawData.length; i += step) {
          sampled.push(rawData[i]);
        }
        
        return sampled;
      }
      default:
        throw new Error(`Unknown message type: ${message.type}`);
    }
  }
  
  terminate() {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.pendingRequests.clear();
  }
}

// Singleton instance
let simpleWorkerPoolInstance: SimpleWorkerPool | null = null;

export function getSimpleWorkerPool(): SimpleWorkerPool {
  if (!simpleWorkerPoolInstance) {
    simpleWorkerPoolInstance = new SimpleWorkerPool();
  }
  return simpleWorkerPoolInstance;
}

export function terminateSimpleWorkerPool() {
  if (simpleWorkerPoolInstance) {
    simpleWorkerPoolInstance.terminate();
    simpleWorkerPoolInstance = null;
  }
}