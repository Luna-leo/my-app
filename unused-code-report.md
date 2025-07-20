# Unused Code Analysis Report

## Executive Summary

This report identifies unused code, dead code, and unnecessary components in the codebase. The analysis found several unused files, components, hooks, services, and utilities that can potentially be removed to improve code maintainability.

## Key Findings

### 1. Unused Files (Never Imported)

#### Components (10 files)
- **components/charts/ChartContainer.tsx** - Unused chart container component
- **components/charts/VirtualizedChartGrid.tsx** - Virtualized grid implementation (replaced by non-virtualized version)
- **components/charts/index.ts** - Barrel export file that's not used
- **components/csv-import/ImportProgress.tsx** - Old import progress component
- **components/data-management/DataSelectionContent.tsx** - Unused data selection content
- **components/data-management/DownloadContent.tsx** - Unused download functionality
- **components/data-selection/DataSelectionDialog.tsx** - Old data selection dialog
- **components/layout/SamplingControls.tsx** - Unused sampling controls
- **components/ui/switch.tsx** - Unused UI component
- **components/ui/table.tsx** - Unused table component

#### Hooks (4 files)
- **hooks/useChartAnimation.ts** - Animation hook that's not being used
- **hooks/useChartDataOptimized.ts** - Optimized data hook (likely replaced)
- **hooks/useChartInteraction.ts** - Chart interaction hook not in use
- **hooks/useChartViewport.ts** - Viewport management hook not used

#### Services (1 file)
- **lib/services/workerPool.ts** - More complex worker pool implementation (replaced by simpleWorkerPool.ts)

#### Utils (4 files)
- **lib/utils/incrementalSampling.ts** - Incremental sampling utility not used
- **lib/utils/parameterNameUtils.ts** - Parameter name utilities not used
- **lib/utils/streamingDataUtils.ts** - Streaming utilities not in use
- **lib/utils/uplotZoomPlugin.ts** - Custom zoom plugin not being used

### 2. Duplicate Functionality

#### Worker Pool Implementations
- **lib/services/workerPool.ts** - Complex worker pool with load balancing
- **lib/services/simpleWorkerPool.ts** - Simplified version (currently in use)

**Recommendation**: Remove the complex workerPool.ts since simpleWorkerPool.ts is sufficient

#### Data Sampling Utilities
Multiple files handle data sampling with overlapping functionality:
- **lib/utils/chartDataSampling.ts** - Main sampling utilities
- **lib/utils/dataSamplingUtils.ts** - Additional sampling utilities
- **lib/utils/incrementalSampling.ts** - Incremental sampling (unused)
- **lib/services/dataSamplingService.ts** - Service layer for sampling

**Recommendation**: Consolidate sampling logic and remove unused incrementalSampling.ts

### 3. Test Files

- **app/test/csv-import/page.tsx** - Test page for CSV import
- **app/test/performance/page.tsx** - Performance test page

**Note**: These might be useful for development/testing but should not be included in production builds

### 4. Potentially Obsolete Components

Based on naming and lack of usage:
- **DataSelectionDialog** - Appears to be replaced by newer data management components
- **VirtualizedChartGrid** - Likely replaced by regular ChartGrid for simplicity
- **ChartContainer** - Might have been replaced by ChartProvider pattern

### 5. Unused UI Components

Several shadcn/ui components are included but not used:
- **Switch** component
- **Table** component (and all its sub-components)

## Recommendations

### Immediate Actions (High Priority)
1. Remove unused hooks directory files (4 files)
2. Remove lib/services/workerPool.ts (duplicate functionality)
3. Remove unused UI components (switch, table)
4. Remove components/charts/VirtualizedChartGrid.tsx

### Medium Priority
1. Review and potentially remove test pages from production
2. Consolidate data sampling utilities
3. Remove unused utility files in lib/utils/

### Low Priority
1. Clean up barrel exports (components/charts/index.ts)
2. Review if old data selection components can be removed

## Impact Analysis

### Size Reduction
Removing these files would reduce the codebase by approximately:
- 20 component files
- 4 hook files
- 5 utility files
- 1 service file

### Maintenance Benefits
- Clearer codebase structure
- Reduced confusion about which implementations to use
- Easier onboarding for new developers
- Reduced build size

## Migration Notes

Before removing any files, ensure:
1. No dynamic imports reference these files
2. No configuration files reference these components
3. Test thoroughly after removal
4. Consider keeping test pages but exclude from production builds

## Conclusion

The codebase has accumulated some technical debt with unused components and duplicate implementations. A cleanup would improve maintainability and reduce complexity. The most impactful changes would be removing the unused hooks and consolidating the worker pool implementations.