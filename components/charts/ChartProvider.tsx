'use client'

import { ComponentType, useState, useEffect } from 'react'
import { getChartEngine } from '@/lib/chartConfig'
import { WebGLPlotComponent } from './WebGLPlot'
import { WebGLPlotWithData } from './WebGLPlotWithData'
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
  // Always return TimeChart during SSR to avoid hydration mismatch
  if (typeof window === 'undefined') {
    return WebGLPlotComponent;
  }
  
  const engine = getChartEngine();
  
  if (engine === 'plotly') {
    return PlotlyChartComponent;
  }
  
  return WebGLPlotComponent;
}

// Factory function to get the appropriate data-driven chart component
export function getDataChartComponent(): ComponentType<DataChartProps> {
  // Always return TimeChart during SSR to avoid hydration mismatch
  if (typeof window === 'undefined') {
    return WebGLPlotWithData;
  }
  
  const engine = getChartEngine();
  
  if (engine === 'plotly') {
    return PlotlyChartWithData;
  }
  
  return WebGLPlotWithData;
}

// Hook to get current chart engine (client-side only)
export function useChartEngine() {
  const [engine, setEngine] = useState<'timechart' | 'plotly'>('timechart');
  
  useEffect(() => {
    setEngine(getChartEngine());
  }, []);
  
  return engine;
}