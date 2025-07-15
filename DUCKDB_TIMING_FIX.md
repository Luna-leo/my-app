# DuckDB Timing Issue Fix

## Problem
Charts were loading data before DuckDB was fully initialized, causing the system to fall back to Worker-based sampling instead of using the faster DuckDB sampling.

## Root Cause
1. DuckDB initializes asynchronously in ChartDataContext
2. Charts immediately call `useChartData` which triggers data loading
3. When `getChartData` checks `isDuckDBReady`, it's still false
4. System falls back to Worker sampling, missing the performance benefits of DuckDB

## Solution Implemented

### 1. Exposed DuckDB State in Context
Added `isDuckDBReady` and `useDuckDB` to the `ChartDataContextType` interface:

```typescript
interface ChartDataContextType {
  // ... existing methods
  isDuckDBReady: boolean;
  useDuckDB: boolean;
}
```

### 2. Provided State Values
Updated the context provider to include these values:

```typescript
const value = useMemo(() => ({
  getChartData,
  preloadChartData,
  getChartsDataBatch,
  clearCache,
  clearChartCache,
  isDuckDBReady,
  useDuckDB
}), [isDuckDBReady, useDuckDB]);
```

### 3. Modified Chart Hook to Wait
Updated `useChartData` to wait for DuckDB when enabled:

```typescript
useEffect(() => {
  // If DuckDB is enabled but not ready, show a waiting state
  if (useDuckDB && !isDuckDBReady) {
    setLoadingState({ 
      loading: true, 
      progress: 0, 
      error: null 
    });
    console.log('[useChartData] Waiting for DuckDB to initialize...');
    return;
  }
  
  // ... rest of data loading logic
}, [config, getChartData, enableSampling, selectedDataIds, isDuckDBReady, useDuckDB]);
```

## Benefits
1. Charts now wait for DuckDB to be ready before loading data
2. No more race conditions between DuckDB initialization and chart loading
3. Ensures DuckDB sampling is used when available, providing better performance
4. Graceful degradation - if DuckDB fails to initialize, system still works with fallback

## Testing
To verify the fix:
1. Check console logs for "[useChartData] Waiting for DuckDB to initialize..."
2. Confirm "[ChartDataContext] Using DuckDB sampling" appears (not Worker fallback)
3. Verify improved sampling performance with large datasets