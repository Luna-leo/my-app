'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { 
  Database, 
  Zap, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Loader2,
  ArrowRight
} from 'lucide-react';
import { duckDBMigrationService, MigrationProgress, MigrationResult } from '@/lib/services/duckdbMigrationService';

export function MigrationContent() {
  const [status, setStatus] = useState<'idle' | 'checking' | 'migrating' | 'completed' | 'error'>('idle');
  const [migrationStatus, setMigrationStatus] = useState<{
    totalDatasets: number;
    migratedDatasets: number;
    pendingDatasets: number;
    isFullyMigrated: boolean;
  } | null>(null);
  const [progress, setProgress] = useState<MigrationProgress | null>(null);
  const [result, setResult] = useState<MigrationResult | null>(null);
  const [error, setError] = useState<string>('');

  useEffect(() => {
    checkMigrationStatus();
  }, []);

  const checkMigrationStatus = async () => {
    setStatus('checking');
    try {
      const status = await duckDBMigrationService.getMigrationStatus();
      setMigrationStatus(status);
      setStatus('idle');
    } catch (err) {
      console.error('Failed to check migration status:', err);
      setStatus('error');
      setError('Failed to check migration status');
    }
  };

  const handleMigration = async () => {
    setStatus('migrating');
    setError('');
    setResult(null);
    
    try {
      const migrationResult = await duckDBMigrationService.migrateAllData(
        (migrationProgress) => setProgress(migrationProgress)
      );
      
      setResult(migrationResult);
      setStatus(migrationResult.success ? 'completed' : 'error');
      
      if (!migrationResult.success) {
        setError(migrationResult.errors.join(', '));
      }
      
      // Refresh status
      await checkMigrationStatus();
      
    } catch (err) {
      setStatus('error');
      setError(err instanceof Error ? err.message : 'Migration failed');
    }
  };

  const renderStatusIcon = () => {
    if (!migrationStatus) return null;
    
    if (migrationStatus.isFullyMigrated) {
      return <CheckCircle2 className="h-5 w-5 text-green-600" />;
    } else if (migrationStatus.migratedDatasets > 0) {
      return <AlertCircle className="h-5 w-5 text-yellow-600" />;
    } else {
      return <Database className="h-5 w-5 text-gray-600" />;
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2 mb-2">
          <Zap className="h-6 w-6 text-yellow-600" />
          DuckDB Migration Tool
        </h2>
        <p className="text-muted-foreground">
          Migrate your existing data to DuckDB for improved performance
        </p>
      </div>

      {/* Status Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Migration Status
            {renderStatusIcon()}
          </CardTitle>
          <CardDescription>
            Current state of your data migration
          </CardDescription>
        </CardHeader>
        <CardContent>
          {status === 'checking' ? (
            <div className="flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Checking migration status...</span>
            </div>
          ) : migrationStatus ? (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold">{migrationStatus.totalDatasets}</div>
                  <div className="text-sm text-muted-foreground">Total Datasets</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {migrationStatus.migratedDatasets}
                  </div>
                  <div className="text-sm text-muted-foreground">Migrated</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">
                    {migrationStatus.pendingDatasets}
                  </div>
                  <div className="text-sm text-muted-foreground">Pending</div>
                </div>
              </div>
              
              {migrationStatus.totalDatasets > 0 && (
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>Migration Progress</span>
                    <span>
                      {Math.round((migrationStatus.migratedDatasets / migrationStatus.totalDatasets) * 100)}%
                    </span>
                  </div>
                  <Progress 
                    value={(migrationStatus.migratedDatasets / migrationStatus.totalDatasets) * 100} 
                  />
                </div>
              )}
              
              {migrationStatus.isFullyMigrated && (
                <Alert className="border-green-200 bg-green-50">
                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    All datasets have been migrated to DuckDB!
                  </AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <div className="text-center text-muted-foreground">
              Unable to fetch migration status
            </div>
          )}
        </CardContent>
      </Card>

      {/* Migration Progress */}
      {status === 'migrating' && progress && (
        <Card>
          <CardHeader>
            <CardTitle>Migration Progress</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span>{progress.message}</span>
                <span>{Math.round(progress.current)}%</span>
              </div>
              <Progress value={progress.current} />
            </div>
            
            {progress.currentMetadata && (
              <div className="text-sm text-muted-foreground">
                Currently migrating: {progress.currentMetadata}
              </div>
            )}
            
            <Badge variant={
              progress.phase === 'completed' ? 'default' :
              progress.phase === 'verifying' ? 'secondary' :
              'outline'
            }>
              {progress.phase}
            </Badge>
          </CardContent>
        </Card>
      )}

      {/* Migration Result */}
      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {result.success ? (
                <>
                  <CheckCircle2 className="h-5 w-5 text-green-600" />
                  Migration Completed
                </>
              ) : (
                <>
                  <XCircle className="h-5 w-5 text-red-600" />
                  Migration Failed
                </>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span>Datasets migrated:</span>
                <span className="font-semibold">
                  {result.migratedCount} / {result.totalCount}
                </span>
              </div>
              <div className="flex justify-between">
                <span>Duration:</span>
                <span className="font-semibold">
                  {(result.duration / 1000).toFixed(1)}s
                </span>
              </div>
              
              {result.errors.length > 0 && (
                <Alert variant="destructive">
                  <AlertDescription>
                    <div className="font-semibold mb-1">Errors:</div>
                    <ul className="list-disc list-inside text-sm">
                      {result.errors.map((error, index) => (
                        <li key={index}>{error}</li>
                      ))}
                    </ul>
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error Display */}
      {status === 'error' && error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Action Buttons */}
      <div className="flex gap-4">
        {migrationStatus && migrationStatus.pendingDatasets > 0 && (
          <Button 
            onClick={handleMigration}
            disabled={status === 'migrating'}
            size="lg"
          >
            {status === 'migrating' ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Migrating...
              </>
            ) : (
              <>
                <ArrowRight className="mr-2 h-4 w-4" />
                Migrate {migrationStatus.pendingDatasets} Datasets
              </>
            )}
          </Button>
        )}
        
        <Button
          onClick={checkMigrationStatus}
          variant="outline"
          disabled={status === 'checking' || status === 'migrating'}
        >
          {status === 'checking' ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Checking...
            </>
          ) : (
            'Refresh Status'
          )}
        </Button>
      </div>

      {/* Information */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <h3 className="font-semibold mb-2">About DuckDB Migration</h3>
          <ul className="text-sm text-muted-foreground space-y-1">
            <li>• Migrates existing IndexedDB data to DuckDB for faster queries</li>
            <li>• Reduces table recreation overhead by tracking schemas</li>
            <li>• Enables single-stage SQL-based sampling</li>
            <li>• Improves performance by up to 100x for large datasets</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}