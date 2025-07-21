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
import { unifiedCache, cacheInterfaces } from '@/lib/services/unifiedCacheManager';

// Ensure cacheInterfaces is initialized
if (!cacheInterfaces) {
  console.error('[ChartDataContext] cacheInterfaces is not initialized');
}

const { timeSeriesCache, metadataCache, parameterCache, transformCache, samplingCache } = cacheInterfaces || {};
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
import { dataSamplingService } from '@/lib/services/dataSamplingService';
import { chartTransformService } from '@/lib/services/chartTransformService';
import { createLogger } from '@/lib/services/logger';

interface ChartDataProviderState {
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
        if (unifiedCache?.clear) {
          unifiedCache.clear();
        }
        parameterTracker.clear(); // Clear parameter tracking when clearing caches
      } else if (stats.pressure === 'high') {
        console.warn('[Memory Monitor] High memory pressure detected, clearing sampling cache');
        if (unifiedCache?.clear) {
          unifiedCache.clear('sampling');
          unifiedCache.clear('chart');
        }
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


  // Fetch parameter info with caching
  const fetchParameters = async (parameterIds: string[]) => {
    // DataFetchServiceに委譲
    return await dataFetchService.fetchParameters(parameterIds);
  };

  const getChartData = async (config: ChartConfigurationWithData, enableSampling: boolean | SamplingConfig = true, onProgress?: (progress: number) => void): Promise<{
    plotData: ChartPlotData | null;
    dataViewport: ChartViewport | null;
  }> => {
    const timer = logger.startTimer('getChartData');
    
    logger.debug('getChartData called', {
      xAxisParameter: config.xAxisParameter,
      yAxisParameters: config.yAxisParameters,
      selectedDataIds: config.selectedDataIds
    });
    
    const configHash = getConfigHash(config, enableSampling);
    
    // キャッシュチェック
    try {
      if (cacheInterfaces?.chart?.get) {
        const cached = cacheInterfaces.chart.get(configHash);
        if (cached) {
          logger.debug(`Cache hit for chart "${config.title}"`);
          timer();
          return {
            plotData: cached.plotData,
            dataViewport: cached.viewport
          };
        }
      }
    } catch (cacheError) {
      console.warn('[ChartDataContext] Cache access failed, continuing without cache:', cacheError);
    }
    
    try {
      if (transformCache?.get) {
        const transformCached = transformCache.get<{ plotData: ChartPlotData; viewport: ChartViewport }>(configHash);
        if (transformCached) {
          if (cacheInterfaces?.chart?.set) {
            cacheInterfaces.chart.set(configHash, transformCached);
          }
          timer();
          return {
            plotData: transformCached.plotData,
            dataViewport: transformCached.viewport
          };
        }
      }
    } catch (cacheError) {
      console.warn('[ChartDataContext] Transform cache access failed:', cacheError);
    }

    // リクエストキューを使用
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
      
      logger.info(`Loading chart "${config.title}" with ${parameterIds.length} parameters`, {
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

      // Apply sampling using DataSamplingService
      logger.debug('Preparing to sample data', {
        enableSampling,
        originalDataLength: rawData.timeSeries.length,
        selectedDataIds: config.selectedDataIds.length
      });

      const samplingParameterIds = [
        ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
        ...config.yAxisParameters,
      ];

      // Use DataSamplingService for sampling
      const samplingResult = await dataSamplingService.sampleData(
        rawData.timeSeries,
        rawData.dataByMetadata,
        config.selectedDataIds,
        samplingParameterIds,
        {
          enableSampling,
          targetPointsPerDataset: targetPointsPerDataset,
          maxPointsPerDataset: targetPointsPerDataset,
          useWorker: true,
          useDuckDB: targetPointsPerDataset !== undefined && useDuckDB && isDuckDBReady
        }
      );

      let processedTimeSeries = samplingResult.timeSeries;
      let samplingInfo = samplingResult.samplingInfo;
      const originalCount = rawData.totalOriginalCount;

      // Handle DuckDB data loading if needed
      if (targetPointsPerDataset && useDuckDB && isDuckDBReady) {
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
                      logger.info(`Found ${parquetFiles.length} Parquet file(s) for metadataId ${metadataId}`);
                      const parquetFile = parquetFiles[0]; // Use the first file
                      
                      try {
                        // Create a temporary table from Parquet
                        const parquetManager = createParquetDataManager(connection);
                        const parquetData = await parquetManager.readParquetData(parquetFile.id!);
                        
                        logger.info(`Loaded ${parquetData.length} points from Parquet for metadataId ${metadataId}`);
                        
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
                        logger.error('Failed to load from Parquet', err);
                      }
                    }
                    
                    if (!persistenceStatus.isPersisted && parquetFiles.length === 0) {
                      logger.warn(`No persisted data or Parquet files found - please re-import the CSV data for metadataId ${metadataId}`);
                    }
                  }
                }
              } catch (err) {
                logger.warn('Failed to check DuckDB table existence', err);
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
      }
      
      logger.info('Sampling completed', {
        originalCount: samplingInfo.originalCount,
        sampledCount: samplingInfo.sampledCount,
        method: samplingInfo.method,
        wasSampled: samplingInfo.wasSampled
      });
      
      // Report progress after sampling
      onProgress?.(70);

      // Transform data using ChartTransformService
      logger.debug('Starting data transformation', {
        xAxisParameter: config.xAxisParameter,
        yAxisParameters: config.yAxisParameters,
        chartType: config.chartType
      });

      const transformResult = await chartTransformService.transformData(
        processedTimeSeries,
        {
          xAxisParameter: config.xAxisParameter,
          yAxisParameters: config.yAxisParameters,
          chartType: config.chartType
        },
        parameterInfoMap,
        rawData.metadata,
        samplingInfo
      );

      const chartData = transformResult.plotData;
      const dataViewport = transformResult.viewport;

      logger.debug('Transformation completed', {
        seriesCount: chartData.series.length,
        hasViewport: !!dataViewport
      });

      // Cache the transformed data
      const cacheData = {
        plotData: chartData,
        viewport: dataViewport!
      };
      
      // Store in unified cache
      try {
        if (cacheInterfaces?.chart?.set) {
          cacheInterfaces.chart.set(configHash, cacheData);
        }
        if (transformCache?.set) {
          transformCache.set(configHash, cacheData);
        }
      } catch (cacheError) {
        console.warn('[ChartDataContext] Failed to store in cache:', cacheError);
      }
      
      // Report final progress
      onProgress?.(90);

      timer();
      
      logger.info(`Processing completed for "${config.title}"`, {
        xAxisMode: config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter',
        xAxisParameter: config.xAxisParameter,
        seriesCount: chartData?.series?.length || 0,
        totalProcessedPoints: processedTimeSeries.length,
        originalCount: samplingInfo?.originalCount,
        sampledCount: samplingInfo?.sampledCount
      });

      return { plotData: chartData, dataViewport };
    } catch (error) {
      logger.error('Error in getChartData', error);
      timer();
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
        try {
          if (cacheInterfaces?.chart?.get) {
            const cached = cacheInterfaces.chart.get(configHash);
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
          }
        } catch (cacheError) {
          console.warn('[ChartDataContext] Batch cache access failed:', cacheError);
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
      isLoading: false
    });
    // Clear the unified cache
    if (unifiedCache?.clear) {
      unifiedCache.clear();
    }
  };

  // Clear cache for a specific chart
  const clearChartCache = (configId: string) => {
    console.log(`[ChartDataContext] Clearing cache for chart: ${configId}`);
    
    // Cancel any pending requests for this chart
    // Clear chart cache entries that contain this chart ID
    const stats = unifiedCache.getStats();
    
    // Note: We'd need to add a method to iterate cache keys in unifiedCache
    // For now, we'll clear all chart and transform caches for safety
    if (unifiedCache?.clear) {
      unifiedCache.clear('chart');
      unifiedCache.clear('transform');
      unifiedCache.clear('sampling');
    }
    
    console.log(`[ChartDataContext] Cleared cache entries for chart: ${configId}`);
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