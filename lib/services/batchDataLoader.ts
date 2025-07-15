import { TimeSeriesData, Metadata } from '@/lib/db/schema';
import { db } from '@/lib/db';
import { timeSeriesCache, metadataCache } from './dataCache';
import { parameterTracker } from './parameterTracker';

export interface DataRequest {
  metadataId: number;
  parameterIds: string[];
  requestId: string; // Unique ID for tracking the request
}

export interface BatchLoadResult {
  metadataId: number;
  data: TimeSeriesData[];
  metadata?: Metadata;
  loadedParameters: string[];
}

/**
 * Batches multiple data requests to minimize database queries
 * Implements the DataLoader pattern for efficient data fetching
 */
export class BatchDataLoader {
  private static instance: BatchDataLoader;
  
  // Pending requests grouped by a batch window
  private pendingRequests: Map<string, DataRequest> = new Map();
  
  // Batch window in milliseconds
  private batchWindow: number = 10; // 10ms default
  
  // Batch timer
  private batchTimer: NodeJS.Timeout | null = null;
  
  // Promise resolvers for pending requests
  private resolvers: Map<string, {
    resolve: (result: BatchLoadResult) => void;
    reject: (error: Error) => void;
  }> = new Map();

  private constructor() {}

  static getInstance(): BatchDataLoader {
    if (!BatchDataLoader.instance) {
      BatchDataLoader.instance = new BatchDataLoader();
    }
    return BatchDataLoader.instance;
  }

  /**
   * Request data for a specific metadata ID and parameters
   * Returns a promise that resolves when the batch is processed
   */
  async load(request: DataRequest): Promise<BatchLoadResult> {
    return new Promise((resolve, reject) => {
      // Store the request and resolver
      this.pendingRequests.set(request.requestId, request);
      this.resolvers.set(request.requestId, { resolve, reject });
      
      // Schedule batch processing
      this.scheduleBatch();
    });
  }

  /**
   * Schedule batch processing after the batch window
   */
  private scheduleBatch(): void {
    if (this.batchTimer) {
      return; // Batch already scheduled
    }
    
    this.batchTimer = setTimeout(() => {
      this.processBatch();
    }, this.batchWindow);
  }

