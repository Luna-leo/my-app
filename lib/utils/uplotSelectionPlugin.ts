import type { Plugin } from 'uplot';

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
    enabled = true
  } = options;

  let isSelecting = false;
  let startX = 0;
  let startY = 0;
  let endX = 0;
  let endY = 0;
  let selectionEl: HTMLDivElement | null = null;
  let u: any = null;

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

  const handleMouseDown = (e: MouseEvent) => {
    if (!enabled || !u) return;

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
      isSelecting = true;
      startX = relX;
      startY = relY;
      endX = relX;
      endY = relY;

      if (onSelectionStart) {
        onSelectionStart();
      }

      updateSelectionElement();
      e.preventDefault();
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isSelecting || !u) return;

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

    const width = Math.abs(endX - startX);
    const height = Math.abs(endY - startY);

    if (width > minSelectionSize && height > minSelectionSize) {
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

      if (onSelect) {
        onSelect(range);
      }
    }

    if (onSelectionEnd) {
      onSelectionEnd();
    }

    clearSelection();
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
        (uplot: any) => {
          u = uplot;
          selectionEl = createSelectionElement();
          u.over.appendChild(selectionEl);

          // Add event listeners
          u.over.addEventListener('mousedown', handleMouseDown);
          document.addEventListener('mousemove', handleMouseMove);
          document.addEventListener('mouseup', handleMouseUp);
          document.addEventListener('keydown', handleKeyDown);
        }
      ],
      destroy: [
        () => {
          if (u && u.over) {
            u.over.removeEventListener('mousedown', handleMouseDown);
          }
          document.removeEventListener('mousemove', handleMouseMove);
          document.removeEventListener('mouseup', handleMouseUp);
          document.removeEventListener('keydown', handleKeyDown);

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