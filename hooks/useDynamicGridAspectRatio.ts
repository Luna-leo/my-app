import { useEffect, useState, RefObject } from 'react'
import { LayoutOption } from '@/components/layout/LayoutSelector'

interface UseDynamicGridAspectRatioOptions {
  layoutOption: LayoutOption | null
  containerRef: RefObject<HTMLElement | null>
  headerHeight?: number
  gap?: number
  minChartHeight?: number
  padding?: number
}

export function useDynamicGridAspectRatio({
  layoutOption,
  containerRef,
  headerHeight = 200, // Approximate header + controls height
  gap = 16, // Default Tailwind gap-4
  minChartHeight = 300,
  padding = 32 // Default Tailwind p-8
}: UseDynamicGridAspectRatioOptions) {
  const [aspectRatio, setAspectRatio] = useState<number>(1.5) // Default aspect ratio

  useEffect(() => {
    if (!layoutOption || !containerRef.current) {
      setAspectRatio(1.5) // Reset to default
      return
    }

    const calculateAspectRatio = () => {
      const viewportHeight = window.innerHeight
      const containerWidth = containerRef.current?.clientWidth || 0

      // Calculate available height for charts
      const totalVerticalGaps = (layoutOption.rows - 1) * gap
      const availableHeight = viewportHeight - headerHeight - totalVerticalGaps - (padding * 2)
      
      // Calculate chart dimensions
      const chartHeight = Math.max(availableHeight / layoutOption.rows, minChartHeight)
      const totalHorizontalGaps = (layoutOption.cols - 1) * gap
      const chartWidth = (containerWidth - totalHorizontalGaps) / layoutOption.cols

      // Calculate dynamic aspect ratio
      const dynamicRatio = chartWidth / chartHeight
      
      // Clamp aspect ratio to reasonable bounds
      const clampedRatio = Math.max(0.5, Math.min(3, dynamicRatio))
      
      setAspectRatio(clampedRatio)
    }

    // Initial calculation
    calculateAspectRatio()

    // Recalculate on window resize
    const handleResize = () => {
      calculateAspectRatio()
    }

    window.addEventListener('resize', handleResize)
    
    // Also observe container size changes
    const resizeObserver = new ResizeObserver(() => {
      calculateAspectRatio()
    })
    
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current)
    }

    return () => {
      window.removeEventListener('resize', handleResize)
      resizeObserver.disconnect()
    }
  }, [layoutOption, containerRef, headerHeight, gap, minChartHeight, padding])

  return aspectRatio
}