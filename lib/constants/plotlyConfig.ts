// Plotly chart configuration constants

export const ANIMATION_CONFIG = {
  TARGET_FPS: 30,
  DEFAULT_FREQUENCY: 0.001,
  DEFAULT_AMPLITUDE: 0.5,
  DEFAULT_SPEED: 0.02,
  INITIAL_POINTS: 500,
} as const;

export const CHART_DEFAULTS = {
  ASPECT_RATIO: 1.3,
  LINE_COLOR: { r: 0.1, g: 0.5, b: 0.9, a: 1 },
  LINE_WIDTH: 2,
  MARKER_SIZE: 6,
  DEBOUNCE_MS: 150,
  INIT_DELAY_MS: 100,
} as const;

export const AXIS_RANGES = {
  DEFAULT_X: [-1, 1] as [number, number],
  DEFAULT_Y: [-1, 1] as [number, number],
} as const;

export const TICK_FORMATS = {
  DEFAULT: '.3g',
  TIME: '%Y-%m-%d %H:%M:%S',
} as const;

export const FONT_SIZES = {
  TITLE: 14,
  AXIS_TITLE: 10,
  TICK_LABEL: 9,
  LEGEND: 9,
} as const;

export const SPIKE_CONFIG = {
  MODE: 'across' as const,
  THICKNESS: 1,
  COLOR: '#999',
} as const;

export const LEGEND_CONFIG = {
  POSITION: {
    x: 0.01,
    y: 0.99,
    xanchor: 'left' as const,
    yanchor: 'top' as const,
  },
  STYLE: {
    bgcolor: 'rgba(255, 255, 255, 0.7)',
    borderwidth: 1,
    bordercolor: '#ddd',
  },
} as const;

export const HOVER_TEMPLATES = {
  TIME_SERIES: (paramName: string, unit: string) =>
    `${paramName}: %{y:.3g} ${unit}<br>Time: %{x|${TICK_FORMATS.TIME}}<extra></extra>`,
  XY_CHART: (yParamName: string, yUnit: string, xParamName: string, xUnit: string) =>
    `${yParamName}: %{y:.3g} ${yUnit}<br>${xParamName}: %{x:.3g} ${xUnit}<extra></extra>`,
} as const;

export const ERROR_MESSAGES = {
  INIT_FAILED: 'Failed to initialize Plotly chart',
  DATA_LOAD_FAILED: 'Failed to load chart data',
  NO_DATA: 'No data found for the selected sources',
  PLOT_CREATION_FAILED: 'Failed to create chart',
  RESIZE_FAILED: 'Failed to resize chart',
  CLEANUP_FAILED: 'Error cleaning up chart',
} as const;