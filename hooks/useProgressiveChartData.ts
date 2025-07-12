import { useEffect, useState, useRef, useCallback } from 'react';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { ChartPlotData, ChartLoadingState, ChartViewport } from '@/lib/types/chart';
import { useChartDataContext } from '@/contexts/ChartDataContext';
import { 
  SamplingConfig, 
  PREVIEW_SAMPLING_CONFIG, 
  DEFAULT_SAMPLING_CONFIG,
  HIGH_RES_SAMPLING_CONFIG 
} from '@/lib/utils/chartDataSampling';
import { getSimpleWorkerPool } from '@/lib/services/simpleWorkerPool';

export type DataResolution = 'preview' | 'normal' | 'high' | 'full';

interface ProgressiveChartDataState {
  plotData: ChartPlotData | null;
  dataViewport: ChartViewport | null;
  loadingState: ChartLoadingState;
  resolution: DataResolution;
}

interface UseProgressiveChartDataOptions {
  initialResolution?: DataResolution;
  autoUpgrade?: boolean;
  upgradeDelay?: number;
  onResolutionChange?: (resolution: DataResolution) => void;
}

const RESOLUTION_CONFIGS: Record<DataResolution, SamplingConfig | false> = {
  preview: PREVIEW_SAMPLING_CONFIG,
  normal: DEFAULT_SAMPLING_CONFIG,
  high: HIGH_RES_SAMPLING_CONFIG,
  full: false // No sampling
};

export function useProgressiveChartData(
  config: ChartConfiguration,
  selectedDataIds: number[],
  options: UseProgressiveChartDataOptions = {}
) {
  const {
    initialResolution = 'preview',
    autoUpgrade = true,
    upgradeDelay = 1000,
    onResolutionChange
  } = options;

  const [state, setState] = useState<ProgressiveChartDataState>({
    plotData: null,
    dataViewport: null,
    loadingState: { loading: true, progress: 0, error: null },
    resolution: initialResolution
  });

  const { getChartData } = useChartDataContext();
  const upgradeTimeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const isMountedRef = useRef(true);
  const currentResolutionRef = useRef(initialResolution);

  // Load data at specific resolution
  const loadDataAtResolution = useCallback(async (resolution: DataResolution) => {
    try {
      setState(prev => ({
        ...prev,
        loadingState: { loading: true, progress: 0, error: null }
      }));

      const samplingConfig = RESOLUTION_CONFIGS[resolution];
      
      const configWithData = {
        ...config,
        selectedDataIds
      };

      const { plotData, dataViewport } = await getChartData(
        configWithData,
        samplingConfig,
        (progress) => {
          if (isMountedRef.current) {
            setState(prev => ({
              ...prev,
              loadingState: { ...prev.loadingState, progress }
            }));
          }
        }
      );

      if (isMountedRef.current) {
        setState({
          plotData,
          dataViewport,
          loadingState: { loading: false, progress: 100, error: null },
          resolution
        });
        
        currentResolutionRef.current = resolution;
        onResolutionChange?.(resolution);
      }
    } catch (error) {
      if (isMountedRef.current) {
        setState(prev => ({
          ...prev,
          loadingState: {
            loading: false,
            progress: 100,
            error: error instanceof Error ? error.message : 'Failed to load data'
          }
        }));
      }
    }
  }, [config, selectedDataIds, getChartData, onResolutionChange]);

  // Schedule resolution upgrade
  const scheduleUpgrade = useCallback((fromResolution: DataResolution) => {
    if (!autoUpgrade) return;

    const resolutionOrder: DataResolution[] = ['preview', 'normal', 'high'];
    const currentIndex = resolutionOrder.indexOf(fromResolution);
    
    if (currentIndex < resolutionOrder.length - 1) {
      const nextResolution = resolutionOrder[currentIndex + 1];
      
      upgradeTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          loadDataAtResolution(nextResolution).then(() => {
            // Schedule next upgrade if not at highest resolution
            if (nextResolution !== 'high') {
              scheduleUpgrade(nextResolution);
            }
          });
        }
      }, upgradeDelay);
    }
  }, [autoUpgrade, upgradeDelay, loadDataAtResolution]);

  // Manual resolution change
  const setResolution = useCallback((resolution: DataResolution) => {
    // Cancel any pending upgrades
    if (upgradeTimeoutRef.current) {
      clearTimeout(upgradeTimeoutRef.current);
    }

    // Only load if resolution actually changed
    if (currentResolutionRef.current !== resolution) {
      loadDataAtResolution(resolution);
    }
  }, [loadDataAtResolution]);

  // Initial load and auto-upgrade
  useEffect(() => {
    loadDataAtResolution(initialResolution).then(() => {
      scheduleUpgrade(initialResolution);
    });

    return () => {
      isMountedRef.current = false;
      if (upgradeTimeoutRef.current) {
        clearTimeout(upgradeTimeoutRef.current);
      }
    };
  }, [config, selectedDataIds]); // Intentionally not including all deps to prevent re-runs

  return {
    ...state,
    setResolution,
    isUpgrading: state.resolution !== 'high' && autoUpgrade
  };
}

// Hook for viewport-based resolution
export function useViewportBasedResolution(
  config: ChartConfiguration,
  selectedDataIds: number[],
  viewportWidth?: number
) {
  const getOptimalResolution = useCallback((width?: number): DataResolution => {
    if (!width) return 'preview';
    
    // Adjust resolution based on viewport width
    if (width < 400) return 'preview';
    if (width < 800) return 'normal';
    return 'high';
  }, []);

  const progressiveData = useProgressiveChartData(config, selectedDataIds, {
    initialResolution: getOptimalResolution(viewportWidth),
    autoUpgrade: true,
    upgradeDelay: 500
  });

  // Update resolution when viewport changes
  useEffect(() => {
    const optimalResolution = getOptimalResolution(viewportWidth);
    if (progressiveData.resolution !== optimalResolution) {
      progressiveData.setResolution(optimalResolution);
    }
  }, [viewportWidth, getOptimalResolution, progressiveData]);

  return progressiveData;
}