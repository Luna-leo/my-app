import type { Config, Layout } from 'plotly.js';

// Color utilities
export interface RGBAColor {
  r: number;
  g: number;
  b: number;
  a?: number;
}

export function rgbaToCSS(color: RGBAColor): string {
  const { r, g, b, a = 1 } = color;
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

// Layout constants
export const PLOTLY_MARGINS = {
  DEFAULT: { t: 40, r: 10, b: 30, l: 40, pad: 0 },
  WITH_LEGEND: { t: 40, r: 10, b: 35, l: 60, pad: 0 },
  COMPACT: { t: 10, r: 10, b: 30, l: 40, pad: 0 },
} as const;

// Config constants
export const PLOTLY_MODEBAR_CONFIG = {
  DEFAULT: {
    displayModeBar: 'hover' as const,
    displaylogo: false,
    responsive: false,
    scrollZoom: true,
  },
  WITH_TOOLS: {
    displayModeBar: 'hover' as const,
    displaylogo: false,
    responsive: false,
    scrollZoom: true,
    modeBarButtonsToAdd: ['select2d' as const, 'lasso2d' as const],
    modeBarButtonsToRemove: ['toImage' as const],
    doubleClick: 'reset' as const,
  },
} as const;

// Layout builders
export interface PlotlyLayoutOptions {
  width: number;
  height: number;
  title?: string;
  xAxisTitle?: string;
  yAxisTitle?: string;
  xRange?: [number, number];
  yRange?: [number, number];
  showLegend?: boolean;
  margins?: typeof PLOTLY_MARGINS[keyof typeof PLOTLY_MARGINS];
  transparent?: boolean;
  xAxisType?: 'linear' | 'date';
}

export function buildPlotlyLayout(options: PlotlyLayoutOptions): Partial<Layout> {
  const {
    width,
    height,
    title = '',
    xAxisTitle = '',
    yAxisTitle = '',
    xRange,
    yRange,
    showLegend = false,
    margins = PLOTLY_MARGINS.DEFAULT,
    transparent = true,
    xAxisType = 'linear',
  } = options;

  return {
    width,
    height,
    autosize: false,
    margin: margins,
    showlegend: showLegend,
    hovermode: showLegend ? 'closest' : false,
    dragmode: 'pan',
    title: {
      text: title,
      font: { size: title ? 14 : 1 },
      pad: { t: 0, r: 0, b: 0, l: 0 },
    },
    xaxis: {
      title: { text: xAxisTitle, font: { size: 10 } },
      range: xRange,
      type: xAxisType,
      zeroline: false,
      automargin: false,
      tickfont: { size: 9 },
      ...(showLegend && {
        showspikes: true,
        spikemode: 'across' as const,
        spikethickness: 1,
        spikecolor: '#999',
      }),
    },
    yaxis: {
      title: { text: yAxisTitle, font: { size: 10 } },
      range: yRange,
      zeroline: false,
      automargin: false,
      tickfont: { size: 9 },
      tickformat: '.3g',
      ...(showLegend && {
        showspikes: true,
        spikemode: 'across' as const,
        spikethickness: 1,
        spikecolor: '#999',
      }),
    },
    ...(transparent && {
      paper_bgcolor: 'transparent',
      plot_bgcolor: 'transparent',
    }),
    ...(showLegend && {
      legend: {
        x: 0.01,
        xanchor: 'left' as const,
        y: 0.99,
        yanchor: 'top' as const,
        bgcolor: 'rgba(255, 255, 255, 0.7)',
        borderwidth: 1,
        bordercolor: '#ddd',
        font: { size: 9 },
      },
    }),
    uirevision: 'true', // Preserve zoom/pan state
    // WebGL optimizations
    selectdirection: 'd' as const,
  };
}

// Plotly cleanup utility
export async function cleanupPlotlyChart(
  plotlyInstance: typeof import('plotly.js') | null,
  plotElement: HTMLElement | null,
  hasPlot: boolean
): Promise<void> {
  if (plotlyInstance && plotElement && hasPlot) {
    try {
      await plotlyInstance.purge(plotElement);
    } catch (error) {
      console.error('Error purging Plotly chart:', error);
    }
  }
}

// Trace builders
export interface ScatterTraceOptions {
  x: number[];
  y: number[];
  name: string;
  color: string;
  mode: 'lines' | 'markers';
  hovertemplate?: string;
  lineWidth?: number;
  markerSize?: number;
  forceNonWebGL?: boolean; // Force non-WebGL rendering
}

export function buildScatterTrace(options: ScatterTraceOptions) {
  const {
    x,
    y,
    name,
    color,
    mode,
    hovertemplate,
    lineWidth = 2,
    markerSize = 6,
    forceNonWebGL = false,
  } = options;

  // Always use regular scatter if no data or forced
  const hasData = x && y && x.length > 0 && y.length > 0;
  const type = (!hasData || forceNonWebGL) ? 'scatter' : 'scattergl';

  return {
    x,
    y,
    type: type as 'scatter' | 'scattergl',
    mode,
    name,
    hovertemplate,
    line: {
      color,
      width: mode === 'markers' ? 0 : lineWidth,
      simplify: false, // Disable line simplification for better accuracy
    },
    marker: {
      color,
      size: mode === 'markers' ? markerSize : 0,
    },
    // Add WebGL-specific optimizations
    ...(type === 'scattergl' && {
      selectedpoints: null,
      cliponaxis: true,
    }),
  };
}

// Animation frame utilities
export interface AnimationState {
  frame: number;
  lastUpdateTime: number;
  isUpdating: boolean;
}

export function createAnimationState(): AnimationState {
  return {
    frame: 0,
    lastUpdateTime: 0,
    isUpdating: false,
  };
}

export function shouldUpdateAnimation(
  state: AnimationState,
  currentTime: number,
  targetFPS: number = 30
): boolean {
  const frameInterval = 1000 / targetFPS;
  const deltaTime = currentTime - state.lastUpdateTime;
  return deltaTime >= frameInterval && !state.isUpdating;
}

// Error handling utilities
export async function tryCreatePlotlyChart(
  plotElement: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traces: any[],
  layout: Partial<Layout>,
  config: Partial<Config>,
  plotlyInstance: typeof import('plotly.js')
): Promise<boolean> {
  try {
    // Validate element
    if (!plotElement || !plotlyInstance) {
      console.error('Invalid plot element or Plotly instance');
      return false;
    }
    
    // Validate and filter traces
    const validTraces = traces.filter(trace => {
      // Check basic requirements
      if (!trace || typeof trace !== 'object') return false;
      
      // Check data arrays
      const hasValidX = Array.isArray(trace.x) && trace.x.length > 0;
      const hasValidY = Array.isArray(trace.y) && trace.y.length > 0;
      
      return hasValidX && hasValidY;
    });
    
    if (validTraces.length === 0) {
      console.warn('No valid traces with data to plot');
      return false;
    }
    
    // Count WebGL traces
    const webglTraceCount = validTraces.filter(t => t.type === 'scattergl').length;
    if (webglTraceCount > 0) {
      console.log(`Creating chart with ${webglTraceCount} WebGL traces`);
    }
    
    // Additional check: ensure all traces have actual data points
    const allTracesHaveData = validTraces.every(trace => 
      trace.x.length > 0 && trace.y.length > 0
    );
    
    if (!allTracesHaveData) {
      console.warn('Some traces have no data points');
      return false;
    }
    
    // Set up config based on trace type
    const hasWebGL = validTraces.some(t => t.type === 'scattergl');
    const plotConfig = {
      ...config,
      ...(hasWebGL && {
        plotGlPixelRatio: window.devicePixelRatio || 1,
      }),
    };
    
    await plotlyInstance.newPlot(plotElement, validTraces, layout, plotConfig);
    return true;
  } catch (error) {
    console.error('Failed to create Plotly chart:', error);
    
    // Check if it's a WebGL context error
    const errorMessage = error instanceof Error ? error.message : String(error);
    if (errorMessage.includes('WebGL') || 
        errorMessage.includes('context') ||
        errorMessage.includes('gl')) {
      console.warn('WebGL context error detected, falling back to non-WebGL');
    }
    
    // Try fallback without WebGL
    try {
      const fallbackTraces = traces.map(trace => ({
        ...trace,
        type: trace.type === 'scattergl' ? 'scatter' : trace.type,
      }));
      
      console.warn('Falling back to non-WebGL rendering');
      await plotlyInstance.newPlot(plotElement, fallbackTraces, layout, config);
      return true;
    } catch (fallbackError) {
      console.error('Fallback chart creation also failed:', fallbackError);
      return false;
    }
  }
}

// Resize handling with proper validation
export async function resizePlotlyChart(
  plotlyInstance: typeof import('plotly.js'),
  plotElement: HTMLElement | null,
  width: number,
  height: number
): Promise<void> {
  if (!plotlyInstance || !plotElement || width <= 0 || height <= 0) return;

  try {
    // Check if plot exists and is properly initialized
    if (!hasExistingPlot(plotElement)) {
      console.warn('Cannot resize: plot not properly initialized');
      return;
    }
    
    // Use Plots.resize instead of relayout for size changes
    await plotlyInstance.Plots.resize(plotElement);
  } catch (error) {
    console.error('Error resizing Plotly chart:', error);
  }
}

// Update chart data without recreating
export async function updatePlotlyData(
  plotlyInstance: typeof import('plotly.js'),
  plotElement: HTMLElement | null,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traces: any[],
  layout?: Partial<Layout>
): Promise<boolean> {
  if (!plotlyInstance || !plotElement) return false;

  try {
    // Check if plot exists
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plotDiv = plotElement as any;
    if (plotDiv._fullLayout) {
      // Update existing plot
      await plotlyInstance.react(plotElement, traces, layout || plotDiv._fullLayout);
    } else {
      // Create new plot if doesn't exist
      return false;
    }
    return true;
  } catch (error) {
    console.error('Error updating Plotly data:', error);
    return false;
  }
}

// Check if plot exists on element
export function hasExistingPlot(plotElement: HTMLElement | null): boolean {
  if (!plotElement) return false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const plotDiv = plotElement as any;
  return !!(plotDiv._fullLayout && plotDiv._fullData);
}

// Validate DOM element is ready for Plotly
export function isElementReady(element: HTMLElement | null): boolean {
  if (!element) return false;
  
  // Check element is in DOM
  if (!document.contains(element)) return false;
  
  // Check element has dimensions
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  
  // Check element is visible
  const style = window.getComputedStyle(element);
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  
  return true;
}


// Safe plot initialization with WebGL context management
export async function initializePlotSafely(
  plotElement: HTMLElement,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  traces: any[],
  layout: Partial<Layout>,
  config: Partial<Config>,
  plotlyInstance: typeof import('plotly.js')
): Promise<boolean> {
  try {
    // Add WebGL context attributes to prevent warnings
    const enhancedConfig: Partial<Config> = {
      ...config,
      plotGlPixelRatio: 2, // Optimize for retina displays
    };
    
    // Ensure layout has proper WebGL settings
    const enhancedLayout: Partial<Layout> = {
      ...layout,
      // Disable features that might cause WebGL issues
      hovermode: layout.hovermode || 'closest',
    };
    
    await plotlyInstance.newPlot(plotElement, traces, enhancedLayout, enhancedConfig);
    return true;
  } catch (error) {
    console.error('Failed to initialize plot safely:', error);
    return false;
  }
}