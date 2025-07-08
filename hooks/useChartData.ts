import { useEffect, useState } from 'react';
import { db } from '@/lib/db';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema';
import {
  transformDataForChart,
  transformDataForXYChart,
  calculateDataRange,
  mergeTimeSeriesData,
} from '@/lib/utils/chartDataUtils';
import { ChartPlotData, ChartLoadingState, PlotlyViewport } from '@/lib/types/plotly';
import { ERROR_MESSAGES } from '@/lib/constants/plotlyConfig';
import { timeSeriesCache, metadataCache, parameterCache } from '@/lib/services/dataCache';

export function useChartData(config: ChartConfiguration) {
  const [plotData, setPlotData] = useState<ChartPlotData | null>(null);
  const [dataViewport, setDataViewport] = useState<PlotlyViewport | null>(null);
  const [loadingState, setLoadingState] = useState<ChartLoadingState>({
    loading: true,
    progress: 0,
    error: null,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingState({ loading: true, progress: 10, error: null });

        // Load all time series data for selected metadata with caching
        const dataArrays: TimeSeriesData[][] = [];
        const totalSteps = config.selectedDataIds.length + 3;
        let currentStep = 0;

        // Batch check cache and fetch missing data
        const timeSeriesPromises = config.selectedDataIds.map(async (metadataId) => {
          // Check cache first
          const cachedData = timeSeriesCache.get(metadataId);
          if (cachedData) {
            return { metadataId, data: cachedData, fromCache: true };
          }
          
          // Fetch from DB if not cached
          const data = await db.getTimeSeriesData(metadataId);
          // Cache the fetched data
          timeSeriesCache.set(metadataId, data);
          return { metadataId, data, fromCache: false };
        });

        const results = await Promise.all(timeSeriesPromises);
        results.forEach(({ data }) => {
          dataArrays.push(data);
          currentStep++;
          setLoadingState(prev => ({ ...prev, progress: (currentStep / totalSteps) * 100 }));
        });

        // Merge all data
        const mergedData = mergeTimeSeriesData(dataArrays);
        if (mergedData.length === 0) {
          setLoadingState({ loading: false, progress: 100, error: ERROR_MESSAGES.NO_DATA });
          return;
        }

        // Load metadata info with caching
        const metadataMap = new Map<number, { label?: string; plant: string; machineNo: string }>();
        const metadataPromises = config.selectedDataIds.map(async (metadataId) => {
          // Check cache first
          const cached = metadataCache.get(metadataId);
          if (cached) {
            return { metadataId, metadata: cached };
          }
          
          // Fetch from DB if not cached
          const metadata = await db.metadata.get(metadataId);
          if (metadata) {
            metadataCache.set(metadataId, metadata);
          }
          return { metadataId, metadata };
        });

        const metadataResults = await Promise.all(metadataPromises);
        metadataResults.forEach(({ metadataId, metadata }) => {
          if (metadata) {
            metadataMap.set(metadataId, {
              label: metadata.label,
              plant: metadata.plant,
              machineNo: metadata.machineNo,
            });
          }
        });

        // Load parameter info
        const parameterIds = [
          ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
          ...config.yAxisParameters,
        ];

        const parameterInfoMap = new Map<string, ParameterInfo>();
        const parameterPromises = parameterIds.map(async (parameterId) => {
          // Check cache first
          const cached = parameterCache.get(parameterId);
          if (cached) {
            return { parameterId, paramInfo: cached };
          }
          
          // Fetch from DB if not cached
          const paramInfo = await db.parameters
            .where('parameterId')
            .equals(parameterId)
            .first();
          
          if (paramInfo) {
            parameterCache.set(parameterId, paramInfo);
          }
          return { parameterId, paramInfo };
        });

        const paramResults = await Promise.all(parameterPromises);
        paramResults.forEach(({ parameterId, paramInfo }) => {
          if (paramInfo) {
            parameterInfoMap.set(parameterId, paramInfo);
          }
        });
        currentStep++;
        setLoadingState(prev => ({ ...prev, progress: (currentStep / totalSteps) * 100 }));

        // Transform data based on X-axis type
        let chartData: ChartPlotData;

        if (config.xAxisParameter === 'timestamp') {
          // Time-based chart
          const timeChartData = await transformDataForChart(
            mergedData,
            config.yAxisParameters,
            parameterInfoMap,
            metadataMap
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
            mergedData,
            config.xAxisParameter,
            config.yAxisParameters,
            parameterInfoMap,
            metadataMap
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

        setPlotData(chartData);

        // Set initial viewport
        if (chartData.series.length > 0) {
          const xMin = Math.min(...chartData.series.map(s => s.xRange.min));
          const xMax = Math.max(...chartData.series.map(s => s.xRange.max));
          const yMin = Math.min(...chartData.series.map(s => s.yRange.min));
          const yMax = Math.max(...chartData.series.map(s => s.yRange.max));
          setDataViewport({ xMin, xMax, yMin, yMax });
        }

        currentStep++;
        setLoadingState({ loading: false, progress: 100, error: null });
      } catch (err) {
        console.error('Error loading chart data:', err);
        setLoadingState({
          loading: false,
          progress: 100,
          error: err instanceof Error ? err.message : ERROR_MESSAGES.DATA_LOAD_FAILED,
        });
      }
    };

    loadData();
  }, [config]);

  return { plotData, dataViewport, loadingState };
}