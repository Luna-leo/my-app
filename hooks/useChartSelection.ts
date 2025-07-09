import { useState, useCallback, useMemo } from 'react';
import { SelectionRange } from '@/utils/uplotSelectionPlugin';
import { Point2D } from '@/utils/chartCoordinateUtils';

export interface ChartSelectionState {
  isSelectionMode: boolean;
  selectedRange: SelectionRange | null;
  isSelecting: boolean;
  selectedDataPoints: { seriesIndex: number; points: Point2D[] }[];
}

export interface ChartSelectionActions {
  enableSelectionMode: () => void;
  disableSelectionMode: () => void;
  toggleSelectionMode: () => void;
  setSelectedRange: (range: SelectionRange | null) => void;
  clearSelection: () => void;
  setIsSelecting: (isSelecting: boolean) => void;
  getSelectedData: () => { seriesIndex: number; points: Point2D[] }[];
  isPointInSelection: (point: Point2D) => boolean;
}

export interface UseChartSelectionOptions {
  onSelectionChange?: (range: SelectionRange | null) => void;
  onSelectionModeChange?: (enabled: boolean) => void;
  autoDisableOnSelect?: boolean;
}

export function useChartSelection(
  dataPoints?: { series: Point2D[]; name?: string }[],
  options: UseChartSelectionOptions = {}
): [ChartSelectionState, ChartSelectionActions] {
  const {
    onSelectionChange,
    onSelectionModeChange,
    autoDisableOnSelect = false
  } = options;

  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedRange, setSelectedRangeInternal] = useState<SelectionRange | null>(null);
  const [isSelecting, setIsSelecting] = useState(false);

  // Calculate selected data points based on the selection range
  const selectedDataPoints = useMemo(() => {
    if (!selectedRange || !dataPoints) return [];

    return dataPoints.map((series, seriesIndex) => {
      const points = series.series.filter(point => {
        return (
          point.x >= selectedRange.xMin &&
          point.x <= selectedRange.xMax &&
          point.y >= selectedRange.yMin &&
          point.y <= selectedRange.yMax
        );
      });

      return {
        seriesIndex,
        points
      };
    }).filter(result => result.points.length > 0);
  }, [selectedRange, dataPoints]);

  // Enable selection mode
  const enableSelectionMode = useCallback(() => {
    setIsSelectionMode(true);
    if (onSelectionModeChange) {
      onSelectionModeChange(true);
    }
  }, [onSelectionModeChange]);

  // Disable selection mode
  const disableSelectionMode = useCallback(() => {
    setIsSelectionMode(false);
    setIsSelecting(false);
    if (onSelectionModeChange) {
      onSelectionModeChange(false);
    }
  }, [onSelectionModeChange]);

  // Toggle selection mode
  const toggleSelectionMode = useCallback(() => {
    if (isSelectionMode) {
      disableSelectionMode();
    } else {
      enableSelectionMode();
    }
  }, [isSelectionMode, enableSelectionMode, disableSelectionMode]);

  // Set selected range
  const setSelectedRange = useCallback((range: SelectionRange | null) => {
    setSelectedRangeInternal(range);
    
    if (onSelectionChange) {
      onSelectionChange(range);
    }

    // Auto-disable selection mode after selection if configured
    if (range && autoDisableOnSelect) {
      disableSelectionMode();
    }
  }, [onSelectionChange, autoDisableOnSelect, disableSelectionMode]);

  // Clear selection
  const clearSelection = useCallback(() => {
    setSelectedRange(null);
  }, [setSelectedRange]);

  // Get selected data
  const getSelectedData = useCallback(() => {
    return selectedDataPoints;
  }, [selectedDataPoints]);

  // Check if a point is within the selection
  const isPointInSelection = useCallback((point: Point2D): boolean => {
    if (!selectedRange) return false;

    return (
      point.x >= selectedRange.xMin &&
      point.x <= selectedRange.xMax &&
      point.y >= selectedRange.yMin &&
      point.y <= selectedRange.yMax
    );
  }, [selectedRange]);

  const state: ChartSelectionState = {
    isSelectionMode,
    selectedRange,
    isSelecting,
    selectedDataPoints
  };

  const actions: ChartSelectionActions = {
    enableSelectionMode,
    disableSelectionMode,
    toggleSelectionMode,
    setSelectedRange,
    clearSelection,
    setIsSelecting,
    getSelectedData,
    isPointInSelection
  };

  return [state, actions];
}

// Utility function to format selection range for display
export function formatSelectionRange(range: SelectionRange, precision: number = 2): string {
  return `X: [${range.xMin.toFixed(precision)}, ${range.xMax.toFixed(precision)}], Y: [${range.yMin.toFixed(precision)}, ${range.yMax.toFixed(precision)}]`;
}

// Utility function to export selected data
export interface ExportFormat {
  format: 'csv' | 'json';
  includeHeaders?: boolean;
  seriesNames?: string[];
}

export function exportSelectedData(
  selectedData: { seriesIndex: number; points: Point2D[] }[],
  options: ExportFormat
): string {
  const { format, includeHeaders = true, seriesNames = [] } = options;

  if (format === 'csv') {
    let csv = '';
    
    if (includeHeaders) {
      csv = 'Series,X,Y\n';
    }

    selectedData.forEach(({ seriesIndex, points }) => {
      const seriesName = seriesNames[seriesIndex] || `Series ${seriesIndex + 1}`;
      points.forEach(point => {
        csv += `"${seriesName}",${point.x},${point.y}\n`;
      });
    });

    return csv;
  } else if (format === 'json') {
    return JSON.stringify(
      selectedData.map(({ seriesIndex, points }) => ({
        series: seriesNames[seriesIndex] || `Series ${seriesIndex + 1}`,
        data: points
      })),
      null,
      2
    );
  }

  return '';
}