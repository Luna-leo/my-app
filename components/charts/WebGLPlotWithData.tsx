'use client'

import { useEffect, useRef, useState } from 'react'
import { WebglPlot, WebglLine, WebglSquare, ColorRGBA } from 'webgl-plot'
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
import { AlertCircle, TrendingUp, MoreVertical, Pencil, Copy, Trash2, ScatterChart, ZoomIn } from 'lucide-react'
import { useChartInteraction } from '@/hooks/useChartInteraction'
import { ViewportBounds } from '@/utils/chartCoordinateUtils'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { SVGOverlay } from './SVGOverlay'

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

// Chart margins - consistent across WebGL and SVG
const CHART_MARGINS = { top: 20, right: 60, bottom: 60, left: 70 }

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
  const [dataViewport, setDataViewport] = useState<ViewportBounds | null>(null)

  // Initialize chart interaction
  const [interactionState, interactionHandlers] = useChartInteraction(
    canvasRef as React.RefObject<HTMLCanvasElement>,
    dataViewport || { xMin: -1, xMax: 1, yMin: -1, yMax: 1 },
    plotData?.series.map(s => ({
      series: s.xValues.map((x, i) => ({ 
        x: x,  // データは既に正規化されている
        y: s.yValues[i]
      })),
      name: `${s.metadataLabel} - ${s.parameterInfo.parameterName}`
    })),
    {
      enableZoom: true,
      enablePan: true,
      enableTooltip: true,
      enableCrosshair: true,
      minZoom: 1,
      maxZoom: 50,
      dataBounds: { xMin: -1, xMax: 1, yMin: -1, yMax: 1 }
    }
  )

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

        // Calculate initial viewport from all series
        if (series.length > 0) {
          // データは正規化されているので、ビューポートも正規化された範囲で初期化
          setDataViewport({ xMin: -1, xMax: 1, yMin: -1, yMax: 1 })
        }

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

  // Add event listeners to canvas
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !dataViewport) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      console.log('Wheel event detected', e.deltaY)
      interactionHandlers.onWheel(e)
    }
    
    const handleMouseDown = (e: MouseEvent) => {
      console.log('Mouse down detected', { x: e.clientX, y: e.clientY })
      interactionHandlers.onMouseDown(e)
    }
    
    const handleMouseMove = (e: MouseEvent) => {
      interactionHandlers.onMouseMove(e)
    }
    
    const handleMouseUp = (e: MouseEvent) => {
      console.log('Mouse up detected')
      interactionHandlers.onMouseUp(e)
    }

    canvas.addEventListener('wheel', handleWheel, { passive: false })
    canvas.addEventListener('mousedown', handleMouseDown)
    canvas.addEventListener('mousemove', handleMouseMove)
    canvas.addEventListener('mouseup', handleMouseUp)
    canvas.addEventListener('mouseleave', interactionHandlers.onMouseLeave)

    return () => {
      canvas.removeEventListener('wheel', handleWheel)
      canvas.removeEventListener('mousedown', handleMouseDown)
      canvas.removeEventListener('mousemove', handleMouseMove)
      canvas.removeEventListener('mouseup', handleMouseUp)
      canvas.removeEventListener('mouseleave', interactionHandlers.onMouseLeave)
    }
  }, [dataViewport, interactionHandlers])

  // Initialize/update WebGL plot
  useEffect(() => {
    console.log('WebGL init check:', { 
      hasCanvas: !!canvasRef.current, 
      dimensions, 
      hasPlotData: !!plotData,
      viewport: interactionState.viewport,
      dataViewport: dataViewport,
      plotDataSample: plotData ? {
        seriesCount: plotData.series.length,
        firstSeriesData: plotData.series[0] ? {
          xValues: plotData.series[0].xValues.slice(0, 5),
          yValues: plotData.series[0].yValues.slice(0, 5),
          xRange: plotData.series[0].xRange,
          yRange: plotData.series[0].yRange
        } : null
      } : null
    })
    
    if (!canvasRef.current || dimensions.width === 0 || !plotData || !dataViewport) return

    const canvas = canvasRef.current
    const devicePixelRatio = window.devicePixelRatio || 1
    
    // Set canvas dimensions with proper scaling
    // Account for high DPI displays
    const scaledWidth = Math.floor(dimensions.width * devicePixelRatio)
    const scaledHeight = Math.floor(dimensions.height * devicePixelRatio)
    
    canvas.width = scaledWidth
    canvas.height = scaledHeight

    // Always create a new WebGL plot instance to avoid stale state
    if (wglpRef.current) {
      wglpRef.current.clear()
      wglpRef.current = null
    }
    
    wglpRef.current = new WebglPlot(canvas)
    linesRef.current = []

    // Set up WebGL viewport to match SVG margins
    const innerWidth = dimensions.width - CHART_MARGINS.left - CHART_MARGINS.right
    const innerHeight = dimensions.height - CHART_MARGINS.top - CHART_MARGINS.bottom

    
    // Apply zoom and pan transformations
    const viewport = interactionState.viewport
    
    // データは既に-1から1に正規化されているので、ビューポートの範囲に基づいてスケールする
    const viewportWidth = viewport.xMax - viewport.xMin
    const viewportHeight = viewport.yMax - viewport.yMin
    
    // ビューポートが2（全範囲）より小さい場合はズームイン、大きい場合はズームアウト
    const xScale = (innerWidth / dimensions.width) * (2.0 / viewportWidth)
    const yScale = (innerHeight / dimensions.height) * (2.0 / viewportHeight)
    
    // ビューポートの中心をWebGL座標系の中心に合わせる
    const viewportCenterX = (viewport.xMin + viewport.xMax) / 2
    const viewportCenterY = (viewport.yMin + viewport.yMax) / 2
    
    // マージンを考慮した描画エリアの中心
    const plotCenterX = CHART_MARGINS.left + innerWidth / 2
    const plotCenterY = CHART_MARGINS.top + innerHeight / 2
    
    // WebGL座標系でのオフセット計算
    // プロットエリアの中心をWebGL座標系に変換
    const basexOffset = (plotCenterX / dimensions.width) * 2 - 1
    const baseyOffset = 1 - (plotCenterY / dimensions.height) * 2
    
    // ビューポートの中心によるオフセット調整
    const xOffset = basexOffset - viewportCenterX * xScale
    const yOffset = baseyOffset - viewportCenterY * yScale
    
    wglpRef.current.gScaleX = xScale
    wglpRef.current.gScaleY = yScale
    wglpRef.current.gOffsetX = xOffset
    wglpRef.current.gOffsetY = yOffset
    
    console.log('WebGL transform:', { 
      xScale, yScale, xOffset, yOffset, 
      baseOffsets: { basexOffset, baseyOffset },
      viewport: { 
        xMin: viewport.xMin, xMax: viewport.xMax, 
        yMin: viewport.yMin, yMax: viewport.yMax 
      },
      plotArea: {
        innerWidth, innerHeight,
        margins: CHART_MARGINS,
        plotCenterX, plotCenterY,
        viewportCenterX, viewportCenterY
      },
      canvas: {
        width: dimensions.width,
        height: dimensions.height
      }
    })

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
        // For scatter plot, create individual points using WebglSquare
        const pointSize = 0.01 // Size of each point in normalized coordinates
        for (let i = 0; i < series.xValues.length; i++) {
          const square = new WebglSquare(color)
          const x = series.xValues[i]
          const y = series.yValues[i]
          
          // Create a small square centered at the data point
          square.setSquare(
            x - pointSize / 2,
            y - pointSize / 2,
            x + pointSize / 2,
            y + pointSize / 2
          )
          
          wglpRef.current!.addSurface(square)
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
      console.log(`Sample data points: X[0]=${series.xValues[0]}, Y[0]=${series.yValues[0]}, X[1]=${series.xValues[1]}, Y[1]=${series.yValues[1]}`)
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
  }, [dimensions, plotData, config, interactionState.viewport])

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
              <DropdownMenuItem onClick={interactionHandlers.resetViewport}>
                <ZoomIn className="mr-2 h-4 w-4" />
                Reset Zoom
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
            className="w-full overflow-hidden border border-border rounded-lg relative"
            style={{ height: dimensions.height || 400, minHeight: 400 }}
          >
            {/* Canvas with clipping wrapper */}
            <div
              className="absolute inset-0 overflow-hidden"
              style={{
                clipPath: `inset(${CHART_MARGINS.top}px ${CHART_MARGINS.right}px ${CHART_MARGINS.bottom}px ${CHART_MARGINS.left}px)`
              }}
            >
              <canvas
                ref={canvasRef}
                className="max-w-full"
                style={{ display: 'block' }}
              />
            </div>
            {plotData.series.length > 0 && (
              <SVGOverlay
                width={dimensions.width}
                height={dimensions.height}
                xRange={(() => {
                  // ビューポートの正規化座標を実際のデータ範囲に変換
                  const vp = interactionState.viewport
                  const xMin = plotData.series[0].xRange.min
                  const xMax = plotData.series[0].xRange.max
                  const xSpan = xMax - xMin
                  return {
                    min: xMin + (vp.xMin + 1) / 2 * xSpan,
                    max: xMin + (vp.xMax + 1) / 2 * xSpan
                  }
                })()}
                yRanges={plotData.series.map(s => {
                  // ビューポートの正規化座標を実際のデータ範囲に変換
                  const vp = interactionState.viewport
                  const yMin = s.yRange.min
                  const yMax = s.yRange.max
                  const ySpan = yMax - yMin
                  return {
                    min: yMin + (vp.yMin + 1) / 2 * ySpan,
                    max: yMin + (vp.yMax + 1) / 2 * ySpan
                  }
                })}
                xParameterInfo={plotData.xParameterInfo}
                yParameterInfos={plotData.series.map(s => s.parameterInfo)}
                xAxisType={config.xAxisParameter === 'timestamp' ? 'timestamp' : 'parameter'}
                showGrid={true}
                hoveredPoint={interactionState.hoveredDataPoint ? {
                  ...interactionState.hoveredDataPoint,
                  point: {
                    // 正規化座標を実データ座標に変換
                    x: plotData.series[0].xRange.min + 
                       (interactionState.hoveredDataPoint.point.x + 1) / 2 * 
                       (plotData.series[0].xRange.max - plotData.series[0].xRange.min),
                    y: plotData.series[interactionState.hoveredDataPoint.seriesIndex || 0].yRange.min + 
                       (interactionState.hoveredDataPoint.point.y + 1) / 2 * 
                       (plotData.series[interactionState.hoveredDataPoint.seriesIndex || 0].yRange.max - 
                        plotData.series[interactionState.hoveredDataPoint.seriesIndex || 0].yRange.min)
                  }
                } : null}
                crosshairPosition={interactionState.crosshairPosition ? {
                  // 正規化座標を実データ座標に変換
                  x: plotData.series[0].xRange.min + 
                     (interactionState.crosshairPosition.x + 1) / 2 * 
                     (plotData.series[0].xRange.max - plotData.series[0].xRange.min),
                  y: plotData.series[0].yRange.min + 
                     (interactionState.crosshairPosition.y + 1) / 2 * 
                     (plotData.series[0].yRange.max - plotData.series[0].yRange.min)
                } : null}
                chartData={plotData.series.map(s => ({
                  metadataLabel: s.metadataLabel,
                  parameterName: s.parameterInfo.parameterName,
                  unit: s.parameterInfo.unit
                }))}
              />
            )}
          </div>

        </div>
      </CardContent>
    </Card>
  )
}