import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { MoreVertical, Pencil, Copy, Trash2 } from 'lucide-react';

interface ChartContainerProps {
  className?: string;
  onEdit?: () => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  children: React.ReactNode;
}

export function ChartContainer({
  className,
  onEdit,
  onDuplicate,
  onDelete,
  children,
}: ChartContainerProps) {
  const [isHovered, setIsHovered] = useState(false);
  
  return (
    <Card 
      className={cn("h-full flex flex-col border-0 relative", className)}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <CardContent className="p-0 flex-1 flex flex-col min-h-0">
        <div className="relative flex-1">
          {children}
          {(onEdit || onDuplicate || onDelete) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className={cn(
                    "absolute top-2 right-2 h-8 w-8 z-10 transition-opacity",
                    isHovered ? "opacity-100" : "opacity-30 hover:opacity-100"
                  )}
                >
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
        </div>
      </CardContent>
    </Card>
  );
}