'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { ChartPlotData, ChartViewport, SamplingInfo } from '@/lib/types/chart';
import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema';
import { db } from '@/lib/db';
import {
  transformDataForChart,
  transformDataForXYChart,
  calculateDataRange,
  mergeTimeSeriesData,
} from '@/lib/utils/chartDataUtils';
import { dataCache, timeSeriesCache, metadataCache, parameterCache, transformCache, samplingCache } from '@/lib/services/dataCache';
import { sampleTimeSeriesData, sampleTimeSeriesDataByMetadata, DEFAULT_SAMPLING_CONFIG, getProgressiveSamplingConfig, SamplingConfig, getMemoryAwareSamplingConfig } from '@/lib/utils/chartDataSampling';
import { memoryMonitor } from '@/lib/services/memoryMonitor';
import { hashChartConfig, hashSamplingConfig } from '@/lib/utils/hashUtils';
import { StreamingDataPipeline } from '@/lib/utils/streamingDataUtils';

interface ChartDataProviderState {
  // Cache for transformed chart data keyed by configuration hash
  chartDataCache: Map<string, {
    plotData: ChartPlotData;
    viewport: ChartViewport;
  }>;
  isLoading: boolean;
}

interface ChartDataContextType {
  getChartData: (config: ChartConfiguration, enableSampling?: boolean | SamplingConfig) => Promise<{
    plotData: ChartPlotData | null;
    dataViewport: ChartViewport | null;
  }>;
  getChartDataStream?: (config: ChartConfiguration, options?: {
    enableSampling?: boolean | SamplingConfig;
    chunkSize?: number;
    onChunk?: (chunk: ChartPlotData) => void;
    onProgress?: (processed: number) => void;
  }) => Promise<AsyncGenerator<ChartPlotData, void>>;
  preloadChartData: (configs: ChartConfiguration[], options?: {
    batchSize?: number;
    onProgress?: (loaded: number, total: number) => void;
  }) => Promise<void>;
  clearCache: () => void;
}

const ChartDataContext = createContext<ChartDataContextType | undefined>(undefined);

