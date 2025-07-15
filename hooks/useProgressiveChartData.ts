import { useEffect, useState, useRef, useCallback } from 'react';
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog';
import { ChartPlotData, ChartLoadingState, ChartViewport } from '@/lib/types/chart';
import { useChartDataContext, DB_SAMPLING_CONFIG } from '@/contexts/ChartDataContext';
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
  maxAutoUpgradeResolution?: DataResolution; // Maximum resolution for auto-upgrade
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
    maxAutoUpgradeResolution = 'high', // Default to 'high' for backward compatibility
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
  const isManualChangeRef = useRef(false);

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


      // Check if we got null data (which might indicate an error)
      if (!plotData && !dataViewport) {
        console.warn(`[useProgressiveChartData] Received null data for chart "${config.title}" - this might indicate an error in data fetching`);
      }

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
  }, [config.id, config.title, config.chartType, config.xAxisParameter, config.yAxisParameters.join(','), selectedDataIds.join(','), getChartData, onResolutionChange]);

  // Schedule resolution upgrade
  const scheduleUpgrade = useCallback((fromResolution: DataResolution) => {
    if (!autoUpgrade) return;

    const resolutionOrder: DataResolution[] = ['preview', 'normal', 'high'];
    const currentIndex = resolutionOrder.indexOf(fromResolution);
    const maxIndex = resolutionOrder.indexOf(maxAutoUpgradeResolution);
    
    // Don't upgrade beyond the maximum allowed resolution
    if (currentIndex < resolutionOrder.length - 1 && currentIndex < maxIndex) {
      const nextResolution = resolutionOrder[currentIndex + 1];
      
      upgradeTimeoutRef.current = setTimeout(() => {
        if (isMountedRef.current) {
          loadDataAtResolution(nextResolution).then(() => {
            // Schedule next upgrade if not at maximum allowed resolution
            if (nextResolution !== maxAutoUpgradeResolution) {
              scheduleUpgrade(nextResolution);
            }
          });
        }
      }, upgradeDelay);
    }
  }, [autoUpgrade, upgradeDelay, loadDataAtResolution, maxAutoUpgradeResolution]);

  // Manual resolution change
  const setResolution = useCallback((resolution: DataResolution) => {
    // Mark as manual change
    isManualChangeRef.current = true;
    
    // Cancel any pending upgrades
    if (upgradeTimeoutRef.current) {
      clearTimeout(upgradeTimeoutRef.current);
      upgradeTimeoutRef.current = undefined;
    }

    // Only load if resolution actually changed
    if (currentResolutionRef.current !== resolution) {
      loadDataAtResolution(resolution);
    }
  }, [loadDataAtResolution]);

  // Initial load and auto-upgrade
  useEffect(() => {
    isMountedRef.current = true;
    
    // Load initial data
    const loadInitialData = async () => {
      try {
        await loadDataAtResolution(initialResolution);
        
        // Schedule upgrades if enabled and not already at max resolution
        const resolutionOrder: DataResolution[] = ['preview', 'normal', 'high'];
        const initialIndex = resolutionOrder.indexOf(initialResolution);
        const maxIndex = resolutionOrder.indexOf(maxAutoUpgradeResolution);
        
        if (autoUpgrade && initialIndex < maxIndex) {
          scheduleUpgrade(initialResolution);
        }
      } catch (error) {
      }
    };
    
    loadInitialData();

    return () => {
      isMountedRef.current = false;
      if (upgradeTimeoutRef.current) {
        clearTimeout(upgradeTimeoutRef.current);
      }
    };
  }, [config.id, config.title, selectedDataIds.join(','), initialResolution, loadDataAtResolution, scheduleUpgrade, autoUpgrade]); // Include all dependencies

  // Check if we're still upgrading based on max allowed resolution
  const isStillUpgrading = () => {
    if (!autoUpgrade || isManualChangeRef.current) return false;
    
    const resolutionOrder: DataResolution[] = ['preview', 'normal', 'high', 'full'];
    const currentIndex = resolutionOrder.indexOf(state.resolution);
    const maxIndex = resolutionOrder.indexOf(maxAutoUpgradeResolution);
    
    // We're upgrading if current resolution is less than max allowed
    return currentIndex < maxIndex;
  };

  return {
    ...state,
    setResolution,
    isUpgrading: isStillUpgrading()
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