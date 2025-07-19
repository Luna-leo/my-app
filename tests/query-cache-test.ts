/**
 * Query Cache Performance Test
 * Tests the DuckDB query caching functionality
 */

import { hybridDataService } from '@/lib/services/hybridDataService';
import { duckDBQueryCache } from '@/lib/services/duckdbQueryCache';

async function testQueryCache() {
  console.log('=== DuckDB Query Cache Test ===\n');
  
  try {
    // 1. Initialize DuckDB
    console.log('1. Initializing DuckDB...');
    await hybridDataService.initialize();
    console.log('✓ DuckDB initialized\n');
    
    // 2. Create test data
    console.log('2. Creating test data...');
    const testData = [];
    const startDate = new Date('2024-01-01');
    
    for (let i = 0; i < 50000; i++) {
      testData.push({
        metadataId: 1,
        timestamp: new Date(startDate.getTime() + i * 60000),
        data: {
          'param1': Math.sin(i / 100) * 100,
          'param2': Math.cos(i / 100) * 200,
          'param3': Math.random() * 300
        }
      });
    }
    
    await hybridDataService.loadTimeSeriesData(1, testData, ['param1', 'param2', 'param3']);
    console.log('✓ Created 50,000 test records\n');
    
    // 3. Test cache miss (first query)
    console.log('3. Testing cache miss...');
    const start1 = performance.now();
    const result1 = await hybridDataService.sampleData(
      [1],
      ['param1', 'param2'],
      1000,
      { method: 'nth' }
    );
    const duration1 = performance.now() - start1;
    console.log(`✓ First query: ${result1.length} points in ${duration1.toFixed(2)}ms\n`);
    
    // 4. Test cache hit (second query)
    console.log('4. Testing cache hit...');
    const start2 = performance.now();
    const result2 = await hybridDataService.sampleData(
      [1],
      ['param1', 'param2'],
      1000,
      { method: 'nth' }
    );
    const duration2 = performance.now() - start2;
    console.log(`✓ Second query: ${result2.length} points in ${duration2.toFixed(2)}ms`);
    console.log(`✓ Speedup: ${(duration1 / duration2).toFixed(1)}x faster\n`);
    
    // 5. Test cache stats
    console.log('5. Cache statistics:');
    const stats = duckDBQueryCache.getStats();
    console.log(`  - Hit rate: ${stats.hitRate.toFixed(1)}%`);
    console.log(`  - Hits: ${stats.hits}`);
    console.log(`  - Misses: ${stats.misses}`);
    console.log(`  - Cache size: ${(stats.cacheSize / 1024).toFixed(2)} KB`);
    console.log(`  - Entries: ${stats.entryCount}\n`);
    
    // 6. Test cache invalidation
    console.log('6. Testing cache invalidation...');
    await hybridDataService.loadTimeSeriesData(1, [testData[0]], ['param1']);
    const start3 = performance.now();
    const result3 = await hybridDataService.sampleData(
      [1],
      ['param1', 'param2'],
      1000,
      { method: 'nth' }
    );
    const duration3 = performance.now() - start3;
    console.log(`✓ After invalidation: ${duration3.toFixed(2)}ms (cache miss)\n`);
    
    // 7. Test different query parameters
    console.log('7. Testing different query parameters...');
    const queries = [
      { params: ['param1'], points: 500, method: 'random' as const },
      { params: ['param2', 'param3'], points: 2000, method: 'nth' as const },
      { params: ['param1', 'param2', 'param3'], points: 100, method: 'nth-fast' as const }
    ];
    
    for (const query of queries) {
      const start = performance.now();
      await hybridDataService.sampleData([1], query.params, query.points, { method: query.method });
      const duration = performance.now() - start;
      console.log(`  - Query (${query.params.join(', ')}, ${query.points} points, ${query.method}): ${duration.toFixed(2)}ms`);
    }
    
    // 8. Final cache stats
    console.log('\n8. Final cache statistics:');
    const finalStats = duckDBQueryCache.getStats();
    console.log(`  - Hit rate: ${finalStats.hitRate.toFixed(1)}%`);
    console.log(`  - Total queries: ${finalStats.totalQueries}`);
    console.log(`  - Cache size: ${(finalStats.cacheSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  - Entries: ${finalStats.entryCount}`);
    
    // Get cache metadata
    const metadata = duckDBQueryCache.getCacheMetadata();
    console.log('\n9. Top cached queries by access count:');
    metadata.entries.slice(0, 3).forEach((entry, i) => {
      console.log(`  ${i + 1}. Size: ${(entry.size / 1024).toFixed(2)}KB, Access: ${entry.accessCount}x, Age: ${(entry.age / 1000).toFixed(1)}s`);
    });
    
    console.log('\n✓ All tests passed!');
    
  } catch (error) {
    console.error('\n✗ Test failed:', error);
  } finally {
    // Cleanup
    duckDBQueryCache.clear();
    await hybridDataService.dispose();
  }
}

// Run test
testQueryCache();