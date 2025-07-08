/**
 * Shared utilities for plot area calculations
 * Ensures consistency between WebGL and SVG coordinate systems
 */

// Chart margins - consistent across WebGL and SVG
export const CHART_MARGINS = { top: 0, right: 40, bottom: 25, left: 50 };

export interface PlotAreaDimensions {
  // Full canvas dimensions
  canvasWidth: number;
  canvasHeight: number;
  // Plot area dimensions (excluding margins)
  plotWidth: number;
  plotHeight: number;
  // Plot area position within canvas
  plotLeft: number;
  plotTop: number;
  plotRight: number;
  plotBottom: number;
}

/**
 * Calculate plot area dimensions from canvas dimensions
 */
export function calculatePlotArea(canvasWidth: number, canvasHeight: number): PlotAreaDimensions {
  const plotWidth = canvasWidth - CHART_MARGINS.left - CHART_MARGINS.right;
  const plotHeight = canvasHeight - CHART_MARGINS.top - CHART_MARGINS.bottom;
  
  return {
    canvasWidth,
    canvasHeight,
    plotWidth,
    plotHeight,
    plotLeft: CHART_MARGINS.left,
    plotTop: CHART_MARGINS.top,
    plotRight: canvasWidth - CHART_MARGINS.right,
    plotBottom: canvasHeight - CHART_MARGINS.bottom
  };
}

/**
 * Convert mouse coordinates to plot area normalized coordinates (-1 to 1)
 * Returns null if the mouse is outside the plot area
 */
export function mouseToPlotArea(
  mouseX: number,
  mouseY: number,
  plotArea: PlotAreaDimensions
): { x: number; y: number } | null {
  // Check if mouse is within plot area
  if (
    mouseX < plotArea.plotLeft ||
    mouseX > plotArea.plotRight ||
    mouseY < plotArea.plotTop ||
    mouseY > plotArea.plotBottom
  ) {
    return null;
  }
  
  // Normalize to plot area coordinates (-1 to 1)
  const normalizedX = ((mouseX - plotArea.plotLeft) / plotArea.plotWidth) * 2 - 1;
  const normalizedY = -((mouseY - plotArea.plotTop) / plotArea.plotHeight) * 2 + 1; // Y軸は反転
  
  return { x: normalizedX, y: normalizedY };
}

/**
 * Convert plot area normalized coordinates to mouse coordinates
 */
export function plotAreaToMouse(
  plotX: number,
  plotY: number,
  plotArea: PlotAreaDimensions
): { x: number; y: number } {
  const mouseX = ((plotX + 1) / 2) * plotArea.plotWidth + plotArea.plotLeft;
  const mouseY = ((-plotY + 1) / 2) * plotArea.plotHeight + plotArea.plotTop;
  
  return { x: mouseX, y: mouseY };
}

/**
 * Calculate WebGL transformation parameters for plot area
 */
export function calculateWebGLTransform(plotArea: PlotAreaDimensions) {
  // Calculate the WebGL coordinates for plot area boundaries
  const plotLeftGL = (plotArea.plotLeft / plotArea.canvasWidth) * 2 - 1;
  const plotRightGL = (plotArea.plotRight / plotArea.canvasWidth) * 2 - 1;
  const plotTopGL = 1 - (plotArea.plotTop / plotArea.canvasHeight) * 2;
  const plotBottomGL = 1 - (plotArea.plotBottom / plotArea.canvasHeight) * 2;
  
  // Scale factors to fit the plot area
  const scaleX = (plotRightGL - plotLeftGL) / 2;
  const scaleY = (plotTopGL - plotBottomGL) / 2;
  
  // Offset to center the plot area
  const offsetX = (plotLeftGL + plotRightGL) / 2;
  const offsetY = (plotTopGL + plotBottomGL) / 2;
  
  return { scaleX, scaleY, offsetX, offsetY };
}