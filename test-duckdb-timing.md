# DuckDB Timing Fix Test

## What was fixed:
1. Added `isDuckDBReady` and `useDuckDB` to ChartDataContext interface
2. Exposed these values in the context provider
3. Modified `useChartData` hook to wait for DuckDB initialization before loading data

## Expected behavior:
1. When charts are created, they should show "Waiting for DuckDB to initialize..." in console
2. Once DuckDB is ready, charts should load using DuckDB sampling
3. Console should show "[ChartDataContext] Using DuckDB sampling" instead of falling back to Worker

## Test steps:
1. Open browser console
2. Create a new chart with multiple datasets
3. Check console logs for:
   - "[useChartData] Waiting for DuckDB to initialize..."
   - "[ChartDataContext] DuckDB initialized successfully"
   - "[ChartDataContext] Using DuckDB sampling"
   - No "falling back to Worker sampling" messages

## Success criteria:
- DuckDB sampling is used (not Worker fallback)
- Sampling performance should be significantly faster
- No timing race conditions