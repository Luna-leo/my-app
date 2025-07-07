# Plotly.js Migration Status

## Current Status

The migration from TimeChart to Plotly.js has been implemented with the following components:

### Completed Tasks ✅

1. **Created Plotly.js Components**
   - `PlotlyChart.tsx` - Basic chart with WebGL support
   - `PlotlyChartWithData.tsx` - Data-driven chart with database integration
   - Type declarations for TypeScript support

2. **Feature Flag System**
   - `lib/chartConfig.ts` - Controls which chart engine to use
   - Environment variable: `NEXT_PUBLIC_CHART_ENGINE`
   - localStorage support for user preferences

3. **Chart Provider Pattern**
   - `ChartProvider.tsx` - Factory pattern for component selection
   - SSR-safe implementation to avoid hydration errors

4. **Testing Pages**
   - `/chart-comparison` - Side-by-side comparison of both engines
   - `/plotly-test` - Simple Plotly.js functionality test

5. **Performance Optimizations**
   - Throttled animation to 30 FPS
   - Error handling for WebGL context loss
   - Fallback to SVG rendering if WebGL fails
   - Limited data points for better performance

## Known Issues 🚨

1. **WebGL Context Errors**
   - Some users may experience WebGL context loss with continuous animations
   - Mitigation: Animation is now optional and throttled

2. **Bundle Size**
   - Plotly.js adds ~850KB to the bundle (using gl2d-dist variant)
   - Consider lazy loading for routes that don't need charts

## How to Use

### Switch to Plotly.js
```bash
# Set environment variable
echo "NEXT_PUBLIC_CHART_ENGINE=plotly" > .env.local

# Or programmatically
import { setChartEngine } from '@/lib/chartConfig'
setChartEngine('plotly')
```

### Test the Implementation
1. Visit `/chart-comparison` to see both implementations
2. Visit `/plotly-test` for a simple functionality test
3. Create charts normally - they'll use the selected engine

## Next Steps

1. **Performance Testing**
   - Benchmark with large datasets (10k+ points)
   - Memory usage comparison
   - Rendering performance metrics

2. **Feature Parity**
   - Ensure all TimeChart features work in Plotly
   - Test zoom/pan behavior
   - Validate tooltip formatting

3. **Production Readiness**
   - More extensive error boundaries
   - Logging and monitoring
   - User feedback collection

## Rollback Instructions

If issues occur:
1. Set `NEXT_PUBLIC_CHART_ENGINE=timechart`
2. Or remove the `.env.local` file
3. Charts will automatically use TimeChart

The implementation maintains full backward compatibility.