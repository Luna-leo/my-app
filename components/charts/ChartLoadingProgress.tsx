'use client'

import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { useEffect, useState } from 'react'

interface ChartLoadingProgressProps {
  totalCharts: number
  loadedCharts: number
  className?: string
  showEstimatedTime?: boolean
}

export function ChartLoadingProgress({
  totalCharts,
  loadedCharts,
  className,
  showEstimatedTime = true
}: ChartLoadingProgressProps) {
  const [startTime] = useState(Date.now())
  const [estimatedTimeRemaining, setEstimatedTimeRemaining] = useState<number | null>(null)
  
  const progress = totalCharts > 0 ? (loadedCharts / totalCharts) * 100 : 0
  
  useEffect(() => {
    if (loadedCharts > 0 && loadedCharts < totalCharts) {
      const elapsedTime = Date.now() - startTime
      const averageTimePerChart = elapsedTime / loadedCharts
      const remainingCharts = totalCharts - loadedCharts
      const estimated = remainingCharts * averageTimePerChart
      setEstimatedTimeRemaining(estimated)
    } else if (loadedCharts === totalCharts) {
      setEstimatedTimeRemaining(0)
    }
  }, [loadedCharts, totalCharts, startTime])
  
  const formatTime = (ms: number) => {
    const seconds = Math.ceil(ms / 1000)
    if (seconds < 60) {
      return `${seconds}s`
    }
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return `${minutes}m ${remainingSeconds}s`
  }
  
  if (loadedCharts === totalCharts && totalCharts > 0) {
    // All charts loaded - hide progress after animation
    return null
  }
  
  return (
    <div className={cn("w-full space-y-2", className)}>
      <div className="flex justify-between text-sm text-muted-foreground">
        <span>
          Loading charts: {loadedCharts} / {totalCharts}
        </span>
        {showEstimatedTime && estimatedTimeRemaining !== null && estimatedTimeRemaining > 0 && (
          <span>
            ~{formatTime(estimatedTimeRemaining)} remaining
          </span>
        )}
      </div>
      <Progress value={progress} className="h-2" />
    </div>
  )
}