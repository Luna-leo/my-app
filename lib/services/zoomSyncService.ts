import uPlot from 'uplot'

export type ZoomSyncMode = 'independent' | 'x-axis-only' | 'full-sync'

interface ChartInstance {
  chart: uPlot & { resetZoom?: () => void }
  isTimeSeries: boolean
}

interface ZoomState {
  xMin: number
  xMax: number
  yMin?: number
  yMax?: number
}

class ZoomSyncService {
  private static instance: ZoomSyncService
  private charts: Map<string, ChartInstance> = new Map()
  private syncMode: ZoomSyncMode = 'independent'
  private isUpdating = false
  private updateQueue: Map<string, () => void> = new Map()
  private listeners: ((mode: ZoomSyncMode) => void)[] = []

  private constructor() {}

  static getInstance(): ZoomSyncService {
    if (!ZoomSyncService.instance) {
      ZoomSyncService.instance = new ZoomSyncService()
    }
    return ZoomSyncService.instance
  }

  // Register a chart instance
  registerChart(id: string, chart: uPlot & { resetZoom?: () => void }, isTimeSeries: boolean) {
    console.log(`[ZoomSyncService] Registering chart: ${id}, isTimeSeries: ${isTimeSeries}`)
    console.log(`[ZoomSyncService] Chart methods available:`, {
      setScale: typeof chart.setScale === 'function',
      batch: typeof chart.batch === 'function',
      scales: !!chart.scales,
      resetZoom: typeof chart.resetZoom === 'function'
    })
    this.charts.set(id, { chart, isTimeSeries })
  }

  // Unregister a chart instance
  unregisterChart(id: string) {
    console.log(`[ZoomSyncService] Unregistering chart: ${id}`)
    this.charts.delete(id)
  }

  // Set sync mode
  setSyncMode(mode: ZoomSyncMode) {
    console.log(`[ZoomSyncService] Setting sync mode to: ${mode}`)
    this.syncMode = mode
    this.notifyListeners(mode)
  }

  // Get current sync mode
  getSyncMode(): ZoomSyncMode {
    return this.syncMode
  }

  // Add mode change listener
  addModeChangeListener(listener: (mode: ZoomSyncMode) => void) {
    this.listeners.push(listener)
  }

  // Remove mode change listener
  removeModeChangeListener(listener: (mode: ZoomSyncMode) => void) {
    this.listeners = this.listeners.filter(l => l !== listener)
  }

  private notifyListeners(mode: ZoomSyncMode) {
    this.listeners.forEach(listener => listener(mode))
  }

