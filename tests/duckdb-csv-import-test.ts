/**
 * Test for DuckDB CSV import functionality
 * Verifies that the stack overflow issue has been resolved
 */

import { hybridDataService } from '@/lib/services/hybridDataService';
import { createDuckDBCsvImporter } from '@/lib/services/duckdbCsvImporter';

async function testDuckDBCsvImport() {
  console.log('=== DuckDB CSV Import Test ===\n');
  
  try {
    // Initialize DuckDB
    console.log('1. Initializing DuckDB...');
    await hybridDataService.initialize();
    const connection = await hybridDataService.getConnection();
    
    if (!connection) {
      throw new Error('Failed to get DuckDB connection');
    }
    console.log('✓ DuckDB initialized successfully\n');
    
    // Create test CSV data
    console.log('2. Creating test CSV file...');
    const csvContent = generateTestCsv(10000); // 10k rows for testing
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const testFile = new File([blob], 'test_data.csv', { type: 'text/csv' });
    console.log(`✓ Created test CSV file (${testFile.size} bytes)\n`);
    
    // Test import
    console.log('3. Testing DuckDB CSV import...');
    const importer = createDuckDBCsvImporter(connection);
    
    const startTime = performance.now();
    const result = await importer.importCsv(
      testFile,
      {
        plant: 'TestPlant',
        machineNo: 'TestMachine001',
        label: 'Test Import',
        dataSource: 'CASS'
      },
      {
        type: 'CASS',
        encoding: 'utf-8'
      },
      (progress) => {
        console.log(`   ${progress.phase}: ${progress.message} (${progress.current}/${progress.total})`);
      }
    );
    const duration = performance.now() - startTime;
    
    if (result.success) {
      console.log('\n✓ Import completed successfully!');
      console.log(`  - Table: ${result.tableName}`);
      console.log(`  - Rows: ${result.rowCount}`);
      console.log(`  - Columns: ${result.columnCount}`);
      console.log(`  - Duration: ${duration.toFixed(0)}ms`);
      console.log(`  - Speed: ${(result.rowCount / (duration / 1000)).toFixed(0)} rows/sec`);
      
      // Verify data
      console.log('\n4. Verifying imported data...');
      const verifyQuery = `SELECT COUNT(*) as count FROM ${result.tableName}`;
      const verifyResult = await connection.query(verifyQuery);
      const count = verifyResult.toArray()[0].count;
      console.log(`✓ Verified ${count} rows in table`);
      
      // Test sampling
      console.log('\n5. Testing data sampling...');
      const sampleQuery = `
        SELECT * FROM ${result.tableName} 
        USING SAMPLE 100 ROWS
      `;
      const sampleResult = await connection.query(sampleQuery);
      const sampleRows = sampleResult.toArray();
      console.log(`✓ Sampled ${sampleRows.length} rows successfully`);
      
      // Clean up
      await connection.query(`DROP TABLE IF EXISTS ${result.tableName}`);
      console.log('\n✓ Cleanup completed');
      
    } else {
      console.error('\n✗ Import failed:', result.errors);
    }
    
  } catch (error) {
    console.error('\n✗ Test failed:', error);
    console.error('Stack trace:', error instanceof Error ? error.stack : 'No stack trace');
  }
}

function generateTestCsv(rows: number): string {
  const headers = ['Header1', 'Header2', 'Header3'];
  const paramHeaders = ['Timestamp', 'Param1', 'Param2', 'Param3', 'Param4', 'Param5'];
  
  let csv = headers.join(',') + '\n';
  csv += paramHeaders.join(',') + '\n';
  csv += '\n'; // Empty line after headers
  
  const startDate = new Date('2024-01-01T00:00:00');
  
  for (let i = 0; i < rows; i++) {
    const timestamp = new Date(startDate.getTime() + i * 1000); // 1 second intervals
    const row = [
      timestamp.toISOString(),
      Math.random() * 100,
      Math.random() * 200,
      Math.random() * 300,
      Math.random() * 400,
      Math.random() * 500
    ];
    csv += row.join(',') + '\n';
  }
  
  return csv;
}

// Run test
testDuckDBCsvImport();