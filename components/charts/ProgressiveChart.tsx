'use client'

import { useRef, memo } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useProgressiveChartData, DataResolution } from '@/hooks/useProgressiveChartData'
import { UplotChart } from './UplotChart'
import { ChartLoadingState } from './ChartStates'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Copy, Edit, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildUplotOptions, transformToUplotData } from '@/lib/utils/uplotUtils'
import { AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import { Badge } from '@/components/ui/badge'

interface ProgressiveChartProps {
  config: ChartConfiguration
  selectedDataIds: number[]
  aspectRatio?: number | AspectRatioPreset
  className?: string
  onEdit?: () => void
  onDuplicate?: () => void
  onDelete?: () => void
  enableProgressive?: boolean
}

function ProgressiveChartComponent({
  config,
  selectedDataIds,
  aspectRatio,
  className,
  onEdit,
  onDuplicate,
  onDelete,
  enableProgressive = true
}: ProgressiveChartProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  
  const {
    plotData,
    dataViewport,
    loadingState,
    resolution,
    setResolution,
    isUpgrading
  } = useProgressiveChartData(config, selectedDataIds, {
    initialResolution: enableProgressive ? 'preview' : 'normal',
    autoUpgrade: enableProgressive,
    upgradeDelay: 1000
  });

  // Create uPlot options
  let aspectRatioValue = 1.5;
  if (typeof aspectRatio === 'string') {
    const presetValue = ASPECT_RATIOS[aspectRatio as AspectRatioPreset];
    aspectRatioValue = presetValue === 'auto' ? 1.5 : presetValue;
  } else if (typeof aspectRatio === 'number') {
    aspectRatioValue = aspectRatio;
  }
  
  const uplotOptions = plotData && dataViewport ? buildUplotOptions({
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
    isTimeAxis: config.chartType === 'line',
    xRange: [dataViewport.xMin, dataViewport.xMax],
    yRange: [dataViewport.yMin, dataViewport.yMax]
  }) : null;

  // Resolution badge color
  const getResolutionBadgeVariant = () => {
    switch (resolution) {
      case 'preview': return 'secondary';
      case 'normal': return 'default';
      case 'high': return 'default';
      default: return 'default';
    }
  };

  // Manual resolution upgrade
  const handleUpgradeResolution = () => {
    const resolutionOrder: DataResolution[] = ['preview', 'normal', 'high'];
    const currentIndex = resolutionOrder.indexOf(resolution);
    if (currentIndex < resolutionOrder.length - 1) {
      setResolution(resolutionOrder[currentIndex + 1]);
    }
  };

  if (loadingState.error) {
    return (
      <Card className={cn("h-full flex flex-col", className)}>
        <div className="flex items-center justify-between p-3 border-b">
          <h3 className="font-medium truncate flex-1">{config.title}</h3>
        </div>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm text-muted-foreground mb-2">Failed to load chart</p>
            <p className="text-xs text-destructive">{loadingState.error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loadingState.loading && !plotData) {
    return <ChartLoadingState title={config.title} progress={loadingState.progress} className={className} />;
  }

  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h3 className="font-medium truncate">{config.title}</h3>
          {enableProgressive && (
            <Badge 
              variant={getResolutionBadgeVariant()} 
              className="text-xs"
              onClick={resolution !== 'high' ? handleUpgradeResolution : undefined}
              style={{ cursor: resolution !== 'high' ? 'pointer' : 'default' }}
            >
              {resolution === 'preview' && 'Preview'}
              {resolution === 'normal' && 'Normal'}
              {resolution === 'high' && 'High-Res'}
              {isUpgrading && <Loader2 className="ml-1 h-2 w-2 animate-spin" />}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onEdit}>
              <Edit className="h-4 w-4" />
            </Button>
          )}
          {onDuplicate && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDuplicate}>
              <Copy className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onDelete}>
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <CardContent className="flex-1 p-4 min-h-0" ref={containerRef}>
        {plotData && uplotOptions && (
          <div className="relative h-full">
            <UplotChart
              data={transformToUplotData(
                plotData.series[0]?.xValues || [],
                plotData.series.map(s => s.yValues)
              )}
              options={uplotOptions}
              className="h-full"
            />
            {plotData.samplingInfo && (
              <div className="absolute top-0 right-0 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-bl">
                {plotData.samplingInfo.sampledCount.toLocaleString()} / {plotData.samplingInfo.originalCount.toLocaleString()} points
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const ProgressiveChart = memo(ProgressiveChartComponent);