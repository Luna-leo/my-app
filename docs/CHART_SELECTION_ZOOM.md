# Chart Selection and Zoom Feature

This document describes the box selection and zoom-to-selection features implemented for uPlot charts.

## Overview

The interactive chart features include:
- **Box Selection**: Draw a rectangle to select a region of data
- **Zoom to Selection**: Zoom the chart view to focus on the selected region
- **Data Export**: Export selected data points as CSV or JSON
- **Viewport Management**: Control and animate chart viewport changes

## Components

### 1. `InteractiveUplotChart`
The main component that combines all interactive features.

```tsx
import { InteractiveUplotChart } from '@/components/charts'

<InteractiveUplotChart
  config={chartConfig}
  enableSelection={true}
  enableZoomToSelection={true}
  onSelectionChange={handleSelectionChange}
/>
```

### 2. `UplotChartWithSelection`
A simpler component for just selection features without zoom.

```tsx
import { UplotChartWithSelection } from '@/components/charts'

<UplotChartWithSelection
  config={chartConfig}
  enableSelection={true}
  onSelectionChange={handleSelectionChange}
/>
```

### 3. `SelectionControls`
UI controls for managing selection state and exporting data.

## Hooks

### `useChartSelection`
Manages selection state and provides utilities for working with selected data.

```tsx
const [selectionState, selectionActions] = useChartSelection(dataPoints, {
  onSelectionChange: (range) => console.log('Selection:', range),
  autoDisableOnSelect: false,
})
```

### `useChartViewport`
Manages chart viewport with animation support.

```tsx
const [viewport, viewportActions] = useChartViewport({
  initialViewport: { xMin: 0, xMax: 100, yMin: 0, yMax: 100 },
  onViewportChange: (viewport) => console.log('Viewport:', viewport),
  animationDuration: 300,
})
```

## Selection Plugin

The `uplotSelectionPlugin` provides the core selection functionality:

```tsx
import { createSelectionPlugin, createZoomToSelectionPlugin } from '@/lib/utils/uplotSelectionPlugin'

const selectionPlugin = createSelectionPlugin({
  onSelect: (range) => console.log('Selected:', range),
  selectionColor: '#4285F4',
  selectionOpacity: 0.2,
  minSelectionSize: 10,
})
```

## Usage Examples

### Basic Box Selection

```tsx
<InteractiveUplotChart
  config={chartConfig}
  enableSelection={true}
  enableZoomToSelection={false}
  onSelectionChange={(range) => {
    console.log('Selected range:', range)
    // range = { xMin, xMax, yMin, yMax }
  }}
/>
```

### Zoom to Selection

```tsx
<InteractiveUplotChart
  config={chartConfig}
  enableSelection={true}
  enableZoomToSelection={true}
  enableViewportControl={true}
  selectionOptions={{
    color: '#3B82F6',
    opacity: 0.3,
    minSize: 20,
  }}
/>
```

### Export Selected Data

The selection controls automatically provide export functionality:
1. Select a region on the chart
2. Click the "Export" button
3. Choose CSV or JSON format

### Custom Selection Appearance

```tsx
<InteractiveUplotChart
  config={chartConfig}
  enableSelection={true}
  selectionOptions={{
    color: '#FF6B6B',      // Selection box color
    opacity: 0.25,         // Selection box opacity
    minSize: 15,           // Minimum selection size in pixels
  }}
/>
```

## Keyboard Shortcuts

- **ESC**: Clear current selection

## API Reference

### InteractiveUplotChart Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `config` | `ChartConfiguration` | required | Chart configuration object |
| `enableSelection` | `boolean` | `true` | Enable box selection |
| `enableZoomToSelection` | `boolean` | `true` | Enable zoom to selection |
| `onSelectionChange` | `(range: SelectionRange \| null) => void` | - | Selection change callback |
| `selectionOptions` | `object` | `{}` | Selection appearance options |
| `enableViewportControl` | `boolean` | `true` | Enable viewport management |
| `initialViewport` | `ChartViewport` | - | Initial viewport bounds |
| `onViewportChange` | `(viewport: ChartViewport) => void` | - | Viewport change callback |

### SelectionRange Type

```tsx
interface SelectionRange {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}
```

### ChartViewport Type

```tsx
interface ChartViewport {
  xMin: number
  xMax: number
  yMin: number
  yMax: number
}
```

## Integration with Existing Features

The selection and zoom features work seamlessly with:
- Mouse wheel zoom
- Click and drag panning
- Tooltips
- Crosshair
- Data sampling
- Multi-series charts
- Time-based axes

## Performance Considerations

- Selection rendering uses minimal DOM manipulation
- Viewport animations use requestAnimationFrame for smooth performance
- Selected data calculation is memoized
- Large datasets are handled efficiently with data sampling

## Browser Compatibility

- All modern browsers supporting Canvas and ES6
- Touch device support for selection gestures
- Keyboard navigation support