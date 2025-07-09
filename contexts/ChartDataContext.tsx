'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode, useMemo } from 'react';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { ChartPlotData, ChartViewport } from '@/lib/types/chart';
import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema';
import { db } from '@/lib/db';
import {
  transformDataForChart,
  transformDataForXYChart,
  calculateDataRange,
  mergeTimeSeriesData,
} from '@/lib/utils/chartDataUtils';
import { timeSeriesCache, metadataCache, parameterCache, transformCache } from '@/lib/services/dataCache';
import { sampleTimeSeriesData, DEFAULT_SAMPLING_CONFIG, getProgressiveSamplingConfig, SamplingConfig } from '@/lib/utils/chartDataSampling';

interface ChartDataProviderState {
  // Cache for transformed chart data keyed by configuration hash
  chartDataCache: Map<string, {
    plotData: ChartPlotData;
    viewport: ChartViewport;
  }>;
  // Shared raw data cache
  rawDataCache: Map<string, {
    timeSeries: TimeSeriesData[];
    metadata: any;
    parameters: Map<string, ParameterInfo>;
  }>;
  isLoading: boolean;
}

interface ChartDataContextType {
  getChartData: (config: ChartConfiguration, enableSampling?: boolean | SamplingConfig) => Promise<{
    plotData: ChartPlotData | null;
    dataViewport: ChartViewport | null;
  }>;
  preloadChartData: (configs: ChartConfiguration[], options?: {
    batchSize?: number;
    onProgress?: (loaded: number, total: number) => void;
  }) => Promise<void>;
  clearCache: () => void;
}

const ChartDataContext = createContext<ChartDataContextType | undefined>(undefined);

// Generate a stable hash for chart configuration
function getConfigHash(config: ChartConfiguration, samplingOption: boolean | SamplingConfig = true): string {
  const samplingKey = typeof samplingOption === 'boolean' 
    ? { enabled: samplingOption }
    : {
        enabled: samplingOption.enabled,
        method: samplingOption.method,
        targetPoints: samplingOption.targetPoints,
        preserveExtremes: samplingOption.preserveExtremes
      };
  
  return JSON.stringify({
    xAxisParameter: config.xAxisParameter,
    yAxisParameters: config.yAxisParameters.sort(),
    selectedDataIds: config.selectedDataIds.sort(),
    chartType: config.chartType,
    sampling: samplingKey
  });
}

// Generate a cache key for raw data
function getRawDataKey(metadataIds: number[]): string {
  return metadataIds.sort().join(',');
}

export function ChartDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ChartDataProviderState>({
    chartDataCache: new Map(),
    rawDataCache: new Map(),
    isLoading: false
  });

  // Fetch and cache raw data for given metadata IDs
  const fetchRawData = async (metadataIds: number[]) => {
    const rawDataKey = getRawDataKey(metadataIds);
    
    // Check if we already have this raw data combination
    const cached = state.rawDataCache.get(rawDataKey);
    if (cached) {
      return cached;
    }

    // Fetch time series data in parallel with caching
    const timeSeriesPromises = metadataIds.map(async (metadataId) => {
      const cachedData = timeSeriesCache.get(metadataId);
      if (cachedData) {
        return cachedData;
      }
      
      const data = await db.getTimeSeriesData(metadataId);
      timeSeriesCache.set(metadataId, data);
      return data;
    });

    const timeSeriesArrays = await Promise.all(timeSeriesPromises);
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
      metadata: metadataMap,
      parameters: new Map<string, ParameterInfo>()
    };

    // Cache the raw data
    setState(prev => ({
      ...prev,
      rawDataCache: new Map(prev.rawDataCache).set(rawDataKey, rawData)
    }));

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
      // Fetch raw data (with caching)
      const rawData = await fetchRawData(config.selectedDataIds);
      
      if (rawData.timeSeries.length === 0) {
        return { plotData: null, dataViewport: null };
      }

      // Fetch parameters
      const parameterIds = [
        ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
        ...config.yAxisParameters,
      ];
      
      const parameterInfoMap = await fetchParameters(parameterIds);

      // Apply sampling if enabled and data is large
      let processedTimeSeries = rawData.timeSeries;
      
      const shouldSample = typeof enableSampling === 'boolean' ? enableSampling : enableSampling.enabled;
      
      if (shouldSample) {
        const samplingConfig = typeof enableSampling === 'boolean' 
          ? getProgressiveSamplingConfig(rawData.timeSeries.length)
          : { ...enableSampling, enabled: true };
        
        // Use the first Y-axis parameter for sampling to ensure consistency
        // This prevents different charts from sampling the same data differently
        // due to non-deterministic parameter ordering in Object.keys()
        const samplingParameter = config.yAxisParameters.length > 0 ? config.yAxisParameters[0] : undefined;
        processedTimeSeries = sampleTimeSeriesData(rawData.timeSeries, samplingConfig, samplingParameter);
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

      // Preload all raw data (this is fast with caching)
      await fetchRawData(Array.from(allMetadataIds));

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
      rawDataCache: new Map(),
      isLoading: false
    });
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