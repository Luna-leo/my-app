'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo, useRef } from 'react';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { ChartPlotData, ChartViewport, SamplingInfo } from '@/lib/types/chart';
import { TimeSeriesData, ParameterInfo, Metadata } from '@/lib/db/schema';
import { db } from '@/lib/db';
import {
  transformDataForChart,
  transformDataForXYChart,
  calculateDataRange,
  mergeTimeSeriesData,
} from '@/lib/utils/chartDataUtils';
import { dataCache, timeSeriesCache, metadataCache, parameterCache, transformCache } from '@/lib/services/dataCache';
import { hierarchicalSamplingCache } from '@/lib/services/hierarchicalSamplingCache';
import { hybridDataService } from '@/lib/services/hybridDataService';
import { parameterTracker } from '@/lib/services/parameterTracker';
import { ChartParameterAggregator } from '@/lib/services/chartParameterAggregator';
import { batchDataLoader } from '@/lib/services/batchDataLoader';
import { createParquetDataManager } from '@/lib/services/parquetDataManager';
import { createDataPersistenceService } from '@/lib/services/dataPersistenceService';
import { sampleTimeSeriesData, sampleTimeSeriesDataByMetadata, DEFAULT_SAMPLING_CONFIG, SamplingConfig, getMemoryAwareSamplingConfig, PREVIEW_SAMPLING_CONFIG, HIGH_RES_SAMPLING_CONFIG } from '@/lib/utils/chartDataSampling';
import { memoryMonitor } from '@/lib/services/memoryMonitor';
import { hashChartConfig } from '@/lib/utils/hashUtils';
import { getSimpleWorkerPool } from '@/lib/services/simpleWorkerPool';
import { DB_SAMPLING_CONFIG, SAMPLING_STRATEGY } from '@/lib/constants/samplingConfig';
import { dataFetchService } from '@/lib/services/dataFetchService';
import { createLogger } from '@/lib/services/logger';

interface ChartDataProviderState {
  // Cache for transformed chart data keyed by configuration hash
  chartDataCache: Map<string, {
    plotData: ChartPlotData;
    viewport: ChartViewport;
  }>;
  isLoading: boolean;
}

// Request queue to limit concurrent requests
class RequestQueue {
  private queue: Array<{
    id: string;
    execute: () => Promise<any>;
    resolve: (value: any) => void;
    reject: (error: any) => void;
  }> = [];
  private activeRequests = 0;
  private maxConcurrent: number;
  private inProgressRequests = new Map<string, Promise<any>>();

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  async enqueue<T>(id: string, fn: () => Promise<T>): Promise<T> {
    // Check if this request is already in progress
    const existing = this.inProgressRequests.get(id);
    if (existing) {
      console.log(`[RequestQueue] Duplicate request detected for ID: ${id}, returning existing promise`);
      return existing as Promise<T>;
    }

    const promise = new Promise<T>((resolve, reject) => {
      this.queue.push({
        id,
        execute: fn,
        resolve,
        reject
      });
      this.processQueue();
    });

    // Track this request as in progress
    this.inProgressRequests.set(id, promise);
    
    // Clean up when done
    promise
      .then((result) => {
        this.inProgressRequests.delete(id);
        return result;
      })
      .catch((error) => {
        this.inProgressRequests.delete(id);
        throw error;
      });

    return promise;
  }

