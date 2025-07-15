// Unified sampling configuration for the application
// This file consolidates all sampling-related settings

import { SamplingConfig } from '@/lib/utils/chartDataSampling';

// Resolution levels with corresponding data points
export const RESOLUTION_LEVELS = {
  preview: 100,
  normal: 500,
  high: 1000,
  full: null, // No limit
} as const;

// Database-level sampling configuration
// Used by IndexedDB getTimeSeriesDataSampled method
export const DB_SAMPLING_CONFIG = {
  preview: RESOLUTION_LEVELS.preview,
  normal: RESOLUTION_LEVELS.normal,
  high: RESOLUTION_LEVELS.high,
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

// Resolution display information
export const RESOLUTION_DISPLAY_INFO = {
  preview: {
    label: 'Preview',
    points: RESOLUTION_LEVELS.preview,
    description: 'Ultra fast display',
  },
  normal: {
    label: 'Normal',
    points: RESOLUTION_LEVELS.normal,
    description: 'Balanced quality and performance',
  },
  high: {
    label: 'High',
    points: RESOLUTION_LEVELS.high,
    description: 'Detailed view',
  },
  full: {
    label: 'Full',
    points: null,
    description: 'All data points (use with caution)',
  },
} as const;

// Export type for resolution levels
export type ResolutionLevel = keyof typeof RESOLUTION_LEVELS;