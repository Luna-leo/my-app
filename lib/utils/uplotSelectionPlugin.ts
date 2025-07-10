import uPlot, { Plugin } from 'uplot';
import { activeChartTracker } from './activeChartTracker';

export interface SelectionRange {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface SelectionPluginOptions {
  onSelect?: (range: SelectionRange) => void;
  onSelectionStart?: () => void;
  onSelectionEnd?: () => void;
  onSelectionClear?: () => void;
  selectionColor?: string;
  selectionOpacity?: number;
  minSelectionSize?: number;
  enabled?: boolean;
  chartInstanceId?: string;
}

export function createSelectionPlugin(options: SelectionPluginOptions = {}): Plugin {
  const {
    onSelect,
    onSelectionStart,
    onSelectionEnd,
    onSelectionClear,
    selectionColor = '#4285F4',
    selectionOpacity = 0.2,
    minSelectionSize = 10,
    enabled = true,
    chartInstanceId
  } = options;
  
  console.log('[SelectionPlugin] Creating plugin with options:', {
    enabled,
    chartInstanceId,
    hasOnSelect: !!onSelect
  });

  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  let endX = 0;
  let endY = 0;
  let selectionEl: HTMLDivElement | null = null;
  let u: uPlot | null = null;

  const createSelectionElement = () => {
    const el = document.createElement('div');
    el.style.position = 'absolute';
    el.style.backgroundColor = selectionColor;
    el.style.opacity = selectionOpacity.toString();
    el.style.border = `1px solid ${selectionColor}`;
    el.style.pointerEvents = 'none';
    el.style.display = 'none';
    el.style.zIndex = '100';
    return el;
  };

  const updateSelectionElement = () => {
    if (!selectionEl || !isSelecting) return;

    const left = Math.min(startX, endX);
    const top = Math.min(startY, endY);
    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    selectionEl.style.left = `${left}px`;
    selectionEl.style.top = `${top}px`;
    selectionEl.style.width = `${width}px`;
    selectionEl.style.height = `${height}px`;
    selectionEl.style.display = width > minSelectionSize && height > minSelectionSize ? 'block' : 'none';
  };

  const clearSelection = () => {
    if (selectionEl) {
      selectionEl.style.display = 'none';
    }
    isSelecting = false;
    startX = 0;
    startY = 0;
    endX = 0;
    endY = 0;
  };

  let selectionTimeout: NodeJS.Timeout | null = null;

  const handleMouseDown = (e: MouseEvent) => {
    if (!enabled || !u) return;

    // Don't interfere with double-click events
    if (e.detail === 2) {
      console.log('[SelectionPlugin] Double-click detected, skipping selection');
      // Clear any pending selection timeout
      if (selectionTimeout) {
        clearTimeout(selectionTimeout);
        selectionTimeout = null;
      }
      return; // Let double-click bubble through without preventDefault
    }

    // Check if click is within plot area
    const { left, top } = u.over.getBoundingClientRect();
    const plotLeft = u.bbox.left;
    const plotTop = u.bbox.top;
    const plotWidth = u.bbox.width;
    const plotHeight = u.bbox.height;

    const relX = e.clientX - left;
    const relY = e.clientY - top;

    if (relX >= plotLeft && relX <= plotLeft + plotWidth &&
        relY >= plotTop && relY <= plotTop + plotHeight) {
      
      // Clear any existing timeout
      if (selectionTimeout) {
        clearTimeout(selectionTimeout);
      }
      
      // Store initial coordinates
      const initialX = relX;
      const initialY = relY;
      
      // Add a small delay to ensure we don't interfere with double-click detection
      // This gives the browser time to register a potential double-click
      selectionTimeout = setTimeout(() => {
        // Only start selection if we haven't received a double-click in the meantime
        if (!isSelecting && enabled) {
          console.log('[SelectionPlugin] Starting selection');
          // Set this chart as active when starting selection
          if (chartInstanceId) {
            console.log('[SelectionPlugin] Setting active chart:', chartInstanceId);
            activeChartTracker.setActiveChart(chartInstanceId);
          }
          
          isSelecting = true;
          startX = initialX;
          startY = initialY;
          endX = initialX;
          endY = initialY;

          if (onSelectionStart) {
            onSelectionStart();
          }

          updateSelectionElement();
        }
        selectionTimeout = null;
      }, 200); // 200ms delay to allow double-click detection
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isSelecting || !u) return;
    
    // Only process if this chart is active
    if (chartInstanceId && !activeChartTracker.isActiveChart(chartInstanceId)) {
      return;
    }

    const { left, top } = u.over.getBoundingClientRect();
    const plotLeft = u.bbox.left;
    const plotTop = u.bbox.top;
    const plotWidth = u.bbox.width;
    const plotHeight = u.bbox.height;

    const relX = e.clientX - left;
    const relY = e.clientY - top;

    // Constrain selection to plot area
    endX = Math.max(plotLeft, Math.min(plotLeft + plotWidth, relX));
    endY = Math.max(plotTop, Math.min(plotTop + plotHeight, relY));

    updateSelectionElement();
    e.preventDefault();
  };

  const handleMouseUp = (e: MouseEvent) => {
    if (!isSelecting || !u) return;
    
    console.log('[SelectionPlugin] Mouse up - isSelecting:', isSelecting);
    
    // Only process if this chart is active
    if (chartInstanceId && !activeChartTracker.isActiveChart(chartInstanceId)) {
      console.log('[SelectionPlugin] Chart not active, skipping');
      return;
    }

    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);
    
    console.log('[SelectionPlugin] Selection size:', { width, height, minSelectionSize });

    if (width > minSelectionSize && height > minSelectionSize) {
      console.log('[SelectionPlugin] Valid selection detected');
      // Convert pixel coordinates to data coordinates
      const left = Math.min(startX, endX);
      const right = Math.max(startX, endX);
      const top = Math.min(startY, endY);
      const bottom = Math.max(startY, endY);

      // Get data coordinates
      const xMin = u.posToVal(left, 'x');
      const xMax = u.posToVal(right, 'x');
      
      // For y-axis, we need to consider that uPlot may have multiple y-scales
      // Use the first y-scale by default
      const yMax = u.posToVal(top, u.series[1]?.scale || 'y');
      const yMin = u.posToVal(bottom, u.series[1]?.scale || 'y');

      const range: SelectionRange = {
        xMin,
        xMax,
        yMin,
        yMax
      };

      console.log('[SelectionPlugin] Selection range:', range);

      if (onSelect) {
        console.log('[SelectionPlugin] Calling onSelect callback');
        onSelect(range);
      } else {
        console.log('[SelectionPlugin] No onSelect callback provided');
      }
    }

    if (onSelectionEnd) {
      onSelectionEnd();
    }

    clearSelection();
    
    // Clear active chart when selection ends
    if (chartInstanceId) {
      activeChartTracker.clearActiveChart();
    }
    
    e.preventDefault();
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Clear selection on Escape key
    if (e.key === 'Escape' && isSelecting) {
      clearSelection();
      if (onSelectionClear) {
        onSelectionClear();
      }
    }
  };

