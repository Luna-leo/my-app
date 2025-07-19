import { NextResponse } from 'next/server';
import { hybridDataService } from '@/lib/services/hybridDataService';
import { createDuckDBCsvImporter } from '@/lib/services/duckdbCsvImporter';

export async function POST(request: Request) {
  try {
    const { rowCount = 10000 } = await request.json();
    
    // Initialize DuckDB
    await hybridDataService.initialize();
    const connection = await hybridDataService.getConnection();
    
    if (!connection) {
      throw new Error('Failed to get DuckDB connection');
    }
    
    // Generate test CSV
    const csvContent = generateTestCsv(rowCount);
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const testFile = new File([blob], 'test_data.csv', { type: 'text/csv' });
    
    // Test import
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
      }
    );
    
    const duration = performance.now() - startTime;
    
    if (result.success) {
      // Clean up
      await connection.query(`DROP TABLE IF EXISTS ${result.tableName}`);
      
      return NextResponse.json({
        success: true,
        message: 'CSV import test completed successfully',
        details: {
          rowCount: result.rowCount,
          columnCount: result.columnCount,
          duration: `${duration.toFixed(0)}ms`,
          speed: `${(result.rowCount / (duration / 1000)).toFixed(0)} rows/sec`,
          fileSize: `${(testFile.size / 1024 / 1024).toFixed(2)} MB`
        }
      });
    } else {
      return NextResponse.json({
        success: false,
        error: result.errors.join(', ')
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error('Test failed:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    }, { status: 500 });
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