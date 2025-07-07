'use client'

import { useEffect, useRef, useState } from 'react'
import { WebglPlot, WebglLine, ColorRGBA } from 'webgl-plot'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import { db } from '@/lib/db'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { 
  transformDataForChart, 
  transformDataForXYChart, 
  calculateDataRange, 
  normalizeValues,
  generateLineColors,
  mergeTimeSeriesData
} from '@/lib/utils/chartDataUtils'
import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema'
import { AlertCircle, TrendingUp, MoreVertical, Pencil, Copy, Trash2, ScatterChart } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'

interface WebGLPlotWithDataProps {
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

export function WebGLPlotWithData({
  config,
  aspectRatio = 2,
  className = '',
  onEdit,
  onDuplicate,
  onDelete
}: WebGLPlotWithDataProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wglpRef = useRef<WebglPlot | null>(null)
  const linesRef = useRef<WebglLine[]>([])
  const [dimensions, setDimensions] = useState({ width: 800, height: 400 })
  const [loading, setLoading] = useState(true)
  const [loadingProgress, setLoadingProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [plotData, setPlotData] = useState<PlotData | null>(null)

  // Handle resize
  useEffect(() => {
    if (!containerRef.current) return

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        // Use border-box size to account for border
        const borderBoxSize = entry.borderBoxSize?.[0]
        const width = borderBoxSize ? borderBoxSize.inlineSize : entry.contentRect.width
        
        // Calculate height based on aspect ratio
        const height = width / aspectRatio
        
        console.log('ResizeObserver:', { width, height })
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
          
          // Process each series
          series = chartData.series.map(s => {
            const xRange = calculateDataRange(s.timestamps)
            const yRange = calculateDataRange(s.values)
            const normalizedX = normalizeValues(s.timestamps, xRange.min, xRange.max)
            const normalizedY = normalizeValues(
              s.values.map(v => v ?? NaN),
              yRange.min,
              yRange.max
            )
            
            return {
              metadataId: s.metadataId,
              metadataLabel: s.metadataLabel,
              parameterId: s.parameterId,
              parameterInfo: s.parameterInfo,
              xValues: normalizedX,
              yValues: normalizedY,
              xRange,
              yRange
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
          
          // Process each series
          series = xyData.series.map(s => {
            const xRange = calculateDataRange(s.xValues)
            const yRange = calculateDataRange(s.yValues)
            const normalizedX = normalizeValues(s.xValues, xRange.min, xRange.max)
            const normalizedY = normalizeValues(
              s.yValues.map(v => v ?? NaN),
              yRange.min,
              yRange.max
            )
            
            return {
              metadataId: s.metadataId,
              metadataLabel: s.metadataLabel,
              parameterId: s.parameterId,
              parameterInfo: s.parameterInfo,
              xValues: normalizedX,
              yValues: normalizedY,
              xRange,
              yRange
            }
          })
        }

        console.log('Chart data loaded:', {
          seriesCount: series.length,
          series: series.map(s => ({
            metadata: s.metadataLabel,
            parameter: s.parameterId,
            dataPoints: s.xValues.length,
            yRange: s.yRange
          }))
        })

        setPlotData({
          xParameterInfo,
          series
        })

        setLoadingProgress(100)
      } catch (err) {
        console.error('Failed to load chart data:', err)
        setError(err instanceof Error ? err.message : 'Failed to load data')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [config])

  // Initialize/update WebGL plot
  useEffect(() => {
    console.log('WebGL init check:', { 
      hasCanvas: !!canvasRef.current, 
      dimensions, 
      hasPlotData: !!plotData 
    })
    
    if (!canvasRef.current || dimensions.width === 0 || !plotData) return

    const canvas = canvasRef.current
    const devicePixelRatio = window.devicePixelRatio || 1
    
    // Set canvas dimensions with proper scaling
    // Account for high DPI displays
    const scaledWidth = Math.floor(dimensions.width * devicePixelRatio)
    const scaledHeight = Math.floor(dimensions.height * devicePixelRatio)
    
    canvas.width = scaledWidth
    canvas.height = scaledHeight
    
    // Set CSS dimensions to match container
    canvas.style.width = '100%'
    canvas.style.height = '100%'

    // Always create a new WebGL plot instance to avoid stale state
    if (wglpRef.current) {
      wglpRef.current.clear()
      wglpRef.current = null
    }
    
    wglpRef.current = new WebglPlot(canvas)
    linesRef.current = []

    // Generate colors based on coloring strategy
    const colors = generateLineColors(plotData.series.length)

    // Create lines or scatter points for each series
    plotData.series.forEach((series, index) => {
      const color = new ColorRGBA(
        colors[index].r,
        colors[index].g,
        colors[index].b,
        colors[index].a
      )
      
      if ((config.chartType || 'line') === 'scatter') {
        // For scatter plot, create individual points using WebglLine with length 1
        for (let i = 0; i < series.xValues.length; i++) {
          const pointLine = new WebglLine(color, 1)
          pointLine.setX(0, series.xValues[i])
          pointLine.setY(0, series.yValues[i])
          wglpRef.current!.addLine(pointLine)
        }
      } else {
        // For line chart, create connected lines
        const line = new WebglLine(color, series.xValues.length)
        
        // Set X and Y data points
        for (let i = 0; i < series.xValues.length; i++) {
          line.setX(i, series.xValues[i])
          line.setY(i, series.yValues[i])
        }
        
        wglpRef.current!.addLine(line)
        linesRef.current.push(line)
      }
      
      console.log(`${(config.chartType || 'line') === 'scatter' ? 'Scatter' : 'Line'} ${index} - Metadata: ${series.metadataLabel}, Parameter: ${series.parameterId}, Points: ${series.xValues.length}, Y range: [${series.yRange.min}, ${series.yRange.max}]`)
    })

    // Initial render
    wglpRef.current.update()

    // Animation loop
    let animationId: number
    const animate = () => {
      if (wglpRef.current) {
        wglpRef.current.update()
      }
      animationId = requestAnimationFrame(animate)
    }
    animate()

    return () => {
      cancelAnimationFrame(animationId)
      // Clean up WebGL resources when component unmounts or config changes
      if (wglpRef.current) {
        wglpRef.current.clear()
        wglpRef.current = null
      }
      linesRef.current = []
    }
  }, [dimensions, plotData, config])

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader>
          <CardTitle>{config.title}</CardTitle>
          <CardDescription>Loading chart data...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <Progress value={loadingProgress} className="w-full" />
            <p className="text-sm text-gray-600 text-center">
              Loading data... {Math.round(loadingProgress)}%
            </p>
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

  if (!plotData) {
    return null
  }

  return (
    <Card className={className}>
      <CardHeader>
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              {(config.chartType || 'line') === 'scatter' ? (
                <ScatterChart className="h-5 w-5" />
              ) : (
                <TrendingUp className="h-5 w-5" />
              )}
              {config.title}
            </CardTitle>
            <CardDescription>
              {(config.chartType || 'line') === 'scatter' ? 'Scatter' : 'Line'} {config.xAxisParameter === 'timestamp' ? 'Time Series' : 'XY'} Chart | 
              {' '}{plotData.series.length > 0 ? plotData.series[0].xValues.length : 0} data points | 
              {' '}{plotData.series.length} series
            </CardDescription>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon">
                <MoreVertical className="h-4 w-4" />
                <span className="sr-only">Open menu</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="mr-2 h-4 w-4" />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="mr-2 h-4 w-4" />
                Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDelete} className="text-red-600">
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {/* Legend */}
          <div className="flex flex-wrap gap-4 text-sm">
            {plotData.series.map((series, index) => {
              const colors = generateLineColors(plotData.series.length)
              const color = colors[index]
              const showMetadata = config.selectedDataIds.length > 1
              
              return (
                <div key={`${series.metadataId}-${series.parameterId}`} className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{
                      backgroundColor: `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`
                    }}
                  />
                  <span>
                    {showMetadata && (
                      <span className="font-medium">{series.metadataLabel} - </span>
                    )}
                    {series.parameterInfo.parameterName} ({series.parameterInfo.unit})
                  </span>
                  <span className="text-gray-500">
                    [{series.yRange.min.toFixed(2)} - {series.yRange.max.toFixed(2)}]
                  </span>
                </div>
              )
            })}
          </div>

          {/* Chart */}
          <div 
            ref={containerRef} 
            className="w-full overflow-hidden border border-border rounded-lg"
            style={{ height: dimensions.height || 400, minHeight: 400 }}
          >
            <canvas
              ref={canvasRef}
              className="max-w-full"
              style={{ display: 'block' }}
            />
          </div>

          {/* X-axis info */}
          <div className="text-sm text-gray-600 text-center">
            X-axis: {config.xAxisParameter === 'timestamp' ? 'Time' : 
              plotData.xParameterInfo ? `${plotData.xParameterInfo.parameterName} (${plotData.xParameterInfo.unit})` : config.xAxisParameter}
            {config.xAxisParameter !== 'timestamp' && plotData.series.length > 0 && (
              <span> [{plotData.series[0].xRange.min.toFixed(2)} - {plotData.series[0].xRange.max.toFixed(2)}]</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}