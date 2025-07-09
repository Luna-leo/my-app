// uPlot configuration constants

// Chart defaults
export const UPLOT_DEFAULTS = {
  // Dimensions
  MIN_WIDTH: 200,
  MIN_HEIGHT: 200,
  ASPECT_RATIO: 16 / 9,
  
  // Performance
  DEBOUNCE_MS: 100,
  
  // Styling
  LINE_WIDTH: 2,
  MARKER_SIZE: 4,
  
  // Font sizes
  FONT_SIZE: {
    TITLE: 16,
    AXIS_LABEL: 14,
    AXIS_TICK: 12,
    LEGEND: 12,
  },
  
  // Colors
  GRID_COLOR: 'rgba(0,0,0,0.05)',
  AXIS_COLOR: 'rgba(0,0,0,0.1)',
  
  // Legend
  LEGEND: {
    SHOW: true,
    ISOLATE: true, // Allow toggling series visibility
  },
  
  // Cursor
  CURSOR: {
    LOCK: false,
    FOCUS_PROXIMITY: 16,
  },
} as const

// Margins for different chart layouts
export const UPLOT_MARGINS = {
  DEFAULT: {
    TOP: 40,
    RIGHT: 20,
    BOTTOM: 60,
    LEFT: 70,
  },
  WITH_LEGEND: {
    TOP: 40,
    RIGHT: 120,
    BOTTOM: 60,
    LEFT: 70,
  },
  COMPACT: {
    TOP: 20,
    RIGHT: 10,
    BOTTOM: 40,
    LEFT: 50,
  },
} as const

// Animation configuration
export const UPLOT_ANIMATION = {
  ENABLED: true,
  DURATION: 300,
  EASING: 'ease-out',
} as const

// Error messages
export const UPLOT_ERROR_MESSAGES = {
  INIT_FAILED: 'Failed to initialize uPlot chart',
  INVALID_DATA: 'Invalid data format for uPlot',
  RENDER_ERROR: 'Error rendering uPlot chart',
  UPDATE_FAILED: 'Failed to update chart data',
  RESIZE_FAILED: 'Failed to resize chart',
  NO_DATA: 'No data points found for the selected parameters',
  DATA_TRANSFORM_ERROR: 'Failed to transform data for chart',
  CACHE_ERROR: 'Error accessing cached data',
  DATA_LOAD_FAILED: 'Failed to load chart data',
} as const

// Data limits
export const UPLOT_DATA_LIMITS = {
  MAX_POINTS_WITHOUT_SAMPLING: 5000,
  MAX_SERIES: 10,
  SAMPLING_TARGET_POINTS: 2000,
} as const

// Tooltip configuration
export const UPLOT_TOOLTIP = {
  OFFSET_X: 10,
  OFFSET_Y: -10,
  MAX_WIDTH: 300,
  BACKGROUND: 'rgba(0, 0, 0, 0.8)',
  TEXT_COLOR: 'white',
  BORDER_RADIUS: 4,
  PADDING: 8,
  FONT_SIZE: 12,
} as const

// Chart type specific configurations
export const UPLOT_CHART_CONFIGS = {
  line: {
    lineWidth: 2,
    showPoints: false,
    fillArea: true,
    fillOpacity: 0.1,
  },
  scatter: {
    lineWidth: 0,
    showPoints: true,
    pointSize: 4,
    fillArea: false,
  },
} as const

// Axis configurations
export const UPLOT_AXIS_CONFIG = {
  // Common axis settings
  LABEL_SIZE: 14,
  LABEL_GAP: 5,
  SIZE: 50,
  GAP: 5,
  
  // Grid settings
  GRID: {
    SHOW: true,
    WIDTH: 1,
  },
  
  // Time axis specific
  TIME_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  
  // Number formatting
  DECIMAL_PLACES: 2,
} as const

// Plugin names
export const UPLOT_PLUGINS = {
  TOOLTIP: 'tooltip',
  CROSSHAIR: 'crosshair',
  LEGEND: 'legend',
  ZOOM: 'zoom',
} as const

// Animation configuration
export const ANIMATION_CONFIG = {
  TARGET_FPS: 60,
  DEFAULT_FREQUENCY: 0.1,
  DEFAULT_AMPLITUDE: 10,
  DEFAULT_SPEED: 0.1,
} as const