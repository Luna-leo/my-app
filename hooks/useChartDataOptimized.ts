import { useEffect, useState } from 'react';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { ChartPlotData, ChartLoadingState, PlotlyViewport } from '@/lib/types/plotly';
import { ERROR_MESSAGES } from '@/lib/constants/plotlyConfig';
import { useChartDataContext } from '@/contexts/ChartDataContext';

export function useChartData(config: ChartConfiguration, enableSampling: boolean = true) {
  const [plotData, setPlotData] = useState<ChartPlotData | null>(null);
  const [dataViewport, setDataViewport] = useState<PlotlyViewport | null>(null);
  const [loadingState, setLoadingState] = useState<ChartLoadingState>({
    loading: true,
    progress: 0,
    error: null,
  });

  const { getChartData } = useChartDataContext();

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadingState({ loading: true, progress: 10, error: null });

        // Get data from the shared provider
        const { plotData: data, dataViewport: viewport } = await getChartData(config, enableSampling);
        
        if (!data || !viewport) {
          setLoadingState({ loading: false, progress: 100, error: ERROR_MESSAGES.NO_DATA });
          return;
        }

        setPlotData(data);
        setDataViewport(viewport);
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
  }, [config, getChartData, enableSampling]);

  return { plotData, dataViewport, loadingState };
}