'use client'

import { ComponentType } from 'react'
import { PlotlyChartRefactored } from './PlotlyChartRefactored'
import { PlotlyChartWithDataOptimized } from './PlotlyChartWithDataOptimized'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'

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
interface DataChartProps {
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
}

// Factory function to get the appropriate basic chart component
export function getBasicChartComponent(): ComponentType<BasicChartProps> {
  return PlotlyChartRefactored;
}

// Factory function to get the appropriate data-driven chart component
export function getDataChartComponent(): ComponentType<DataChartProps> {
  // Use optimized version with shared data provider
  return PlotlyChartWithDataOptimized;
}

// Hook to get current chart engine (client-side only)
export function useChartEngine() {
  return 'plotly' as const;
}