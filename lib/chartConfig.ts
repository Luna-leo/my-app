// Chart rendering engine configuration
export type ChartEngine = 'uplot';

// Always use uplot as the chart engine
export const getChartEngine = (): ChartEngine => {
  return 'uplot';
};

// Set chart engine preference (kept for compatibility but always returns 'uplot')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const setChartEngine = (_engine: ChartEngine) => {
  // No-op since we only use uPlot now
};