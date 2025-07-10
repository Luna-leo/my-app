import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Copy, Trash2, ScatterChart, TrendingUp } from 'lucide-react';

interface ChartContainerProps {
  title: string;
  chartType: 'line' | 'scatter';
  seriesCount: number;
  pointCount: number;
  className?: string;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

export function ChartContainer({
  title,
  chartType,
  seriesCount,
  pointCount,
  className,
  onEdit,
  onDuplicate,
  onDelete,
  children,
}: ChartContainerProps) {
  return (
    <Card className={cn("h-full flex flex-col", className)}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-1 pt-2 flex-shrink-0">
        <div className="space-y-0">
          <CardTitle className="text-xs font-medium">{title}</CardTitle>
          <CardDescription className="text-xs leading-none">
            {chartType === 'scatter' ? (
              <ScatterChart className="inline h-3 w-3 mr-1" />
            ) : (
              <TrendingUp className="inline h-3 w-3 mr-1" />
            )}
            {seriesCount} series • {pointCount.toLocaleString()} points
          </CardDescription>
        </div>
        {(onEdit || onDuplicate || onDelete) && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onEdit && (
                <DropdownMenuItem onClick={onEdit}>
                  <Pencil className="mr-2 h-4 w-4" />
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
      </CardHeader>
      <CardContent className="pt-2 pb-1 px-2 flex-1 flex flex-col min-h-0">
        <div className="relative pl-3 pr-1 pb-1 flex-1">
          {children}
        </div>
      </CardContent>
    </Card>
  );
}