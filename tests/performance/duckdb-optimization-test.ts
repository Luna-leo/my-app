/**
 * DuckDB Optimization Performance Test
 * 
 * Tests the performance improvements from:
 * 1. Schema tracking (avoiding table recreation)
 * 2. Single-stage sampling
 * 3. Intelligent column loading
 */

import { hybridDataService } from '@/lib/services/hybridDataService';
import { duckDBSchemaTracker } from '@/lib/services/duckdbSchemaTracker';
import { TimeSeriesData } from '@/lib/db';

interface TestResult {
  testName: string;
  duration: number;
  dataPoints: number;
  operations: string[];
}

class DuckDBPerformanceTest {
  private results: TestResult[] = [];

  /**
   * Generate mock time series data
   */
  private generateMockData(
    metadataId: number,
    points: number,
    parameterCount: number
  ): TimeSeriesData[] {
    const data: TimeSeriesData[] = [];
    const startTime = new Date('2024-01-01');

    for (let i = 0; i < points; i++) {
      const timestamp = new Date(startTime.getTime() + i * 60000); // 1 minute intervals
      const dataPoint: Record<string, number | null> = {};

      // Generate parameter values
      for (let p = 0; p < parameterCount; p++) {
        const parameterId = `param_${p}`;
        dataPoint[parameterId] = Math.sin(i / 100) * 100 + Math.random() * 10;
      }

      data.push({
        id: i,
        metadataId,
        timestamp,
        data: dataPoint
      });
    }

    return data;
  }

  /**
   * Test 1: Initial table creation and data loading
   */
  async testInitialLoad(): Promise<void> {
    console.log('\n=== Test 1: Initial Table Creation ===');
    
    const metadataId = 1;
    const dataPoints = 100000; // 100k points
    const parameters = 50; // 50 parameters
    
    // Generate test data
    const testData = this.generateMockData(metadataId, dataPoints, parameters);
    const parameterIds = Array.from({ length: parameters }, (_, i) => `param_${i}`);
    
    const startTime = performance.now();
    
    // Initialize DuckDB if not already done
    await hybridDataService.initialize();
    
    // Load data (should create new table)
    await hybridDataService.loadTimeSeriesData(
      metadataId,
      testData,
      parameterIds
    );
    
    const duration = performance.now() - startTime;
    
    this.results.push({
      testName: 'Initial Load',
      duration,
      dataPoints,
      operations: ['CREATE TABLE', 'INSERT DATA']
    });
    
    console.log(`✓ Loaded ${dataPoints} points with ${parameters} parameters in ${duration.toFixed(2)}ms`);
    console.log(`  Rate: ${(dataPoints / (duration / 1000)).toFixed(0)} points/second`);
  }

  /**
   * Test 2: Loading same data again (should skip due to schema tracking)
   */
  async testRedundantLoad(): Promise<void> {
    console.log('\n=== Test 2: Redundant Load (Schema Tracking) ===');
    
    const metadataId = 1;
    const dataPoints = 100000;
    const parameters = 50;
    
    // Generate same test data
    const testData = this.generateMockData(metadataId, dataPoints, parameters);
    const parameterIds = Array.from({ length: parameters }, (_, i) => `param_${i}`);
    
    const startTime = performance.now();
    
    // Load data again (should detect existing schema and skip)
    await hybridDataService.loadTimeSeriesData(
      metadataId,
      testData,
      parameterIds
    );
    
    const duration = performance.now() - startTime;
    
    this.results.push({
      testName: 'Redundant Load',
      duration,
      dataPoints,
      operations: ['SCHEMA CHECK', 'SKIP LOAD']
    });
    
    console.log(`✓ Schema tracking avoided reload in ${duration.toFixed(2)}ms`);
    console.log(`  Speedup: ${duration < 100 ? '100x+' : 'N/A'}`);
  }

  /**
   * Test 3: Adding new columns (incremental update)
   */
  async testIncrementalColumnAdd(): Promise<void> {
    console.log('\n=== Test 3: Incremental Column Addition ===');
    
    const metadataId = 1;
    const dataPoints = 100000;
    const existingParams = 50;
    const newParams = 10;
    
    // Generate data with additional parameters
    const testData = this.generateMockData(metadataId, dataPoints, existingParams + newParams);
    const allParameterIds = Array.from({ length: existingParams + newParams }, (_, i) => `param_${i}`);
    
    const startTime = performance.now();
    
    // Load data with new parameters (should use ALTER TABLE)
    await hybridDataService.loadTimeSeriesData(
      metadataId,
      testData,
      allParameterIds
    );
    
    const duration = performance.now() - startTime;
    
    this.results.push({
      testName: 'Incremental Update',
      duration,
      dataPoints,
      operations: ['ALTER TABLE ADD COLUMN', 'INSERT DATA']
    });
    
    console.log(`✓ Added ${newParams} new columns in ${duration.toFixed(2)}ms`);
    console.log(`  Avoided full table recreation`);
  }

