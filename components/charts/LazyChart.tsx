'use client'

import { useEffect, useRef, useState } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { PlotlyChartWithDataOptimized } from './PlotlyChartWithDataOptimized'
import { ChartLoadingState } from './ChartStates'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'

interface LazyChartProps {
  config: ChartConfiguration
  aspectRatio?: number | AspectRatioPreset
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  threshold?: number
  rootMargin?: string
}

export function LazyChart({
  config,
  aspectRatio,
  className,
  onEdit,
  onDuplicate,
  onDelete,
  threshold = 0.1,
  rootMargin = '100px'
}: LazyChartProps) {
  const [hasBeenVisible, setHasBeenVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !hasBeenVisible) {
            setHasBeenVisible(true)
          }
        })
      },
      {
        threshold,
        rootMargin
      }
    )

    observer.observe(element)

    return () => {
      observer.unobserve(element)
    }
  }, [threshold, rootMargin, hasBeenVisible])

  return (
    <div ref={containerRef} className={className}>
      {hasBeenVisible ? (
        <PlotlyChartWithDataOptimized
          config={config}
          aspectRatio={aspectRatio}
          className={className}
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
        />
      ) : (
        <ChartLoadingState
          title={config.title}
          progress={0}
          className={className}
        />
      )}
    </div>
  )
}