/**
 * DuckDB Migration Service
 * 
 * Migrates existing IndexedDB data to DuckDB for improved performance
 */

import { db } from '@/lib/db';
import { hybridDataService } from './hybridDataService';
import { duckDBSchemaTracker } from './duckdbSchemaTracker';

export interface MigrationProgress {
  current: number;
  total: number;
  phase: 'preparing' | 'migrating' | 'verifying' | 'completed';
  currentMetadata?: string;
  message: string;
}

export interface MigrationResult {
  success: boolean;
  migratedCount: number;
  totalCount: number;
  duration: number;
  errors: string[];
}

export class DuckDBMigrationService {
  private static instance: DuckDBMigrationService;
  
  private constructor() {}
  
  static getInstance(): DuckDBMigrationService {
    if (!DuckDBMigrationService.instance) {
      DuckDBMigrationService.instance = new DuckDBMigrationService();
    }
    return DuckDBMigrationService.instance;
  }
  
  /**
   * Migrate all existing IndexedDB data to DuckDB
   */
  async migrateAllData(
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<MigrationResult> {
    const startTime = performance.now();
    const errors: string[] = [];
    let migratedCount = 0;
    
    try {
      onProgress?.({
        current: 0,
        total: 100,
        phase: 'preparing',
        message: 'Initializing DuckDB...'
      });
      
      // Ensure DuckDB is initialized
      await hybridDataService.initialize();
      
      // Get all metadata
      const allMetadata = await db.metadata.toArray();
      const totalCount = allMetadata.length;
      
      if (totalCount === 0) {
        return {
          success: true,
          migratedCount: 0,
          totalCount: 0,
          duration: performance.now() - startTime,
          errors: []
        };
      }
      
      onProgress?.({
        current: 10,
        total: 100,
        phase: 'migrating',
        message: `Found ${totalCount} datasets to migrate`
      });
      
      // Migrate each dataset
      for (let i = 0; i < allMetadata.length; i++) {
        const metadata = allMetadata[i];
        const progressPercent = 10 + (i / totalCount) * 80;
        
        try {
          onProgress?.({
            current: progressPercent,
            total: 100,
            phase: 'migrating',
            currentMetadata: `${metadata.plant} - ${metadata.machineNo}`,
            message: `Migrating dataset ${i + 1} of ${totalCount}`
          });
          
          // Check if already migrated
          if (!metadata.id) {
            console.log(`[Migration] Metadata has no ID, skipping`);
            continue;
          }
          
          if (duckDBSchemaTracker.hasTable(metadata.id)) {
            console.log(`[Migration] Dataset ${metadata.id} already migrated, skipping`);
            migratedCount++;
            continue;
          }
          
          // Get time series data for this metadata
          const timeSeriesData = await db.timeSeries
            .where('metadataId')
            .equals(metadata.id)
            .toArray();
          
          if (timeSeriesData.length === 0) {
            console.log(`[Migration] No data for metadata ${metadata.id}, skipping`);
            continue;
          }
          
          // Extract all parameter IDs
          const parameterIds = new Set<string>();
          timeSeriesData.forEach(row => {
            Object.keys(row.data).forEach(id => parameterIds.add(id));
          });
          
          // Load data into DuckDB
          await hybridDataService.loadTimeSeriesData(
            metadata.id,
            timeSeriesData,
            Array.from(parameterIds)
          );
          
          migratedCount++;
          console.log(`[Migration] Successfully migrated dataset ${metadata.id}`);
          
        } catch (error) {
          const errorMsg = `Failed to migrate dataset ${metadata.id}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[Migration] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }
      
      onProgress?.({
        current: 90,
        total: 100,
        phase: 'verifying',
        message: 'Verifying migration...'
      });
      
      // Verify migration
      const stats = await hybridDataService.getLoadedDataStats();
      console.log(`[Migration] Verification - Total rows in DuckDB: ${stats.totalRows}`);
      
      const duration = performance.now() - startTime;
      
      onProgress?.({
        current: 100,
        total: 100,
        phase: 'completed',
        message: `Migration completed: ${migratedCount} of ${totalCount} datasets`
      });
      
      return {
        success: errors.length === 0,
        migratedCount,
        totalCount,
        duration,
        errors
      };
      
    } catch (error) {
      console.error('[Migration] Fatal error:', error);
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        migratedCount,
        totalCount: 0,
        duration: performance.now() - startTime,
        errors
      };
    }
  }
  
  /**
   * Migrate specific metadata IDs to DuckDB
   */
  async migrateSelected(
    metadataIds: number[],
    onProgress?: (progress: MigrationProgress) => void
  ): Promise<MigrationResult> {
    const startTime = performance.now();
    const errors: string[] = [];
    let migratedCount = 0;
    
    try {
      onProgress?.({
        current: 0,
        total: 100,
        phase: 'preparing',
        message: 'Initializing DuckDB...'
      });
      
      // Ensure DuckDB is initialized
      await hybridDataService.initialize();
      
      const totalCount = metadataIds.length;
      
      for (let i = 0; i < metadataIds.length; i++) {
        const metadataId = metadataIds[i];
        const progressPercent = (i / totalCount) * 100;
        
        try {
          const metadata = await db.metadata.get(metadataId);
          if (!metadata) {
            errors.push(`Metadata ${metadataId} not found`);
            continue;
          }
          
          onProgress?.({
            current: progressPercent,
            total: 100,
            phase: 'migrating',
            currentMetadata: `${metadata.plant} - ${metadata.machineNo}`,
            message: `Migrating dataset ${i + 1} of ${totalCount}`
          });
          
          // Get time series data
          const timeSeriesData = await db.timeSeries
            .where('metadataId')
            .equals(metadataId)
            .toArray();
          
          if (timeSeriesData.length === 0) {
            console.log(`[Migration] No data for metadata ${metadataId}, skipping`);
            continue;
          }
          
          // Extract all parameter IDs
          const parameterIds = new Set<string>();
          timeSeriesData.forEach(row => {
            Object.keys(row.data).forEach(id => parameterIds.add(id));
          });
          
          // Load data into DuckDB
          await hybridDataService.loadTimeSeriesData(
            metadataId,
            timeSeriesData,
            Array.from(parameterIds)
          );
          
          migratedCount++;
          
        } catch (error) {
          const errorMsg = `Failed to migrate dataset ${metadataId}: ${error instanceof Error ? error.message : 'Unknown error'}`;
          console.error(`[Migration] ${errorMsg}`);
          errors.push(errorMsg);
        }
      }
      
      const duration = performance.now() - startTime;
      
      return {
        success: errors.length === 0,
        migratedCount,
        totalCount,
        duration,
        errors
      };
      
    } catch (error) {
      console.error('[Migration] Fatal error:', error);
      errors.push(error instanceof Error ? error.message : 'Unknown error');
      
      return {
        success: false,
        migratedCount,
        totalCount: metadataIds.length,
        duration: performance.now() - startTime,
        errors
      };
    }
  }
  
  /**
   * Check migration status
   */
  async getMigrationStatus(): Promise<{
    totalDatasets: number;
    migratedDatasets: number;
    pendingDatasets: number;
    isFullyMigrated: boolean;
  }> {
    try {
      const allMetadata = await db.metadata.toArray();
      const migratedIds = duckDBSchemaTracker.getMigratedMetadataIds();
      
      const totalDatasets = allMetadata.length;
      const migratedDatasets = allMetadata.filter(m => m.id !== undefined && migratedIds.has(m.id)).length;
      const pendingDatasets = totalDatasets - migratedDatasets;
      
      return {
        totalDatasets,
        migratedDatasets,
        pendingDatasets,
        isFullyMigrated: pendingDatasets === 0
      };
    } catch (error) {
      console.error('[Migration] Failed to get status:', error);
      return {
        totalDatasets: 0,
        migratedDatasets: 0,
        pendingDatasets: 0,
        isFullyMigrated: false
      };
    }
  }
}

// Export singleton instance
export const duckDBMigrationService = DuckDBMigrationService.getInstance();