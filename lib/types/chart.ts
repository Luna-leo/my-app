// Chart-related type definitions (replacing plotly.ts)

import { ParameterInfo } from '@/lib/db/schema'

// Chart viewport for data bounds
export interface ChartViewport {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}

// Chart loading state
export interface ChartLoadingState {
  loading: boolean
  progress: number
  error: string | null
}

// Range for data bounds
export interface DataRange {
  min: number
  max: number
}

// Series data for charts
export interface ChartSeriesData {
  xValues: number[]
  yValues: number[]
  parameterInfo: ParameterInfo
  metadataId: number
  metadataLabel: string
  xRange?: DataRange
  yRange?: DataRange
}

// Sampling information for chart data
export interface SamplingInfo {
  originalCount: number
  sampledCount: number
  wasSampled: boolean
  method?: string
}

// Plot data structure
export interface ChartPlotData {
  xParameterInfo: ParameterInfo | null
  series: ChartSeriesData[]
  samplingInfo?: SamplingInfo
}

// Animation function type
export type ChartAnimationFunction = (data: Array<{x: number, y: number}>, frame: number) => Array<{x: number, y: number}>

// Chart state
export interface ChartState {
  isChartReady: boolean
  hasChart: boolean
  error?: string
}