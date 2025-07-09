'use client'

import { ComponentType } from 'react'
// Plotly components have been removed - using only uPlot now
import { UplotChartWithData } from './UplotChartWithData'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'
import { getChartEngine } from '@/lib/chartConfig'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'

// Props for basic chart component
interface BasicChartProps {
  aspectRatio?: number | AspectRatioPreset
  lineColor?: { r: number; g: number; b: number; a?: number }
  updateFunction?: (data: Array<{x: number, y: number}>, frame: number) => Array<{x: number, y: number}>
  className?: string
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
}

// Props for data-driven chart component
export interface DataChartProps {
  config: ChartConfiguration
  aspectRatio?: number | AspectRatioPreset
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  padding?: {
    top?: number
    right?: number
    bottom?: number
    left?: number
  }
  samplingConfig?: SamplingConfig
}

// Factory function to get the appropriate basic chart component
export function getBasicChartComponent(): ComponentType<BasicChartProps> {
  // TODO: Create basic UplotChart component for animated charts
  throw new Error('Basic chart component not yet implemented for uPlot');
}

// Factory function to get the appropriate data-driven chart component
export function getDataChartComponent(): ComponentType<DataChartProps> {
  return UplotChartWithData;
}

// Hook to get current chart engine (client-side only)
export function useChartEngine() {
  return getChartEngine();
}