// Type definitions for Plotly chart components

export interface PlotlyChartDimensions {
  width: number;
  height: number;
  isReady: boolean;
}

export interface PlotlyAnimationFunction {
  (data: Array<{ x: number; y: number }>, frame: number): Array<{ x: number; y: number }>;
}

export interface PlotlyChartState {
  isPlotlyReady: boolean;
  hasPlot: boolean;
  error?: string;
}

export interface PlotlyTraceData {
  x: number[];
  y: number[];
  name: string;
  color: string;
  mode: 'lines' | 'markers';
  hovertemplate?: string;
}

export interface PlotlyViewport {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export interface ChartLoadingState {
  loading: boolean;
  progress: number;
  error: string | null;
}

export interface ChartSeriesData {
  metadataId: number;
  metadataLabel: string;
  parameterId: string;
  parameterInfo: {
    parameterName: string;
    unit?: string;
  };
  xValues: number[];
  yValues: number[];
  xRange: { min: number; max: number };
  yRange: { min: number; max: number };
}

export interface ChartPlotData {
  xParameterInfo: {
    parameterName: string;
    unit?: string;
  } | null;
  series: ChartSeriesData[];
}