# Fixes Applied for Plotly.js Migration

## Issues Fixed

### 1. Hydration Mismatch Error ✅
**Problem**: Server and client rendering different values for chart engine selection
**Solution**: 
- Added client-side only state management in chart comparison page
- Modified ChartProvider to use TimeChart during SSR
- Added mounted state check before rendering dynamic components

### 2. WebGL Context Errors ✅
**Problem**: "WebGL: too many errors" due to excessive rendering
**Solution**:
- Throttled animation loop to 30 FPS instead of 60+ FPS
- Added error handling and recovery in animation loop
- Limited data points to 500 for better performance
- Made animation optional (disabled by default in comparison page)
- Added try-catch blocks around Plotly operations
- Implemented fallback to SVG rendering if WebGL fails

### 3. Variable Naming Conflict ✅
**Problem**: `ReferenceError: Cannot access 'config' before initialization`
**Solution**:
- Renamed local Plotly config variable to `plotlyConfig` to avoid conflict with component prop
- This prevents the JavaScript hoisting issue

### 4. Memory Leaks ✅
**Problem**: Animation frames not properly cleaned up
**Solution**:
- Added proper cleanup in useEffect return functions
- Cancel animation frames before purging plots
- Set flags to prevent multiple animation loops

### 5. TypeScript Errors ✅
**Problem**: Missing type declarations for plotly.js-gl2d-dist
**Solution**:
- Created type declaration file at `types/plotly.d.ts`
- Fixed title property type in layout configuration

## Performance Optimizations Applied

1. **Animation Throttling**
   - Limited to 30 FPS for smoother performance
   - Only animate when update function is provided
   - Stop animation on errors

2. **Data Management**
   - Filter NaN values before rendering
   - Limit initial data points to prevent overload
   - Use `restyle` instead of `react` for better performance

3. **Resource Management**
   - Proper plot disposal on unmount
   - Clear animation frames before cleanup
   - Handle WebGL context loss gracefully

## Testing

### Test Pages Created
1. `/plotly-test` - Basic Plotly functionality test
2. `/chart-comparison` - Side-by-side comparison (animation disabled)
3. Main app page updated to use ChartProvider pattern

### How to Test
```bash
# Ensure Plotly mode is active
echo "NEXT_PUBLIC_CHART_ENGINE=plotly" > .env.local

# Start dev server
npm run dev

# Visit test pages
# http://localhost:3000/plotly-test
# http://localhost:3000/chart-comparison
```

## Remaining Considerations

1. **Bundle Size**: Plotly.js adds significant size, consider code splitting
2. **Large Datasets**: May need data decimation for 10k+ points
3. **Mobile Performance**: WebGL may have issues on older mobile devices
4. **Browser Compatibility**: Ensure fallbacks for browsers without WebGL support