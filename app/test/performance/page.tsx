'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Play, AlertCircle, CheckCircle2, Clock, Database, Zap } from 'lucide-react';
import { hybridDataService } from '@/lib/services/hybridDataService';
import { duckDBSchemaTracker } from '@/lib/services/duckdbSchemaTracker';
import { TimeSeriesData } from '@/lib/db';

interface TestResult {
  testName: string;
  duration: number;
  dataPoints: number;
  operations: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  error?: string;
}

export default function PerformanceTestPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentTest, setCurrentTest] = useState<string>('');
  const [progress, setProgress] = useState(0);

  const generateMockData = (
    metadataId: number,
    points: number,
    parameterCount: number
  ): TimeSeriesData[] => {
    const data: TimeSeriesData[] = [];
    const startTime = new Date('2024-01-01');

    for (let i = 0; i < points; i++) {
      const timestamp = new Date(startTime.getTime() + i * 60000);
      const dataPoint: Record<string, number | null> = {};

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
  };

  const runTests = async () => {
    setIsRunning(true);
    setResults([]);
    setProgress(0);

    const tests = [
      { name: 'Initial Load', fn: testInitialLoad },
      { name: 'Redundant Load', fn: testRedundantLoad },
      { name: 'Incremental Update', fn: testIncrementalColumnAdd },
      { name: 'SQL Sampling', fn: testSamplingPerformance },
    ];

    try {
      // Initialize DuckDB
      await hybridDataService.initialize();

      for (let i = 0; i < tests.length; i++) {
        const test = tests[i];
        setCurrentTest(test.name);
        setProgress((i / tests.length) * 100);

        const result = await test.fn();
        setResults(prev => [...prev, result]);
      }

      setProgress(100);
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      setIsRunning(false);
      setCurrentTest('');
    }
  };

  const testInitialLoad = async (): Promise<TestResult> => {
    const metadataId = 1;
    const dataPoints = 50000;
    const parameters = 30;
    
    const testData = generateMockData(metadataId, dataPoints, parameters);
    const parameterIds = Array.from({ length: parameters }, (_, i) => `param_${i}`);
    
    const startTime = performance.now();
    
    await hybridDataService.loadTimeSeriesData(
      metadataId,
      testData,
      parameterIds
    );
    
    const duration = performance.now() - startTime;
    
    return {
      testName: 'Initial Load',
      duration,
      dataPoints,
      operations: ['CREATE TABLE', 'INSERT DATA'],
      status: 'completed'
    };
  };

  const testRedundantLoad = async (): Promise<TestResult> => {
    const metadataId = 1;
    const dataPoints = 50000;
    const parameters = 30;
    
    const testData = generateMockData(metadataId, dataPoints, parameters);
    const parameterIds = Array.from({ length: parameters }, (_, i) => `param_${i}`);
    
    const startTime = performance.now();
    
    await hybridDataService.loadTimeSeriesData(
      metadataId,
      testData,
      parameterIds
    );
    
    const duration = performance.now() - startTime;
    
    return {
      testName: 'Redundant Load (Optimized)',
      duration,
      dataPoints,
      operations: ['SCHEMA CHECK', 'SKIP LOAD'],
      status: 'completed'
    };
  };

  const testIncrementalColumnAdd = async (): Promise<TestResult> => {
    const metadataId = 1;
    const dataPoints = 50000;
    const existingParams = 30;
    const newParams = 10;
    
    const testData = generateMockData(metadataId, dataPoints, existingParams + newParams);
    const allParameterIds = Array.from({ length: existingParams + newParams }, (_, i) => `param_${i}`);
    
    const startTime = performance.now();
    
    await hybridDataService.loadTimeSeriesData(
      metadataId,
      testData,
      allParameterIds
    );
    
    const duration = performance.now() - startTime;
    
    return {
      testName: 'Incremental Column Add',
      duration,
      dataPoints,
      operations: ['ALTER TABLE', 'INSERT DATA'],
      status: 'completed'
    };
  };

  const testSamplingPerformance = async (): Promise<TestResult> => {
    const metadataIds = [1, 2, 3];
    const targetPoints = 1000;
    
    // Load data for additional metadata IDs
    for (let i = 1; i < metadataIds.length; i++) {
      const metadataId = metadataIds[i];
      const testData = generateMockData(metadataId, 50000, 20);
      await hybridDataService.loadTimeSeriesData(
        metadataId,
        testData,
        Array.from({ length: 20 }, (_, j) => `param_${j}`)
      );
    }
    
    const startTime = performance.now();
    
    const sampledData = await hybridDataService.sampleData(
      metadataIds,
      ['param_0', 'param_1', 'param_2'],
      targetPoints,
      { method: 'nth' }
    );
    
    const duration = performance.now() - startTime;
    
    return {
      testName: 'DuckDB SQL Sampling',
      duration,
      dataPoints: sampledData.length,
      operations: ['SELECT', 'SAMPLE', 'UNION'],
      status: 'completed'
    };
  };

  const calculateSpeedup = () => {
    const initialLoad = results.find(r => r.testName === 'Initial Load');
    const redundantLoad = results.find(r => r.testName.includes('Redundant'));
    
    if (initialLoad && redundantLoad) {
      return Math.round(initialLoad.duration / redundantLoad.duration);
    }
    return null;
  };

  return (
    <div className="container mx-auto p-8 max-w-6xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">DuckDB Performance Test</h1>
        <p className="text-muted-foreground">
          最適化の効果を測定します：スキーマ追跡、単一段階サンプリング、インテリジェントカラムローディング
        </p>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Test Control
            </CardTitle>
            <CardDescription>
              各テストは50,000データポイントを使用して実行されます
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Button 
                onClick={runTests} 
                disabled={isRunning}
                className="w-full"
                size="lg"
              >
                {isRunning ? (
                  <>
                    <Clock className="mr-2 h-4 w-4 animate-spin" />
                    Running {currentTest}...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" />
                    Run Performance Tests
                  </>
                )}
              </Button>
              
              {isRunning && (
                <Progress value={progress} className="w-full" />
              )}
            </div>
          </CardContent>
        </Card>

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5" />
                Test Results
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {results.map((result, index) => (
                  <div key={index} className="border rounded-lg p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-semibold flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        {result.testName}
                      </h3>
                      <span className="text-sm font-mono">
                        {result.duration.toFixed(2)}ms
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Data Points:</span>
                        <span className="ml-2 font-mono">
                          {result.dataPoints.toLocaleString()}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Rate:</span>
                        <span className="ml-2 font-mono">
                          {Math.round(result.dataPoints / (result.duration / 1000)).toLocaleString()} pts/sec
                        </span>
                      </div>
                    </div>
                    <div className="mt-2">
                      <span className="text-sm text-muted-foreground">
                        Operations: {result.operations.join(' → ')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {calculateSpeedup() && (
                <Alert className="mt-6">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    <strong>Performance Improvement:</strong> Schema tracking による再ロード回避で
                    <span className="font-bold text-green-600 mx-1">
                      {calculateSpeedup()}x
                    </span>
                    高速化を達成しました！
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle>Schema Tracker Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              variant="outline"
              onClick={() => {
                const stats = duckDBSchemaTracker.getStats();
                alert(JSON.stringify(stats, null, 2));
              }}
            >
              View Schema Statistics
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}