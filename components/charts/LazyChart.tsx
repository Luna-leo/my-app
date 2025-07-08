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
  const [isVisible, setIsVisible] = useState(false)
  const [hasBeenVisible, setHasBeenVisible] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setIsVisible(true)
            if (!hasBeenVisible) {
              setHasBeenVisible(true)
            }
          } else {
            setIsVisible(false)
          }
        })
      },
      {
        threshold,
        rootMargin
      }
    )

    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => {
      if (containerRef.current) {
        observer.unobserve(containerRef.current)
      }
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