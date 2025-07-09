import uPlot from 'uplot'

export interface WheelZoomPluginOptions {
  factor?: number
  minZoomRange?: number
  maxZoomRange?: number
  enablePan?: boolean
  panButton?: number // 0: left, 1: middle, 2: right
  onZoomChange?: (isZoomed: boolean) => void
}

export function createWheelZoomPlugin(opts: WheelZoomPluginOptions = {}): uPlot.Plugin {
  const factor = opts.factor ?? 0.75
  const minZoomRange = opts.minZoomRange ?? 0.001
  const maxZoomRange = opts.maxZoomRange ?? Number.MAX_VALUE
  const enablePan = opts.enablePan ?? true
  const panButton = opts.panButton ?? 1 // Middle mouse button by default
  const onZoomChange = opts.onZoomChange

  let xMin: number, xMax: number
  let xRange: number
  const initialScales: Record<string, { min: number; max: number }> = {}
  let hasInteracted = false // Track if user has zoomed or panned

  function clamp(nRange: number, nMin: number, nMax: number, fRange: number, fMin: number, fMax: number): [number, number] {
    if (nRange > fRange) {
      nMin = fMin
      nMax = fMax
    } else if (nMin < fMin) {
      nMin = fMin
      nMax = fMin + nRange
    } else if (nMax > fMax) {
      nMax = fMax
      nMin = fMax - nRange
    }
    return [nMin, nMax]
  }

  // Removed checkZoomState function - using simpler hasInteracted flag instead

  return {
    hooks: {
      ready: (u: uPlot) => {
        const over = u.over

        // Store initial scales if not already stored
        if (Object.keys(initialScales).length === 0) {
          Object.keys(u.scales).forEach(key => {
            const scale = u.scales[key]
            if (scale.min != null && scale.max != null) {
              initialScales[key] = {
                min: scale.min,
                max: scale.max
              }
            }
          })
        }

        // Store initial scale ranges for zoom calculations
        xMin = u.scales.x.min!
        xMax = u.scales.x.max!
        xRange = xMax - xMin

        // Handle Y scales (could be multiple)
        const yScaleKeys = Object.keys(u.scales).filter(k => k !== 'x')

        // Wheel zoom handler
        over.addEventListener('wheel', (e: WheelEvent) => {
          e.preventDefault()

          const { left, top } = u.cursor

          if (left == null || top == null) {
            return
          }

          const currentRect = over.getBoundingClientRect()
          const leftPct = left / currentRect.width
          const btmPct = 1 - top / currentRect.height
          const xVal = u.posToVal(left, 'x')
          const yVal = u.posToVal(top, yScaleKeys[0] || 'y')
          const zoom = e.deltaY < 0 ? 1 / factor : factor

          // X-axis zoom
          const nxRange = Math.max(minZoomRange, Math.min(maxZoomRange, xRange * zoom))
          const nxMin = xVal - leftPct * nxRange
          const nxMax = nxMin + nxRange
          const [cxMin, cxMax] = clamp(nxRange, nxMin, nxMax, xRange, xMin, xMax)

          u.batch(() => {
            u.setScale('x', { min: cxMin, max: cxMax })

            // Y-axis zoom for all y scales
            yScaleKeys.forEach(scaleKey => {
              const scale = u.scales[scaleKey]
              const scaleMin = scale.min!
              const scaleMax = scale.max!
              const scaleRange = scaleMax - scaleMin
              const nyRange = Math.max(minZoomRange, Math.min(maxZoomRange, scaleRange * zoom))
              const nyMin = yVal - btmPct * nyRange
              const nyMax = nyMin + nyRange
              const [cyMin, cyMax] = clamp(nyRange, nyMin, nyMax, scaleRange, scaleMin, scaleMax)
              u.setScale(scaleKey, { min: cyMin, max: cyMax })
            })
            
            // Mark as interacted and notify
            hasInteracted = true
            if (onZoomChange) {
              // Zoom interaction detected
              onZoomChange(true)
            }
          })
        })

        // Pan handler
        if (enablePan) {
          let isDragging = false
          let startX = 0
          let startY = 0
          let scXMin0 = 0
          let scXMax0 = 0
          const scYMin0: Record<string, number> = {}
          const scYMax0: Record<string, number> = {}

          over.addEventListener('mousedown', (e: MouseEvent) => {
            if (e.button === panButton) {
              e.preventDefault()
              isDragging = true
              startX = e.clientX
              startY = e.clientY

              // Store current scale values
              scXMin0 = u.scales.x.min!
              scXMax0 = u.scales.x.max!

              yScaleKeys.forEach(scaleKey => {
                scYMin0[scaleKey] = u.scales[scaleKey].min!
                scYMax0[scaleKey] = u.scales[scaleKey].max!
              })

              // Change cursor
              over.style.cursor = 'grabbing'
            }
          })

          const onMouseMove = (e: MouseEvent) => {
            if (!isDragging) return

            e.preventDefault()

            const dx = startX - e.clientX
            const dy = e.clientY - startY

            const xUnitsPerPx = u.posToVal(1, 'x') - u.posToVal(0, 'x')
            const xDelta = dx * xUnitsPerPx

            u.batch(() => {
              // Pan X axis
              const newXMin = scXMin0 + xDelta
              const newXMax = scXMax0 + xDelta
              const currentXRange = newXMax - newXMin
              const [cxMin, cxMax] = clamp(currentXRange, newXMin, newXMax, xRange, xMin, xMax)
              u.setScale('x', { min: cxMin, max: cxMax })

              // Pan Y axes
              yScaleKeys.forEach(scaleKey => {
                const yUnitsPerPx = u.posToVal(1, scaleKey) - u.posToVal(0, scaleKey)
                const yDelta = dy * yUnitsPerPx
                const newYMin = scYMin0[scaleKey] + yDelta
                const newYMax = scYMax0[scaleKey] + yDelta
                const currentYRange = newYMax - newYMin
                const scale = u.scales[scaleKey]
                const scaleMin = scale.min!
                const scaleMax = scale.max!
                const scaleRange = scaleMax - scaleMin
                const [cyMin, cyMax] = clamp(currentYRange, newYMin, newYMax, scaleRange, scaleMin, scaleMax)
                u.setScale(scaleKey, { min: cyMin, max: cyMax })
              })
              
              // Mark as interacted and notify
              if (!hasInteracted) {
                hasInteracted = true
                if (onZoomChange) {
                  // Pan interaction detected
                  onZoomChange(true)
                }
              }
            })
          }

          const onMouseUp = (e: MouseEvent) => {
            if (e.button === panButton && isDragging) {
              isDragging = false
              over.style.cursor = ''
            }
          }

          window.addEventListener('mousemove', onMouseMove)
          window.addEventListener('mouseup', onMouseUp)

          // Cleanup on destroy
          const originalDestroy = u.destroy
          u.destroy = () => {
            window.removeEventListener('mousemove', onMouseMove)
            window.removeEventListener('mouseup', onMouseUp)
            originalDestroy.call(u)
          }
        }
        
        // Add reset method to uPlot instance
        const uExtended = u as uPlot & { resetZoom: () => void }
        uExtended.resetZoom = () => {
          if (Object.keys(initialScales).length === 0) {
            console.warn('[uplotZoomPlugin] No initial scales stored, cannot reset zoom')
            return
          }
          
          u.batch(() => {
            Object.keys(initialScales).forEach(key => {
              if (u.scales[key]) {
                u.setScale(key, initialScales[key])
              }
            })
            
            // Reset interaction flag and notify
            hasInteracted = false
            if (onZoomChange) {
              // Reset zoom
              onZoomChange(false)
            }
          })
        }
        
        // Keyboard shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.key === 'r' || e.key === 'R' || e.key === 'Escape') && hasInteracted) {
            e.preventDefault()
            uExtended.resetZoom()
          }
        }
        
        over.addEventListener('keydown', handleKeyDown)
        over.tabIndex = 0 // Make focusable
        
        // Cleanup keyboard listener
        const originalDestroyKb = u.destroy
        u.destroy = () => {
          over.removeEventListener('keydown', handleKeyDown)
          originalDestroyKb.call(u)
        }
      }
    }
  }
}

// Helper function to reset zoom
export function createResetZoomPlugin(): uPlot.Plugin {
  const initialScales: Record<string, { min: number; max: number }> = {}

  return {
    hooks: {
      ready: (u: uPlot) => {
        // Store initial scales
        Object.keys(u.scales).forEach(key => {
          initialScales[key] = {
            min: u.scales[key].min!,
            max: u.scales[key].max!
          }
        })

        // Add reset method to uPlot instance
        // Add resetZoom method to uPlot instance
        const uExtended = u as uPlot & { resetZoom: () => void }
        uExtended.resetZoom = () => {
          u.batch(() => {
            Object.keys(initialScales).forEach(key => {
              u.setScale(key, initialScales[key])
            })
          })
        }
      }
    }
  }
}