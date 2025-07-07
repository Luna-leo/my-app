'use client'

import { useEffect, useRef, useState } from 'react'
import { scaleLinear, scaleTime, ScaleTime, ScaleLinear } from 'd3-scale'
import { ParameterInfo } from '@/lib/db/schema'

interface SVGOverlayProps {
  width: number
  height: number
  xRange: { min: number; max: number }
  yRanges: Array<{ min: number; max: number }>
  xParameterInfo: ParameterInfo | null
  yParameterInfos: ParameterInfo[]
  xAxisType: 'timestamp' | 'parameter'
  showGrid?: boolean
}

export function SVGOverlay({
  width,
  height,
  xRange,
  yRanges,
  xParameterInfo,
  yParameterInfos,
  xAxisType,
  showGrid = true
}: SVGOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const [scales, setScales] = useState<{
    x: ScaleLinear<number, number> | ScaleTime<number, number>
    y: ScaleLinear<number, number>
  }>()

  // Margins for the plot area
  const margin = { top: 20, right: 60, bottom: 60, left: 70 }
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom

  useEffect(() => {
    if (width === 0 || height === 0) return

    // Create scales
    let xScale: ScaleLinear<number, number> | ScaleTime<number, number>
    
    if (xAxisType === 'timestamp') {
      xScale = scaleTime()
        .domain([new Date(xRange.min), new Date(xRange.max)])
        .range([0, innerWidth])
    } else {
      xScale = scaleLinear()
        .domain([xRange.min, xRange.max])
        .range([0, innerWidth])
    }

    // For now, use the first Y range (we'll handle multiple Y axes later)
    const yScale = scaleLinear()
      .domain([yRanges[0].min, yRanges[0].max])
      .range([innerHeight, 0])

    setScales({ x: xScale, y: yScale })
  }, [width, height, xRange, yRanges, xAxisType, innerWidth, innerHeight])

  if (!scales || width === 0 || height === 0) return null

  // Generate tick values
  const xTicks = scales.x.ticks(Math.floor(innerWidth / 100))
  const yTicks = scales.y.ticks(Math.floor(innerHeight / 50))

  // Format tick labels
  const formatXTick = (value: any) => {
    if (xAxisType === 'timestamp') {
      const date = new Date(value)
      const hours = date.getHours().toString().padStart(2, '0')
      const minutes = date.getMinutes().toString().padStart(2, '0')
      const seconds = date.getSeconds().toString().padStart(2, '0')
      return `${hours}:${minutes}:${seconds}`
    }
    return value.toFixed(2)
  }

  const formatYTick = (value: number) => {
    if (Math.abs(value) >= 1000) {
      return value.toExponential(1)
    }
    return value.toFixed(2)
  }

  return (
    <svg
      ref={svgRef}
      width={width}
      height={height}
      className="absolute top-0 left-0 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      <g transform={`translate(${margin.left},${margin.top})`}>
        {/* Grid lines */}
        {showGrid && (
          <>
            {/* Vertical grid lines */}
            {xTicks.map((tick, i) => (
              <line
                key={`x-grid-${i}`}
                x1={scales.x(tick)}
                y1={0}
                x2={scales.x(tick)}
                y2={innerHeight}
                stroke="#e0e0e0"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            ))}
            {/* Horizontal grid lines */}
            {yTicks.map((tick, i) => (
              <line
                key={`y-grid-${i}`}
                x1={0}
                y1={scales.y(tick)}
                x2={innerWidth}
                y2={scales.y(tick)}
                stroke="#e0e0e0"
                strokeWidth="1"
                strokeDasharray="2,2"
              />
            ))}
          </>
        )}

        {/* X axis */}
        <g transform={`translate(0,${innerHeight})`}>
          <line
            x1={0}
            y1={0}
            x2={innerWidth}
            y2={0}
            stroke="#333"
            strokeWidth="2"
          />
          {/* X axis ticks */}
          {xTicks.map((tick, i) => (
            <g key={`x-tick-${i}`} transform={`translate(${scales.x(tick)},0)`}>
              <line
                y1={0}
                y2={6}
                stroke="#333"
                strokeWidth="1"
              />
              <text
                y={20}
                textAnchor="middle"
                fontSize="12"
                fill="#666"
              >
                {formatXTick(tick)}
              </text>
            </g>
          ))}
          {/* X axis label */}
          <text
            x={innerWidth / 2}
            y={45}
            textAnchor="middle"
            fontSize="14"
            fill="#333"
          >
            {xAxisType === 'timestamp' 
              ? 'Time' 
              : xParameterInfo 
                ? `${xParameterInfo.parameterName} (${xParameterInfo.unit})`
                : 'X Axis'
            }
          </text>
        </g>

        {/* Y axis */}
        <g>
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={innerHeight}
            stroke="#333"
            strokeWidth="2"
          />
          {/* Y axis ticks */}
          {yTicks.map((tick, i) => (
            <g key={`y-tick-${i}`} transform={`translate(0,${scales.y(tick)})`}>
              <line
                x1={-6}
                x2={0}
                stroke="#333"
                strokeWidth="1"
              />
              <text
                x={-10}
                textAnchor="end"
                alignmentBaseline="middle"
                fontSize="12"
                fill="#666"
              >
                {formatYTick(tick)}
              </text>
            </g>
          ))}
          {/* Y axis label */}
          <text
            transform={`rotate(-90)`}
            x={-innerHeight / 2}
            y={-50}
            textAnchor="middle"
            fontSize="14"
            fill="#333"
          >
            {yParameterInfos.length === 1 
              ? `${yParameterInfos[0].parameterName} (${yParameterInfos[0].unit})`
              : 'Y Axis'
            }
          </text>
        </g>
      </g>
    </svg>
  )
}