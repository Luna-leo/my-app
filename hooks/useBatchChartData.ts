import { useEffect, useState, useRef } from 'react';
import { useChartDataContext } from '@/contexts/ChartDataContext';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { ChartPlotData, ChartViewport } from '@/lib/types/chart';
import { SamplingConfig } from '@/lib/utils/chartDataSampling';

interface ChartConfigurationWithData extends ChartConfiguration {
  id: string;
  selectedDataIds: number[];
}

export interface BatchChartDataResult {
  loading: boolean;
  error: Error | null;
  dataMap: Map<string, { plotData: ChartPlotData | null; dataViewport: ChartViewport | null }>;
  progress: { loaded: number; total: number };
}

/**
 * Hook to batch load data for multiple charts efficiently
 */
export function useBatchChartData(
  charts: ChartConfigurationWithData[],
  options?: {
    enabled?: boolean;
    enableSampling?: boolean | SamplingConfig;
    onProgress?: (loaded: number, total: number) => void;
  }
): BatchChartDataResult {
  const { getChartsDataBatch } = useChartDataContext();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [dataMap, setDataMap] = useState<Map<string, { plotData: ChartPlotData | null; dataViewport: ChartViewport | null }>>(new Map());
  const [progress, setProgress] = useState({ loaded: 0, total: 0 });
  
  // Track previous charts to detect changes
  const prevChartsRef = useRef<string>('');
  
  useEffect(() => {
    // Skip if disabled
    if (options?.enabled === false) {
      return;
    }
    
    // Create a stable string representation of charts to detect changes
    const chartsString = JSON.stringify(charts.map(c => ({ 
      id: c.id, 
      xAxisParameter: c.xAxisParameter,
      yAxisParameters: c.yAxisParameters,
      selectedDataIds: c.selectedDataIds,
      chartType: c.chartType
    })));
    
    // Skip if charts haven't changed
    if (chartsString === prevChartsRef.current) {
      return;
    }
    
    prevChartsRef.current = chartsString;
    
    // Skip if no charts
    if (!charts || charts.length === 0) {
      setDataMap(new Map());
      setProgress({ loaded: 0, total: 0 });
      return;
    }
    
    const loadData = async () => {
      console.log(`[useBatchChartData] Loading data for ${charts.length} charts`);
      setLoading(true);
      setError(null);
      setProgress({ loaded: 0, total: charts.length });
      
      try {
        const results = await getChartsDataBatch(charts, {
          enableSampling: options?.enableSampling,
          onProgress: (loaded, total) => {
            setProgress({ loaded, total });
            options?.onProgress?.(loaded, total);
          }
        });
        
        setDataMap(results);
        console.log(`[useBatchChartData] Successfully loaded data for ${results.size} charts`);
      } catch (err) {
        console.error('[useBatchChartData] Error loading chart data:', err);
        setError(err as Error);
      } finally {
        setLoading(false);
      }
    };
    
    loadData();
  }, [charts, getChartsDataBatch, options?.enabled, options?.enableSampling]);
  
  return {
    loading,
    error,
    dataMap,
    progress
  };
}