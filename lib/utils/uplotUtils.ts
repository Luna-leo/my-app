import uPlot from 'uplot'
import { format } from 'date-fns'

// Color palette similar to Plotly defaults
const DEFAULT_COLORS = [
  'rgb(99, 110, 250)',
  'rgb(239, 85, 59)',
  'rgb(0, 204, 150)',
  'rgb(171, 99, 250)',
  'rgb(255, 161, 90)',
  'rgb(25, 211, 243)',
  'rgb(255, 102, 146)',
  'rgb(182, 232, 128)',
  'rgb(255, 151, 255)',
  'rgb(254, 203, 82)'
]

// Generate colors for series
export function generateSeriesColors(count: number): string[] {
  const colors: string[] = []
  for (let i = 0; i < count; i++) {
    colors.push(DEFAULT_COLORS[i % DEFAULT_COLORS.length])
  }
  return colors
}

// Format timestamp for axis labels
export function formatTimestamp(timestamp: number): string {
  return format(new Date(timestamp * 1000), 'yyyy-MM-dd HH:mm:ss')
}

// Format number with appropriate precision
export function formatNumber(value: number, decimals = 2): string {
  if (Math.abs(value) >= 1e6) {
    return `${(value / 1e6).toFixed(decimals)}M`
  } else if (Math.abs(value) >= 1e3) {
    return `${(value / 1e3).toFixed(decimals)}k`
  }
  return value.toFixed(decimals)
}

// Build axis options
export function buildAxisOptions(
  type: 'x' | 'y',
  label: string,
  isTime = false
): uPlot.Axis {
  const axis: uPlot.Axis = {
    label,
    labelSize: 14,
    labelGap: 5,
    size: 50,
    gap: 5,
    stroke: 'rgba(0,0,0,0.1)',
    grid: {
      show: true,
      stroke: 'rgba(0,0,0,0.05)',
      width: 1,
    },
  }

  if (isTime && type === 'x') {
    axis.values = (_, splits) => splits.map(v => formatTimestamp(v))
  } else {
    axis.values = (_, splits) => splits.map(v => formatNumber(v))
  }

  return axis
}

// Build series options
export function buildSeriesOptions(
  names: string[],
  colors: string[],
  chartType: 'line' | 'scatter'
): uPlot.Series[] {
  const series: uPlot.Series[] = [
    {} // First series is always for X axis
  ]

  names.forEach((name, i) => {
    const seriesOpts: uPlot.Series = {
      label: name,
      stroke: colors[i],
      width: chartType === 'line' ? 2 : 0,
      points: {
        show: chartType === 'scatter',
        size: chartType === 'scatter' ? 4 : 0,
        fill: colors[i],
      },
    }

    if (chartType === 'line') {
      seriesOpts.fill = `${colors[i]}10` // Add transparency for area fill
    }

    series.push(seriesOpts)
  })

  return series
}

// Transform data to uPlot format
export function transformToUplotData(
  xValues: number[],
  ySeriesData: number[][]
): uPlot.AlignedData {
  // uPlot expects data in columnar format: [xValues, ...ySeriesValues]
  return [xValues, ...ySeriesData]
}

// Build uPlot options
export interface BuildUplotOptionsParams {
  width: number
  height: number
  title?: string
  xLabel: string
  yLabel: string
  seriesNames: string[]
  chartType: 'line' | 'scatter'
  isTimeAxis?: boolean
  showLegend?: boolean
  xRange?: [number, number]
  yRange?: [number, number]
}

export function buildUplotOptions({
  width,
  height,
  title,
  xLabel,
  yLabel,
  seriesNames,
  chartType,
  isTimeAxis = false,
  showLegend = true,
  xRange,
  yRange,
}: BuildUplotOptionsParams): uPlot.Options {
  const colors = generateSeriesColors(seriesNames.length)

  const options: uPlot.Options = {
    width,
    height,
    title,
    class: 'uplot-chart',
    legend: {
      show: showLegend,
      isolate: true,
    },
    cursor: {
      lock: false,
      focus: {
        prox: 16,
      },
      sync: {
        key: 'chart-sync',
        setSeries: true,
      },
    },
    series: buildSeriesOptions(seriesNames, colors, chartType),
    axes: [
      buildAxisOptions('x', xLabel, isTimeAxis),
      buildAxisOptions('y', yLabel, false),
    ],
    scales: {
      x: {
        time: isTimeAxis,
        range: xRange,
      },
      y: {
        range: yRange,
      },
    },
    hooks: {},
  }

  return options
}

// Create tooltip plugin
export function createTooltipPlugin(): uPlot.Plugin {
  return {
    hooks: {
      ready(u) {
        const tooltip = document.createElement('div')
        tooltip.className = 'uplot-tooltip'
        tooltip.style.cssText = `
          position: absolute;
          display: none;
          padding: 8px;
          background: rgba(0, 0, 0, 0.8);
          color: white;
          border-radius: 4px;
          pointer-events: none;
          z-index: 100;
          font-size: 12px;
          line-height: 1.4;
          white-space: nowrap;
        `
        u.over.appendChild(tooltip)

        u.over.addEventListener('mouseleave', () => {
          tooltip.style.display = 'none'
        })

        u.over.addEventListener('mousemove', (e) => {
          const { left, top } = u.cursor

          if (left === null || top === null) {
            tooltip.style.display = 'none'
            return
          }

          const idx = u.cursor.idx

          if (idx === null || idx === undefined) {
            tooltip.style.display = 'none'
            return
          }

          let content = ''
          const xVal = u.data[0][idx]
          let xFormatted = String(xVal)
          
          // Format x value
          if (u.scales.x && u.scales.x.time) {
            xFormatted = formatTimestamp(xVal)
          } else {
            xFormatted = formatNumber(xVal)
          }

          content += `<div style="margin-bottom: 4px">${xFormatted}</div>`

          u.series.forEach((series, i) => {
            if (i === 0) return // Skip X series

            const yVal = u.data[i]?.[idx]
            if (yVal !== null && yVal !== undefined) {
              const color = series.stroke || 'black'
              const name = series.label || `Series ${i}`
              const value = formatNumber(yVal)
              content += `<div style="color: ${color}">${name}: ${value}</div>`
            }
          })

          tooltip.innerHTML = content
          tooltip.style.display = 'block'
          tooltip.style.left = `${e.offsetX + 10}px`
          tooltip.style.top = `${e.offsetY - 10}px`
        })
      },
    },
  }
}

// Resize chart
export function resizeUplotChart(chart: uPlot, width: number, height: number): void {
  if (chart && width > 0 && height > 0) {
    chart.setSize({ width, height })
  }
}

// Update chart data
export function updateUplotData(chart: uPlot, data: uPlot.AlignedData): void {
  if (chart && data) {
    chart.setData(data, false)
  }
}

// Check if chart exists and is valid
export function isValidChart(chart: uPlot | null): boolean {
  return chart !== null && chart.root !== null
}