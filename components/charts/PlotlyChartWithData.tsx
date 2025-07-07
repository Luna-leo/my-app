'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { db } from '@/lib/db'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { 
  transformDataForChart, 
  transformDataForXYChart, 
  calculateDataRange,
  generateLineColors,
  mergeTimeSeriesData
} from '@/lib/utils/chartDataUtils'
import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema'
import { AlertCircle, TrendingUp, MoreVertical, Pencil, Copy, Trash2, ScatterChart, ZoomIn } from 'lucide-react'
import { ViewportBounds } from '@/utils/chartCoordinateUtils'
import { CHART_MARGINS } from '@/utils/plotAreaUtils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

// Dynamic import for Plotly to avoid SSR issues

interface PlotlyChartWithDataProps {
  config: ChartConfiguration
  aspectRatio?: number
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
}

interface PlotSeries {
  metadataId: number
  metadataLabel: string
  parameterId: string
  parameterInfo: ParameterInfo
  xValues: number[]
  yValues: number[]
  xRange: { min: number; max: number }
  yRange: { min: number; max: number }
}

interface PlotData {
  xParameterInfo: ParameterInfo | null
  series: PlotSeries[]
}

export function PlotlyChartWithData({
  config,
  aspectRatio = 2,
  className = '',
  onEdit,
  onDuplicate,
  onDelete
}: PlotlyChartWithDataProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const plotRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [loading, setLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [plotData, setPlotData] = useState<PlotData | null>(null)
  const [dataViewport, setDataViewport] = useState<ViewportBounds | null>(null)
  const [isPlotReady, setIsPlotReady] = useState(false)
  const plotlyRef = useRef<any>(null)
  const hasPlotRef = useRef(false)

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const borderBoxSize = entry.borderBoxSize?.[0]
        const width = borderBoxSize ? borderBoxSize.inlineSize : entry.contentRect.width
        const height = width / aspectRatio
        
        if (width > 0) {
          setDimensions({ width: Math.floor(width), height: Math.floor(height) })
        }
      }
    })

    resizeObserver.observe(containerRef.current)

    return () => {
      resizeObserver.disconnect()
    }
  }, [aspectRatio])

  // Load and transform data
  useEffect(() => {
    const loadData = async () => {
      try {
        setLoading(true)
        setLoadingProgress(10)
        setError(null)

        // Load all time series data for selected metadata
        const dataArrays: TimeSeriesData[][] = []
        const totalSteps = config.selectedDataIds.length + 3
        let currentStep = 0

        for (const metadataId of config.selectedDataIds) {
          const data = await db.getTimeSeriesData(metadataId)
          dataArrays.push(data)
          currentStep++
          setLoadingProgress((currentStep / totalSteps) * 100)
        }

        // Merge all data
        const mergedData = mergeTimeSeriesData(dataArrays)
        if (mergedData.length === 0) {
          setError('No data found for the selected sources')
          return
        }

        // Load metadata info
        const metadataMap = new Map<number, { label?: string; plant: string; machineNo: string }>()
        for (const metadataId of config.selectedDataIds) {
          const metadata = await db.metadata.get(metadataId)
          if (metadata) {
            metadataMap.set(metadataId, {
              label: metadata.label,
              plant: metadata.plant,
              machineNo: metadata.machineNo
            })
          }
        }

        // Load parameter info
        const parameterIds = [
          ...(config.xAxisParameter !== 'timestamp' ? [config.xAxisParameter] : []),
          ...config.yAxisParameters
        ]
        
        const parameterInfoMap = new Map<string, ParameterInfo>()
        for (const parameterId of parameterIds) {
          const paramInfo = await db.parameters
            .where('parameterId')
            .equals(parameterId)
            .first()
          
          if (paramInfo) {
            parameterInfoMap.set(parameterId, paramInfo)
          }
        }
        currentStep++
        setLoadingProgress((currentStep / totalSteps) * 100)

        // Transform data based on X-axis type
        let xParameterInfo: ParameterInfo | null = null
        let series: PlotSeries[] = []

        if (config.xAxisParameter === 'timestamp') {
          // Time-based chart
          const chartData = await transformDataForChart(
            mergedData,
            config.yAxisParameters,
            parameterInfoMap,
            metadataMap
          )
          
          xParameterInfo = null
          
          // Calculate combined Y range across all series
          let combinedYMin = Number.POSITIVE_INFINITY
          let combinedYMax = Number.NEGATIVE_INFINITY
          
          chartData.series.forEach(s => {
            const yRange = calculateDataRange(s.values)
            combinedYMin = Math.min(combinedYMin, yRange.min)
            combinedYMax = Math.max(combinedYMax, yRange.max)
          })
          
          const combinedYRange = { min: combinedYMin, max: combinedYMax }
          
          // Process each series
          series = chartData.series.map(s => {
            const xRange = calculateDataRange(s.timestamps)
            
            return {
              metadataId: s.metadataId,
              metadataLabel: s.metadataLabel,
              parameterId: s.parameterId,
              parameterInfo: s.parameterInfo,
              xValues: s.timestamps,
              yValues: s.values.map(v => v ?? NaN),
              xRange,
              yRange: combinedYRange
            }
          })
        } else {
          // XY chart
          const xyData = await transformDataForXYChart(
            mergedData,
            config.xAxisParameter,
            config.yAxisParameters,
            parameterInfoMap,
            metadataMap
          )
          
          xParameterInfo = xyData.xParameterInfo
          
          // Calculate combined Y range across all series
          let combinedYMin = Number.POSITIVE_INFINITY
          let combinedYMax = Number.NEGATIVE_INFINITY
          
          xyData.series.forEach(s => {
            const yRange = calculateDataRange(s.yValues)
            combinedYMin = Math.min(combinedYMin, yRange.min)
            combinedYMax = Math.max(combinedYMax, yRange.max)
          })
          
          const combinedYRange = { min: combinedYMin, max: combinedYMax }
          
          // Process each series
          series = xyData.series.map(s => {
            const xRange = calculateDataRange(s.xValues)
            
            return {
              metadataId: s.metadataId,
              metadataLabel: s.metadataLabel,
              parameterId: s.parameterId,
              parameterInfo: s.parameterInfo,
              xValues: s.xValues,
              yValues: s.yValues.map(v => v ?? NaN),
              xRange,
              yRange: combinedYRange
            }
          })
        }

        setPlotData({ xParameterInfo, series })
        
        // Set initial viewport
        if (series.length > 0) {
          const xMin = Math.min(...series.map(s => s.xRange.min))
          const xMax = Math.max(...series.map(s => s.xRange.max))
          const yMin = Math.min(...series.map(s => s.yRange.min))
          const yMax = Math.max(...series.map(s => s.yRange.max))
          setDataViewport({ xMin, xMax, yMin, yMax })
        }
        
        currentStep++
        setLoadingProgress(100)
        setIsPlotReady(true)
      } catch (err) {
        console.error('Error loading chart data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load chart data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [config])

  // Initialize Plotly when data is ready
  useEffect(() => {
    if (!plotData || !dataViewport || !isPlotReady) return

    let timeoutId: NodeJS.Timeout
    let disposed = false

    const initPlot = async () => {
      try {
        // Wait a bit to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100))
        
        if (disposed) return
        
        // Ensure element is available
        if (!plotRef.current || !(plotRef.current instanceof HTMLElement)) {
          console.error('Plot container ref is not an HTML element, retrying...')
          // Retry after a short delay
          timeoutId = setTimeout(() => {
            if (!disposed) initPlot()
          }, 100)
          return
        }

        // Cleanup existing plot
        if (plotlyRef.current && hasPlotRef.current) {
          try {
            plotlyRef.current.purge(plotRef.current)
            hasPlotRef.current = false
          } catch (e) {
            console.warn('Error purging plot:', e)
          }
        }

        // Load Plotly module
        const Plotly = await import('plotly.js-gl2d-dist')
        plotlyRef.current = Plotly

        // Generate colors
        const colors = generateLineColors(plotData.series.length)

        // Prepare traces for Plotly
        const traces = plotData.series.map((series, index) => {
          // Filter out NaN values
          const validIndices: number[] = []
          for (let i = 0; i < series.yValues.length; i++) {
            if (!isNaN(series.yValues[i])) {
              validIndices.push(i)
            }
          }
          
          const xData = validIndices.map(i => series.xValues[i])
          const yData = validIndices.map(i => series.yValues[i])

          const cssColor = `rgba(${Math.round(colors[index].r * 255)}, ${Math.round(colors[index].g * 255)}, ${Math.round(colors[index].b * 255)}, ${colors[index].a})`

          return {
            x: xData,
            y: yData,
            type: 'scattergl' as const,
            mode: (config.chartType === 'scatter' ? 'markers' : 'lines') as const,
            name: `${series.metadataLabel} - ${series.parameterInfo.parameterName}`,
            line: config.chartType !== 'scatter' ? {
              color: cssColor,
              width: 2
            } : undefined,
            marker: config.chartType === 'scatter' ? {
              color: cssColor,
              size: 6
            } : undefined,
            hovertemplate: 
              `${series.parameterInfo.parameterName}: %{y:.3g} ${series.parameterInfo.unit || ''}<br>` +
              (config.xAxisParameter === 'timestamp' 
                ? 'Time: %{x|%Y-%m-%d %H:%M:%S}' 
                : `${plotData.xParameterInfo?.parameterName || 'X'}: %{x:.3g} ${plotData.xParameterInfo?.unit || ''}`
              ) + '<extra></extra>'
          }
        })

        // Create layout
        const layout = {
          xaxis: { 
            title: plotData.xParameterInfo 
              ? `${plotData.xParameterInfo.parameterName} [${plotData.xParameterInfo.unit || ''}]`
              : 'Time',
            range: [dataViewport.xMin, dataViewport.xMax],
            type: config.xAxisParameter === 'timestamp' ? 'date' as const : 'linear' as const,
            tickformat: config.xAxisParameter === 'timestamp' ? undefined : '.3g',
            showspikes: true,
            spikemode: 'across' as const,
            spikethickness: 1,
            spikecolor: '#999'
          },
          yaxis: { 
            title: plotData.series.length === 1
              ? `${plotData.series[0].parameterInfo.parameterName} [${plotData.series[0].parameterInfo.unit || ''}]`
              : 'Value',
            range: [dataViewport.yMin, dataViewport.yMax],
            tickformat: '.3g',
            showspikes: true,
            spikemode: 'across' as const,
            spikethickness: 1,
            spikecolor: '#999'
          },
          margin: CHART_MARGINS,
          showlegend: true,
          legend: {
            x: 1,
            xanchor: 'right' as const,
            y: 1,
            yanchor: 'top' as const,
            bgcolor: 'rgba(255, 255, 255, 0.8)'
          },
          hovermode: 'closest' as const,
          dragmode: 'pan' as const,
          uirevision: 'true', // Preserve zoom/pan state
          paper_bgcolor: 'transparent',
          plot_bgcolor: 'transparent'
        }

        // Create plotly config
        const plotlyConfig = {
          modeBarButtonsToAdd: ['select2d', 'lasso2d'],
          modeBarButtonsToRemove: ['toImage'],
          displaylogo: false,
          responsive: true,
          scrollZoom: true,
          doubleClick: 'reset' as const
        }

        // Create plot
        await Plotly.newPlot(plotRef.current, traces, layout, plotlyConfig)
        hasPlotRef.current = true
      } catch (err) {
        console.error('Error creating Plotly chart:', err)
        setError('Failed to create chart')
      }
    }

    initPlot()

    // Cleanup function
    return () => {
      disposed = true
      if (timeoutId) clearTimeout(timeoutId)
      if (plotlyRef.current && plotRef.current && hasPlotRef.current) {
        try {
          plotlyRef.current.purge(plotRef.current)
          hasPlotRef.current = false
        } catch (e) {
          console.warn('Error purging plot on cleanup:', e)
        }
      }
    }
  }, [plotData, dataViewport, config.chartType, config.xAxisParameter, isPlotReady])

  // Update plot size when dimensions change
  useEffect(() => {
    if (plotlyRef.current && plotRef.current && hasPlotRef.current && dimensions.width > 0) {
      plotlyRef.current.Plots.resize(plotRef.current)
    }
  }, [dimensions])

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>Loading chart data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Progress value={loadingProgress} />
            <p className="text-sm text-muted-foreground">Loading and processing data...</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>Error loading chart</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  if (!plotData || plotData.series.length === 0) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <TrendingUp className="h-4 w-4" />
            <AlertDescription>
              No data points found for the selected parameters
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div className="space-y-1">
          <CardTitle className="text-base font-medium">{config.title}</CardTitle>
          <CardDescription className="text-xs">
            {config.chartType === 'scatter' ? (
              <ScatterChart className="inline h-3 w-3 mr-1" />
            ) : (
              <TrendingUp className="inline h-3 w-3 mr-1" />
            )}
            {plotData.series.length} series • {plotData.series.reduce((acc, s) => acc + s.xValues.length, 0).toLocaleString()} points
          </CardDescription>
        </div>
        {(onEdit || onDuplicate || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div 
          ref={containerRef} 
          className="w-full relative"
          style={{ height: dimensions.height || 400 }}
        >
          <div
            ref={plotRef}
            className="absolute inset-0"
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded">
            <ZoomIn className="h-3 w-3" />
            <span>Scroll to zoom • Drag to pan • Double-click to reset</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}