'use client'

import { useEffect, useRef, useState } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { getDataChartComponent } from './ChartProvider'
import { ChartLoadingState } from './ChartStates'
import { cn } from '@/lib/utils'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'

interface LazyChartProps {
  config: ChartConfiguration
  aspectRatio?: number | AspectRatioPreset
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  threshold?: number
  rootMargin?: string
  samplingConfig?: SamplingConfig
}

export function LazyChart({
  config,
  aspectRatio,
  className,
  onEdit,
  onDuplicate,
  onDelete,
  threshold = 0.1,
  rootMargin = '100px',
  samplingConfig
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

  const ChartComponent = getDataChartComponent()

  return (
    <div ref={containerRef} className={cn("h-full", className)}>
      {hasBeenVisible ? (
        <ChartComponent
          config={config}
          aspectRatio={aspectRatio}
          className="h-full"
          onEdit={onEdit}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          samplingConfig={samplingConfig}
        />
      ) : (
        <ChartLoadingState
          title={config.title}
          progress={0}
          className="h-full"
        />
      )}
    </div>
  )
}