  return {
    hooks: {
      init: [
        (uplot: uPlot) => {
          u = uplot;
          selectionEl = createSelectionElement();
          u.over.appendChild(selectionEl);

          // Add event listeners
          // Use regular phase (not capture) to allow zoom plugin's capture phase to fire first
          u.over.addEventListener('mousedown', handleMouseDown, false);
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
          document.addEventListener('keydown', handleKeyDown);
          
          // Register listener for when this chart becomes inactive
          if (chartInstanceId) {
            activeChartTracker.registerInactiveListener(chartInstanceId, () => {
              // Clear selection if this chart becomes inactive
              if (isSelecting) {
                clearSelection();
                if (onSelectionClear) {
                  onSelectionClear();
                }
              }
            });
          }
        }
      ],
      destroy: [
        () => {
          // Clear any pending timeout
          if (selectionTimeout) {
            clearTimeout(selectionTimeout);
            selectionTimeout = null;
          }
          
          if (u && u.over) {
            u.over.removeEventListener('mousedown', handleMouseDown, false);
          }
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          document.removeEventListener('keydown', handleKeyDown);

          // Unregister inactive listener
          if (chartInstanceId) {
            activeChartTracker.unregisterInactiveListener(chartInstanceId);
          }

          if (selectionEl && selectionEl.parentNode) {
            selectionEl.parentNode.removeChild(selectionEl);
          }
          selectionEl = null;
          u = null;
        }
      ]
    }
  };
}

export function createZoomToSelectionPlugin(
  options: SelectionPluginOptions & {
    onZoom?: (range: SelectionRange) => void;
  } = {}
): Plugin {
  const { onZoom, ...selectionOptions } = options;

  return createSelectionPlugin({
    ...selectionOptions,
    onSelect: (range) => {
      if (onZoom) {
        onZoom(range);
      }
      if (selectionOptions.onSelect) {
        selectionOptions.onSelect(range);
      }
    }
  });
}