  // Handle zoom change from a chart
  handleZoomChange(sourceId: string, state: ZoomState) {
    if (this.isUpdating || this.syncMode === 'independent') {
      console.log(`[ZoomSyncService] Skipping zoom sync - isUpdating: ${this.isUpdating}, mode: ${this.syncMode}`)
      return
    }

    console.log(`[ZoomSyncService] Zoom change from ${sourceId}:`, state)
    console.log(`[ZoomSyncService] Current mode: ${this.syncMode}, Chart count: ${this.charts.size}`)
    console.log(`[ZoomSyncService] Charts registered:`, Array.from(this.charts.keys()))
    this.isUpdating = true

    try {
      this.charts.forEach((chartInstance, id) => {
        if (id === sourceId) {
          console.log(`[ZoomSyncService] Skipping source chart: ${id}`)
          return
        }

        const { chart, isTimeSeries } = chartInstance
        console.log(`[ZoomSyncService] Syncing to chart ${id}, isTimeSeries: ${isTimeSeries}`)
        
        // Validate chart is ready
        if (!chart || !chart.scales || !chart.scales.x) {
          console.warn(`[ZoomSyncService] Chart ${id} not ready for sync, skipping`)
          return
        }
        
        // Check if chart has been destroyed (uPlot sets root to null when destroyed)
        if ((chart as any).root === null) {
          console.warn(`[ZoomSyncService] Chart ${id} has been destroyed, removing from registry`)
          this.charts.delete(id)
          return
        }
        
        // Check if chart has required methods
        if (typeof chart.setScale !== 'function' || typeof chart.batch !== 'function') {
          console.error(`[ZoomSyncService] Chart ${id} missing required methods`)
          return
        }

        if (this.syncMode === 'x-axis-only') {
          // Only sync X-axis
          console.log(`[ZoomSyncService] Setting X-axis for ${id}: min=${state.xMin}, max=${state.xMax}`)
          
          try {
            // Get the chart's current x scale range for validation
            const xScale = chart.scales.x
            console.log(`[ZoomSyncService] Current X scale:`, {
              min: xScale.min,
              max: xScale.max,
              time: xScale.time
            })
            
            // Try batch with setScale
            console.log(`[ZoomSyncService] Attempting batch update for ${id}`)
            
            try {
              chart.batch(() => {
                chart.setScale('x', { 
                  min: state.xMin, 
                  max: state.xMax 
                })
              })
              
              // Force a redraw by calling setData with the existing data
              if ((chart as any).data) {
                console.log(`[ZoomSyncService] Forcing redraw by calling setData`)
                chart.setData((chart as any).data, false)
              }
            } catch (error) {
              console.error(`[ZoomSyncService] Error during scale update:`, error)
            }
            
            // Verify the scale was updated
            setTimeout(() => {
              console.log(`[ZoomSyncService] After batch setScale, X scale for ${id}:`, {
                min: chart.scales.x.min,
                max: chart.scales.x.max,
                expected: { min: state.xMin, max: state.xMax },
                success: chart.scales.x.min === state.xMin && chart.scales.x.max === state.xMax
              })
            }, 0)
            
          } catch (error) {
            console.error(`[ZoomSyncService] Error syncing X-axis for ${id}:`, error)
          }
        } else if (this.syncMode === 'full-sync' && state.yMin !== undefined && state.yMax !== undefined) {
          // Sync both axes
          console.log(`[ZoomSyncService] Full sync for ${id}: X(${state.xMin}, ${state.xMax}), Y(${state.yMin}, ${state.yMax})`)
          
          // Log current scales before update
          console.log(`[ZoomSyncService] Current scales before full sync:`, {
            x: { min: chart.scales.x.min, max: chart.scales.x.max }
          })
          
          chart.batch(() => {
            chart.setScale('x', { min: state.xMin, max: state.xMax })
            
            // Set Y scale for all y scales
            Object.keys(chart.scales).forEach(scale => {
              if (scale !== 'x') {
                chart.setScale(scale, { min: state.yMin!, max: state.yMax! })
              }
            })
          })
          
          // Verify the update
          setTimeout(() => {
            console.log(`[ZoomSyncService] After full sync, scales for ${id}:`, {
              x: { min: chart.scales.x.min, max: chart.scales.x.max },
              success: chart.scales.x.min === state.xMin && chart.scales.x.max === state.xMax
            })
          }, 0)
        }
      })
    } finally {
      this.isUpdating = false
    }
  }

  // Handle reset from a chart
  handleReset(sourceId: string) {
    if (this.syncMode === 'independent') {
      return
    }

    console.log(`[ZoomSyncService] Reset from ${sourceId}`)
    this.isUpdating = true

    try {
      this.charts.forEach((chartInstance, id) => {
        if (id === sourceId) return

        const { chart } = chartInstance
        if (chart.resetZoom) {
          if (this.syncMode === 'x-axis-only') {
            // For X-axis only mode, we need to reset just the X-axis
            // This is a bit tricky as resetZoom resets all axes
            // So we'll need to store and restore Y-axis values
            const yScales: Record<string, { min: number; max: number }> = {}
            
            // Store current Y scales
            Object.keys(chart.scales).forEach(scale => {
              if (scale !== 'x') {
                yScales[scale] = {
                  min: chart.scales[scale].min!,
                  max: chart.scales[scale].max!
                }
              }
            })
            
            // Reset all
            chart.resetZoom()
            
            // Restore Y scales
            chart.batch(() => {
              Object.keys(yScales).forEach(scale => {
                chart.setScale(scale, yScales[scale])
              })
            })
          } else if (this.syncMode === 'full-sync') {
            // Reset everything
            chart.resetZoom()
          }
        }
      })
    } finally {
      this.isUpdating = false
    }
  }

  // Check if currently updating (to prevent loops)
  isCurrentlyUpdating(): boolean {
    return this.isUpdating
  }
}

export const zoomSyncService = ZoomSyncService.getInstance()