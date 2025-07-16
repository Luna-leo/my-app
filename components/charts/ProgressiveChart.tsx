'use client'

import { useRef, memo, useEffect, useState } from 'react'
import { ChartConfiguration } from '@/components/chart-creation/CreateChartDialog'
import { useProgressiveChartData, DataResolution } from '@/hooks/useProgressiveChartData'
import { UplotChart } from './UplotChart'
import { ChartLoadingState } from './ChartStates'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Trash2, Copy, Edit, Loader2, MoreVertical } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buildUplotOptions, transformToUplotData } from '@/lib/utils/uplotUtils'
import { AspectRatioPreset, ASPECT_RATIOS } from '@/hooks/useChartDimensions'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
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


  // Resolution labels and info (per dataset)
  const resolutionInfo: Record<DataResolution, { label: string; description: string }> = {
    preview: { label: 'Preview', description: '100 pts/dataset - Ultra fast' },
    normal: { label: 'Normal', description: '500 pts/dataset - Balanced' },
    high: { label: 'High-Res', description: '1,000 pts/dataset - Detailed' },
    full: { label: 'Full', description: 'All points - Maximum detail' }
  };
  

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
              data={(() => {
                if (config.xAxisParameter === 'timestamp') {
                  // For time series, always use unified x-axis approach to ensure consistent rendering
                  // across different resolutions. Use null for missing values.
                  const allTimestamps = new Set<number>();
                  plotData.series.forEach(series => {
                    series.xValues.forEach(x => allTimestamps.add(x));
                  });
                  
                  const unifiedXValues = Array.from(allTimestamps).sort((a, b) => a - b);
                  const xValues = unifiedXValues.map(x => x / 1000);
                  
                  const ySeriesData: number[][] = plotData.series.map(series => {
                    const valueMap = new Map<number, number>();
                    series.xValues.forEach((x, i) => {
                      valueMap.set(x, series.yValues[i]);
                    });
                    
                    // Map values to unified x-axis, using NaN for missing data (uPlot handles NaN as gaps)
                    return unifiedXValues.map(x => {
                      const value = valueMap.get(x);
                      return value !== undefined ? value : NaN;
                    });
                  });
                  
                  return transformToUplotData(xValues, ySeriesData);
                } else {
                  // For non-time series (XY charts), use the original logic
                  const xValues = plotData.series[0]?.xValues || [];
                  const ySeriesData = plotData.series.map(s => s.yValues || []);
                  return transformToUplotData(xValues, ySeriesData);
                }
              })()}
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "absolute top-2 right-2 h-8 w-8 transition-opacity",
                    isHovered ? "opacity-100" : "opacity-30 hover:opacity-100"
                  )}
                >
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {enableProgressive && !globalResolution && (
                  <>
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger>
                        {isUpgrading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        Resolution: {resolutionInfo[resolution].label}
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent>
                        <DropdownMenuRadioGroup value={resolution} onValueChange={handleResolutionChange}>
                          {Object.entries(resolutionInfo).map(([key, info]) => (
                            <DropdownMenuRadioItem key={key} value={key} className="flex flex-col items-start py-2">
                              <span className="font-medium">{info.label}</span>
                              <span className="text-xs text-muted-foreground">{info.description}</span>
                            </DropdownMenuRadioItem>
                          ))}
                        </DropdownMenuRadioGroup>
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                    <DropdownMenuSeparator />
                  </>
                )}
                {onEdit && (
                  <DropdownMenuItem onClick={onEdit}>
                    <Edit className="mr-2 h-4 w-4" />
                    Edit
                  </DropdownMenuItem>
                )}
                {onDuplicate && (
                  <DropdownMenuItem onClick={onDuplicate}>
                    <Copy className="mr-2 h-4 w-4" />
                    Duplicate
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <DropdownMenuItem onClick={onDelete} className="text-destructive">
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-muted-foreground">
              {selectedDataIds.length === 0 
                ? "No data selected - Please select data from the Data Management dialog"
                : "No data to display"}
            </p>
          </div>
        )}
        {/* Overlay menu button for empty state */}
        {(!plotData || plotData.series.length === 0) && (onEdit || onDuplicate || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "absolute top-2 right-2 h-8 w-8 transition-opacity",
                  isHovered ? "opacity-100" : "opacity-30 hover:opacity-100"
                )}
              >
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDuplicate && (
                <DropdownMenuItem onClick={onDuplicate}>
                  <Copy className="mr-2 h-4 w-4" />
                  Duplicate
                </DropdownMenuItem>
              )}
              {onDelete && (
                <DropdownMenuItem onClick={onDelete} className="text-destructive">
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </CardContent>
    </Card>
  );
}

export const ProgressiveChart = memo(ProgressiveChartComponent);