  /**
   * Process all pending requests in a single batch
   */
  private async processBatch(): Promise<void> {
    // Clear the timer
    this.batchTimer = null;
    
    // Get all pending requests
    const requests = Array.from(this.pendingRequests.values());
    const requestResolvers = new Map(this.resolvers);
    
    // Clear pending state
    this.pendingRequests.clear();
    this.resolvers.clear();
    
    if (requests.length === 0) {
      return;
    }
    
    console.log(`[BatchDataLoader] Processing batch of ${requests.length} requests`);
    
    try {
      // Group requests by metadata ID
      const requestsByMetadata = new Map<number, DataRequest[]>();
      requests.forEach(request => {
        if (!requestsByMetadata.has(request.metadataId)) {
          requestsByMetadata.set(request.metadataId, []);
        }
        requestsByMetadata.get(request.metadataId)!.push(request);
      });
      
      console.log(`[BatchDataLoader] Grouped into ${requestsByMetadata.size} unique metadata IDs`);
      
      // Process each metadata ID
      const results = await Promise.all(
        Array.from(requestsByMetadata.entries()).map(async ([metadataId, metadataRequests]) => {
          try {
            // Aggregate all required parameters for this metadata ID
            const allParameters = new Set<string>();
            metadataRequests.forEach(req => {
              req.parameterIds.forEach(param => allParameters.add(param));
            });
            
            const parameterArray = Array.from(allParameters);
            console.log(`[BatchDataLoader] Loading metadataId ${metadataId} with ${parameterArray.length} parameters`);
            
            // Check cache first
            const cachedData = timeSeriesCache.get(metadataId);
            let data: TimeSeriesData[];
            let loadedParams: string[] = parameterArray;
            
            if (cachedData) {
              // Check if we have all required parameters
              const missingParams = parameterTracker.getMissingParameters(metadataId, parameterArray);
              
              if (missingParams.length === 0) {
                console.log(`[BatchDataLoader] Cache hit with all parameters for metadataId ${metadataId}`);
                data = cachedData;
              } else {
                console.log(`[BatchDataLoader] Fetching missing parameters for metadataId ${metadataId}:`, missingParams);
                
                // Fetch only missing parameters
                const additionalData = await db.getTimeSeriesData(metadataId, undefined, undefined, missingParams);
                
                // Merge with cached data
                data = this.mergeTimeSeriesData(cachedData, additionalData);
                
                // Update cache and tracker
                timeSeriesCache.set(metadataId, data);
                parameterTracker.addLoadedParameters(metadataId, missingParams);
              }
            } else {
              // No cache, fetch all requested parameters
              console.log(`[BatchDataLoader] No cache for metadataId ${metadataId}, fetching ${parameterArray.length} parameters`);
              data = await db.getTimeSeriesData(metadataId, undefined, undefined, parameterArray);
              
              // Update cache and tracker
              timeSeriesCache.set(metadataId, data);
              if (data.length > 0) {
                const actualKeys = Object.keys(data[0].data);
                parameterTracker.addLoadedParameters(metadataId, actualKeys);
                loadedParams = actualKeys;
              }
            }
            
            // Get metadata
            const metadata = metadataCache.get(metadataId) || await db.metadata.get(metadataId);
            if (metadata && !metadataCache.has(metadataId)) {
              metadataCache.set(metadataId, metadata);
            }
            
            return {
              metadataId,
              data,
              metadata: metadata || undefined,
              loadedParameters: loadedParams,
              requests: metadataRequests
            };
          } catch (error) {
            console.error(`[BatchDataLoader] Error loading metadataId ${metadataId}:`, error);
            throw error;
          }
        })
      );
      
      // Resolve individual requests
      results.forEach(result => {
        result.requests.forEach(request => {
          const resolver = requestResolvers.get(request.requestId);
          if (resolver) {
            resolver.resolve({
              metadataId: result.metadataId,
              data: result.data,
              metadata: result.metadata,
              loadedParameters: result.loadedParameters
            });
          }
        });
      });
      
    } catch (error) {
      // Reject all pending requests
      requests.forEach(request => {
        const resolver = requestResolvers.get(request.requestId);
        if (resolver) {
          resolver.reject(error as Error);
        }
      });
    }
  }

  /**
   * Merge cached data with additional data
   */
  private mergeTimeSeriesData(
    cachedData: TimeSeriesData[], 
    additionalData: TimeSeriesData[]
  ): TimeSeriesData[] {
    // Create a map for faster lookup by timestamp
    const additionalDataMap = new Map<number, Record<string, number | null>>();
    additionalData.forEach(item => {
      additionalDataMap.set(item.timestamp.getTime(), item.data);
    });
    
    // Merge data
    return cachedData.map(item => {
      const timestamp = item.timestamp.getTime();
      const additionalItemData = additionalDataMap.get(timestamp);
      
      if (additionalItemData) {
        return {
          ...item,
          data: {
            ...item.data,
            ...additionalItemData
          }
        };
      }
      return item;
    });
  }

  /**
   * Set the batch window (for testing or optimization)
   */
  setBatchWindow(milliseconds: number): void {
    this.batchWindow = milliseconds;
  }

  /**
   * Clear all pending requests (useful for cleanup)
   */
  clearPending(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
    
    // Reject all pending requests
    this.resolvers.forEach(resolver => {
      resolver.reject(new Error('Batch loader cleared'));
    });
    
    this.pendingRequests.clear();
    this.resolvers.clear();
  }
}

// Export singleton instance
export const batchDataLoader = BatchDataLoader.getInstance();