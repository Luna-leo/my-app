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
import { dataCache, timeSeriesCache, metadataCache, parameterCache, transformCache, samplingCache } from '@/lib/services/dataCache';
import { sampleTimeSeriesData, sampleTimeSeriesDataByMetadata, DEFAULT_SAMPLING_CONFIG, SamplingConfig, getMemoryAwareSamplingConfig } from '@/lib/utils/chartDataSampling';
import { memoryMonitor } from '@/lib/services/memoryMonitor';
import { hashChartConfig, hashSamplingConfig } from '@/lib/utils/hashUtils';

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

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = maxConcurrent;
  }

  async enqueue<T>(id: string, fn: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.queue.push({
        id,
        execute: fn,
        resolve,
        reject
      });
      this.processQueue();
    });
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
  clearCache: () => void;
}

const ChartDataContext = createContext<ChartDataContextType | undefined>(undefined);

// Generate a stable hash for chart configuration
function getConfigHash(config: ChartConfigurationWithData, samplingOption: boolean | SamplingConfig = true): string {
  const samplingConfig = typeof samplingOption === 'boolean' 
    ? { enabled: samplingOption }
    : samplingOption;
  
  return hashChartConfig({
    id: config.id,
    xAxisParameter: config.xAxisParameter,
    yAxisParameters: config.yAxisParameters,
    selectedDataIds: config.selectedDataIds,
    chartType: config.chartType,
  }, samplingConfig);
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
        setState(prev => ({
          ...prev,
          chartDataCache: new Map()
        }));
      } else if (stats.pressure === 'high') {
        console.warn('[Memory Monitor] High memory pressure detected, clearing sampling cache');
        samplingCache.clear();
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
  const fetchRawData = async (metadataIds: number[]) => {
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
    const timeSeriesPromises = metadataIds.map(async (metadataId) => {
      const metadata = metadataByIdMap.get(metadataId);
      
      // If time range is specified, skip cache (for now)
      if (metadata?.startTime || metadata?.endTime) {
        console.log(`[ChartDataContext] Fetching filtered data for metadataId ${metadataId}:`, {
          startTime: metadata.startTime,
          endTime: metadata.endTime
        });
        const data = await db.getTimeSeriesData(metadataId, metadata.startTime, metadata.endTime);
        console.log(`[ChartDataContext] Filtered data count: ${data.length}`);
        return { metadataId, data };
      }
      
      // For data without time range, use cache as before
      const cachedData = timeSeriesCache.get(metadataId);
      if (cachedData) {
        return { metadataId, data: cachedData };
      }
      
      const data = await db.getTimeSeriesData(metadataId);
      
      // Debug: Check data structure
      if (data.length > 0) {
        console.log(`[ChartDataContext] Sample data point for metadataId ${metadataId}:`, {
          firstPoint: data[0],
          hasData: !!data[0]?.data,
          dataKeys: data[0]?.data ? Object.keys(data[0].data) : []
        });
      }
      
      timeSeriesCache.set(metadataId, data);
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
      console.log(`[ChartDataContext] Queue status - Active: ${requestQueue.getActiveCount()}, Queued: ${requestQueue.getQueueLength()}`);
      
      try {
      // Report initial progress
      onProgress?.(10);
      
      // Fetch raw data (with caching)
      const fetchStartTime = performance.now();
      const rawData = await fetchRawData(config.selectedDataIds);
      console.log(`[ChartDataContext] Data fetch for "${config.title}" took ${performance.now() - fetchStartTime}ms (${rawData.timeSeries.length} points)`);
      
      if (rawData.timeSeries.length === 0) {
        return { plotData: null, dataViewport: null };
      }
      
      // Report progress after data fetch
      onProgress?.(30);

      // Fetch parameters
      const parameterIds = [
        ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
        ...config.yAxisParameters,
      ];
      
      console.log(`[ChartDataContext] Parameter IDs for "${config.title}":`, parameterIds);
      
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
        
        // Check shared sampling cache first
        const samplingCacheKey = getSamplingCacheKey(config.selectedDataIds, samplingConfig);
        const cachedSampledData = samplingCache.get<TimeSeriesData[]>(samplingCacheKey);
        
        if (cachedSampledData) {
          processedTimeSeries = cachedSampledData;
          console.log(`[ChartDataContext] Sampling cache hit for "${config.title}" (${performance.now() - samplingStartTime}ms)`);
        } else {
          // Use the first Y-axis parameter for sampling to ensure consistency
          const samplingParameter = config.yAxisParameters.length > 0 ? config.yAxisParameters[0] : undefined;
          
          // Use per-metadata sampling when multiple series are present
          if (config.selectedDataIds.length > 1) {
            processedTimeSeries = sampleTimeSeriesDataByMetadata(
              rawData.dataByMetadata,
              samplingConfig,
              samplingParameter
            );
          } else {
            // Single series - use regular sampling
            processedTimeSeries = sampleTimeSeriesData(rawData.timeSeries, samplingConfig, samplingParameter);
          }
          
          console.log(`[ChartDataContext] Sampling for "${config.title}" took ${performance.now() - samplingStartTime}ms (${originalCount} → ${processedTimeSeries.length} points)`);
          
          // Cache the sampled data for reuse by other charts
          samplingCache.set(samplingCacheKey, processedTimeSeries);
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

  const clearCache = () => {
    setState({
      chartDataCache: new Map(),
      isLoading: false
    });
    // Clear the shared data cache instance once
    dataCache.clear();
  };


  const value = useMemo(() => ({
    getChartData,
    preloadChartData,
    clearCache
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