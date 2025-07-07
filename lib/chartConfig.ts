// Chart rendering engine configuration
export type ChartEngine = 'timechart' | 'plotly';

// Feature flag for chart engine selection
// Can be controlled via environment variable or user preference
export const getChartEngine = (): ChartEngine => {
  // Check environment variable first
  if (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_CHART_ENGINE) {
    const engine = process.env.NEXT_PUBLIC_CHART_ENGINE.toLowerCase();
    if (engine === 'plotly' || engine === 'timechart') {
      return engine as ChartEngine;
    }
  }
  
  // Check localStorage for user preference (client-side only)
  if (typeof window !== 'undefined' && window.localStorage) {
    const userPref = localStorage.getItem('chartEngine');
    if (userPref === 'plotly' || userPref === 'timechart') {
      return userPref as ChartEngine;
    }
  }
  
  // Default to timechart for now (change to 'plotly' when ready to switch)
  return 'timechart';
};

// Set chart engine preference
export const setChartEngine = (engine: ChartEngine) => {
  if (typeof window !== 'undefined' && window.localStorage) {
    localStorage.setItem('chartEngine', engine);
  }
};