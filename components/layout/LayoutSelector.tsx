'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LayoutOption {
  rows: number
  cols: number
  paginationEnabled?: boolean
}

interface LayoutSelectorProps {
  value?: LayoutOption | null
  onChange: (layout: LayoutOption | null) => void
}

export function LayoutSelector({ value, onChange }: LayoutSelectorProps) {
  const [open, setOpen] = useState(false)
  const [tempPaginationEnabled, setTempPaginationEnabled] = useState(value?.paginationEnabled ?? false)

  const gridOptions: { rows: number; cols: number }[] = []
  for (let rows = 1; rows <= 4; rows++) {
    for (let cols = 1; cols <= 4; cols++) {
      gridOptions.push({ rows, cols })
    }
  }

  const handleSelect = (grid: { rows: number; cols: number }) => {
    onChange({
      ...grid,
      paginationEnabled: tempPaginationEnabled
    })
    setOpen(false)
  }

  const handleReset = () => {
    onChange(null)
    setTempPaginationEnabled(false)
    setOpen(false)
  }

  // Update temp state when prop changes
  if (value?.paginationEnabled !== undefined && value.paginationEnabled !== tempPaginationEnabled && !open) {
    setTempPaginationEnabled(value.paginationEnabled)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline">
          <LayoutGrid className="mr-2 h-4 w-4" />
          {value ? `${value.rows}×${value.cols}` : 'Auto Layout'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80">
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="font-medium leading-none">Select Layout</h4>
            <p className="text-sm text-muted-foreground">
              Choose a fixed grid layout or use auto layout
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {gridOptions.map((grid) => (
              <button
                key={`${grid.rows}x${grid.cols}`}
                onClick={() => handleSelect(grid)}
                className={cn(
                  'relative aspect-square rounded-md border-2 p-1 transition-colors hover:border-primary',
                  value?.rows === grid.rows && value?.cols === grid.cols
                    ? 'border-primary bg-primary/10'
                    : 'border-muted'
                )}
                title={`${grid.rows}×${grid.cols} layout`}
              >
                <div
                  className="h-full w-full grid gap-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${grid.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${grid.rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: grid.rows * grid.cols }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-muted-foreground/20 rounded-sm"
                    />
                  ))}
                </div>
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                  {grid.rows}×{grid.cols}
                </span>
              </button>
            ))}
          </div>
          {value && (
            <div className="flex items-center gap-2 pt-2 border-t">
              <Checkbox
                id="pagination-enabled"
                checked={tempPaginationEnabled}
                onCheckedChange={(checked) => {
                  setTempPaginationEnabled(checked as boolean)
                  // Immediately update the current selection if one exists
                  if (value) {
                    onChange({
                      ...value,
                      paginationEnabled: checked as boolean
                    })
                  }
                }}
              />
              <label
                htmlFor="pagination-enabled"
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
              >
                Enable Pagination
              </label>
            </div>
          )}
          <div className="pt-4">
            <Button
              variant="outline"
              className="w-full"
              onClick={handleReset}
              disabled={!value}
            >
              Use Auto Layout
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}