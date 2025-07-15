// Unified sampling configuration for the application
// This file consolidates all sampling-related settings

import { SamplingConfig } from '@/lib/utils/chartDataSampling';

// Resolution levels with corresponding data points per dataset
export const RESOLUTION_LEVELS = {
  preview: 100,   // 100 points per dataset
  normal: 500,    // 500 points per dataset
  high: 1000,     // 1000 points per dataset
  full: null,     // No limit (all data points)
} as const;

// Database-level sampling configuration per dataset
// Used by IndexedDB getTimeSeriesDataSampled method
export const DB_SAMPLING_CONFIG = {
  preview: RESOLUTION_LEVELS.preview,  // 100 points per dataset
  normal: RESOLUTION_LEVELS.normal,    // 500 points per dataset
  high: RESOLUTION_LEVELS.high,        // 1000 points per dataset
  full: null,                          // No sampling
} as const;

// Client-side sampling configurations
// Used by chartDataSampling.ts and Web Workers
export const PREVIEW_SAMPLING_CONFIG: SamplingConfig = {
  enabled: true,
  method: 'nth' as const,
  targetPoints: RESOLUTION_LEVELS.preview,
  preserveExtremes: false,
  samplingThreshold: 50,
};

export const DEFAULT_SAMPLING_CONFIG: SamplingConfig = {
  enabled: true,
  method: 'lttb' as const,
  targetPoints: RESOLUTION_LEVELS.normal,
  preserveExtremes: true,
  samplingThreshold: 250,
};

export const HIGH_RES_SAMPLING_CONFIG: SamplingConfig = {
  enabled: true,
  method: 'lttb' as const,
  targetPoints: RESOLUTION_LEVELS.high,
  preserveExtremes: true,
  samplingThreshold: 500,
};

// Sampling method options
export type SamplingMethod = 'nth' | 'lttb' | 'min-max';

export const SAMPLING_METHODS = {
  nth: {
    label: 'Nth-point',
    description: 'Fast, selects every Nth point',
    performance: 'fastest',
  },
  lttb: {
    label: 'LTTB',
    description: 'Preserves visual shape better',
    performance: 'moderate',
  },
  'min-max': {
    label: 'Min-Max',
    description: 'Preserves extremes in each bucket',
    performance: 'fast',
  },
} as const;

// Resolution display information (per dataset)
export const RESOLUTION_DISPLAY_INFO = {
  preview: {
    label: 'Preview',
    points: RESOLUTION_LEVELS.preview,
    description: '100 pts/dataset - Ultra fast display',
  },
  normal: {
    label: 'Normal',
    points: RESOLUTION_LEVELS.normal,
    description: '500 pts/dataset - Balanced quality',
  },
  high: {
    label: 'High',
    points: RESOLUTION_LEVELS.high,
    description: '1000 pts/dataset - Detailed view',
  },
  full: {
    label: 'Full',
    points: null,
    description: 'All data points (use with caution)',
  },
} as const;

// Export type for resolution levels
export type ResolutionLevel = keyof typeof RESOLUTION_LEVELS;

// Sampling strategy for each resolution
// dbFetchPoints: Points to fetch from DB per dataset
// clientTargetPoints: Final points after client-side sampling per dataset
export const SAMPLING_STRATEGY = {
  preview: {
    dbFetchPoints: 300,      // Fetch 3x from DB
    clientTargetPoints: 100  // Sample down to 100 in DuckDB
  },
  normal: {
    dbFetchPoints: 1000,     // Fetch 2x from DB
    clientTargetPoints: 500  // Sample down to 500 in DuckDB
  },
  high: {
    dbFetchPoints: 1500,     // Fetch 1.5x from DB
    clientTargetPoints: 1000 // Sample down to 1000 in DuckDB
  },
  full: {
    dbFetchPoints: null,     // Fetch all data
    clientTargetPoints: null // No sampling
  }
} as const;