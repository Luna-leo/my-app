'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
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
import { parameterTracker } from '@/lib/services/parameterTracker';
import { ChartParameterAggregator } from '@/lib/services/chartParameterAggregator';
import { batchDataLoader } from '@/lib/services/batchDataLoader';
import { incrementalSample } from '@/lib/utils/incrementalSampling';
import { sampleTimeSeriesData, sampleTimeSeriesDataByMetadata, DEFAULT_SAMPLING_CONFIG, SamplingConfig, getMemoryAwareSamplingConfig, PREVIEW_SAMPLING_CONFIG, HIGH_RES_SAMPLING_CONFIG } from '@/lib/utils/chartDataSampling';
import { memoryMonitor } from '@/lib/services/memoryMonitor';
import { hashChartConfig, hashSamplingConfig } from '@/lib/utils/hashUtils';
import { getSimpleWorkerPool } from '@/lib/services/simpleWorkerPool';

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
function getSamplingCacheKey(metadataIds: number[], samplingConfig: SamplingConfig): string {
  return hashSamplingConfig(metadataIds, samplingConfig);
}

// Create a singleton request queue instance
const requestQueue = new RequestQueue(2); // Allow max 2 concurrent requests

export function ChartDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChartDataProviderState>({
    chartDataCache: new Map(),
    isLoading: false
  });

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
  const fetchRawData = async (metadataIds: number[], parameterIds?: string[]) => {
    // Handle empty data case
    if (!metadataIds || metadataIds.length === 0) {
      return {
        timeSeries: [],
        dataByMetadata: new Map(),
        metadata: new Map(),
        parameters: new Map()
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
          startTime: metadata.startTime,
          endTime: metadata.endTime,
          parameterIds: parameterIds?.length || 'all'
        });
        const data = await db.getTimeSeriesData(metadataId, metadata.startTime, metadata.endTime, parameterIds);
        console.log(`[ChartDataContext] Filtered data count: ${data.length}`);
        
        // Update parameter tracker even for time-filtered data
        if (data.length > 0) {
          const actualKeys = data[0]?.data ? Object.keys(data[0].data) : [];
          if (parameterIds) {
            parameterTracker.addLoadedParameters(metadataId, parameterIds);
          } else {
            parameterTracker.addLoadedParameters(metadataId, actualKeys);
          }
        }
        
        return { metadataId, data };
      }
      
      // For data without time range, use intelligent caching with parameter tracking
      // Always use metadataId as the main cache key
      const cachedData = timeSeriesCache.get(metadataId);
      
      // TEMPORARY: Skip selective loading logic when parameterIds is not provided
      if (cachedData && !parameterIds) {
        // No specific parameters requested, return all cached data
        console.log(`[ChartDataContext] Cache hit (all columns) for metadataId ${metadataId}, data points: ${cachedData.length}`);
        return { metadataId, data: cachedData };
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
          return { metadataId, data: cachedData };
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
          
          return { metadataId, data: mergedData };
        }
      }*/
      
      // No cache or first time loading
      
      const data = await db.getTimeSeriesData(metadataId, undefined, undefined, parameterIds);
      
      // Debug: Check data structure
      if (data.length > 0) {
        const actualKeys = data[0]?.data ? Object.keys(data[0].data) : [];
        const requestedKeys = parameterIds || [];
        
        // Check for mismatches
        const missingRequested = requestedKeys.filter(id => !actualKeys.includes(id));
        const unexpectedReturned = actualKeys.filter(key => !requestedKeys.includes(key));
        
        if (missingRequested.length > 0 || unexpectedReturned.length > 0) {
          console.warn(`[ChartDataContext] Parameter mismatch for metadataId ${metadataId}:`, {
            requested: parameterIds,
            missing: missingRequested,
            unexpected: unexpectedReturned.slice(0, 5)
          });
        }
        
        // CRITICAL: Update parameter tracker with ACTUAL keys, not requested ones
        // The database might return different keys than requested
        if (actualKeys.length > 0) {
          parameterTracker.addLoadedParameters(metadataId, actualKeys);
        }
      }
      
      // Only cache full data to prevent partial data pollution
      if (!parameterIds) {
        timeSeriesCache.set(metadataId, data);
      }
      
      return { metadataId, data };
    });

    const timeSeriesResults = await Promise.all(timeSeriesPromises);
    
    // Create a map of data by metadataId for per-series sampling
    const dataByMetadata = new Map<number, TimeSeriesData[]>();
    timeSeriesResults.forEach(({ metadataId, data }) => {
      dataByMetadata.set(metadataId, data);
    });

    // Also create merged data for backward compatibility
    const timeSeriesArrays = timeSeriesResults.map(r => r.data);
    const mergedTimeSeries = mergeTimeSeriesData(timeSeriesArrays);

    const rawData = {
      timeSeries: mergedTimeSeries,
      dataByMetadata,
      metadata: metadataMap,
      parameters: new Map<string, ParameterInfo>()
    };

    return rawData;
  };

  // Fetch parameter info with caching
  const fetchParameters = async (parameterIds: string[]) => {
    const parameterPromises = parameterIds.map(async (parameterId) => {
      const cached = parameterCache.get(parameterId);
      if (cached) {
        return { parameterId, paramInfo: cached };
      }
      
      const paramInfo = await db.parameters
        .where('parameterId')
        .equals(parameterId)
        .first();
      
      if (paramInfo) {
        parameterCache.set(parameterId, paramInfo);
      }
      return { parameterId, paramInfo };
    });

    const results = await Promise.all(parameterPromises);
    const parameterMap = new Map<string, ParameterInfo>();
    results.forEach(({ parameterId, paramInfo }) => {
      if (paramInfo) {
        parameterMap.set(parameterId, paramInfo);
      }
    });
    
    return parameterMap;
  };

  const getChartData = async (config: ChartConfigurationWithData, enableSampling: boolean | SamplingConfig = true, onProgress?: (progress: number) => void) => {
    const startTime = performance.now();
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
    return requestQueue.enqueue(configHash, async () => {
      
      try {
      // Report initial progress
      onProgress?.(10);
      
      // Determine required parameter IDs first
      const parameterIds = [
        ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
        ...config.yAxisParameters,
      ];
      
      console.log(`[ChartDataContext] Loading chart "${config.title}" with ${parameterIds.length} parameters`);
      
      // Fetch raw data (with caching)
      // Re-enable selective column loading with debug mode
      const fetchStartTime = performance.now();
      const rawData = await fetchRawData(config.selectedDataIds, parameterIds); // Load only required columns
      console.log(`[ChartDataContext] Data fetch for "${config.title}" took ${performance.now() - fetchStartTime}ms (${rawData.timeSeries.length} points)`);
      
      if (rawData.timeSeries.length === 0) {
        return { plotData: null, dataViewport: null };
      }
      
      // Report progress after data fetch
      onProgress?.(30);
      
      const parameterInfoMap = await fetchParameters(parameterIds);
      
      // Report progress after parameter fetch
      onProgress?.(50);

      // Apply sampling if enabled and data is large
      let processedTimeSeries = rawData.timeSeries;
      let samplingInfo: SamplingInfo | undefined;
      
      const shouldSample = typeof enableSampling === 'boolean' ? enableSampling : enableSampling.enabled;
      const originalCount = rawData.timeSeries.length;
      
      if (shouldSample) {
        const samplingStartTime = performance.now();
        
        // Get current memory stats for adaptive sampling
        const memoryStats = memoryMonitor.getCurrentStats();
        const currentMemoryMB = memoryStats?.usedMB || 0;
        
        const samplingConfig = typeof enableSampling === 'boolean' 
          ? getMemoryAwareSamplingConfig(rawData.timeSeries.length, currentMemoryMB)
          : { ...enableSampling, enabled: true };
        
        // TEMPORARY: Disable hierarchical sampling cache for selective column loading
        // The cache key doesn't include parameter IDs, causing data mixing issues
        const cachedSampledData = null; // hierarchicalSamplingCache.get(config.selectedDataIds, samplingConfig);
        
        if (cachedSampledData) {
          processedTimeSeries = cachedSampledData;
          console.log(`[ChartDataContext] Hierarchical cache hit for "${config.title}" (${performance.now() - samplingStartTime}ms)`);
        } else {
          // Try to find existing lower resolution data for incremental sampling
          const existingData = null; // hierarchicalSamplingCache.getBestAvailableResolution(
            // config.selectedDataIds, 
            // samplingConfig.targetPoints
          // );
          
          // Use the first Y-axis parameter for sampling to ensure consistency
          const samplingParameter = config.yAxisParameters.length > 0 ? config.yAxisParameters[0] : undefined;
          
          if (existingData) {
            // Incremental sampling disabled temporarily due to cache issues
            // Fall through to full sampling
          }
          
          // Always use full sampling for now
          {
            // No existing data, perform full sampling
            if (config.selectedDataIds.length > 1) {
              // Multiple series - try Worker first, fallback to main thread
              try {
                const workerPool = getSimpleWorkerPool();
                processedTimeSeries = await workerPool.execute({
                  type: 'SAMPLE_DATA',
                  data: {
                    id: `sampling-multi-${config.id}-${Date.now()}`,
                    rawData: [], // For backward compatibility
                    targetPoints: samplingConfig.targetPoints,
                    samplingConfig: {
                      dataByMetadata: Object.fromEntries(rawData.dataByMetadata),
                      samplingConfig: samplingConfig,
                      samplingParameter: samplingParameter
                    }
                  }
                });
                console.log(`[ChartDataContext] Worker sampling for multiple series "${config.title}" took ${performance.now() - samplingStartTime}ms (${originalCount} → ${processedTimeSeries.length} points)`);
              } catch (error) {
                console.warn('[ChartDataContext] Worker sampling failed for multiple series, falling back to main thread:', error);
                processedTimeSeries = sampleTimeSeriesDataByMetadata(
                  rawData.dataByMetadata,
                  samplingConfig,
                  samplingParameter
                );
                console.log(`[ChartDataContext] Fallback sampling for multiple series "${config.title}" took ${performance.now() - samplingStartTime}ms (${originalCount} → ${processedTimeSeries.length} points)`);
              }
            } else {
              // Single series - try Worker first, fallback to main thread
              try {
                const workerPool = getSimpleWorkerPool();
                processedTimeSeries = await workerPool.execute({
                  type: 'SAMPLE_DATA',
                  data: {
                    id: `sampling-${config.id}-${Date.now()}`,
                    rawData: [], // For backward compatibility
                    targetPoints: samplingConfig.targetPoints,
                    samplingConfig: {
                      data: rawData.timeSeries,
                      samplingConfig: samplingConfig,
                      samplingParameter: samplingParameter
                    }
                  }
                });
                console.log(`[ChartDataContext] Worker sampling for "${config.title}" took ${performance.now() - samplingStartTime}ms (${originalCount} → ${processedTimeSeries.length} points)`);
              } catch (error) {
                console.warn('[ChartDataContext] Worker sampling failed, falling back to main thread:', error);
                processedTimeSeries = sampleTimeSeriesData(rawData.timeSeries, samplingConfig, samplingParameter);
                console.log(`[ChartDataContext] Fallback sampling for "${config.title}" took ${performance.now() - samplingStartTime}ms (${originalCount} → ${processedTimeSeries.length} points)`);
              }
            }
          }
          
          // TEMPORARY: Disable caching until parameter IDs are included in cache key
          // hierarchicalSamplingCache.set(config.selectedDataIds, samplingConfig, processedTimeSeries);
        }
        
        // Track sampling info
        const wasSampled = processedTimeSeries.length < originalCount;
        if (wasSampled) {
          samplingInfo = {
            originalCount,
            sampledCount: processedTimeSeries.length,
            wasSampled: true,
            method: samplingConfig.method
          };
        }
      }
      
      // If not sampled but we still want to track the count
      if (!samplingInfo) {
        samplingInfo = {
          originalCount,
          sampledCount: processedTimeSeries.length,
          wasSampled: false
        };
      }
      
      // Report progress after sampling
      onProgress?.(70);

      // Transform data based on X-axis type
      let chartData: ChartPlotData;

      if (config.xAxisParameter === 'timestamp') {
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

        // Calculate combined Y range
        let combinedYMin = Number.POSITIVE_INFINITY;
        let combinedYMax = Number.NEGATIVE_INFINITY;

        timeChartData.series.forEach(s => {
          const yRange = calculateDataRange(s.values);
          combinedYMin = Math.min(combinedYMin, yRange.min);
          combinedYMax = Math.max(combinedYMax, yRange.max);
        });

        const combinedYRange = { min: combinedYMin, max: combinedYMax };

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
              xRange,
              yRange: combinedYRange,
            };
          }),
          samplingInfo,
        };
      } else {
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
        hasPlotData: !!chartData,
        seriesCount: chartData?.series?.length || 0,
        hasDataViewport: !!dataViewport,
        dataViewport,
        firstSeriesDataLength: chartData?.series?.[0]?.xValues?.length || 0
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
        
        // Apply sampling if needed
        let processedTimeSeries = chartTimeSeries;
        const samplingConfig = options?.enableSampling ?? true;
        
        if (samplingConfig && chartTimeSeries.length > DEFAULT_SAMPLING_CONFIG.targetPoints) {
          const actualConfig = typeof samplingConfig === 'boolean' 
            ? getMemoryAwareSamplingConfig(chartTimeSeries.length, memoryMonitor.getCurrentStats()?.usedMB || 0)
            : samplingConfig;
          
          // Try Worker first for sampling
          try {
            const workerPool = getSimpleWorkerPool();
            processedTimeSeries = await workerPool.execute({
              type: 'SAMPLE_DATA',
              data: {
                id: `xy-sampling-${config.id}-${Date.now()}`,
                rawData: [], // For backward compatibility
                targetPoints: actualConfig.targetPoints,
                samplingConfig: {
                  data: chartTimeSeries,
                  samplingConfig: actualConfig,
                  samplingParameter: config.yAxisParameters[0]
                }
              }
            });
          } catch (error) {
            console.warn('[ChartDataContext] Worker sampling failed for XY chart, falling back to main thread:', error);
            processedTimeSeries = sampleTimeSeriesData(chartTimeSeries, actualConfig);
          }
        }
        
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
    // Note: This is a bit tricky as sampling cache uses metadata IDs, not chart IDs
    // For now, we'll clear the entire sampling cache on chart deletion to be safe
    hierarchicalSamplingCache.clear();
  };


  const value = useMemo(() => ({
    getChartData,
    preloadChartData,
    getChartsDataBatch,
    clearCache,
    clearChartCache
  }), []);

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