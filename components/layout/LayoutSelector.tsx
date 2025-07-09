'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { LayoutGrid } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface LayoutOption {
  rows: number
  cols: number
}

interface LayoutSelectorProps {
  value?: LayoutOption | null
  onChange: (layout: LayoutOption | null) => void
}

export function LayoutSelector({ value, onChange }: LayoutSelectorProps) {
  const [open, setOpen] = useState(false)

  const layoutOptions: LayoutOption[] = []
  for (let rows = 1; rows <= 4; rows++) {
    for (let cols = 1; cols <= 4; cols++) {
      layoutOptions.push({ rows, cols })
    }
  }

  const handleSelect = (layout: LayoutOption) => {
    onChange(layout)
    setOpen(false)
  }

  const handleReset = () => {
    onChange(null)
    setOpen(false)
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
            {layoutOptions.map((layout) => (
              <button
                key={`${layout.rows}x${layout.cols}`}
                onClick={() => handleSelect(layout)}
                className={cn(
                  'relative aspect-square rounded-md border-2 p-1 transition-colors hover:border-primary',
                  value?.rows === layout.rows && value?.cols === layout.cols
                    ? 'border-primary bg-primary/10'
                    : 'border-muted'
                )}
                title={`${layout.rows}×${layout.cols} layout`}
              >
                <div
                  className="h-full w-full grid gap-0.5"
                  style={{
                    gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
                    gridTemplateRows: `repeat(${layout.rows}, 1fr)`,
                  }}
                >
                  {Array.from({ length: layout.rows * layout.cols }).map((_, i) => (
                    <div
                      key={i}
                      className="bg-muted-foreground/20 rounded-sm"
                    />
                  ))}
                </div>
                <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
                  {layout.rows}×{layout.cols}
                </span>
              </button>
            ))}
          </div>
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