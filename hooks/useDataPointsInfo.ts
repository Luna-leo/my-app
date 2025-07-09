import { useEffect, useState, useMemo } from 'react';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { useChartDataContext } from '@/contexts/ChartDataContext';
import { SamplingConfig } from '@/lib/utils/chartDataSampling';

interface DataPointsInfo {
  original: number;
  sampled: number;
  isLoading: boolean;
}

/**
 * Hook to aggregate data points information across visible charts
 */
export function useDataPointsInfo(
  visibleCharts: (ChartConfiguration & { id: string })[],
  samplingConfig: SamplingConfig
): DataPointsInfo {
  const [dataPointsInfo, setDataPointsInfo] = useState<DataPointsInfo>({
    original: 0,
    sampled: 0,
    isLoading: true,
  });
  const { getChartData } = useChartDataContext();

  // Use debounce to avoid too frequent recalculations
  // Create a stable dependency key without JSON.stringify
  const chartIdsKey = useMemo(() => {
    return visibleCharts.map(c => c.id).sort().join(',');
  }, [visibleCharts]);
  
  const debouncedCharts = useMemo(() => {
    return visibleCharts;
  }, [chartIdsKey]);

  useEffect(() => {
    let isCancelled = false;

    const aggregateDataPoints = async () => {
      setDataPointsInfo(prev => ({ ...prev, isLoading: true }));

      try {
        let totalOriginal = 0;
        let totalSampled = 0;

        // Process charts in parallel for better performance
        const promises = debouncedCharts.map(async (chart) => {
          try {
            const { plotData } = await getChartData(chart, samplingConfig);
            
            if (plotData?.samplingInfo) {
              return {
                original: plotData.samplingInfo.originalCount,
                sampled: plotData.samplingInfo.sampledCount,
              };
            }
            return { original: 0, sampled: 0 };
          } catch (error) {
            console.warn(`Failed to get data for chart ${chart.id}:`, error);
            return { original: 0, sampled: 0 };
          }
        });

        const results = await Promise.all(promises);

        if (!isCancelled) {
          results.forEach(result => {
            totalOriginal += result.original;
            totalSampled += result.sampled;
          });

          setDataPointsInfo({
            original: totalOriginal,
            sampled: totalSampled,
            isLoading: false,
          });
        }
      } catch (error) {
        console.error('Error aggregating data points:', error);
        if (!isCancelled) {
          setDataPointsInfo({
            original: 0,
            sampled: 0,
            isLoading: false,
          });
        }
      }
    };

    // Only aggregate if we have charts
    if (debouncedCharts.length > 0) {
      aggregateDataPoints();
    } else {
      setDataPointsInfo({
        original: 0,
        sampled: 0,
        isLoading: false,
      });
    }

    return () => {
      isCancelled = true;
    };
  }, [debouncedCharts, samplingConfig, getChartData]);

  return dataPointsInfo;
}