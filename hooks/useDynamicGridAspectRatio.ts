import { useEffect, useState, RefObject } from 'react'
import { LayoutOption } from '@/components/layout/LayoutSelector'

interface UseDynamicGridAspectRatioOptions {
  layoutOption: LayoutOption | null
  containerRef: RefObject<HTMLElement | null>
  gap?: number
  minChartHeight?: number
  cardPadding?: number // Total vertical padding inside each card
}

export function useDynamicGridAspectRatio({
  layoutOption,
  containerRef,
  gap = 16, // Default Tailwind gap-4
  minChartHeight = 300,
  cardPadding = 52 // Card internal vertical padding (py-3 + header + content + inner div)
}: UseDynamicGridAspectRatioOptions) {
  const [aspectRatio, setAspectRatio] = useState<number>(1.5) // Default aspect ratio

  useEffect(() => {
    if (!layoutOption || !containerRef.current) {
      setAspectRatio(1.5) // Reset to default
      return
    }

    const calculateAspectRatio = () => {
      // Get parent container dimensions
      const container = containerRef.current
      if (!container) return
      
      const containerHeight = container.clientHeight
      const containerWidth = container.clientWidth
      
      if (!containerHeight || !containerWidth) return

      // Calculate available space for cards
      const totalVerticalGaps = (layoutOption.rows - 1) * gap
      const totalHorizontalGaps = (layoutOption.cols - 1) * gap
      
      // Calculate card dimensions
      const cardHeight = (containerHeight - totalVerticalGaps) / layoutOption.rows
      const cardWidth = (containerWidth - totalHorizontalGaps) / layoutOption.cols
      
      // Calculate actual chart dimensions (card minus padding)
      const chartHeight = Math.max(cardHeight - cardPadding, minChartHeight)
      const chartWidth = cardWidth

      // Calculate dynamic aspect ratio based on actual chart area
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
  }, [layoutOption, containerRef, gap, minChartHeight, cardPadding])

  return aspectRatio
}