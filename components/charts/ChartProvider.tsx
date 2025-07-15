'use client'

import { ComponentType } from 'react'
// Plotly components have been removed - using only uPlot now
import { UplotChartWithData } from './UplotChartWithData'
import { ProgressiveChart } from './ProgressiveChart'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'
import { getChartEngine } from '@/lib/chartConfig'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'
import { DataResolution } from '@/hooks/useProgressiveChartData'


// Props for data-driven chart component
export interface DataChartProps {
  config: ChartConfiguration
  selectedDataIds: number[]
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
  enableProgressive?: boolean
  globalResolution?: DataResolution
  globalAutoUpgrade?: boolean
  maxAutoUpgradeResolution?: DataResolution
}


// Factory function to get the appropriate data-driven chart component
export function getDataChartComponent(progressive: boolean = false): ComponentType<DataChartProps> {
  return progressive ? ProgressiveChart : UplotChartWithData;
}

// Hook to get current chart engine (client-side only)
export function useChartEngine() {
  return getChartEngine();
}