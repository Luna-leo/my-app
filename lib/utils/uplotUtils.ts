import uPlot from 'uplot'
import { format } from 'date-fns'
import { colorService } from '@/lib/services/colorService'


// Generate colors for series
export function generateSeriesColors(count: number): string[] {
  return colorService.generateColors(count)
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
    stroke: 'rgba(0,0,0,0.6)',
    grid: {
      show: true,
      stroke: 'rgba(0,0,0,0.2)',
      width: 1,
    },
    ticks: {
      stroke: 'rgba(0,0,0,0.8)',
      width: 1,
      size: 4,
    },
    font: '12px system-ui, -apple-system, sans-serif',
    labelFont: '14px system-ui, -apple-system, sans-serif',
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
  plugins?: uPlot.Plugin[]
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
  plugins,
}: BuildUplotOptionsParams): uPlot.Options {
  const colors = generateSeriesColors(seriesNames.length)

  // Build plugins array
  const allPlugins: uPlot.Plugin[] = [...(plugins || [])]
  
  // Wheel zoom has been removed as per user requirement
  // Only selection-based zoom is now supported

  const options: uPlot.Options = {
    width,
    height,
    title,
    class: 'uplot-chart',
    padding: [5, 5, 5, 5], // top, right, bottom, left
    legend: {
      show: showLegend,
      isolate: true,
    },
    cursor: {
      lock: false,
      focus: {
        prox: 16,
      },
      // Remove sync to prevent automatic cursor/scale synchronization
      // We'll handle sync manually through ZoomSyncService
      // sync: {
      //   key: 'chart-sync',
      //   setSeries: true,
      // },
      // Disable cursor drag to prevent conflicts with selection plugin
      drag: {
        x: false,
        y: false,
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
    plugins: allPlugins,
  }

  return options
}

// Create tooltip plugin
export function createTooltipPlugin(
  chartData?: Array<{ metadataLabel: string; parameterName: string; unit: string }>
): uPlot.Plugin {
  return {
    hooks: {
      ready(u) {
        const tooltip = document.createElement('div')
        tooltip.className = 'uplot-tooltip'
        tooltip.style.cssText = `
          position: absolute;
          display: none;
          padding: 12px;
          background: white;
          color: #333;
          border: 1px solid #333;
          border-radius: 4px;
          pointer-events: none;
          z-index: 999;
          font-size: 12px;
          line-height: 1.5;
          white-space: nowrap;
          box-shadow: 0 2px 4px rgba(0,0,0,0.2);
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
              const value = formatNumber(yVal)
              
              if (chartData && chartData[i - 1]) {
                // Use metadata if available
                const metadata = chartData[i - 1]
                content += `<div style="margin-bottom: 4px;">
                  <div style="font-weight: bold; color: ${color}">${metadata.metadataLabel}</div>
                  <div style="color: #666; font-size: 11px">${metadata.parameterName}</div>
                  <div style="color: #333">Value: ${value} ${metadata.unit}</div>
                </div>`
              } else {
                // Fallback to series label
                const name = series.label || `Series ${i}`
                content += `<div style="color: ${color}">${name}: ${value}</div>`
              }
            }
          })

          tooltip.innerHTML = content
          tooltip.style.display = 'block'
          
          // Get tooltip dimensions
          const tooltipRect = tooltip.getBoundingClientRect()
          
          // Calculate position with edge detection
          let tooltipLeft = e.offsetX + 10
          let tooltipTop = e.offsetY - 30
          
          // Check right edge
          if (tooltipLeft + tooltipRect.width > u.over.offsetWidth) {
            tooltipLeft = e.offsetX - tooltipRect.width - 10
          }
          
          // Check bottom edge
          if (tooltipTop + tooltipRect.height > u.over.offsetHeight) {
            tooltipTop = e.offsetY - tooltipRect.height - 10
          }
          
          // Check top edge
          if (tooltipTop < 0) {
            tooltipTop = e.offsetY + 10
          }
          
          tooltip.style.left = `${Math.max(0, tooltipLeft)}px`
          tooltip.style.top = `${Math.max(0, tooltipTop)}px`
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