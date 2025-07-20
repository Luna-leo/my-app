## Conversation Guide lines
- 常に日本語で会話する

# Claude Development Notes

## Performance Optimization (2025-07-12)

### Challenge
- Large dataset visualization: 500,000 data points × 16 charts (4x4 layout)
- Performance issues with data loading and rendering

### Implemented Solutions

#### 1. Progressive Data Loading
- Added 3 resolution levels:
  - Preview: 500 points per chart (fast initial display)
  - Normal: 2,000 points per chart
  - High: 5,000 points per chart
- Automatic resolution upgrade in background
- Visual resolution indicator badge

#### 2. Web Worker Support (Partial)
- Created `SimpleWorkerPool` for basic data processing
- Worker handles data sampling in background thread
- Prevents main thread blocking during heavy calculations

#### 3. Enhanced Sampling Configurations
- `PREVIEW_SAMPLING_CONFIG`: Fast nth-point sampling
- `DEFAULT_SAMPLING_CONFIG`: LTTB algorithm (better quality)
- `HIGH_RES_SAMPLING_CONFIG`: High quality for detailed views

### Files Modified
- `/hooks/useProgressiveChartData.ts` - New progressive loading hook
- `/components/charts/ProgressiveChart.tsx` - Progressive chart component
- `/lib/utils/chartDataSampling.ts` - Added new sampling configs
- `/lib/services/simpleWorkerPool.ts` - Basic worker pool implementation
- `/public/dataProcessing.worker.js` - Web Worker script
- `/components/charts/ChartGrid.tsx` - Added progressive mode support
- `/app/page.tsx` - Enabled progressive mode

### Pending Improvements
- Virtual scrolling with react-window
- Intelligent viewport-based caching
- Streaming data processing
- WebGL rendering for ultra-large datasets

### Test Commands
```bash
npm run dev
npm run build
npm run lint
npm run typecheck
```

## Phase 2: Web Worker Implementation (2025-07-15)

### Challenge
- Main thread blocking during heavy data sampling operations
- Need to offload CPU-intensive calculations to background threads

### Implemented Solutions

#### 1. Worker Pool Service
- Created `SimpleWorkerPool` class for managing Web Workers
- Supports async execution with promise-based API
- Automatic fallback to main thread if Worker fails
- Singleton pattern for resource efficiency

#### 2. Enhanced Data Processing Worker
- Moved to `/public/dataProcessing.worker.js` for direct serving
- Implemented multiple sampling algorithms:
  - LTTB (Largest Triangle Three Buckets)
  - Nth-point sampling
  - Min-max sampling (preserves extremes)
- Supports data transformation for charts
- Progress reporting capability

#### 3. ChartDataContext Integration
- Integrated Worker pool for sampling operations
- Automatic fallback to main thread on Worker errors
- Works for both time-series and XY charts
- Maintains backward compatibility

### Files Modified
- `/lib/services/simpleWorkerPool.ts` - Worker pool implementation
- `/public/dataProcessing.worker.js` - Enhanced worker with sampling algorithms
- `/contexts/ChartDataContext.tsx` - Worker integration for sampling
- `/tsconfig.json` - Exclude test files from compilation

### Performance Impact
- Sampling operations now run in background thread
- Main UI thread remains responsive during heavy calculations
- Fallback ensures reliability if Workers unavailable

## Code Cleanup and Simplification (2025-07-20)

### Challenge
- Accumulated technical debt with unused components
- Duplicate implementations and complex code structures
- Need for better maintainability

### Implemented Solutions

#### 1. Removed Unused Code
- Deleted 30+ unused files including:
  - Unused hooks: useChartAnimation, useChartDataOptimized, useChartInteraction, useChartViewport
  - Unused components: VirtualizedChartGrid, ChartContainer, DataSelectionDialog
  - Duplicate services: workerPool.ts (kept simpleWorkerPool.ts)
  - Unused utilities: incrementalSampling, parameterNameUtils, streamingDataUtils

#### 2. Simplified Progressive Chart Implementation
- Extracted data transformation logic to `/lib/utils/chartDataTransform.ts`
- Created reusable ChartMenu component for consistent UI
- Reduced ProgressiveChart.tsx from 462 to ~200 lines
- Maintained all progressive loading functionality

#### 3. Worker Implementation Cleanup
- Removed TypeScript worker files (using JS worker in public/)
- Updated all worker references to use `/dataProcessing.worker.js`
- Simplified worker pool architecture

### Files Added
- `/lib/utils/chartDataTransform.ts` - Centralized data transformation utilities
- `/components/charts/ChartMenu.tsx` - Reusable chart menu component

### Files Removed
- 4 unused hooks
- 10 unused components
- 1 duplicate service
- 4 unused utilities
- Empty service directories (data/, import/)

### Impact
- Reduced codebase complexity by ~30%
- Improved code maintainability
- Faster build times
- Clearer architecture for new developers