  private async processQueue() {
    if (this.activeRequests >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const request = this.queue.shift();
    if (!request) return;

    this.activeRequests++;
    try {
      const result = await request.execute();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    } finally {
      this.activeRequests--;
      this.processQueue();
    }
  }

  getQueueLength() {
    return this.queue.length;
  }

  getActiveCount() {
    return this.activeRequests;
  }

  // Cancel specific request by ID
  cancelRequest(id: string) {
    // Remove from queue if pending
    this.queue = this.queue.filter(request => request.id !== id);
    
    // Remove from in-progress requests
    if (this.inProgressRequests.has(id)) {
      console.log(`[RequestQueue] Cancelling in-progress request: ${id}`);
      this.inProgressRequests.delete(id);
    }
  }

  // Clear all requests
  clearAll() {
    console.log(`[RequestQueue] Clearing all requests. Queue: ${this.queue.length}, In-progress: ${this.inProgressRequests.size}`);
    this.queue = [];
    this.inProgressRequests.clear();
  }
}

// Extended ChartConfiguration type for internal use
interface ChartConfigurationWithData extends ChartConfiguration {
  id?: string;
  selectedDataIds: number[];
}

interface ChartDataContextType {
  getChartData: (config: ChartConfigurationWithData, enableSampling?: boolean | SamplingConfig, onProgress?: (progress: number) => void) => Promise<{
    plotData: ChartPlotData | null;
    dataViewport: ChartViewport | null;
  }>;
  preloadChartData: (configs: ChartConfigurationWithData[], options?: {
    batchSize?: number;
    onProgress?: (loaded: number, total: number) => void;
  }) => Promise<void>;
  getChartsDataBatch: (configs: ChartConfigurationWithData[], options?: {
    enableSampling?: boolean | SamplingConfig;
    onProgress?: (loaded: number, total: number) => void;
  }) => Promise<Map<string, { plotData: ChartPlotData | null; dataViewport: ChartViewport | null }>>;
  clearCache: () => void;
  clearChartCache: (configId: string) => void;
  isDuckDBReady: boolean;
  useDuckDB: boolean;
}

const ChartDataContext = createContext<ChartDataContextType | undefined>(undefined);

// Generate a stable hash for chart configuration
function getConfigHash(config: ChartConfigurationWithData, samplingOption: boolean | SamplingConfig = true): string {
  const samplingConfig = typeof samplingOption === 'boolean' 
    ? { enabled: samplingOption }
    : samplingOption;
  
  const hash = hashChartConfig({
    id: config.id,
    xAxisParameter: config.xAxisParameter,
    yAxisParameters: config.yAxisParameters,
    selectedDataIds: config.selectedDataIds,
    chartType: config.chartType,
  }, samplingConfig);
  
  return hash;
}

// Generate a cache key for sampled data
// Removed: getSamplingCacheKey (no longer needed)

// Create a singleton request queue instance
const requestQueue = new RequestQueue(2); // Allow max 2 concurrent requests

export function ChartDataProvider({ children, useDuckDB = true }: { children: ReactNode; useDuckDB?: boolean }) {
  const [state, setState] = useState<ChartDataProviderState>({
    chartDataCache: new Map(),
    isLoading: false
  });
  const [isDuckDBReady, setIsDuckDBReady] = useState(false);
  const duckDBLoadedData = useRef(new Set<number>());
  const logger = useMemo(() => createLogger('ChartDataContext'), []);
  
  // Initialize DuckDB if enabled
  useEffect(() => {
    if (useDuckDB) {
      logger.info('Initializing DuckDB...');
      hybridDataService.initialize()
        .then(async () => {
          logger.info('DuckDB initialized successfully');
          
          // Don't auto-restore data - wait for on-demand restoration
          try {
            const connection = await hybridDataService.getConnection();
            if (connection) {
              const persistenceService = createDataPersistenceService(connection);
              const persistedIds = await persistenceService.getPersistedMetadataIds();
              
              if (persistedIds.length > 0) {
                console.log(`[ChartDataContext] Found ${persistedIds.length} persisted datasets available for on-demand restoration`);
              }
            }
          } catch (error) {
            console.error('[ChartDataContext] Failed to check persisted data:', error);
          }
          
          setIsDuckDBReady(true);
        })
        .catch(error => {
          console.error('[ChartDataContext] Failed to initialize DuckDB:', error);
          // Continue without DuckDB
        });
    }

    return () => {
      if (useDuckDB) {
        hybridDataService.dispose();
        duckDBLoadedData.current.clear();
      }
    };
  }, [useDuckDB]);

  // Monitor memory pressure and clear caches when needed
  useEffect(() => {
    // Start memory monitoring
    memoryMonitor.startMonitoring(5000); // Check every 5 seconds

    // Subscribe to memory pressure changes
    const unsubscribe = memoryMonitor.subscribe((stats) => {
      console.log(`[Memory Monitor] Pressure: ${stats.pressure}, Used: ${stats.usedMB.toFixed(1)}MB / ${stats.totalMB.toFixed(1)}MB`);
      
      // Clear caches on high memory pressure
      if (stats.pressure === 'critical') {
        console.warn('[Memory Monitor] Critical memory pressure detected, clearing all caches');
        dataCache.clear();
        parameterTracker.clear(); // Clear parameter tracking when clearing caches
        setState(prev => ({
          ...prev,
          chartDataCache: new Map()
        }));
      } else if (stats.pressure === 'high') {
        console.warn('[Memory Monitor] High memory pressure detected, clearing sampling cache');
        hierarchicalSamplingCache.clear();
        // Clear half of in-memory cache
        setState(prev => {
          const newCache = new Map(prev.chartDataCache);
          const keys = Array.from(newCache.keys());
          const halfSize = Math.floor(keys.length / 2);
          keys.slice(0, halfSize).forEach(key => newCache.delete(key));
          return {
            ...prev,
            chartDataCache: newCache
          };
        });
      }
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Fetch and cache raw data for given metadata IDs
  const fetchRawData = async (metadataIds: number[], parameterIds?: string[], maxPointsPerDataset?: number) => {
    // DataFetchServiceに委譲
    const result = await dataFetchService.fetchRawData(metadataIds, parameterIds, maxPointsPerDataset);
    return result;
  };

  // 元のfetchRawData関数（後で削除予定）
  const fetchRawDataOld = async (metadataIds: number[], parameterIds?: string[], maxPointsPerDataset?: number) => {
    // Handle empty data case
    if (!metadataIds || metadataIds.length === 0) {
      return {
        timeSeries: [],
        dataByMetadata: new Map(),
        metadata: new Map(),
        parameters: new Map(),
        originalCountByMetadata: new Map(),
        totalOriginalCount: 0
      };
    }

    // First, fetch metadata to get time range information
    const metadataPromises = metadataIds.map(async (metadataId) => {
      const cached = metadataCache.get(metadataId);
      if (cached) {
        return { metadataId, metadata: cached };
      }
      
      const metadata = await db.metadata.get(metadataId);
      if (metadata) {
        metadataCache.set(metadataId, metadata);
      }
      return { metadataId, metadata };
    });

    const metadataResults = await Promise.all(metadataPromises);
    const metadataMap = new Map();
    const metadataByIdMap = new Map<number, Metadata | undefined>();
    
    metadataResults.forEach(({ metadataId, metadata }) => {
      metadataByIdMap.set(metadataId, metadata);
      if (metadata) {
        metadataMap.set(metadataId, {
          label: metadata.label,
          plant: metadata.plant,
          machineNo: metadata.machineNo,
          startTime: metadata.startTime,
          endTime: metadata.endTime,
        });
      }
    });

    // Then fetch time series data with time range filtering
    console.log(`[ChartDataContext] fetchRawData called with metadataIds:`, metadataIds, `parameterIds:`, parameterIds);
    
    const timeSeriesPromises = metadataIds.map(async (metadataId) => {
      const metadata = metadataByIdMap.get(metadataId);
      
      // If time range is specified, skip cache (for now)
      if (metadata?.startTime || metadata?.endTime) {
        console.log(`[ChartDataContext] Fetching filtered data for metadataId ${metadataId}:`, {
          startTime: metadata.startTime ? new Date(metadata.startTime).toLocaleString() : 'not set',
          endTime: metadata.endTime ? new Date(metadata.endTime).toLocaleString() : 'not set',
          startTimeMs: metadata.startTime,
          endTimeMs: metadata.endTime,
          parameterIds: parameterIds?.length || 'all'
        });
        
        // Check if data exists in DuckDB first
        if (isDuckDBReady && useDuckDB) {
          try {
            const connection = await hybridDataService.getConnection();
            if (connection) {
              const tableName = `timeseries_${metadataId}`;
              
              // Check if table exists
              const tableExists = await connection.query(`
                SELECT COUNT(*) as count 
                FROM information_schema.tables 
                WHERE table_name = '${tableName}'
              `);
              
              if (tableExists.toArray()[0]?.count > 0) {
                console.log(`[ChartDataContext] DuckDB table ${tableName} exists, loading from DuckDB`);
                
                // Load data from DuckDB
                // IMPORTANT: Use all required parameters, not just the ones passed to fetchRawData
                const allParams = parameterIds || [];
                console.log(`[ChartDataContext] Loading from DuckDB with parameters:`, allParams);
                
                const duckdbData = await hybridDataService.sampleData(
                  [metadataId],
                  allParams,
                  maxPointsPerDataset || 10000,
                  {
                    startTime: metadata.startTime ? new Date(metadata.startTime) : undefined,
                    endTime: metadata.endTime ? new Date(metadata.endTime) : undefined,
                    method: 'nth'
                  }
                );
                
                console.log(`[ChartDataContext] Loaded ${duckdbData.length} points from DuckDB for metadataId ${metadataId}`, {
                  requestedParams: allParams,
                  sampleDataKeys: duckdbData[0] ? Object.keys(duckdbData[0].data) : []
                });
                
                // Update parameter tracker
                if (duckdbData.length > 0) {
                  const actualKeys = Object.keys(duckdbData[0].data);
                  console.log(`[ChartDataContext] DuckDB returned data with keys:`, actualKeys);
                  parameterTracker.addLoadedParameters(metadataId, actualKeys);
                }
                
                return { metadataId, data: duckdbData, totalCount: duckdbData.length };
              } else {
                // Table doesn't exist - check for persisted data and restore on-demand
                console.log(`[ChartDataContext] DuckDB table ${tableName} doesn't exist, checking for persisted data`);
                
                const persistenceService = createDataPersistenceService(connection);
                const persistenceStatus = await persistenceService.getPersistenceStatus(metadataId);
                
                if (persistenceStatus.isPersisted) {
                  console.log(`[ChartDataContext] Found persisted data for metadataId ${metadataId}, restoring on-demand...`);
                  
                  try {
                    const restoreResult = await persistenceService.restoreTable(metadataId);
                    if (restoreResult.success) {
                      console.log(`[ChartDataContext] Successfully restored ${restoreResult.rowsRestored} rows for metadataId ${metadataId}`);
                      duckDBLoadedData.current.add(metadataId);
                      
                      // Now load the data from the restored table
                      const allParams = parameterIds || [];
                      const duckdbData = await hybridDataService.sampleData(
                        [metadataId],
                        allParams,
                        maxPointsPerDataset || 10000,
                        {
                          startTime: metadata.startTime ? new Date(metadata.startTime) : undefined,
                          endTime: metadata.endTime ? new Date(metadata.endTime) : undefined,
                          method: 'nth'
                        }
                      );
                      
                      // Update parameter tracker
                      if (duckdbData.length > 0) {
                        const actualKeys = Object.keys(duckdbData[0].data);
                        parameterTracker.addLoadedParameters(metadataId, actualKeys);
                      }
                      
                      return { metadataId, data: duckdbData, totalCount: duckdbData.length };
                    } else {
                      console.error(`[ChartDataContext] Failed to restore persisted data: ${restoreResult.error}`);
                    }
                  } catch (err) {
                    console.error(`[ChartDataContext] Error restoring persisted data:`, err);
                  }
                }
                
                // Check for Parquet files when table doesn't exist
                const parquetFiles = await db.parquetFiles
                  .where('metadataId')
                  .equals(metadataId)
                  .toArray();
                
                if (parquetFiles.length > 0) {
                  console.log(`[ChartDataContext] Found ${parquetFiles.length} Parquet file(s) for metadataId ${metadataId}, loading from Parquet`);
                  const parquetFile = parquetFiles[0];
                  
                  try {
                    const parquetManager = createParquetDataManager(connection);
                    const parquetData = await parquetManager.readParquetData(parquetFile.id!);
                    
                    console.log(`[ChartDataContext] Loaded ${parquetData.length} points from Parquet with time filtering`);
                    
                    // Convert to TimeSeriesData format with parseDuckDBTimestamp
                    const { parseDuckDBTimestamp } = await import('@/lib/utils/duckdbTimestamp');
                    const timeSeriesData: TimeSeriesData[] = parquetData.map((row: unknown) => {
                      const rowObj = row as Record<string, unknown>;
                      return {
                        metadataId: metadataId,
                        timestamp: parseDuckDBTimestamp(rowObj.timestamp as string | number),
                        data: parameterIds ? 
                          Object.fromEntries(parameterIds.map(pid => [pid, rowObj[pid] as number | null ?? null])) :
                          Object.fromEntries(
                            Object.entries(rowObj)
                              .filter(([k]) => k !== 'timestamp')
                              .map(([k, v]) => [k, v as number | null ?? null])
                          )
                      };
                    });
                    
                    // Update parameter tracker
                    if (timeSeriesData.length > 0) {
                      const actualKeys = Object.keys(timeSeriesData[0].data);
                      parameterTracker.addLoadedParameters(metadataId, actualKeys);
                    }
                    
                    return { metadataId, data: timeSeriesData, totalCount: parquetFile.rowCount };
                  } catch (err) {
                    console.error(`[ChartDataContext] Failed to load from Parquet:`, err);
                  }
                }
              }
            }
          } catch (err) {
            console.warn('[ChartDataContext] Failed to load from DuckDB:', err);
          }
        }
        
        // No data available without DuckDB or persisted data
        console.log(`[ChartDataContext] No data available - DuckDB not ready and no persisted data to restore`);
        return { metadataId, data: [], totalCount: 0 };
      }
      
      // For data without time range, use intelligent caching with parameter tracking
      // Always use metadataId as the main cache key
      const cachedData = timeSeriesCache.get(metadataId);
      
      // TEMPORARY: Skip selective loading logic when parameterIds is not provided
      if (cachedData && !parameterIds) {
        // No specific parameters requested, return all cached data
        console.log(`[ChartDataContext] Cache hit (all columns) for metadataId ${metadataId}, data points: ${cachedData.length}`);
        return { metadataId, data: cachedData, totalCount: cachedData.length };
      }
      
      // TEMPORARY: Disable cache for selective column loading to avoid partial data pollution
      if (cachedData && parameterIds) {
        // Skip cache when using selective loading
      }
      
      // OLD CODE - temporarily disabled
      /*if (cachedData && parameterIds) {
        // Check if cached data has all required parameters
        const loadedParams = Array.from(parameterTracker.getLoadedParameters(metadataId));
        const missingParams = parameterTracker.getMissingParameters(metadataId, parameterIds);
        
        console.log(`[ChartDataContext DEBUG] Cache check for metadataId ${metadataId}:`, {
          cachedDataPoints: cachedData.length,
          cachedDataKeys: cachedData.length > 0 ? Object.keys(cachedData[0].data).slice(0, 10) : [],
          requestedParams: parameterIds,
          loadedParams: loadedParams,
          missingParams: missingParams,
          allParamsLoaded: missingParams.length === 0
        });
        
        if (missingParams.length === 0) {
          // All required parameters are already loaded
          console.log(`[ChartDataContext] Cache hit with all parameters for metadataId ${metadataId}`);
          return { metadataId, data: cachedData, totalCount: cachedData.length };
        } else {
          // Some parameters are missing, fetch only the missing ones
          console.log(`[ChartDataContext DEBUG] Fetching missing parameters for metadataId ${metadataId}:`, missingParams);
          const additionalData = await db.getTimeSeriesData(metadataId, undefined, undefined, missingParams);
          
          // Merge additional data with cached data
          // Create a map for faster lookup by timestamp
          const additionalDataMap = new Map<number, Record<string, number | null>>();
          additionalData.forEach(item => {
            additionalDataMap.set(item.timestamp.getTime(), item.data);
          });
          
          console.log(`[ChartDataContext] Merging data: cached=${cachedData.length}, additional=${additionalData.length}`);
          
          // Debug: Check if additional data actually contains the requested parameters
          if (additionalData.length > 0) {
            const sampleData = additionalData[0].data;
            const actualParams = Object.keys(sampleData);
            console.log(`[ChartDataContext] Additional data sample:`, {
              requestedParams: missingParams,
              actualParams: actualParams,
              matches: missingParams.every(p => actualParams.includes(p))
            });
          }
          
          const mergedData = cachedData.map(item => {
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
            } else {
              // If no matching timestamp found, keep original item
              // This could happen if the data was updated between requests
              console.warn(`[ChartDataContext] No matching additional data for timestamp ${item.timestamp.toISOString()}`);
              return item;
            }
          });
          
          // Update tracker and cache
          parameterTracker.addLoadedParameters(metadataId, missingParams);
          timeSeriesCache.set(metadataId, mergedData);
          
          // Debug: Verify merged data contains all parameters
          if (mergedData.length > 0) {
            const mergedSample = mergedData[0].data;
            const mergedKeys = Object.keys(mergedSample);
            const stillMissing = parameterIds.filter(p => !mergedKeys.includes(p));
            
            console.log(`[ChartDataContext DEBUG] Merged data verification:`, {
              totalKeys: mergedKeys.length,
              containsAllRequestedParams: parameterIds.every(p => mergedKeys.includes(p)),
              stillMissingParams: stillMissing.length > 0 ? stillMissing : 'none',
              sampleKeys: mergedKeys.slice(0, 10),
              cacheSizeBefore: cachedData.length,
              cacheSizeAfter: mergedData.length
            });
          }
          
          return { metadataId, data: mergedData, totalCount: mergedData.length };
        }
      }*/
      
      // No cache or first time loading
      console.log(`[ChartDataContext] No cache for metadataId ${metadataId}, calling getTimeSeriesDataSampled with maxPoints: ${maxPointsPerDataset} (${maxPointsPerDataset === undefined ? 'FULL DATA' : 'SAMPLED'})`);
      
      // Check if data exists in DuckDB first
      if (isDuckDBReady && useDuckDB) {
        try {
          const connection = await hybridDataService.getConnection();
          if (connection) {
            const tableName = `timeseries_${metadataId}`;
            
            // Check if table exists
            const tableExists = await connection.query(`
              SELECT COUNT(*) as count 
              FROM information_schema.tables 
              WHERE table_name = '${tableName}'
            `);
            
            if (tableExists.toArray()[0]?.count > 0) {
              console.log(`[ChartDataContext] DuckDB table ${tableName} exists, loading from DuckDB`);
              
              // Load data from DuckDB
              // IMPORTANT: Use all required parameters, not just the ones passed to fetchRawData
              const allParams = parameterIds || [];
              console.log(`[ChartDataContext] Loading from DuckDB with parameters:`, allParams);
              
              const duckdbData = await hybridDataService.sampleData(
                [metadataId],
                allParams,
                maxPointsPerDataset || 10000,
                {
                  method: 'nth'
                }
              );
              
              console.log(`[ChartDataContext] Loaded ${duckdbData.length} points from DuckDB for metadataId ${metadataId}`, {
                requestedParams: allParams,
                sampleDataKeys: duckdbData[0] ? Object.keys(duckdbData[0].data) : []
              });
              
              // Update parameter tracker and cache
              if (duckdbData.length > 0) {
                const actualKeys = Object.keys(duckdbData[0].data);
                console.log(`[ChartDataContext] DuckDB returned data with keys:`, actualKeys);
                parameterTracker.addLoadedParameters(metadataId, actualKeys);
                timeSeriesCache.set(metadataId, duckdbData);
              }
              
              return { metadataId, data: duckdbData, totalCount: duckdbData.length };
            } else {
              // Table doesn't exist - check for persisted data and restore on-demand
              console.log(`[ChartDataContext] DuckDB table ${tableName} doesn't exist, checking for persisted data`);
              
              const persistenceService = createDataPersistenceService(connection);
              const persistenceStatus = await persistenceService.getPersistenceStatus(metadataId);
              
              if (persistenceStatus.isPersisted) {
                console.log(`[ChartDataContext] Found persisted data for metadataId ${metadataId}, restoring on-demand...`);
                
                try {
                  const restoreResult = await persistenceService.restoreTable(metadataId);
                  if (restoreResult.success) {
                    console.log(`[ChartDataContext] Successfully restored ${restoreResult.rowsRestored} rows for metadataId ${metadataId}`);
                    duckDBLoadedData.current.add(metadataId);
                    
                    // Now load the data from the restored table
                    const allParams = parameterIds || [];
                    const duckdbData = await hybridDataService.sampleData(
                      [metadataId],
                      allParams,
                      maxPointsPerDataset || 10000,
                      {
                        method: 'nth'
                      }
                    );
                    
                    // Update parameter tracker and cache
                    if (duckdbData.length > 0) {
                      const actualKeys = Object.keys(duckdbData[0].data);
                      parameterTracker.addLoadedParameters(metadataId, actualKeys);
                      timeSeriesCache.set(metadataId, duckdbData);
                    }
                    
                    return { metadataId, data: duckdbData, totalCount: duckdbData.length };
                  } else {
                    console.error(`[ChartDataContext] Failed to restore persisted data: ${restoreResult.error}`);
                  }
                } catch (err) {
                  console.error(`[ChartDataContext] Error restoring persisted data:`, err);
                }
              }
              
              // Check for Parquet files when table doesn't exist
              const parquetFiles = await db.parquetFiles
                .where('metadataId')
                .equals(metadataId)
                .toArray();
              
              if (parquetFiles.length > 0) {
                console.log(`[ChartDataContext] Found ${parquetFiles.length} Parquet file(s) for metadataId ${metadataId}, loading from Parquet`);
                const parquetFile = parquetFiles[0];
                
                try {
                  const parquetManager = createParquetDataManager(connection);
                  const parquetData = await parquetManager.readParquetData(parquetFile.id!);
                  
                  console.log(`[ChartDataContext] Loaded ${parquetData.length} points from Parquet`);
                  
                  // Convert to TimeSeriesData format with parseDuckDBTimestamp
                  const { parseDuckDBTimestamp } = await import('@/lib/utils/duckdbTimestamp');
                  const timeSeriesData: TimeSeriesData[] = parquetData.map((row: unknown) => {
                    const rowObj = row as Record<string, unknown>;
                    return {
                      metadataId: metadataId,
                      timestamp: parseDuckDBTimestamp(rowObj.timestamp as string | number),
                      data: parameterIds ? 
                        Object.fromEntries(parameterIds.map(pid => [pid, rowObj[pid] as number | null ?? null])) :
                        Object.fromEntries(
                          Object.entries(rowObj)
                            .filter(([k]) => k !== 'timestamp')
                            .map(([k, v]) => [k, v as number | null ?? null])
                        )
                    };
                  });
                  
                  // Update parameter tracker
                  if (timeSeriesData.length > 0) {
                    const actualKeys = Object.keys(timeSeriesData[0].data);
                    parameterTracker.addLoadedParameters(metadataId, actualKeys);
                    timeSeriesCache.set(metadataId, timeSeriesData);
                  }
                  
                  return { metadataId, data: timeSeriesData, totalCount: parquetFile.rowCount };
                } catch (err) {
                  console.error(`[ChartDataContext] Failed to load from Parquet:`, err);
                }
              }
            }
          }
        } catch (err) {
          console.warn('[ChartDataContext] Failed to load from DuckDB:', err);
        }
      }
      
      // No data available without DuckDB
      console.log(`[ChartDataContext] No data available - data needs to be loaded into DuckDB or restored from persisted storage`);
      return { metadataId, data: [], totalCount: 0 };
    });

    const timeSeriesResults = await Promise.all(timeSeriesPromises);
    
    // Create a map of data by metadataId for per-series sampling
    const dataByMetadata = new Map<number, TimeSeriesData[]>();
    const originalCountByMetadata = new Map<number, number>();
    
    timeSeriesResults.forEach(({ metadataId, data, totalCount }) => {
      dataByMetadata.set(metadataId, data);
      originalCountByMetadata.set(metadataId, totalCount || data.length);
    });

    // Also create merged data for backward compatibility
    const timeSeriesArrays = timeSeriesResults.map(r => r.data);
    const mergedTimeSeries = mergeTimeSeriesData(timeSeriesArrays);

    const rawData = {
      timeSeries: mergedTimeSeries,
      dataByMetadata,
      metadata: metadataMap,
      parameters: new Map<string, ParameterInfo>(),
      originalCountByMetadata, // Add original counts
      totalOriginalCount: Array.from(originalCountByMetadata.values()).reduce((sum, count) => sum + count, 0)
    };

    return rawData;
  };

  // Fetch parameter info with caching
  const fetchParameters = async (parameterIds: string[]) => {
    // DataFetchServiceに委譲
    return await dataFetchService.fetchParameters(parameterIds);
  };

  const getChartData = async (config: ChartConfigurationWithData, enableSampling: boolean | SamplingConfig = true, onProgress?: (progress: number) => void): Promise<{
    plotData: ChartPlotData | null;
    dataViewport: ChartViewport | null;
  }> => {
    const startTime = performance.now();
    
    console.log('[ChartDataContext] getChartData called with:', {
      xAxisParameter: config.xAxisParameter,
      yAxisParameters: config.yAxisParameters,
      xAxisMode: config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter',
      selectedDataIds: config.selectedDataIds
    });
    
    const configHash = getConfigHash(config, enableSampling);
    
    // Check if we already have transformed data for this configuration
    const cached = state.chartDataCache.get(configHash);
    if (cached) {
      console.log(`[ChartDataContext] Cache hit for chart "${config.title}" (${performance.now() - startTime}ms)`);
      return {
        plotData: cached.plotData,
        dataViewport: cached.viewport
      };
    }
    
    // Also check transform cache
    const transformCached = transformCache.get<{ plotData: ChartPlotData; viewport: ChartViewport }>(configHash);
    if (transformCached) {
      // Update in-memory cache
      setState(prev => ({
        ...prev,
        chartDataCache: new Map(prev.chartDataCache).set(configHash, transformCached)
      }));
      return {
        plotData: transformCached.plotData,
        dataViewport: transformCached.viewport
      };
    }

    // Use request queue to limit concurrent data fetches
    return requestQueue.enqueue(configHash, async (): Promise<{
      plotData: ChartPlotData | null;
      dataViewport: ChartViewport | null;
    }> => {
      
      try {
      // Report initial progress
      onProgress?.(10);
      
      // Determine required parameter IDs first
      const parameterIds = [
        ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
        ...config.yAxisParameters,
      ];
      
      console.log(`[ChartDataContext] Loading chart "${config.title}" with ${parameterIds.length} parameters`, {
        xAxisMode: config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter',
        xAxisParameter: config.xAxisParameter,
        yAxisParameters: config.yAxisParameters,
        allParameterIds: parameterIds
      });
      
      // Fetch raw data (with caching)
      // Re-enable selective column loading with debug mode
      const fetchStartTime = performance.now();
      
      // Simplified sampling strategy - single stage with DuckDB
      let targetPointsPerDataset: number | undefined;
      
      if (enableSampling === false) {
        // Full mode - no sampling
        targetPointsPerDataset = undefined;
        console.log(`[ChartDataContext] Full mode - no sampling`);
      } else if (typeof enableSampling === 'object') {
        // Resolution-based sampling
        if (!enableSampling.enabled || !enableSampling.targetPoints) {
          targetPointsPerDataset = undefined;
          console.log(`[ChartDataContext] Sampling disabled - full mode`);
        } else {
          targetPointsPerDataset = enableSampling.targetPoints;
          console.log(`[ChartDataContext] Target points: ${targetPointsPerDataset} per dataset`);
        }
      } else if (enableSampling === true) {
        // Default to normal resolution when true is passed
        targetPointsPerDataset = DEFAULT_SAMPLING_CONFIG.targetPoints;
        console.log(`[ChartDataContext] Default sampling: ${targetPointsPerDataset} points per dataset`);
      }
      
      // Fetch full data from IndexedDB - sampling will be done in DuckDB
      const rawData = await fetchRawData(config.selectedDataIds, parameterIds, undefined);
      console.log(`[ChartDataContext] Data fetch for "${config.title}" took ${performance.now() - fetchStartTime}ms (${rawData.timeSeries.length} points)`);
      
      // Debug: Check actual data time ranges from raw data
      const dataByMetadata = new Map<number, { min: Date, max: Date, count: number }>();
      rawData.timeSeries.forEach(item => {
        const existing = dataByMetadata.get(item.metadataId);
        if (!existing) {
          dataByMetadata.set(item.metadataId, { min: item.timestamp, max: item.timestamp, count: 1 });
        } else {
          if (item.timestamp < existing.min) existing.min = item.timestamp;
          if (item.timestamp > existing.max) existing.max = item.timestamp;
          existing.count++;
        }
      });
      
      console.log('[ChartDataContext] Raw data time ranges by metadata:');
      dataByMetadata.forEach((range, metadataId) => {
        const metadata = rawData.metadata.get(metadataId);
        console.log(`  - ${metadata?.label || `ID: ${metadataId}`}: ${range.min.toLocaleString()} to ${range.max.toLocaleString()} (${range.count} points)`);
      });
      
      if (rawData.timeSeries.length === 0) {
        return { plotData: null, dataViewport: null };
      }
      
      // Report progress after data fetch
      onProgress?.(30);
      
      const parameterInfoMap = await fetchParameters(parameterIds);
      
      // Report progress after parameter fetch
      onProgress?.(50);

      // Apply sampling using DuckDB if needed
      let processedTimeSeries = rawData.timeSeries;
      let samplingInfo: SamplingInfo | undefined;
      const originalCount = rawData.totalOriginalCount;
      
      const samplingParameterIds = [
        ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
        ...config.yAxisParameters,
      ];
      
      console.log('[ChartDataContext] Before DuckDB processing:', {
        xAxisMode: config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter',
        xAxisParameter: config.xAxisParameter,
        processedTimeSeriesLength: processedTimeSeries.length,
        samplingParameterIds,
        targetPointsPerDataset
      });
      
      if (targetPointsPerDataset && useDuckDB && isDuckDBReady) {
        console.log(`[ChartDataContext] DuckDB sampling: ${processedTimeSeries.length} → ${targetPointsPerDataset * config.selectedDataIds.length}`);
        const samplingStartTime = performance.now();
        try {
          // Load data to DuckDB with intelligent column tracking
          for (const metadataId of config.selectedDataIds) {
            const dataForMetadata = rawData.dataByMetadata.get(metadataId) || [];
            console.log(`[ChartDataContext] Loading data for metadataId ${metadataId}: ${dataForMetadata.length} rows`);
            
            if (dataForMetadata.length > 0) {
              // Debug: Check the structure of the first data point
              const firstDataPoint = dataForMetadata[0];
              console.log(`[ChartDataContext] First data point for metadataId ${metadataId}:`, {
                timestamp: firstDataPoint.timestamp,
                dataKeys: Object.keys(firstDataPoint.data),
                sampleValues: Object.entries(firstDataPoint.data).slice(0, 3).map(([k, v]) => ({ key: k, value: v }))
              });
              
              // IMPORTANT: Always pass all required parameters (including X-axis parameter)
              // This ensures the DuckDB table has all necessary columns regardless of axis configuration
              const allRequiredParams = [...new Set(parameterIds)]; // Remove duplicates
              console.log(`[ChartDataContext] Loading with all required parameters:`, {
                xAxisMode: config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter',
                xAxisParameter: config.xAxisParameter,
                allRequiredParams,
                samplingParameterIds,
                dataPointsToLoad: dataForMetadata.length
              });
              
              // hybridDataService will now check if columns exist and only add missing ones
              await hybridDataService.loadTimeSeriesData(
                metadataId,
                dataForMetadata,
                allRequiredParams  // Pass ALL required parameters for tracking
              );
              duckDBLoadedData.current.add(metadataId);
            } else {
              // Check if data already exists in DuckDB
              try {
                const connection = await hybridDataService.getConnection();
                if (connection) {
                  const tableName = `timeseries_${metadataId}`;
                  const tableExists = await connection.query(`
                    SELECT COUNT(*) as count 
                    FROM information_schema.tables 
                    WHERE table_name = '${tableName}'
                  `);
                  
                  if (tableExists.toArray()[0]?.count > 0) {
                    console.log(`[ChartDataContext] Data already exists in DuckDB table ${tableName}`);
                    duckDBLoadedData.current.add(metadataId);
                  } else {
                    // Table doesn't exist - check for persisted data and restore on-demand
                    console.log(`[ChartDataContext] DuckDB table ${tableName} doesn't exist, checking for persisted data`);
                    
                    const persistenceService = createDataPersistenceService(connection);
                    const persistenceStatus = await persistenceService.getPersistenceStatus(metadataId);
                    
                    if (persistenceStatus.isPersisted) {
                      console.log(`[ChartDataContext] Found persisted data for metadataId ${metadataId}, restoring on-demand...`);
                      
                      try {
                        const restoreResult = await persistenceService.restoreTable(metadataId);
                        if (restoreResult.success) {
                          console.log(`[ChartDataContext] Successfully restored ${restoreResult.rowsRestored} rows for metadataId ${metadataId}`);
                          duckDBLoadedData.current.add(metadataId);
                        } else {
                          console.error(`[ChartDataContext] Failed to restore persisted data: ${restoreResult.error}`);
                        }
                      } catch (err) {
                        console.error(`[ChartDataContext] Error restoring persisted data:`, err);
                      }
                    }
                    
                    // Check if Parquet file exists in IndexedDB
                    const parquetFiles = await db.parquetFiles
                      .where('metadataId')
                      .equals(metadataId)
                      .toArray();
                    
                    if (parquetFiles.length > 0) {
                      console.log(`[ChartDataContext] Found ${parquetFiles.length} Parquet file(s) for metadataId ${metadataId}`);
                      const parquetFile = parquetFiles[0]; // Use the first file
                      
                      try {
                        // Create a temporary table from Parquet
                        const parquetManager = createParquetDataManager(connection);
                        const parquetData = await parquetManager.readParquetData(parquetFile.id!);
                        
                        console.log(`[ChartDataContext] Loaded ${parquetData.length} points from Parquet for metadataId ${metadataId}`);
                        
                        // Convert Parquet data to TimeSeriesData format
                        const timeSeriesData: TimeSeriesData[] = parquetData.map((row: unknown) => {
                          const rowObj = row as Record<string, unknown>;
                          return {
                            metadataId: metadataId,
                            timestamp: rowObj.timestamp instanceof Date ? rowObj.timestamp : new Date(rowObj.timestamp as string | number),
                            data: parameterIds ? 
                              Object.fromEntries(parameterIds.map(pid => [pid, rowObj[pid] as number | null ?? null])) :
                              Object.fromEntries(
                                Object.entries(rowObj)
                                  .filter(([k]) => k !== 'timestamp')
                                  .map(([k, v]) => [k, v as number | null ?? null])
                              )
                          };
                        });
                        
                        // Continue with normal flow - data will be processed below
                      } catch (err) {
                        console.error(`[ChartDataContext] Failed to load from Parquet:`, err);
                      }
                    }
                    
                    if (!persistenceStatus.isPersisted && parquetFiles.length === 0) {
                      console.log(`[ChartDataContext] No persisted data or Parquet files found - please re-import the CSV data for metadataId ${metadataId}`);
                    }
                  }
                }
              } catch (err) {
                console.warn('[ChartDataContext] Failed to check DuckDB table existence:', err);
              }
            }
          }
          
          console.log(`[ChartDataContext] Sampling with parameters: ${samplingParameterIds.join(', ')}`);
          
          // Perform SQL-based sampling with per-dataset targets
          const pointsPerDataset = Math.floor(targetPointsPerDataset);
          
          console.log('[ChartDataContext] Calling hybridDataService.sampleData with:', {
            xAxisMode: config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter',
            xAxisParameter: config.xAxisParameter,
            parameterIds: samplingParameterIds,
            metadataIds: config.selectedDataIds,
            samplingParameterIds,
            pointsPerDataset
          });
          
          processedTimeSeries = await hybridDataService.sampleData(
            config.selectedDataIds,
            samplingParameterIds,
            pointsPerDataset,
            {
              method: 'nth' // DuckDB supports nth-point and random
            }
          );
          
          console.log('[ChartDataContext] After hybridDataService.sampleData:', {
            xAxisMode: config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter',
            xAxisParameter: config.xAxisParameter,
            returnedPointsCount: processedTimeSeries.length,
            sampleDataPoint: processedTimeSeries[0] ? {
              metadataId: processedTimeSeries[0].metadataId,
              timestamp: processedTimeSeries[0].timestamp,
              dataKeys: Object.keys(processedTimeSeries[0].data),
              dataValues: Object.entries(processedTimeSeries[0].data).slice(0, 3)
            } : null
          });
            
          
          samplingInfo = {
            originalCount,
            sampledCount: processedTimeSeries.length,
            wasSampled: true,
            method: 'duckdb'
          };
          
          console.log(`[ChartDataContext] DuckDB sampling completed: ${originalCount} → ${processedTimeSeries.length} points (${performance.now() - samplingStartTime}ms)`);
        } catch (error) {
          console.error('[ChartDataContext] DuckDB sampling failed:', error);
          // Keep original data if sampling fails
          samplingInfo = {
            originalCount,
            sampledCount: processedTimeSeries.length,
            wasSampled: false,
            method: 'none'
          };
        }
      } else {
        // No sampling needed or DuckDB not available
        samplingInfo = {
          originalCount,
          sampledCount: processedTimeSeries.length,
          wasSampled: false,
          method: 'none'
        };
      }
      
      console.log(`[ChartDataContext] Data ready: ${samplingInfo.sampledCount}/${samplingInfo.originalCount} points (${samplingInfo.method})`);
      
      // Report progress after sampling
      onProgress?.(70);

      // Transform data based on X-axis type
      let chartData: ChartPlotData;

      if (config.xAxisParameter === 'timestamp') {
        console.log('[ChartDataContext] Transforming data for timestamp X-axis:', {
          processedTimeSeriesLength: processedTimeSeries.length,
          yAxisParameters: config.yAxisParameters
        });
        
        // Time-based chart
        const timeChartData = await transformDataForChart(
          processedTimeSeries,
          config.yAxisParameters,
          parameterInfoMap,
          rawData.metadata
        );

        console.log(`[ChartDataContext] Transform complete for "${config.title}":`, {
          seriesCount: timeChartData.series.length,
          firstSeries: timeChartData.series[0] ? {
            parameterId: timeChartData.series[0].parameterId,
            timestampsLength: timeChartData.series[0].timestamps.length,
            valuesLength: timeChartData.series[0].values.length,
            firstTimestamp: timeChartData.series[0].timestamps[0],
            firstValue: timeChartData.series[0].values[0]
          } : null
        });
        
        // Debug: Check if processed time series has data for the requested parameters
        console.log(`[ChartDataContext] Checking processedTimeSeries for chart "${config.title}":`, {
          totalPoints: processedTimeSeries.length,
          requestedParams: config.yAxisParameters,
          samplePoint: processedTimeSeries[0] ? {
            metadataId: processedTimeSeries[0].metadataId,
            timestamp: processedTimeSeries[0].timestamp,
            dataKeys: Object.keys(processedTimeSeries[0].data),
            dataValues: Object.entries(processedTimeSeries[0].data).slice(0, 3)
          } : null
        });

        // Calculate combined Y range
        let combinedYMin = Number.POSITIVE_INFINITY;
        let combinedYMax = Number.NEGATIVE_INFINITY;

        timeChartData.series.forEach(s => {
          const yRange = calculateDataRange(s.values);
          combinedYMin = Math.min(combinedYMin, yRange.min);
          combinedYMax = Math.max(combinedYMax, yRange.max);
        });

        const combinedYRange = { min: combinedYMin, max: combinedYMax };

        // Calculate overall x range from all series
        let overallXMin = Number.POSITIVE_INFINITY;
        let overallXMax = Number.NEGATIVE_INFINITY;
        
        timeChartData.series.forEach(s => {
          if (s.timestamps.length > 0) {
            overallXMin = Math.min(overallXMin, s.timestamps[0]);
            overallXMax = Math.max(overallXMax, s.timestamps[s.timestamps.length - 1]);
          }
        });
        
        const overallXRange = overallXMin < overallXMax 
          ? { min: overallXMin, max: overallXMax }
          : { min: 0, max: 1 };

        chartData = {
          xParameterInfo: null,
          series: timeChartData.series.map(s => {
            const xRange = calculateDataRange(s.timestamps);
            return {
              metadataId: s.metadataId,
              metadataLabel: s.metadataLabel,
              parameterId: s.parameterId,
              parameterInfo: s.parameterInfo,
              xValues: s.timestamps,
              yValues: s.values.map(v => v ?? NaN),
              xRange: overallXRange, // Use overall range instead of individual range
              yRange: combinedYRange,
            };
          }),
          samplingInfo,
        };
      } else {
        console.log('[ChartDataContext] Transforming data for parameter X-axis:', {
          processedTimeSeriesLength: processedTimeSeries.length,
          xAxisParameter: config.xAxisParameter,
          yAxisParameters: config.yAxisParameters
        });
        
        // XY chart
        const xyData = await transformDataForXYChart(
          processedTimeSeries,
          config.xAxisParameter,
          config.yAxisParameters,
          parameterInfoMap,
          rawData.metadata
        );

        // Calculate combined Y range
        let combinedYMin = Number.POSITIVE_INFINITY;
        let combinedYMax = Number.NEGATIVE_INFINITY;

        xyData.series.forEach(s => {
          const yRange = calculateDataRange(s.yValues);
          combinedYMin = Math.min(combinedYMin, yRange.min);
          combinedYMax = Math.max(combinedYMax, yRange.max);
        });

        const combinedYRange = { min: combinedYMin, max: combinedYMax };

        chartData = {
          xParameterInfo: xyData.xParameterInfo,
          series: xyData.series.map(s => {
            const xRange = calculateDataRange(s.xValues);
            return {
              metadataId: s.metadataId,
              metadataLabel: s.metadataLabel,
              parameterId: s.parameterId,
              parameterInfo: s.parameterInfo,
              xValues: s.xValues,
              yValues: s.yValues.map(v => v ?? NaN),
              xRange,
              yRange: combinedYRange,
            };
          }),
          samplingInfo,
        };
      }

      // Calculate viewport
      let dataViewport: ChartViewport | null = null;
      if (chartData.series.length > 0) {
        const validSeries = chartData.series.filter(s => s.xRange && s.yRange);
        if (validSeries.length > 0) {
          const xMin = Math.min(...validSeries.map(s => s.xRange!.min));
          const xMax = Math.max(...validSeries.map(s => s.xRange!.max));
          const yMin = Math.min(...validSeries.map(s => s.yRange!.min));
          const yMax = Math.max(...validSeries.map(s => s.yRange!.max));
          dataViewport = { xMin, xMax, yMin, yMax };
        }
      }

      // Cache the transformed data
      const cacheData = {
        plotData: chartData,
        viewport: dataViewport!
      };
      
      setState(prev => ({
        ...prev,
        chartDataCache: new Map(prev.chartDataCache).set(configHash, cacheData)
      }));
      
      // Also persist to transform cache
      transformCache.set(configHash, cacheData);
      
      // Report final progress
      onProgress?.(90);

      console.log(`[ChartDataContext] Total processing time for "${config.title}": ${performance.now() - startTime}ms`);
      console.log(`[ChartDataContext] Returning data for "${config.title}":`, {
        xAxisMode: config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter',
        xAxisParameter: config.xAxisParameter,
        hasPlotData: !!chartData,
        seriesCount: chartData?.series?.length || 0,
        hasDataViewport: !!dataViewport,
        dataViewport,
        firstSeriesDataLength: chartData?.series?.[0]?.xValues?.length || 0,
        totalProcessedPoints: processedTimeSeries.length,
        originalCount: samplingInfo?.originalCount,
        sampledCount: samplingInfo?.sampledCount
      });

      return { plotData: chartData, dataViewport };
    } catch (error) {
      console.error('Error in getChartData:', error);
      return { plotData: null, dataViewport: null };
    }
    });
  };

  // Preload data for multiple charts with progressive loading
  const preloadChartData = async (configs: ChartConfigurationWithData[], options?: {
    batchSize?: number;
    onProgress?: (loaded: number, total: number) => void;
  }) => {
    const onProgress = options?.onProgress;
    
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Process charts one by one
      for (let i = 0; i < configs.length; i++) {
        const config = configs[i];
        
        console.log(`[ChartDataContext] Loading chart ${i + 1}/${configs.length}`);
        
        // Load data for this chart
        await getChartData(config);
        
        // Update progress
        onProgress?.(i + 1, configs.length);
        
        // Small delay to allow UI updates
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      console.log(`[ChartDataContext] All ${configs.length} charts loaded`);
    } finally {
      setState(prev => ({ ...prev, isLoading: false }));
    }
  };

  const getChartsDataBatch = async (
    configs: ChartConfigurationWithData[],
    options?: {
      enableSampling?: boolean | SamplingConfig;
      onProgress?: (loaded: number, total: number) => void;
    }
  ): Promise<Map<string, { plotData: ChartPlotData | null; dataViewport: ChartViewport | null }>> => {
    const startTime = performance.now();
    const results = new Map<string, { plotData: ChartPlotData | null; dataViewport: ChartViewport | null }>();
    
    if (!configs || configs.length === 0) {
      return results;
    }
    
    console.log(`[ChartDataContext] Starting batch data loading for ${configs.length} charts`);
    
    try {
      // Step 1: Aggregate required parameters
      const aggregator = new ChartParameterAggregator();
      aggregator.collectRequiredParameters(configs);
      
      const stats = aggregator.getStats();
      console.log(`[ChartDataContext] Aggregation stats:`, stats);
      
      // Step 2: Fetch data for each unique metadata ID
      const metadataIds = aggregator.getMetadataIds();
      const dataPromises = metadataIds.map(async metadataId => {
        const requiredParams = aggregator.getRequiredParameters(metadataId);
        
        // Use batch data loader for efficient fetching
        const requestId = `batch-${metadataId}-${Date.now()}`;
        const loadResult = await batchDataLoader.load({
          metadataId,
          parameterIds: requiredParams,
          requestId
        });
        
        return {
          metadataId,
          data: loadResult.data,
          metadata: loadResult.metadata
        };
      });
      
      const dataResults = await Promise.all(dataPromises);
      
      // Create a map for quick access
      const dataByMetadataId = new Map<number, TimeSeriesData[]>();
      const metadataByIdMap = new Map<number, Metadata | undefined>();
      
      dataResults.forEach(result => {
        dataByMetadataId.set(result.metadataId, result.data);
        metadataByIdMap.set(result.metadataId, result.metadata);
      });
      
      // Step 3: Process each chart configuration
      let processedCount = 0;
      
      for (const config of configs) {
        const configHash = getConfigHash(config, options?.enableSampling);
        
        // Check if already cached
        const cached = state.chartDataCache.get(configHash);
        if (cached) {
          // Convert cached format to expected format
          results.set(config.id || configHash, { 
            plotData: cached.plotData, 
            dataViewport: cached.viewport 
          });
          processedCount++;
          options?.onProgress?.(processedCount, configs.length);
          continue;
        }
        
        // Get the data for this chart's metadata IDs
        const chartTimeSeries: TimeSeriesData[] = [];
        config.selectedDataIds.forEach(metadataId => {
          const data = dataByMetadataId.get(metadataId);
          if (data) {
            chartTimeSeries.push(...data);
          }
        });
        
        if (chartTimeSeries.length === 0) {
          results.set(config.id || configHash, { plotData: null, dataViewport: null });
          processedCount++;
          options?.onProgress?.(processedCount, configs.length);
          continue;
        }
        
        // Create metadata map for this chart
        const chartMetadataMap = new Map();
        config.selectedDataIds.forEach(metadataId => {
          const metadata = metadataByIdMap.get(metadataId);
          if (metadata) {
            chartMetadataMap.set(metadataId, {
              label: metadata.label,
              plant: metadata.plant,
              machineNo: metadata.machineNo,
              startTime: metadata.startTime,
              endTime: metadata.endTime,
            });
          }
        });
        
        // Fetch parameters
        const parameterIds = [
          ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
          ...config.yAxisParameters,
        ];
        
        const parameterInfoMap = await fetchParameters(parameterIds);
        
        // No client-side sampling - data is already sampled at DB level
        const processedTimeSeries = chartTimeSeries;
        
        // Transform data for the chart
        let plotData: ChartPlotData | null = null;
        
        if (config.chartType === 'line') {
          // TODO: Update to use new transformDataForChart signature
          // For now, skip transformation in batch mode
          console.warn('[ChartDataContext] Batch mode chart transformation not yet implemented for line charts');
          plotData = null;
        } else if (config.chartType === 'scatter') {
          // TODO: Update to use new transformDataForXYChart signature
          console.warn('[ChartDataContext] Batch mode chart transformation not yet implemented for scatter charts');
          plotData = null;
        }
        
        const dataViewport: ChartViewport | null = null; // TODO: Calculate viewport when transformation is implemented
        
        // Cache the result (skip for now since we're not transforming data)
        // TODO: Re-enable caching when transformation is implemented
        const result = { plotData, dataViewport };
        
        results.set(config.id || configHash, result);
        processedCount++;
        options?.onProgress?.(processedCount, configs.length);
      }
      
      console.log(`[ChartDataContext] Batch processing completed in ${performance.now() - startTime}ms`);
      return results;
      
    } catch (error) {
      console.error('[ChartDataContext] Batch processing error:', error);
      throw error;
    }
  };

  const clearCache = () => {
    setState({
      chartDataCache: new Map(),
      isLoading: false
    });
    // Clear the shared data cache instance once
    dataCache.clear();
  };

  // Clear cache for a specific chart
  const clearChartCache = (configId: string) => {
    console.log(`[ChartDataContext] Clearing cache for chart: ${configId}`);
    
    // Cancel any pending requests for this chart
    // We need to iterate through possible cache keys for this chart
    setState(prev => {
      const newCache = new Map(prev.chartDataCache);
      const keysToDelete: string[] = [];
      
      // Find all cache keys that contain this chart ID
      newCache.forEach((_, key) => {
        if (key.includes(configId)) {
          keysToDelete.push(key);
          // Cancel any pending requests
          requestQueue.cancelRequest(key);
        }
      });
      
      // Delete the cache entries
      keysToDelete.forEach(key => {
        newCache.delete(key);
        // Also clear from transform cache
        // TODO: Add delete method to transformCache
        // transformCache.delete(key);
      });
      
      console.log(`[ChartDataContext] Cleared ${keysToDelete.length} cache entries for chart: ${configId}`);
      
      return {
        ...prev,
        chartDataCache: newCache
      };
    });
    
    // Also clear sampling cache entries related to this chart
    // Clear sampling cache for safety
    hierarchicalSamplingCache.clear();
  };


  const value = useMemo(() => ({
    getChartData,
    preloadChartData,
    getChartsDataBatch,
    clearCache,
    clearChartCache,
    isDuckDBReady,
    useDuckDB
  }), [isDuckDBReady, useDuckDB]);

  return (
    <ChartDataContext.Provider value={value}>
      {children}
    </ChartDataContext.Provider>
  );
}

export function useChartDataContext() {
  const context = useContext(ChartDataContext);
  if (!context) {
    throw new Error('useChartDataContext must be used within ChartDataProvider');
  }
  return context;
}