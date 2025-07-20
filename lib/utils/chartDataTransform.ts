import { ChartPlotData } from '@/lib/types/chart'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { transformToUplotData } from '@/lib/utils/uplotUtils'

/**
 * Transform chart plot data to uPlot format based on chart configuration
 */
export function transformPlotDataToUplot(
  plotData: ChartPlotData,
  config: ChartConfiguration
): [number[], ...(number | null)[][]] {
  if (config.xAxisParameter === 'timestamp') {
    return transformTimeSeriesData(plotData)
  } else {
    return transformXYData(plotData, config)
  }
}

/**
 * Transform time series data to uPlot format
 */
function transformTimeSeriesData(plotData: ChartPlotData): [number[], ...(number | null)[][]] {
  // Check if series have overlapping time ranges
  const seriesTimeRanges = plotData.series.map(series => ({
    min: Math.min(...series.xValues),
    max: Math.max(...series.xValues),
    count: series.xValues.length,
    label: series.metadataLabel
  }))
  
  // Check for time range overlap between series
  let hasOverlap = false
  for (let i = 0; i < seriesTimeRanges.length - 1; i++) {
    for (let j = i + 1; j < seriesTimeRanges.length; j++) {
      const range1 = seriesTimeRanges[i]
      const range2 = seriesTimeRanges[j]
      if (range1.max >= range2.min && range2.max >= range1.min) {
        hasOverlap = true
        break
      }
    }
    if (hasOverlap) break
  }
  
  // Collect all unique timestamps from all series
  const allTimestamps = new Set<number>()
  plotData.series.forEach(series => {
    series.xValues.forEach(x => allTimestamps.add(x))
  })
  
  const unifiedXValues = Array.from(allTimestamps).sort((a, b) => a - b)
  const xValues = unifiedXValues.map(x => x / 1000) // Convert to seconds for uPlot
  
  // Create Y series data
  const ySeriesData: (number | null)[][] = plotData.series.map(series => {
    // Use sparse arrays for non-overlapping series to minimize memory usage
    if (!hasOverlap && plotData.series.length > 1) {
      const sparseArray = new Array(unifiedXValues.length).fill(null)
      series.xValues.forEach((x, i) => {
        const unifiedIdx = unifiedXValues.indexOf(x)
        if (unifiedIdx !== -1) {
          sparseArray[unifiedIdx] = series.yValues[i]
        }
      })
      return sparseArray
    } else {
      // For overlapping series, use map for O(1) lookup
      const valueMap = new Map<number, number>()
      series.xValues.forEach((x, i) => {
        valueMap.set(x, series.yValues[i])
      })
      
      return unifiedXValues.map(x => {
        const value = valueMap.get(x)
        return value !== undefined ? value : null
      })
    }
  })
  
  return transformToUplotData(xValues, ySeriesData) as [number[], ...(number | null)[][]]
}

/**
 * Transform XY data to uPlot format
 */
function transformXYData(
  plotData: ChartPlotData,
  config: ChartConfiguration
): [number[], ...(number | null)[][]] {
  const firstSeries = plotData.series[0]
  if (!firstSeries) {
    return transformToUplotData([], []) as [number[], ...(number | null)[][]]
  }
  
  // Check if X and Y use the same parameter
  const isXYSameParameter = config.yAxisParameters.includes(config.xAxisParameter)
  
  // Check if all series have the same x values
  const allSameXValues = plotData.series.every(s => 
    s.xValues.length === firstSeries.xValues.length &&
    s.xValues.every((x, i) => x === firstSeries.xValues[i])
  )
  
  if (allSameXValues) {
    // Optimize by sharing x array
    const xValues = firstSeries.xValues || []
    const ySeriesData = plotData.series.map(s => s.yValues || [])
    return transformToUplotData(xValues, ySeriesData) as [number[], ...(number | null)[][]] as [number[], ...(number | null)[][]]
  }
  
  // Handle different x values for each series
  if (isXYSameParameter) {
    // Special handling when X and Y use the same parameter
    return transformXYSameParameter(plotData)
  } else {
    // Different parameters for X and Y
    return transformXYDifferentParameters(plotData)
  }
}

/**
 * Transform XY data when X and Y use the same parameter
 */
function transformXYSameParameter(plotData: ChartPlotData): [number[], ...(number | null)[][]] {
  // Collect all unique values from both x and y arrays
  const allValues = new Set<number>()
  plotData.series.forEach(series => {
    series.xValues.forEach(x => {
      if (!isNaN(x)) {
        allValues.add(x)
      }
    })
    series.yValues.forEach(y => {
      if (y !== null && !isNaN(y)) {
        allValues.add(y)
      }
    })
  })
  
  const unifiedValues = Array.from(allValues).sort((a, b) => a - b)
  
  // Map each series' data
  const ySeriesData: (number | null)[][] = plotData.series.map(series => {
    const seriesValues = new Set<number>()
    series.xValues.forEach((x, i) => {
      if (!isNaN(x) && series.yValues[i] !== null && !isNaN(series.yValues[i])) {
        seriesValues.add(x)
      }
    })
    
    return unifiedValues.map(value => {
      return seriesValues.has(value) ? value : null
    })
  })
  
  return transformToUplotData(unifiedValues, ySeriesData) as [number[], ...(number | null)[][]]
}

/**
 * Transform XY data when X and Y use different parameters
 */
function transformXYDifferentParameters(plotData: ChartPlotData): [number[], ...(number | null)[][]] {
  // Collect all unique x values
  const allXValues = new Set<number>()
  plotData.series.forEach(series => {
    series.xValues.forEach(x => {
      if (!isNaN(x)) {
        allXValues.add(x)
      }
    })
  })
  
  const unifiedXValues = Array.from(allXValues).sort((a, b) => a - b)
  
  // Map each series' y values
  const ySeriesData: (number | null)[][] = plotData.series.map(series => {
    const valueMap = new Map<number, number>()
    series.xValues.forEach((x, i) => {
      if (!isNaN(x) && series.yValues[i] !== null && !isNaN(series.yValues[i])) {
        valueMap.set(x, series.yValues[i])
      }
    })
    
    return unifiedXValues.map(x => {
      const value = valueMap.get(x)
      return value !== undefined ? value : null
    })
  })
  
  return transformToUplotData(unifiedXValues, ySeriesData) as [number[], ...(number | null)[][]]
}