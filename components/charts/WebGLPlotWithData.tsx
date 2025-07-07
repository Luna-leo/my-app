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
import { AlertCircle, TrendingUp, MoreVertical, Pencil, Copy, Trash2 } from 'lucide-react'
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

interface PlotData {
  xValues: number[]
  xRange: { min: number; max: number }
  yData: Array<{
    parameterId: string
    parameterInfo: ParameterInfo
    values: number[]
    range: { min: number; max: number }
  }>
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
        let xValues: number[]
        let xRange: { min: number; max: number }
        let yData: PlotData['yData'] = []

        if (config.xAxisParameter === 'timestamp') {
          // Time-based chart
          const chartData = await transformDataForChart(
            mergedData,
            config.yAxisParameters,
            parameterInfoMap
          )
          
          xValues = chartData.timestamps
          xRange = calculateDataRange(xValues)

          yData = chartData.parameters.map(param => ({
            parameterId: param.parameterId,
            parameterInfo: param.parameterInfo,
            values: normalizeValues(
              param.values.map(v => v ?? NaN),
              ...(() => {
                const range = calculateDataRange(param.values)
                return [range.min, range.max] as const
              })()
            ),
            range: calculateDataRange(param.values)
          }))
        } else {
          // XY chart
          const xyData = await transformDataForXYChart(
            mergedData,
            config.xAxisParameter,
            config.yAxisParameters,
            parameterInfoMap
          )
          
          xValues = xyData.xValues
          xRange = calculateDataRange(xValues)

          yData = xyData.yParameters.map(param => ({
            parameterId: param.parameterId,
            parameterInfo: param.parameterInfo,
            values: normalizeValues(
              param.values.map(v => v ?? NaN),
              ...(() => {
                const range = calculateDataRange(param.values)
                return [range.min, range.max] as const
              })()
            ),
            range: calculateDataRange(param.values)
          }))
        }

        // Normalize X values
        const normalizedXValues = normalizeValues(xValues, xRange.min, xRange.max)

        console.log('Chart data loaded:', {
          dataPoints: normalizedXValues.length,
          xRange,
          yParameterCount: yData.length,
          yParameters: yData.map(d => ({
            id: d.parameterId,
            range: d.range,
            sampleValues: d.values.slice(0, 5)
          }))
        })

        setPlotData({
          xValues: normalizedXValues,
          xRange,
          yData
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

    // Generate colors for each line
    const colors = generateLineColors(plotData.yData.length)

    // Create lines for each Y parameter
    plotData.yData.forEach((yParam, index) => {
      const color = new ColorRGBA(
        colors[index].r,
        colors[index].g,
        colors[index].b,
        colors[index].a
      )
      
      const line = new WebglLine(color, plotData.xValues.length)
      
      // Use arrangeX for automatic X-axis arrangement
      line.arrangeX()
      
      // Set Y data points
      for (let i = 0; i < plotData.xValues.length; i++) {
        line.setY(i, yParam.values[i])
      }
      
      console.log(`Line ${index} - Parameter: ${yParam.parameterId}, Points: ${plotData.xValues.length}, Y range: [${Math.min(...yParam.values)}, ${Math.max(...yParam.values)}]`)
      
      wglpRef.current!.addLine(line)
      linesRef.current.push(line)
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
              <TrendingUp className="h-5 w-5" />
              {config.title}
            </CardTitle>
            <CardDescription>
              {config.xAxisParameter === 'timestamp' ? 'Time Series' : 'XY'} Chart | 
              {' '}{plotData.xValues.length} data points
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
            {plotData.yData.map((yParam, index) => {
              const colors = generateLineColors(plotData.yData.length)
              const color = colors[index]
              return (
                <div key={yParam.parameterId} className="flex items-center gap-2">
                  <div 
                    className="w-4 h-4 rounded"
                    style={{
                      backgroundColor: `rgb(${Math.round(color.r * 255)}, ${Math.round(color.g * 255)}, ${Math.round(color.b * 255)})`
                    }}
                  />
                  <span>
                    {yParam.parameterInfo.parameterName} ({yParam.parameterInfo.unit})
                  </span>
                  <span className="text-gray-500">
                    [{yParam.range.min.toFixed(2)} - {yParam.range.max.toFixed(2)}]
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
              plotData.yData[0]?.parameterInfo.parameterName || config.xAxisParameter}
            {config.xAxisParameter !== 'timestamp' && plotData.xRange && (
              <span> [{plotData.xRange.min.toFixed(2)} - {plotData.xRange.max.toFixed(2)}]</span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}