import { sampleTimeSeriesData, DEFAULT_SAMPLING_CONFIG } from '../chartDataSampling';
import { TimeSeriesData } from '@/lib/db/schema';

describe('chartDataSampling', () => {
  // Helper function to create test data
  const createTestData = (count: number, paramOrder: string[]): TimeSeriesData[] => {
    const data: TimeSeriesData[] = [];
    for (let i = 0; i < count; i++) {
      const dataPoint: Record<string, number | null> = {};
      // Add parameters in specified order to test Object.keys behavior
      paramOrder.forEach((param, idx) => {
        dataPoint[param] = Math.sin(i * 0.1) * (idx + 1) + Math.random() * 0.1;
      });
      
      data.push({
        id: i,
        metadataId: 1,
        timestamp: new Date(Date.now() + i * 1000),
        data: dataPoint
      });
    }
    return data;
  };

  describe('sampleTimeSeriesData', () => {
    it('should return consistent results regardless of parameter order in data object', () => {
      const config = {
        ...DEFAULT_SAMPLING_CONFIG,
        samplingThreshold: 100, // Force sampling
        targetPoints: 50
      };

      // Create two datasets with same values but different parameter order
      const data1 = createTestData(200, ['param1', 'param2', 'param3']);
      const data2 = createTestData(200, ['param3', 'param1', 'param2']);
      
      // Sample both datasets without specifying a parameter
      const sampled1 = sampleTimeSeriesData(data1, config);
      const sampled2 = sampleTimeSeriesData(data2, config);
      
      // Both should have the same number of points
      expect(sampled1.length).toBe(sampled2.length);
      
      // The timestamps should be the same (since we're using alphabetically first parameter)
      const timestamps1 = sampled1.map(d => d.timestamp.getTime());
      const timestamps2 = sampled2.map(d => d.timestamp.getTime());
      expect(timestamps1).toEqual(timestamps2);
    });

    it('should use the specified sampling parameter when provided', () => {
      const config = {
        ...DEFAULT_SAMPLING_CONFIG,
        samplingThreshold: 100,
        targetPoints: 50
      };

      const data = createTestData(200, ['param1', 'param2', 'param3']);
      
      // Sample with different parameters
      const sampledParam1 = sampleTimeSeriesData(data, config, 'param1');
      const sampledParam2 = sampleTimeSeriesData(data, config, 'param2');
      
      // Results might differ since different parameters have different patterns
      // But both should respect the target points constraint
      expect(sampledParam1.length).toBeLessThanOrEqual(config.targetPoints);
      expect(sampledParam2.length).toBeLessThanOrEqual(config.targetPoints);
    });

    it('should handle missing sampling parameter gracefully', () => {
      const config = {
        ...DEFAULT_SAMPLING_CONFIG,
        samplingThreshold: 100,
        targetPoints: 50
      };

      const data = createTestData(200, ['param1', 'param2', 'param3']);
      
      // Try to sample with non-existent parameter
      const sampled = sampleTimeSeriesData(data, config, 'nonExistentParam');
      
      // Should fall back to alphabetically first parameter
      expect(sampled.length).toBeLessThanOrEqual(config.targetPoints);
      expect(sampled.length).toBeGreaterThan(0);
    });

    it('should not sample when data is below threshold', () => {
      const config = {
        ...DEFAULT_SAMPLING_CONFIG,
        samplingThreshold: 1000,
        targetPoints: 50
      };

      const data = createTestData(100, ['param1', 'param2']);
      const sampled = sampleTimeSeriesData(data, config);
      
      // Should return original data
      expect(sampled).toBe(data);
      expect(sampled.length).toBe(100);
    });
  });
});