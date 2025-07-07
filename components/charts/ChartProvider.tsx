'use client'

import { ComponentType } from 'react'
import { PlotlyChartComponent } from './PlotlyChart'
import { PlotlyChartWithData } from './PlotlyChartWithData'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'

// Props for basic chart component
interface BasicChartProps {
  aspectRatio?: number
  lineColor?: { r: number; g: number; b: number; a?: number }
  updateFunction?: (data: Array<{x: number, y: number}>, frame: number) => Array<{x: number, y: number}>
  className?: string
}

// Props for data-driven chart component
interface DataChartProps {
  config: ChartConfiguration
  aspectRatio?: number
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}

// Factory function to get the appropriate basic chart component
export function getBasicChartComponent(): ComponentType<BasicChartProps> {
  return PlotlyChartComponent;
}

// Factory function to get the appropriate data-driven chart component
export function getDataChartComponent(): ComponentType<DataChartProps> {
  return PlotlyChartWithData;
}

// Hook to get current chart engine (client-side only)
export function useChartEngine() {
  return 'plotly' as const;
}