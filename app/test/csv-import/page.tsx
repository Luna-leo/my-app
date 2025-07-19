'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Zap, Upload, CheckCircle, XCircle } from 'lucide-react';
import { hybridDataService } from '@/lib/services/hybridDataService';
import { createDuckDBCsvImporter } from '@/lib/services/duckdbCsvImporter';

export default function CsvImportTestPage() {
  const [testStatus, setTestStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle');
  const [testResults, setTestResults] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string>('');

  const addResult = (message: string) => {
    setTestResults(prev => [...prev, message]);
  };

  const generateTestCsv = (rows: number): File => {
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
    
    const blob = new Blob([csv], { type: 'text/csv' });
    return new File([blob], 'test_data.csv', { type: 'text/csv' });
  };

  const runTest = async (rowCount: number) => {
    setTestStatus('running');
    setTestResults([]);
    setProgress(0);
    setError('');
    
    try {
      // Initialize DuckDB
      addResult('Initializing DuckDB...');
      await hybridDataService.initialize();
      const connection = await hybridDataService.getConnection();
      
      if (!connection) {
        throw new Error('Failed to get DuckDB connection');
      }
      addResult('✓ DuckDB initialized successfully');
      setProgress(20);
      
      // Create test CSV data
      addResult(`Creating test CSV file with ${rowCount.toLocaleString()} rows...`);
      const testFile = generateTestCsv(rowCount);
      addResult(`✓ Created test CSV file (${(testFile.size / 1024 / 1024).toFixed(2)} MB)`);
      setProgress(40);
      
      // Test import
      addResult('Testing DuckDB CSV import...');
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
        (importProgress) => {
          const progressValue = 40 + (importProgress.current / importProgress.total) * 40;
          setProgress(progressValue);
        }
      );
      const duration = performance.now() - startTime;
      
      if (result.success) {
        addResult('✓ Import completed successfully!');
        addResult(`  - Table: ${result.tableName}`);
        addResult(`  - Rows: ${result.rowCount.toLocaleString()}`);
        addResult(`  - Columns: ${result.columnCount}`);
        addResult(`  - Duration: ${duration.toFixed(0)}ms`);
        addResult(`  - Speed: ${(result.rowCount / (duration / 1000)).toFixed(0)} rows/sec`);
        setProgress(90);
        
        // Verify data
        addResult('Verifying imported data...');
        const verifyQuery = `SELECT COUNT(*) as count FROM ${result.tableName}`;
        const verifyResult = await connection.query(verifyQuery);
        const count = verifyResult.toArray()[0].count;
        addResult(`✓ Verified ${count.toLocaleString()} rows in table`);
        
        // Test sampling
        addResult('Testing data sampling...');
        const sampleQuery = `
          SELECT * FROM ${result.tableName} 
          USING SAMPLE 100 ROWS
        `;
        const sampleResult = await connection.query(sampleQuery);
        const sampleRows = sampleResult.toArray();
        addResult(`✓ Sampled ${sampleRows.length} rows successfully`);
        
        // Clean up
        await connection.query(`DROP TABLE IF EXISTS ${result.tableName}`);
        addResult('✓ Cleanup completed');
        
        setProgress(100);
        setTestStatus('success');
      } else {
        throw new Error(result.errors.join(', '));
      }
      
    } catch (err) {
      console.error('Test failed:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setTestStatus('error');
    }
  };

  return (
    <div className="container mx-auto p-8">
      <h1 className="text-2xl font-bold mb-6">DuckDB CSV Import Test</h1>
      
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>CSV Import Performance Test</CardTitle>
          <CardDescription>
            Test the DuckDB CSV import functionality with different file sizes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <Button 
              onClick={() => runTest(1000)}
              disabled={testStatus === 'running'}
              variant="outline"
            >
              <Upload className="mr-2 h-4 w-4" />
              Test 1K rows
            </Button>
            <Button 
              onClick={() => runTest(10000)}
              disabled={testStatus === 'running'}
              variant="outline"
            >
              <Upload className="mr-2 h-4 w-4" />
              Test 10K rows
            </Button>
            <Button 
              onClick={() => runTest(100000)}
              disabled={testStatus === 'running'}
              variant="outline"
            >
              <Upload className="mr-2 h-4 w-4" />
              Test 100K rows
            </Button>
          </div>
          
          {testStatus === 'running' && (
            <div className="mb-4">
              <Progress value={progress} className="mb-2" />
              <p className="text-sm text-muted-foreground text-center">
                Running test... {progress.toFixed(0)}%
              </p>
            </div>
          )}
          
          {testStatus === 'success' && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Test completed successfully! No stack overflow errors detected.
              </AlertDescription>
            </Alert>
          )}
          
          {testStatus === 'error' && (
            <Alert className="mb-4" variant="destructive">
              <XCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          
          {testResults.length > 0 && (
            <div className="bg-gray-50 rounded-lg p-4 max-h-96 overflow-y-auto">
              <h3 className="font-semibold mb-2 flex items-center">
                <Zap className="mr-2 h-4 w-4 text-yellow-600" />
                Test Results
              </h3>
              <pre className="text-sm whitespace-pre-wrap font-mono">
                {testResults.join('\n')}
              </pre>
            </div>
          )}
        </CardContent>
      </Card>
      
      <div className="text-sm text-muted-foreground">
        <p>This test verifies that the DuckDB CSV import functionality works correctly without stack overflow errors.</p>
        <p className="mt-2">The implementation uses <code>registerFileBuffer</code> to handle large files efficiently.</p>
      </div>
    </div>
  );
}