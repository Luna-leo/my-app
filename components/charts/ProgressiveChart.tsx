'use client'

import { useRef, memo, useEffect, useState } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useProgressiveChartData, DataResolution } from '@/hooks/useProgressiveChartData'
import { UplotChart } from './UplotChart'
import { ChartLoadingState } from './ChartStates'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { buildUplotOptions } from '@/lib/utils/uplotUtils'
import { transformPlotDataToUplot } from '@/lib/utils/chartDataTransform'
import { AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import { ChartMenu } from './ChartMenu'

interface ProgressiveChartProps {
  config: ChartConfiguration
  selectedDataIds: number[]
  aspectRatio?: number | AspectRatioPreset
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  enableProgressive?: boolean
  onDataLoaded?: () => void
  globalResolution?: DataResolution
  globalAutoUpgrade?: boolean
  maxAutoUpgradeResolution?: DataResolution
}

function ProgressiveChartComponent({
  config,
  selectedDataIds,
  aspectRatio,
  className,
  onEdit,
  onDuplicate,
  onDelete,
  enableProgressive = true,
  globalResolution,
  globalAutoUpgrade = true,
  maxAutoUpgradeResolution
}: ProgressiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [isHovered, setIsHovered] = useState(false)
  
  const {
    plotData,
    dataViewport,
    loadingState,
    resolution,
    setResolution,
    isUpgrading
  } = useProgressiveChartData(config, selectedDataIds, {
    initialResolution: globalResolution || (enableProgressive ? 'preview' : 'normal'),
    autoUpgrade: globalResolution ? false : (enableProgressive && globalAutoUpgrade),
    upgradeDelay: 1000,
    maxAutoUpgradeResolution
  });

  // Update resolution when global resolution changes
  useEffect(() => {
    if (globalResolution && globalResolution !== resolution) {
      setResolution(globalResolution);
    }
  }, [globalResolution, resolution, setResolution]);


  // Create uPlot options
  let aspectRatioValue = 1.5;
  if (typeof aspectRatio === 'string') {
    const presetValue = ASPECT_RATIOS[aspectRatio as AspectRatioPreset];
    aspectRatioValue = presetValue === 'auto' ? 1.5 : presetValue;
  } else if (typeof aspectRatio === 'number') {
    aspectRatioValue = aspectRatio;
  }
  
  const uplotOptions = plotData && dataViewport && plotData.series.length > 0 ? (() => {
    // For time-based charts, convert viewport x values to seconds
    const xRange: [number, number] = config.xAxisParameter === 'timestamp' 
      ? [dataViewport.xMin / 1000, dataViewport.xMax / 1000]
      : [dataViewport.xMin, dataViewport.xMax];
    
    return buildUplotOptions({
      width: 800, // Default width, will be adjusted by ResizeObserver
      height: Math.round(800 / aspectRatioValue),
      xLabel: plotData.xParameterInfo 
        ? `${plotData.xParameterInfo.parameterName} [${plotData.xParameterInfo.unit || ''}]`
        : 'Time',
      yLabel: plotData.series.length > 0
        ? `${plotData.series[0].parameterInfo.parameterName}${plotData.series[0].parameterInfo.unit ? ` [${plotData.series[0].parameterInfo.unit}]` : ''}`
        : 'Value',
      seriesNames: plotData.series.map(series => 
        `${series.metadataLabel} - ${series.parameterInfo.parameterName}`
      ),
      chartType: config.chartType,
      isTimeAxis: config.xAxisParameter === 'timestamp',
      showLegend: false,
      xRange: xRange,
      yRange: [dataViewport.yMin, dataViewport.yMax]
    });
  })() : null;


  // Handle resolution change
  const handleResolutionChange = (value: string) => {
    setResolution(value as DataResolution);
  };

  if (loadingState.error) {
    return (
      <Card className={cn("h-full flex flex-col border border-gray-200 dark:border-gray-700 rounded-none shadow-none", className)}>
        <CardContent className="flex-1 flex items-center justify-center p-0">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Failed to load chart</p>
            <p className="text-xs text-destructive">{loadingState.error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadingState.loading && !plotData) {
    return <ChartLoadingState title={config.title} progress={loadingState.progress} className={className} aspectRatio={aspectRatioValue} />;
  }

  return (
    <Card 
      className={cn("h-full flex flex-col border border-gray-200 dark:border-gray-700 rounded-none shadow-none relative", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="flex-1 p-0 relative" ref={containerRef}>
        {plotData && plotData.series.length > 0 && uplotOptions ? (
          <div className="relative h-full w-full">
            <UplotChart
              data={transformPlotDataToUplot(plotData, config)}
              options={uplotOptions}
              className="h-full"
            />
            {plotData.samplingInfo && (
              <div className={cn(
                "absolute top-0 left-0 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-br transition-opacity",
                isHovered ? "opacity-100" : "opacity-0"
              )}>
                {plotData.samplingInfo.sampledCount.toLocaleString()} / {plotData.samplingInfo.originalCount.toLocaleString()} points
              </div>
            )}
            {/* Overlay menu button */}
            <ChartMenu
              isHovered={isHovered}
              enableProgressive={enableProgressive}
              globalResolution={globalResolution}
              resolution={resolution}
              isUpgrading={isUpgrading}
              onResolutionChange={handleResolutionChange}
              onEdit={onEdit}
              onDuplicate={onDuplicate}
              onDelete={onDelete}
            />
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              {selectedDataIds.length === 0 
                ? "No data selected - Please select data from the Data Management dialog"
                : "No data to display - Please re-import CSV data if you reloaded the page"}
            </p>
          </div>
        )}
        {/* Overlay menu button for empty state */}
        {(!plotData || plotData.series.length === 0) && (
          <ChartMenu
            isHovered={isHovered}
            onEdit={onEdit}
            onDuplicate={onDuplicate}
            onDelete={onDelete}
          />
        )}
      </CardContent>
    </Card>
  );
}

export const ProgressiveChart = memo(ProgressiveChartComponent);