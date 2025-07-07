// Chart rendering engine configuration
export type ChartEngine = 'plotly';

// Always use Plotly as the chart engine
export const getChartEngine = (): ChartEngine => {
  return 'plotly';
};

// Set chart engine preference (kept for compatibility but always returns 'plotly')
export const setChartEngine = (engine: ChartEngine) => {
  // No-op since we only use Plotly now
};