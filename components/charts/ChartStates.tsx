import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChartLoadingStateProps {
  title: string;
  progress: number;
  className?: string;
  aspectRatio?: number;
}

export function ChartLoadingState({ title, progress, className, aspectRatio = 1.5 }: ChartLoadingStateProps) {
  return (
    <Card className={cn("h-full flex flex-col rounded-none shadow-none border border-gray-200 dark:border-gray-700", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription className="animate-pulse">Loading chart data...</CardDescription>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col p-0 min-h-0">
        <div className="flex-1 flex flex-col p-6 space-y-4">
          {/* Skeleton chart area */}
          <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" style={{ minHeight: `${200 / aspectRatio}px` }}>
            <div className="h-full flex items-end p-4 space-x-2">
              <div className="w-8 bg-gray-300 dark:bg-gray-600 rounded" style={{ height: '40%' }}></div>
              <div className="w-8 bg-gray-300 dark:bg-gray-600 rounded" style={{ height: '60%' }}></div>
              <div className="w-8 bg-gray-300 dark:bg-gray-600 rounded" style={{ height: '30%' }}></div>
              <div className="w-8 bg-gray-300 dark:bg-gray-600 rounded" style={{ height: '75%' }}></div>
              <div className="w-8 bg-gray-300 dark:bg-gray-600 rounded" style={{ height: '50%' }}></div>
              <div className="w-8 bg-gray-300 dark:bg-gray-600 rounded" style={{ height: '65%' }}></div>
              <div className="w-8 bg-gray-300 dark:bg-gray-600 rounded" style={{ height: '45%' }}></div>
            </div>
          </div>
          <Progress value={progress} className="h-2" />
          <p className="text-sm text-muted-foreground text-center">
            {progress < 30 ? 'Fetching data...' 
             : progress < 70 ? 'Processing parameters...' 
             : 'Rendering chart...'}
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

interface ChartErrorStateProps {
  title: string;
  error: string;
  className?: string;
}

export function ChartErrorState({ title, error, className }: ChartErrorStateProps) {
  // If title is provided, render as a full card (for standalone use)
  if (title) {
    return (
      <Card className={cn("rounded-none shadow-none border border-gray-200 dark:border-gray-700", className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>Error loading chart</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  
  // Otherwise, just render the alert (when used inside ChartContainer)
  return (
    <div className={className}>
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-1">
            <p className="font-medium">Error loading chart</p>
            <p className="text-sm">{error}</p>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}

interface ChartEmptyStateProps {
  title: string;
  className?: string;
}

export function ChartEmptyState({ title, className }: ChartEmptyStateProps) {
  // If title is provided, render as a full card (for standalone use)
  if (title) {
    return (
      <Card className={cn("rounded-none shadow-none border border-gray-200 dark:border-gray-700", className)}>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
          <CardDescription>No data available</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <TrendingUp className="h-4 w-4" />
            <AlertDescription>
              No data points found for the selected parameters
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }
  
  // Otherwise, just render the alert (when used inside ChartContainer)
  return (
    <div className={className}>
      <Alert>
        <TrendingUp className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-1">
            <p className="font-medium">No data available</p>
            <p className="text-sm">No data points found for the selected parameters</p>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}