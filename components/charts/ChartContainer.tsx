import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Copy, Trash2, ScatterChart, TrendingUp, ZoomIn } from 'lucide-react';

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
    <Card className={className}>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-0 pt-1">
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
      <CardContent>
        <div className="relative">
          {children}
          <div className="absolute bottom-1 right-1 flex items-center gap-1 text-[10px] text-muted-foreground bg-background/80 px-1 py-0.5 rounded">
            <ZoomIn className="h-2.5 w-2.5" />
            <span>Scroll to zoom • Drag to pan</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}