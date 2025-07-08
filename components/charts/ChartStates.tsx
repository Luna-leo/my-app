import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { AlertCircle, TrendingUp } from 'lucide-react';

interface ChartLoadingStateProps {
  title: string;
  progress: number;
  className?: string;
}

export function ChartLoadingState({ title, progress, className }: ChartLoadingStateProps) {
  return (
    <Card className={className}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>Loading chart data...</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <Progress value={progress} />
          <p className="text-sm text-muted-foreground">Loading and processing data...</p>
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
  return (
    <Card className={className}>
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

interface ChartEmptyStateProps {
  title: string;
  className?: string;
}

export function ChartEmptyState({ title, className }: ChartEmptyStateProps) {
  return (
    <Card className={className}>
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