/**
 * Streaming sampler implementation for efficient data sampling
 */
import { TimeSeriesData } from "./schema";
import { 
  SamplingOptions, 
  calculateSamplingStep, 
  sampleChunkNthPoint,
  calculateTimeIntervals,
  findClosestDataPoint 
} from "./sampling";

export class StreamingSampler {
  private globalOffset = 0;
  private sampledData: TimeSeriesData[] = [];
  private step: number = 1;
  private timeIntervals?: Date[];
  private currentIntervalIndex = 0;
  
  constructor(
    private options: SamplingOptions,
    private estimatedTotalPoints: number
  ) {
    this.initialize();
  }
  
  private initialize() {
    if (this.options.method === 'nth-point') {
      this.step = calculateSamplingStep(this.estimatedTotalPoints, this.options.targetPoints);
    } else if (this.options.method === 'time-range' && this.options.startTime && this.options.endTime) {
      this.timeIntervals = calculateTimeIntervals(
        this.options.startTime,
        this.options.endTime,
        this.options.targetPoints
      );
    }
  }
  
  /**
   * Process a chunk of data and return sampled results
   */
  processChunk(chunk: TimeSeriesData[]): TimeSeriesData[] {
    let sampled: TimeSeriesData[] = [];
    
    switch (this.options.method) {
      case 'nth-point':
        sampled = this.processNthPointChunk(chunk);
        break;
      case 'time-range':
        sampled = this.processTimeRangeChunk(chunk);
        break;
      case 'lttb':
        // LTTB requires buffering for proper implementation
        // For now, fall back to nth-point
        sampled = this.processNthPointChunk(chunk);
        break;
    }
    
    this.globalOffset += chunk.length;
    this.sampledData.push(...sampled);
    
    return sampled;
  }
  
  private processNthPointChunk(chunk: TimeSeriesData[]): TimeSeriesData[] {
    return sampleChunkNthPoint(chunk, 0, this.step, this.globalOffset);
  }
  
  private processTimeRangeChunk(chunk: TimeSeriesData[]): TimeSeriesData[] {
    if (!this.timeIntervals) return [];
    
    const sampled: TimeSeriesData[] = [];
    
    // Find data points closest to our target time intervals
    while (this.currentIntervalIndex < this.timeIntervals.length) {
      const targetTime = this.timeIntervals[this.currentIntervalIndex];
      
      // Check if the chunk contains data around this time
      const firstTime = chunk[0]?.timestamp.getTime() || 0;
      const lastTime = chunk[chunk.length - 1]?.timestamp.getTime() || 0;
      const targetMs = targetTime.getTime();
      
      if (targetMs < firstTime) {
        // Target time is before this chunk, move to next interval
        this.currentIntervalIndex++;
      } else if (targetMs > lastTime) {
        // Target time is after this chunk, wait for next chunk
        break;
      } else {
        // Target time is within this chunk
        const closest = findClosestDataPoint(chunk, targetTime);
        if (closest) {
          sampled.push(closest);
        }
        this.currentIntervalIndex++;
      }
    }
    
    return sampled;
  }
  
  /**
   * Get all sampled data collected so far
   */
  getSampledData(): TimeSeriesData[] {
    return this.sampledData;
  }
  
  /**
   * Check if sampling is complete
   */
  isComplete(): boolean {
    if (this.options.method === 'nth-point') {
      return this.sampledData.length >= this.options.targetPoints;
    } else if (this.options.method === 'time-range' && this.timeIntervals) {
      return this.currentIntervalIndex >= this.timeIntervals.length;
    }
    return false;
  }
  
  /**
   * Get progress percentage
   */
  getProgress(): number {
    if (this.options.method === 'nth-point') {
      return Math.min(100, (this.sampledData.length / this.options.targetPoints) * 100);
    } else if (this.options.method === 'time-range' && this.timeIntervals) {
      return (this.currentIntervalIndex / this.timeIntervals.length) * 100;
    }
    return 0;
  }
}