// Generate a stable hash for chart configuration
function getConfigHash(config: ChartConfiguration, samplingOption: boolean | SamplingConfig = true): string {
  const samplingConfig = typeof samplingOption === 'boolean' 
    ? { enabled: samplingOption }
    : samplingOption;
  
  return hashChartConfig({
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
  const fetchRawData = async (metadataIds: number[], samplingConfig?: SamplingConfig) => {

    // Fetch time series data in parallel with caching
    const timeSeriesPromises = metadataIds.map(async (metadataId) => {
      // Check cache only if not sampling (sampling uses different cache key)
      if (!samplingConfig?.enabled) {
        const cachedData = timeSeriesCache.get(metadataId);
        if (cachedData) {
          return { metadataId, data: cachedData };
        }
      }
      
      // Apply database-level sampling if enabled
      const data = await db.getTimeSeriesData(
        metadataId,
        undefined, // startTime
        undefined, // endTime
        samplingConfig?.enabled ? {
          enabled: true,
          targetPoints: Math.ceil(samplingConfig.targetPoints / metadataIds.length), // Distribute points across series
          method: 'nth' // Use nth sampling at DB level for consistency
        } : undefined
      );
      
      // Cache only if not sampling (sampled data has different requirements)
      if (!samplingConfig?.enabled) {
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

    // Fetch metadata in parallel
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
    metadataResults.forEach(({ metadataId, metadata }) => {
      if (metadata) {
        metadataMap.set(metadataId, {
          label: metadata.label,
          plant: metadata.plant,
          machineNo: metadata.machineNo,
        });
      }
    });

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

  const getChartData = async (config: ChartConfiguration, enableSampling: boolean | SamplingConfig = true) => {
    const configHash = getConfigHash(config, enableSampling);
    
    // Check if we already have transformed data for this configuration
    const cached = state.chartDataCache.get(configHash);
    if (cached) {
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

    try {
      // Determine sampling config before fetching data
      const shouldSample = typeof enableSampling === 'boolean' ? enableSampling : enableSampling.enabled;
      let samplingConfig: SamplingConfig | undefined;
      
      if (shouldSample) {
        // Get current memory stats for adaptive sampling
        const memoryStats = memoryMonitor.getCurrentStats();
        const currentMemoryMB = memoryStats?.usedMB || 0;
        
        // Get estimated data size first (we can improve this with metadata)
        const estimatedDataPoints = config.selectedDataIds.length * 32000; // Assuming worst case
        
        samplingConfig = typeof enableSampling === 'boolean' 
          ? getMemoryAwareSamplingConfig(estimatedDataPoints, currentMemoryMB)
          : { ...enableSampling, enabled: true };
      }
      
      // Fetch raw data with database-level sampling if enabled
      const rawData = await fetchRawData(config.selectedDataIds, samplingConfig);
      
      if (rawData.timeSeries.length === 0) {
        return { plotData: null, dataViewport: null };
      }

      // Fetch parameters
      const parameterIds = [
        ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
        ...config.yAxisParameters,
      ];
      
      const parameterInfoMap = await fetchParameters(parameterIds);

      // Data is already sampled at database level if sampling was enabled
      let processedTimeSeries = rawData.timeSeries;
      let samplingInfo: SamplingInfo | undefined;
      
      // Track sampling info if database-level sampling was applied
      if (samplingConfig?.enabled) {
        // Estimate original count based on target points and series count
        const estimatedOriginalCount = samplingConfig.targetPoints * 10; // Rough estimate
        
        samplingInfo = {
          originalCount: estimatedOriginalCount,
          sampledCount: processedTimeSeries.length,
          wasSampled: true,
          method: 'nth' // Database uses nth sampling
        };
        
        console.log(`[ChartDataContext] Database-level sampling applied: ~${estimatedOriginalCount} → ${processedTimeSeries.length} points`);
      } else {
        // No sampling applied
        samplingInfo = {
          originalCount: processedTimeSeries.length,
          sampledCount: processedTimeSeries.length,
          wasSampled: false
        };
      }

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

      return { plotData: chartData, dataViewport };
    } catch (error) {
      console.error('Error in getChartData:', error);
      return { plotData: null, dataViewport: null };
    }
  };

  // Preload data for multiple charts with progressive loading
  const preloadChartData = async (configs: ChartConfiguration[], options?: {
    batchSize?: number;
    onProgress?: (loaded: number, total: number) => void;
  }) => {
    const batchSize = options?.batchSize || 4; // Load 4 charts at a time
    const onProgress = options?.onProgress;
    
    setState(prev => ({ ...prev, isLoading: true }));

    try {
      // Collect all unique metadata IDs
      const allMetadataIds = new Set<number>();
      configs.forEach(config => {
        config.selectedDataIds.forEach(id => allMetadataIds.add(id));
      });

      // Get memory stats for sampling decision
      const memoryStats = memoryMonitor.getCurrentStats();
      const currentMemoryMB = memoryStats?.usedMB || 0;
      
      // Estimate total data points and apply sampling if needed
      const estimatedTotalPoints = allMetadataIds.size * 32000;
      const samplingConfig = getMemoryAwareSamplingConfig(estimatedTotalPoints, currentMemoryMB);
      
      // Preload all raw data with sampling (this prevents OOM)
      await fetchRawData(Array.from(allMetadataIds), samplingConfig);

      // Collect all unique parameter IDs
      const allParameterIds = new Set<string>();
      configs.forEach(config => {
        if (config.xAxisParameter !== 'timestamp') {
          allParameterIds.add(config.xAxisParameter);
        }
        config.yAxisParameters.forEach(p => allParameterIds.add(p));
      });

      // Preload all parameters (this is also fast with caching)
      await fetchParameters(Array.from(allParameterIds));

      // Progressive loading: Process charts in batches
      let loaded = 0;
      for (let i = 0; i < configs.length; i += batchSize) {
        const batch = configs.slice(i, Math.min(i + batchSize, configs.length));
        
        // Process batch in parallel
        await Promise.all(batch.map(config => getChartData(config)));
        
        loaded += batch.length;
        onProgress?.(loaded, configs.length);
        
        // Small delay to prevent UI blocking
        if (i + batchSize < configs.length) {
          await new Promise(resolve => setTimeout(resolve, 10));
        }
      }
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

  // Streaming implementation for large datasets
  const getChartDataStream = async (
    config: ChartConfiguration,
    options?: {
      enableSampling?: boolean | SamplingConfig;
      chunkSize?: number;
      onChunk?: (chunk: ChartPlotData) => void;
      onProgress?: (processed: number) => void;
    }
  ): Promise<AsyncGenerator<ChartPlotData, void>> => {
    const chunkSize = options?.chunkSize || 10000;
    
    // Return async generator
    async function* generateStream(): AsyncGenerator<ChartPlotData, void> {
      // Use streaming API to fetch data
      let processedCount = 0;
      for await (const chunk of db.streamMultipleTimeSeriesData(config.selectedDataIds, { chunkSize })) {
        // Apply sampling if needed
        let processedChunk = chunk;
        if (options?.enableSampling) {
          const samplingConfig = typeof options.enableSampling === 'boolean' 
            ? DEFAULT_SAMPLING_CONFIG 
            : options.enableSampling;
          
          // Use regular sampling on chunks
          processedChunk = sampleTimeSeriesData(chunk, samplingConfig);
        }
        
        // Transform chunk to chart data (simplified)
        const chartData: ChartPlotData = {
          xParameterInfo: null,
          series: [], // TODO: Transform chunk to series
          samplingInfo: {
            originalCount: chunk.length,
            sampledCount: processedChunk.length,
            wasSampled: processedChunk.length < chunk.length
          }
        };
        
        processedCount += chunk.length;
        options?.onProgress?.(processedCount);
        options?.onChunk?.(chartData);
        
        yield chartData;
      }
    }
    
    return generateStream();
  };

  const value = useMemo(() => ({
    getChartData,
    getChartDataStream,
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