/**
 * Database-level sampling utilities
 */
import { TimeSeriesData } from "./schema";
import type { AppDatabase } from "./index";

export interface SamplingOptions {
  targetPoints: number;
  method: 'nth-point' | 'lttb' | 'time-range';
  startTime?: Date;
  endTime?: Date;
  parameterIds?: string[];
}

/**
 * Calculate the sampling step for nth-point sampling
 */
export function calculateSamplingStep(totalPoints: number, targetPoints: number): number {
  if (totalPoints <= targetPoints) {
    return 1;
  }
  return Math.max(1, Math.floor(totalPoints / targetPoints));
}

/**
 * Apply nth-point sampling to a chunk of data
 */
export function sampleChunkNthPoint(
  chunk: TimeSeriesData[],
  chunkIndex: number,
  step: number,
  globalOffset: number
): TimeSeriesData[] {
  const sampled: TimeSeriesData[] = [];
  
  for (let i = 0; i < chunk.length; i++) {
    const globalIndex = globalOffset + i;
    if (globalIndex % step === 0) {
      sampled.push(chunk[i]);
    }
  }
  
  return sampled;
}

/**
 * Calculate time-based sampling intervals
 */
export function calculateTimeIntervals(
  startTime: Date,
  endTime: Date,
  targetPoints: number
): Date[] {
  const startMs = startTime.getTime();
  const endMs = endTime.getTime();
  const intervalMs = (endMs - startMs) / (targetPoints - 1);
  
  const intervals: Date[] = [];
  for (let i = 0; i < targetPoints; i++) {
    intervals.push(new Date(startMs + i * intervalMs));
  }
  
  return intervals;
}

/**
 * Find the closest data point to a target timestamp
 */
export function findClosestDataPoint(
  data: TimeSeriesData[],
  targetTime: Date
): TimeSeriesData | null {
  if (data.length === 0) return null;
  
  const targetMs = targetTime.getTime();
  let closestIndex = 0;
  let minDiff = Math.abs(data[0].timestamp.getTime() - targetMs);
  
  for (let i = 1; i < data.length; i++) {
    const diff = Math.abs(data[i].timestamp.getTime() - targetMs);
    if (diff < minDiff) {
      minDiff = diff;
      closestIndex = i;
    }
  }
  
  return data[closestIndex];
}

/**
 * Estimate total points for a metadata ID (for planning purposes)
 */
export async function estimateTotalPoints(
  db: AppDatabase,
  metadataId: number
): Promise<number> {
  // This is a simplified estimation
  // In production, you might want to maintain a count in metadata
  return await db.timeSeries
    .where('metadataId')
    .equals(metadataId)
    .count();
}