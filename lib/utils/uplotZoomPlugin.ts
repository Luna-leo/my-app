import uPlot from 'uplot'

export interface WheelZoomPluginOptions {
  factor?: number
  minZoomRange?: number
  maxZoomRange?: number
  enablePan?: boolean
  panButton?: number // 0: left, 1: middle, 2: right
  onZoomChange?: (isZoomed: boolean) => void
  debug?: boolean // Enable debug logging
}

export function createWheelZoomPlugin(opts: WheelZoomPluginOptions = {}): uPlot.Plugin {
  const factor = opts.factor ?? 0.75
  const minZoomRange = opts.minZoomRange ?? 0.001
  const maxZoomRange = opts.maxZoomRange ?? Number.MAX_VALUE
  const enablePan = opts.enablePan ?? true
  const panButton = opts.panButton ?? 1 // Middle mouse button by default
  const onZoomChange = opts.onZoomChange
  const debug = opts.debug ?? true // Enable debug by default for now

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
      init: (u: uPlot) => {
        // Register double-click handler as early as possible in init hook
        const over = u.over
        
        console.log('[uplotZoomPlugin] 🚀 INIT HOOK CALLED - Plugin is being initialized!')
        console.log('[uplotZoomPlugin] Chart element in init:', over)
        
        if (debug) {
          console.log('[uplotZoomPlugin] Early init - registering double-click handler')
        }
        
        // Double-click handler - register FIRST before any other handlers
        const earlyDblClickHandler = (e: MouseEvent) => {
          console.log('[uplotZoomPlugin] EARLY Double-click captured!', e)
          // Let the main handler process it, but log that we caught it
        }
        
        over.addEventListener('dblclick', earlyDblClickHandler, true)
      },
      ready: (u: uPlot) => {
        const over = u.over
        
        console.log('[uplotZoomPlugin] 🎯 READY HOOK CALLED - Plugin is ready!')
        
        if (debug) {
          console.log('[uplotZoomPlugin] Plugin ready, initializing...')
          console.log('[uplotZoomPlugin] Chart element:', over)
          console.log('[uplotZoomPlugin] Chart scales:', u.scales)
        }

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
          if (debug) {
            console.log('[uplotZoomPlugin] Stored initial scales:', initialScales)
          }
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

        // Pan handler variables - declare outside to make them accessible in destroy
        let onMouseMove: ((e: MouseEvent) => void) | null = null
        let onMouseUp: ((e: MouseEvent) => void) | null = null
        
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

          onMouseMove = (e: MouseEvent) => {
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

          onMouseUp = (e: MouseEvent) => {
            if (e.button === panButton && isDragging) {
              isDragging = false
              over.style.cursor = ''
            }
          }

          window.addEventListener('mousemove', onMouseMove)
          window.addEventListener('mouseup', onMouseUp)
        }
        
        // Add reset method to uPlot instance
        const uExtended = u as uPlot & { 
          resetZoom: () => void; 
          _debugInfo?: {
            hasInteracted: () => boolean;
            initialScales: () => Record<string, { min: number; max: number }>;
            forceReset: () => void;
          }
        }
        uExtended.resetZoom = () => {
          console.log('[uplotZoomPlugin] resetZoom called')
          if (Object.keys(initialScales).length === 0) {
            console.warn('[uplotZoomPlugin] No initial scales stored, cannot reset zoom')
            return
          }
          
          u.batch(() => {
            Object.keys(initialScales).forEach(key => {
              if (u.scales[key]) {
                console.log(`[uplotZoomPlugin] Resetting scale ${key} to:`, initialScales[key])
                u.setScale(key, initialScales[key])
              }
            })
            
            // Reset interaction flag and notify
            hasInteracted = false
            if (onZoomChange) {
              console.log('[uplotZoomPlugin] Notifying zoom change: false')
              onZoomChange(false)
            }
          })
        }
        
        // For debugging - expose chart instance globally
        uExtended._debugInfo = {
          hasInteracted: () => hasInteracted,
          initialScales: () => initialScales,
          forceReset: () => {
            console.log('[uplotZoomPlugin] Force reset called from debug')
            uExtended.resetZoom()
          }
        }
        
        // Expose to window for debugging
        if (typeof window !== 'undefined') {
          (window as Window & { __uplotChart?: typeof uExtended }).__uplotChart = uExtended
        }
        
        // Keyboard shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
          if ((e.key === 'r' || e.key === 'R' || e.key === 'Escape') && hasInteracted) {
            e.preventDefault()
            uExtended.resetZoom()
          }
        }
        
        // Double-click to reset zoom
        const handleDblClick = (e: MouseEvent) => {
          if (debug || true) { // Always log double-click for now
            console.log('[uplotZoomPlugin] Double-click detected, hasInteracted:', hasInteracted)
            console.log('[uplotZoomPlugin] Double-click event details:', {
              target: e.target,
              currentTarget: e.currentTarget,
              eventPhase: e.eventPhase,
              bubbles: e.bubbles,
              cancelable: e.cancelable,
              defaultPrevented: e.defaultPrevented
            })
          }
          
          e.preventDefault()
          e.stopPropagation() // Prevent event from being captured by other handlers
          e.stopImmediatePropagation() // Stop other handlers on the same element
          
          // Always allow double-click to reset, regardless of hasInteracted state
          // This ensures the user can always reset even if state tracking fails
          if (Object.keys(initialScales).length > 0) {
            console.log('[uplotZoomPlugin] Forcing reset zoom via double-click')
            console.log('[uplotZoomPlugin] Initial scales:', initialScales)
            console.log('[uplotZoomPlugin] Current scales:', {
              x: { min: u.scales.x.min, max: u.scales.x.max },
              ...Object.keys(u.scales).filter(k => k !== 'x').reduce((acc, k) => {
                acc[k] = { min: u.scales[k].min ?? null, max: u.scales[k].max ?? null }
                return acc
              }, {} as Record<string, { min: number | null, max: number | null }>)
            })
            
            u.batch(() => {
              Object.keys(initialScales).forEach(key => {
                if (u.scales[key]) {
                  console.log(`[uplotZoomPlugin] Resetting scale ${key} to:`, initialScales[key])
                  u.setScale(key, initialScales[key])
                }
              })
              
              // Reset interaction flag and notify
              hasInteracted = false
              if (onZoomChange) {
                console.log('[uplotZoomPlugin] Notifying zoom change: false')
                onZoomChange(false)
              }
            })
            
            console.log('[uplotZoomPlugin] Zoom reset complete')
          } else {
            console.warn('[uplotZoomPlugin] No initial scales stored, cannot reset')
          }
        }
        
        // Add event listeners with capture phase for higher priority
        over.addEventListener('keydown', handleKeyDown)
        over.addEventListener('dblclick', handleDblClick, true) // Use capture phase
        over.tabIndex = 0 // Make focusable
        
        // Log that we've added the double-click handler
        console.log('[uplotZoomPlugin] ✅ Double-click handler registered on element:', over)
        console.log('[uplotZoomPlugin] ✅ Element info:', {
          tagName: over.tagName,
          className: over.className,
          hasEventListeners: true,
          capturePhase: true
        })
        
        // Test if dblclick events work at all
        const testDblClick = () => {
          console.log('[uplotZoomPlugin] Testing double-click event registration...')
          const testHandler = (e: MouseEvent) => {
            console.log('[uplotZoomPlugin] TEST: Double-click event fired!', e)
          }
          over.addEventListener('dblclick', testHandler)
          setTimeout(() => {
            over.removeEventListener('dblclick', testHandler)
          }, 30000) // Remove test handler after 30 seconds
        }
        if (debug) {
          testDblClick()
        }
        
        // Add click event listener for debugging
        over.addEventListener('click', (e: MouseEvent) => {
          if (debug) {
            console.log('[uplotZoomPlugin] Click detected, detail:', e.detail, 'hasInteracted:', hasInteracted)
          }
        }, true) // Also use capture phase for debugging
        
        // Add mousedown listener for debugging
        over.addEventListener('mousedown', (e: MouseEvent) => {
          if (debug) {
            console.log('[uplotZoomPlugin] Mousedown detected, detail:', e.detail, 'button:', e.button)
          }
        }, true) // Capture phase to see it before selection plugin
        
        // Ensure the element can receive focus
        over.style.outline = 'none' // Remove default focus outline
        
        // Focus on mouse enter to ensure keyboard events work
        const handleMouseEnter = () => {
          if (document.activeElement !== over) {
            over.focus()
          }
        }
        over.addEventListener('mouseenter', handleMouseEnter)
        
        
        // Consolidated cleanup on destroy
        const originalDestroy = u.destroy
        u.destroy = () => {
          // Remove zoom/keyboard event listeners
          if (over) {
            over.removeEventListener('keydown', handleKeyDown)
            over.removeEventListener('dblclick', handleDblClick, true) // Remove from capture phase
            over.removeEventListener('mouseenter', handleMouseEnter)
          }
          
          // Remove pan event listeners
          if (onMouseMove) {
            window.removeEventListener('mousemove', onMouseMove)
          }
          if (onMouseUp) {
            window.removeEventListener('mouseup', onMouseUp)
          }
          
          // Call original destroy
          originalDestroy.call(u)
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

// Double-click reset plugin with sync support
export function createDoubleClickResetPlugin(opts: { 
  debug?: boolean,
  chartId?: string,
  onReset?: () => void 
} = {}): uPlot.Plugin {
  const initialScales: Record<string, { min: number; max: number }> = {}
  const debug = opts.debug ?? false
  const onReset = opts.onReset
  
  return {
    hooks: {
      ready: (u: uPlot) => {
        const over = u.over
        
        if (debug) {
          console.log('[DoubleClickReset] Plugin ready, registering handlers')
        }
        
        // Store initial scales
        Object.keys(u.scales).forEach(key => {
          const scale = u.scales[key]
          if (scale.min != null && scale.max != null) {
            initialScales[key] = {
              min: scale.min,
              max: scale.max
            }
          }
        })
        
        if (debug) {
          console.log('[DoubleClickReset] Stored initial scales:', initialScales)
        }
        
        // Add resetZoom method to uPlot instance
        const uExtended = u as uPlot & { resetZoom: () => void }
        uExtended.resetZoom = () => {
          if (debug) {
            console.log('[DoubleClickReset] resetZoom called')
          }
          if (Object.keys(initialScales).length === 0) {
            console.warn('[DoubleClickReset] No initial scales stored, cannot reset')
            return
          }
          
          u.batch(() => {
            Object.keys(initialScales).forEach(key => {
              if (u.scales[key]) {
                if (debug) {
                  console.log(`[DoubleClickReset] Resetting scale ${key} to:`, initialScales[key])
                }
                u.setScale(key, initialScales[key])
              }
            })
          })
        }
        
        // Double-click handler
        const handleDblClick = (e: MouseEvent) => {
          if (debug) {
            console.log('[DoubleClickReset] Double-click detected!')
          }
          e.preventDefault()
          e.stopPropagation()
          e.stopImmediatePropagation()
          
          // Always reset on double-click
          uExtended.resetZoom()
          
          // Notify about reset for sync
          if (onReset) {
            onReset()
          }
        }
        
        // Register handler with capture phase for higher priority
        over.addEventListener('dblclick', handleDblClick, true)
        
        if (debug) {
          console.log('[DoubleClickReset] Double-click handler registered on element:', over)
        }
        
        // Cleanup on destroy
        const originalDestroy = u.destroy
        u.destroy = () => {
          if (over) {
            over.removeEventListener('dblclick', handleDblClick, true)
          }
          originalDestroy.call(u)
        }
      }
    }
  }
}