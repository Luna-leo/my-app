# TimeChart to Plotly.js Migration Guide

## Overview

This document describes the migration from TimeChart to Plotly.js for chart rendering in the application.

## Architecture

### Component Structure

```
components/charts/
├── WebGLPlot.tsx          # Original TimeChart implementation
├── WebGLPlotWithData.tsx  # Original TimeChart with data loading
├── PlotlyChart.tsx        # New Plotly.js implementation
├── PlotlyChartWithData.tsx # New Plotly.js with data loading
└── ChartProvider.tsx      # Factory for selecting chart engine
```

### Feature Flag System

The chart engine can be controlled through:

1. **Environment Variable**: Set `NEXT_PUBLIC_CHART_ENGINE` to `plotly` or `timechart`
2. **Local Storage**: User preference stored in browser
3. **Default**: Currently defaults to `timechart`

## Usage

### Switching Chart Engines

1. **Via Environment Variable**:
   ```bash
   # Create .env.local file
   cp .env.local.example .env.local
   # Edit NEXT_PUBLIC_CHART_ENGINE=plotly
   ```

2. **Via Code**:
   ```typescript
   import { setChartEngine } from '@/lib/chartConfig'
   setChartEngine('plotly')
   ```

3. **Via UI**: Visit `/chart-comparison` page to toggle between engines

### Testing

Visit the comparison page at `/chart-comparison` to see both implementations side-by-side.

## Features Implemented

### PlotlyChart.tsx
- ✅ WebGL rendering with `scattergl` type
- ✅ Dynamic imports for SSR compatibility
- ✅ Responsive sizing with ResizeObserver
- ✅ Animation loop support
- ✅ Custom update functions
- ✅ Proper cleanup on unmount

### PlotlyChartWithData.tsx
- ✅ Data loading from IndexedDB
- ✅ Support for time-series and XY charts
- ✅ Multiple series with color generation
- ✅ Zoom and pan interactions
- ✅ Hover tooltips with formatting
- ✅ Legend display
- ✅ Responsive design
- ✅ Loading states and error handling

## Performance Considerations

1. **WebGL Mode**: All traces use `scattergl` type for GPU acceleration
2. **Efficient Updates**: Using `Plotly.react` for animation updates
3. **Data Filtering**: NaN values are filtered before rendering
4. **Dynamic Loading**: Charts are loaded dynamically to reduce initial bundle size

## Migration Checklist

- [x] Install Plotly.js dependencies
- [x] Create Plotly chart components
- [x] Implement feature flag system
- [x] Create comparison page
- [x] Test basic functionality
- [ ] Performance benchmarking
- [ ] User acceptance testing
- [ ] Production deployment

## Next Steps

1. **Performance Testing**: Compare rendering performance with large datasets
2. **Feature Parity**: Ensure all TimeChart features are available in Plotly
3. **User Testing**: Gather feedback on the new implementation
4. **Gradual Rollout**: Use feature flags for A/B testing

## Rollback Plan

If issues arise, rollback is simple:
1. Set `NEXT_PUBLIC_CHART_ENGINE=timechart`
2. Or change default in `lib/chartConfig.ts`
3. All existing charts will continue to work