'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { getDataChartComponent } from './ChartProvider'
import { ChartLoadingState } from './ChartStates'
import { cn } from '@/lib/utils'
import { AspectRatioPreset } from '@/hooks/useChartDimensions'
import { SamplingConfig } from '@/lib/utils/chartDataSampling'
import { DataResolution } from '@/hooks/useProgressiveChartData'
// Use CSS animations instead of framer-motion
import { AlertCircle } from 'lucide-react'

interface WaterfallChartLoaderProps {
  config: ChartConfiguration & { id: string }
  selectedDataIds: number[]
  aspectRatio?: number | AspectRatioPreset
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  samplingConfig?: SamplingConfig
  enableProgressive?: boolean
  index: number
  onLoadComplete?: (index: number) => void
  shouldLoad: boolean
  showSkeleton?: boolean
  globalResolution?: DataResolution
  globalAutoUpgrade?: boolean
  isAlreadyLoaded?: boolean
  maxAutoUpgradeResolution?: DataResolution
}

type LoadingStatus = 'pending' | 'loading' | 'loaded' | 'error'

export function WaterfallChartLoader({
  config,
  selectedDataIds,
  aspectRatio,
  className,
  onEdit,
  onDuplicate,
  onDelete,
  samplingConfig,
  enableProgressive = true,
  index,
  onLoadComplete,
  shouldLoad,
  showSkeleton = true,
  globalResolution,
  globalAutoUpgrade,
  isAlreadyLoaded = false,
  maxAutoUpgradeResolution
}: WaterfallChartLoaderProps) {
  const [status, setStatus] = useState<LoadingStatus>(isAlreadyLoaded ? 'loaded' : 'pending')
  const [error, setError] = useState<string | null>(null)
  const hasStartedLoading = useRef(isAlreadyLoaded)
  const hasCalledLoadComplete = useRef(false)
  
  const ChartComponent = getDataChartComponent()
  
  // Reset refs when config.id changes, unless already loaded
  useEffect(() => {
    if (!isAlreadyLoaded) {
      hasStartedLoading.current = false
      hasCalledLoadComplete.current = false
      setStatus('pending')
      setError(null)
    } else {
      // If already loaded, ensure status is set correctly
      setStatus('loaded')
      hasStartedLoading.current = true
    }
  }, [config.id, isAlreadyLoaded])
  
  // Cleanup on unmount
  useEffect(() => {
    return () => {
      hasStartedLoading.current = false
      hasCalledLoadComplete.current = false
    }
  }, [])

  useEffect(() => {
    // Reset the flag when shouldLoad changes to false
    if (!shouldLoad) {
      hasCalledLoadComplete.current = false
    }
    
    // If already loaded and shouldLoad is true, call onLoadComplete immediately
    if (shouldLoad && (status === 'loaded' || isAlreadyLoaded) && onLoadComplete && !hasCalledLoadComplete.current) {
      hasCalledLoadComplete.current = true
      // If status is not yet 'loaded' but isAlreadyLoaded is true, set it
      if (isAlreadyLoaded && status !== 'loaded') {
        setStatus('loaded')
      }
      onLoadComplete(index)
      return
    }
    
    if (shouldLoad && !hasStartedLoading.current && status === 'pending') {
      hasStartedLoading.current = true
      setStatus('loading')
      
      // Simulate minimum loading time for better UX
      const minLoadTime = 500
      const startTime = Date.now()
      
      // Use a small delay to ensure smooth animation
      setTimeout(() => {
        const loadComplete = () => {
          const elapsed = Date.now() - startTime
          const remainingTime = Math.max(0, minLoadTime - elapsed)
          
          setTimeout(() => {
            setStatus('loaded')
            hasCalledLoadComplete.current = true
            onLoadComplete?.(index)
          }, remainingTime)
        }
        
        // For now, we'll just mark as loaded
        // The actual data loading happens inside the chart component
        loadComplete()
      }, 100)
    }
  }, [shouldLoad, status, index, onLoadComplete, config.id, isAlreadyLoaded])

  // Retry functionality
  const handleRetry = useCallback(() => {
    setStatus('pending')
    setError(null)
    hasStartedLoading.current = false
  }, [])

  // Render based on status
  const renderContent = () => {
    switch (status) {
      case 'pending':
        return showSkeleton ? (
          <ChartLoadingState
            title={config.title}
            progress={0}
            className="h-full"
            aspectRatio={typeof aspectRatio === 'number' ? aspectRatio : 1.5}
          />
        ) : null

      case 'loading':
        return (
          <ChartLoadingState
            title={config.title}
            progress={50}
            className="h-full"
            aspectRatio={typeof aspectRatio === 'number' ? aspectRatio : 1.5}
          />
        )

      case 'loaded':
        return (
          <div className="h-full relative animate-in fade-in-0 zoom-in-95 duration-300">
            <ChartComponent
              config={config}
              selectedDataIds={selectedDataIds}
              aspectRatio={aspectRatio}
              className="h-full"
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
              samplingConfig={samplingConfig}
              globalResolution={globalResolution}
              globalAutoUpgrade={globalAutoUpgrade}
              enableProgressive={enableProgressive}
              maxAutoUpgradeResolution={maxAutoUpgradeResolution}
            />
            
          </div>
        )

      case 'error':
        return (
          <div className="h-full flex flex-col items-center justify-center p-4">
            <AlertCircle className="w-8 h-8 text-destructive mb-2" />
            <p className="text-sm text-muted-foreground text-center mb-2">
              Failed to load chart
            </p>
            <p className="text-xs text-muted-foreground text-center mb-4">
              {error || 'Unknown error'}
            </p>
            <button
              onClick={handleRetry}
              className="text-xs text-primary hover:underline"
            >
              Retry
            </button>
          </div>
        )
    }
  }

  return (
    <div className={cn("h-full w-full", className)}>
      {renderContent()}
    </div>
  )
}