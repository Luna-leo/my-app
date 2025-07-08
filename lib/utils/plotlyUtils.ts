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
  } = options;

  return {
    x,
    y,
    type: 'scattergl' as const,
    mode,
    name,
    hovertemplate,
    line: {
      color,
      width: mode === 'markers' ? 0 : lineWidth,
    },
    marker: {
      color,
      size: mode === 'markers' ? markerSize : 0,
    },
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
    await plotlyInstance.newPlot(plotElement, traces, layout, config);
    return true;
  } catch (error) {
    console.error('Failed to create Plotly chart:', error);
    
    // Try fallback without WebGL
    try {
      const fallbackTraces = traces.map(trace => ({
        ...trace,
        type: trace.type === 'scattergl' ? 'scatter' : trace.type,
      }));
      await plotlyInstance.newPlot(plotElement, fallbackTraces, layout, config);
      return true;
    } catch (fallbackError) {
      console.error('Fallback chart creation also failed:', fallbackError);
      return false;
    }
  }
}

// Resize handling
export async function resizePlotlyChart(
  plotlyInstance: typeof import('plotly.js'),
  plotElement: HTMLElement | null,
  width: number,
  height: number
): Promise<void> {
  if (!plotlyInstance || !plotElement || width <= 0 || height <= 0) return;

  try {
    await plotlyInstance.relayout(plotElement, { width, height });
  } catch (error) {
    console.error('Error resizing Plotly chart:', error);
  }
}