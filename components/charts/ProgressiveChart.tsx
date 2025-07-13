'use client'

import { useRef, memo, useEffect } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useProgressiveChartData, DataResolution } from '@/hooks/useProgressiveChartData'
import { UplotChart } from './UplotChart'
import { ChartLoadingState } from './ChartStates'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Copy, Edit, Loader2, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildUplotOptions, transformToUplotData } from '@/lib/utils/uplotUtils'
import { AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

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
  globalAutoUpgrade = true
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
    initialResolution: globalResolution || (enableProgressive ? 'preview' : 'normal'),
    autoUpgrade: globalResolution ? false : (enableProgressive && globalAutoUpgrade),
    upgradeDelay: 1000
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


  // Resolution labels and info
  const resolutionInfo: Record<DataResolution, { label: string; description: string }> = {
    preview: { label: 'Preview', description: '500 pts - Fast initial display' },
    normal: { label: 'Normal', description: '2,000 pts - Balanced quality' },
    high: { label: 'High-Res', description: '5,000 pts - Detailed view' },
    full: { label: 'Full', description: 'All points - Maximum detail' }
  };

  // Handle resolution change
  const handleResolutionChange = (value: string) => {
    setResolution(value as DataResolution);
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-7 text-xs gap-1"
                  disabled={!!globalResolution}
                >
                  {isUpgrading ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : null}
                  {resolutionInfo[resolution].label}
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-56">
                <DropdownMenuRadioGroup value={resolution} onValueChange={handleResolutionChange}>
                  {Object.entries(resolutionInfo).map(([key, info]) => (
                    <DropdownMenuRadioItem key={key} value={key} className="flex flex-col items-start py-2">
                      <span className="font-medium">{info.label}</span>
                      <span className="text-xs text-muted-foreground">{info.description}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
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
      <CardContent className="flex-1 p-4 min-h-[200px]" ref={containerRef}>
        {plotData && plotData.series.length > 0 && uplotOptions ? (
          <div className="relative h-full w-full">
            <UplotChart
              data={(() => {
                // Convert timestamps to seconds if this is a time-based chart
                const xValues = config.xAxisParameter === 'timestamp' 
                  ? (plotData.series[0]?.xValues || []).map(x => x / 1000)
                  : (plotData.series[0]?.xValues || []);
                
                const ySeriesData = plotData.series.map(s => s.yValues || []);
                
                return transformToUplotData(xValues, ySeriesData);
              })()}
              options={uplotOptions}
              className="h-full"
            />
            {plotData.samplingInfo && (
              <div className="absolute top-0 right-0 text-xs text-muted-foreground bg-background/80 px-2 py-1 rounded-bl">
                {plotData.samplingInfo.sampledCount.toLocaleString()} / {plotData.samplingInfo.originalCount.toLocaleString()} points
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">No data to display</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export const ProgressiveChart = memo(ProgressiveChartComponent);