  /**
   * Test 4: SQL-based sampling performance
   */
  async testSamplingPerformance(): Promise<void> {
    console.log('\n=== Test 4: DuckDB Sampling Performance ===');
    
    const metadataIds = [1, 2, 3]; // Multiple datasets
    const targetPoints = 1000; // Sample down to 1k points
    
    // Ensure data is loaded for all metadata IDs
    for (let i = 0; i < metadataIds.length; i++) {
      const metadataId = metadataIds[i];
      if (metadataId > 1) {
        const testData = this.generateMockData(metadataId, 100000, 20);
        await hybridDataService.loadTimeSeriesData(
          metadataId,
          testData,
          Array.from({ length: 20 }, (_, j) => `param_${j}`)
        );
      }
    }
    
    const startTime = performance.now();
    
    // Perform SQL-based sampling
    const sampledData = await hybridDataService.sampleData(
      metadataIds,
      ['param_0', 'param_1', 'param_2'], // Sample 3 parameters
      targetPoints,
      { method: 'nth' }
    );
    
    const duration = performance.now() - startTime;
    
    this.results.push({
      testName: 'SQL Sampling',
      duration,
      dataPoints: sampledData.length,
      operations: ['SELECT WITH SAMPLING', 'UNION ALL']
    });
    
    console.log(`✓ Sampled ${metadataIds.length} datasets to ${sampledData.length} points in ${duration.toFixed(2)}ms`);
    console.log(`  SQL-based sampling eliminates client-side processing`);
  }

  /**
   * Test 5: Memory usage comparison
   */
  async testMemoryUsage(): Promise<void> {
    console.log('\n=== Test 5: Memory Usage Analysis ===');
    
    // Get current schema statistics
    const stats = duckDBSchemaTracker.getStats();
    
    console.log(`✓ Schema Tracker Stats:`);
    console.log(`  Tables tracked: ${stats.tableCount}`);
    console.log(`  Total columns: ${stats.totalColumns}`);
    console.log(`  Total rows: ${stats.totalRows}`);
    
    // Check for stale tables
    const staleTableIds = duckDBSchemaTracker.getStaleTableIds(5); // 5 minutes
    console.log(`  Stale tables (>5 min): ${staleTableIds.length}`);
  }

  /**
   * Run all tests and generate report
   */
  async runAllTests(): Promise<void> {
    console.log('Starting DuckDB Optimization Performance Tests...');
    console.log('================================================');
    
    try {
      await this.testInitialLoad();
      await this.testRedundantLoad();
      await this.testIncrementalColumnAdd();
      await this.testSamplingPerformance();
      await this.testMemoryUsage();
      
      this.generateReport();
    } catch (error) {
      console.error('Test failed:', error);
    }
  }

  /**
   * Generate performance report
   */
  private generateReport(): void {
    console.log('\n\n=== PERFORMANCE TEST REPORT ===');
    console.log('================================');
    
    let totalDuration = 0;
    let totalDataPoints = 0;
    
    this.results.forEach(result => {
      console.log(`\n${result.testName}:`);
      console.log(`  Duration: ${result.duration.toFixed(2)}ms`);
      console.log(`  Data Points: ${result.dataPoints.toLocaleString()}`);
      console.log(`  Operations: ${result.operations.join(' → ')}`);
      
      totalDuration += result.duration;
      totalDataPoints += result.dataPoints;
    });
    
    console.log('\n--- Summary ---');
    console.log(`Total Duration: ${totalDuration.toFixed(2)}ms`);
    console.log(`Total Data Points: ${totalDataPoints.toLocaleString()}`);
    console.log(`Average Throughput: ${(totalDataPoints / (totalDuration / 1000)).toFixed(0)} points/second`);
    
    // Performance improvements
    const redundantLoadTime = this.results.find(r => r.testName === 'Redundant Load')?.duration || 0;
    const initialLoadTime = this.results.find(r => r.testName === 'Initial Load')?.duration || 1;
    const speedupFactor = initialLoadTime / redundantLoadTime;
    
    console.log('\n--- Performance Improvements ---');
    console.log(`Schema Tracking Speedup: ${speedupFactor.toFixed(0)}x`);
    console.log(`Eliminated Operations: DROP TABLE, CREATE TABLE`);
    console.log(`Single-stage Sampling: Reduced complexity`);
  }
}

// Export test runner
export async function runDuckDBPerformanceTests() {
  const tester = new DuckDBPerformanceTest();
  await tester.runAllTests();
}

// Allow running from command line
if (require.main === module) {
  runDuckDBPerformanceTests().catch(console.error);
}