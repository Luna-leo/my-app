/**
 * Parquet Integration Test
 * Tests the DuckDB Parquet functionality
 */

import { hybridDataService } from '@/lib/services/hybridDataService';
import { duckDBParquetService } from '@/lib/services/duckdbParquetService';

async function testParquetIntegration() {
  console.log('=== DuckDB Parquet Integration Test ===\n');
  
  const testResults = {
    initialization: false,
    parquetInfo: false,
    directRead: false,
    hybridQuery: false,
    sampling: false,
    export: false
  };
  
  try {
    // 1. Initialize DuckDB
    console.log('1. Initializing DuckDB...');
    await hybridDataService.initialize();
    const connection = await hybridDataService.getConnection();
    
    if (!connection) {
      throw new Error('Failed to get DuckDB connection');
    }
    
    console.log('✓ DuckDB initialized successfully');
    testResults.initialization = true;
    
    // 2. Create test data in memory
    console.log('\n2. Creating test data...');
    const testData = [];
    const startDate = new Date('2024-01-01');
    
    for (let i = 0; i < 10000; i++) {
      testData.push({
        metadataId: 1,
        timestamp: new Date(startDate.getTime() + i * 60000), // 1 minute intervals
        data: {
          'param1': Math.sin(i / 100) * 100,
          'param2': Math.cos(i / 100) * 200,
          'param3': Math.random() * 300
        }
      });
    }
    
    await hybridDataService.loadTimeSeriesData(1, testData, ['param1', 'param2', 'param3']);
    console.log('✓ Created test data with 10,000 rows');
    
    // 3. Export to Parquet
    console.log('\n3. Exporting to Parquet...');
    const parquetPath = `/tmp/test_${Date.now()}.parquet`;
    
    await hybridDataService.exportToParquet(
      'SELECT * FROM timeseries_1',
      parquetPath,
      { compression: 'snappy' }
    );
    
    console.log(`✓ Exported to ${parquetPath}`);
    testResults.export = true;
    
    // 4. Get Parquet file info
    console.log('\n4. Reading Parquet metadata...');
    try {
      const info = await duckDBParquetService.getParquetInfo(parquetPath);
      console.log('✓ Parquet file info:');
      console.log(`  - Rows: ${info.rowCount}`);
      console.log(`  - Columns: ${info.columns.length}`);
      console.log(`  - Size: ${(info.sizeBytes / 1024).toFixed(2)} KB`);
      console.log(`  - Compression: ${info.compression}`);
      testResults.parquetInfo = true;
    } catch (err) {
      console.error('✗ Failed to read parquet info:', err);
    }
    
    // 5. Test direct Parquet reading
    console.log('\n5. Testing direct Parquet read...');
    const directData = await hybridDataService.loadTimeSeriesFromParquet(
      parquetPath,
      1,
      {
        columns: ['param1', 'param2'],
        limit: 100
      }
    );
    
    console.log(`✓ Read ${directData.length} rows directly from Parquet`);
    testResults.directRead = true;
    
    // 6. Test hybrid query
    console.log('\n6. Testing hybrid query (memory + parquet)...');
    const hybridResult = await hybridDataService.executeHybridQuery(
      [1], // Memory table IDs
      new Map([[2, parquetPath]]), // Parquet files
      'SELECT COUNT(*) as count, AVG(param1) as avg_param1 FROM $table'
    );
    
    console.log('✓ Hybrid query results:', hybridResult[0]);
    testResults.hybridQuery = true;
    
    // 7. Test sampling from Parquet
    console.log('\n7. Testing Parquet sampling...');
    const sampledData = await hybridDataService.sampleDataFromParquet(
      new Map([[1, parquetPath]]),
      ['param1', 'param2', 'param3'],
      500,
      { method: 'reservoir' }
    );
    
    console.log(`✓ Sampled ${sampledData.length} points from Parquet`);
    testResults.sampling = true;
    
    // Summary
    console.log('\n=== Test Summary ===');
    let passedTests = 0;
    for (const [test, passed] of Object.entries(testResults)) {
      console.log(`${passed ? '✓' : '✗'} ${test}`);
      if (passed) passedTests++;
    }
    
    console.log(`\nPassed ${passedTests}/${Object.keys(testResults).length} tests`);
    
  } catch (error) {
    console.error('\n✗ Test failed:', error);
  } finally {
    // Cleanup
    await hybridDataService.dispose();
  }
}

// Run test
testParquetIntegration();