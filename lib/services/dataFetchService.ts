/**
 * DataFetchService
 * 
 * ChartDataContextから分離されたデータ取得サービス
 * 責任:
 * - メタデータの取得とキャッシュ管理
 * - 時系列データの取得（DuckDB、Parquet、IndexedDB）
 * - データソースの統合
 */

import { TimeSeriesData, Metadata, ParameterInfo } from '@/lib/db/schema';
import { db } from '@/lib/db';
import { metadataCache, timeSeriesCache, parameterCache } from '@/lib/services/dataCache';
import { hybridDataService } from '@/lib/services/hybridDataService';
import { createDataPersistenceService } from '@/lib/services/dataPersistenceService';
import { createParquetDataManager } from '@/lib/services/parquetDataManager';
import { parameterTracker } from '@/lib/services/parameterTracker';
import { mergeTimeSeriesData } from '@/lib/utils/chartDataUtils';
import { createLogger } from './logger';

export interface FetchRawDataResult {
  timeSeries: TimeSeriesData[];
  dataByMetadata: Map<number, TimeSeriesData[]>;
  metadata: Map<number, {
    label: string;
    plant: string;
    machineNo: string;
    startTime?: Date;
    endTime?: Date;
  }>;
  parameters: Map<string, ParameterInfo>;
  originalCountByMetadata: Map<number, number>;
  totalOriginalCount: number;
}

export class DataFetchService {
  private static instance: DataFetchService;
  private logger = createLogger('DataFetchService');
  private duckDBLoadedData = new Set<number>();

  private constructor() {}

  static getInstance(): DataFetchService {
    if (!DataFetchService.instance) {
      DataFetchService.instance = new DataFetchService();
    }
    return DataFetchService.instance;
  }

  /**
   * メタデータを取得（キャッシュ付き）
   */
  async fetchMetadata(metadataIds: number[]): Promise<Map<number, Metadata | undefined>> {
    const metadataByIdMap = new Map<number, Metadata | undefined>();
    
    const promises = metadataIds.map(async (metadataId) => {
      const cached = metadataCache.get(metadataId);
      if (cached) {
        return { metadataId, metadata: cached };
      }
      
      const metadata = await db.metadata.get(metadataId);
      if (metadata) {
        metadataCache.set(metadataId, metadata);
      }
      return { metadataId, metadata };
    });

    const results = await Promise.all(promises);
    results.forEach(({ metadataId, metadata }) => {
      metadataByIdMap.set(metadataId, metadata);
    });

    return metadataByIdMap;
  }

  /**
   * パラメータ情報を取得（キャッシュ付き）
   */
  async fetchParameters(parameterIds: string[]): Promise<Map<string, ParameterInfo>> {
    const promises = parameterIds.map(async (parameterId) => {
      const cached = parameterCache.get(parameterId);
      if (cached) {
        return { parameterId, paramInfo: cached };
      }
      
      const paramInfo = await db.parameters
        .where('parameterId')
        .equals(parameterId)
        .first();
      
      if (paramInfo) {
        parameterCache.set(parameterId, paramInfo);
      }
      return { parameterId, paramInfo };
    });

    const results = await Promise.all(promises);
    const parameterMap = new Map<string, ParameterInfo>();
    results.forEach(({ parameterId, paramInfo }) => {
      if (paramInfo) {
        parameterMap.set(parameterId, paramInfo);
      }
    });
    
    return parameterMap;
  }

  /**
   * 単一のメタデータIDに対する時系列データを取得
   */
  private async fetchTimeSeriesForMetadata(
    metadataId: number,
    metadata: Metadata | undefined,
    parameterIds?: string[],
    maxPointsPerDataset?: number,
    isDuckDBReady = false,
    useDuckDB = true
  ): Promise<{ data: TimeSeriesData[]; totalCount: number }> {
    // 時間範囲フィルタリングがある場合
    if (metadata?.startTime || metadata?.endTime) {
      this.logger.debug(`Fetching filtered data for metadataId ${metadataId}`, {
        startTime: metadata.startTime,
        endTime: metadata.endTime,
        parameterIds: parameterIds?.length || 'all'
      });
      
      if (isDuckDBReady && useDuckDB) {
        return await this.fetchFromDuckDB(metadataId, metadata, parameterIds, maxPointsPerDataset);
      }
    }
    
    // キャッシュチェック（時間範囲なしの場合のみ）
    const cachedData = timeSeriesCache.get(metadataId);
    if (cachedData && !parameterIds) {
      this.logger.debug(`Cache hit for metadataId ${metadataId}`, { dataPoints: cachedData.length });
      return { data: cachedData, totalCount: cachedData.length };
    }
    
    // DuckDBから取得
    if (isDuckDBReady && useDuckDB) {
      return await this.fetchFromDuckDB(metadataId, metadata, parameterIds, maxPointsPerDataset);
    }
    
    // データなし
    this.logger.debug(`No data available for metadataId ${metadataId} - DuckDB not ready`);
    return { data: [], totalCount: 0 };
  }

  /**
   * DuckDBからデータを取得（復元処理含む）
   */
  private async fetchFromDuckDB(
    metadataId: number,
    metadata: Metadata | undefined,
    parameterIds?: string[],
    maxPointsPerDataset?: number
  ): Promise<{ data: TimeSeriesData[]; totalCount: number }> {
    try {
      const connection = await hybridDataService.getConnection();
      if (!connection) {
        throw new Error('DuckDB connection not available');
      }

      const tableName = `timeseries_${metadataId}`;
      
      // テーブル存在チェック
      const tableExists = await this.checkTableExists(connection, tableName);
      
      if (tableExists) {
        this.logger.debug(`DuckDB table ${tableName} exists, loading from DuckDB`);
        return await this.loadFromDuckDBTable(metadataId, metadata, parameterIds, maxPointsPerDataset);
      }
      
      // テーブルが存在しない場合、永続化データまたはParquetから復元
      return await this.restoreDataIfAvailable(connection, metadataId, metadata, parameterIds, maxPointsPerDataset);
      
    } catch (err) {
      this.logger.warn('Failed to load from DuckDB', err);
      return { data: [], totalCount: 0 };
    }
  }

  /**
   * DuckDBテーブルの存在チェック
   */
  private async checkTableExists(connection: any, tableName: string): Promise<boolean> {
    try {
      const result = await connection.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = '${tableName}'
      `);
      return result.toArray()[0]?.count > 0;
    } catch {
      return false;
    }
  }

  /**
   * DuckDBテーブルからデータをロード
   */
  private async loadFromDuckDBTable(
    metadataId: number,
    metadata: Metadata | undefined,
    parameterIds?: string[],
    maxPointsPerDataset?: number
  ): Promise<{ data: TimeSeriesData[]; totalCount: number }> {
    const allParams = parameterIds || [];
    
    const duckdbData = await hybridDataService.sampleData(
      [metadataId],
      allParams,
      maxPointsPerDataset || 10000,
      {
        startTime: metadata?.startTime ? new Date(metadata.startTime) : undefined,
        endTime: metadata?.endTime ? new Date(metadata.endTime) : undefined,
        method: 'nth'
      }
    );
    
    // パラメータトラッカーを更新
    if (duckdbData.length > 0) {
      const actualKeys = Object.keys(duckdbData[0].data);
      parameterTracker.addLoadedParameters(metadataId, actualKeys);
      if (!metadata?.startTime && !metadata?.endTime) {
        timeSeriesCache.set(metadataId, duckdbData);
      }
    }
    
    return { data: duckdbData, totalCount: duckdbData.length };
  }

  /**
   * 永続化データまたはParquetから復元
   */
  private async restoreDataIfAvailable(
    connection: any,
    metadataId: number,
    metadata: Metadata | undefined,
    parameterIds?: string[],
    maxPointsPerDataset?: number
  ): Promise<{ data: TimeSeriesData[]; totalCount: number }> {
    // 永続化データの確認と復元
    const persistenceService = createDataPersistenceService(connection);
    const persistenceStatus = await persistenceService.getPersistenceStatus(metadataId);
    
    if (persistenceStatus.isPersisted) {
      this.logger.info(`Found persisted data for metadataId ${metadataId}, restoring on-demand...`);
      
      try {
        const restoreResult = await persistenceService.restoreTable(metadataId);
        if (restoreResult.success) {
          this.logger.info(`Successfully restored ${restoreResult.rowsRestored} rows for metadataId ${metadataId}`);
          this.duckDBLoadedData.add(metadataId);
          
          // 復元後にデータをロード
          return await this.loadFromDuckDBTable(metadataId, metadata, parameterIds, maxPointsPerDataset);
        }
      } catch (err) {
        this.logger.error('Error restoring persisted data', err);
      }
    }
    
    // Parquetファイルの確認
    const parquetFiles = await db.parquetFiles
      .where('metadataId')
      .equals(metadataId)
      .toArray();
    
    if (parquetFiles.length > 0) {
      return await this.loadFromParquet(connection, metadataId, parquetFiles[0], parameterIds);
    }
    
    return { data: [], totalCount: 0 };
  }

  /**
   * Parquetファイルからデータをロード
   */
  private async loadFromParquet(
    connection: any,
    metadataId: number,
    parquetFile: any,
    parameterIds?: string[]
  ): Promise<{ data: TimeSeriesData[]; totalCount: number }> {
    this.logger.info(`Loading from Parquet file for metadataId ${metadataId}`);
    
    try {
      const parquetManager = createParquetDataManager(connection);
      const parquetData = await parquetManager.readParquetData(parquetFile.id!);
      
      // DuckDBタイムスタンプのパース
      const { parseDuckDBTimestamp } = await import('@/lib/utils/duckdbTimestamp');
      const timeSeriesData: TimeSeriesData[] = parquetData.map((row: unknown) => {
        const rowObj = row as Record<string, unknown>;
        return {
          metadataId: metadataId,
          timestamp: parseDuckDBTimestamp(rowObj.timestamp as string | number),
          data: parameterIds ? 
            Object.fromEntries(parameterIds.map(pid => [pid, rowObj[pid] as number | null ?? null])) :
            Object.fromEntries(
              Object.entries(rowObj)
                .filter(([k]) => k !== 'timestamp')
                .map(([k, v]) => [k, v as number | null ?? null])
            )
        };
      });
      
      // パラメータトラッカーとキャッシュを更新
      if (timeSeriesData.length > 0) {
        const actualKeys = Object.keys(timeSeriesData[0].data);
        parameterTracker.addLoadedParameters(metadataId, actualKeys);
        timeSeriesCache.set(metadataId, timeSeriesData);
      }
      
      return { data: timeSeriesData, totalCount: parquetFile.rowCount };
    } catch (err) {
      this.logger.error('Failed to load from Parquet', err);
      return { data: [], totalCount: 0 };
    }
  }

  /**
   * 複数のメタデータIDに対する生データを取得
   */
  async fetchRawData(
    metadataIds: number[],
    parameterIds?: string[],
    maxPointsPerDataset?: number
  ): Promise<FetchRawDataResult> {
    const timer = this.logger.startTimer('fetchRawData');
    
    // 空データの処理
    if (!metadataIds || metadataIds.length === 0) {
      return {
        timeSeries: [],
        dataByMetadata: new Map(),
        metadata: new Map(),
        parameters: new Map(),
        originalCountByMetadata: new Map(),
        totalOriginalCount: 0
      };
    }

    // メタデータを取得
    const metadataByIdMap = await this.fetchMetadata(metadataIds);
    
    // メタデータマップを作成
    const metadataMap = new Map();
    metadataByIdMap.forEach((metadata, metadataId) => {
      if (metadata) {
        metadataMap.set(metadataId, {
          label: metadata.label,
          plant: metadata.plant,
          machineNo: metadata.machineNo,
          startTime: metadata.startTime,
          endTime: metadata.endTime,
        });
      }
    });

    // DuckDBの準備状態を確認
    const isDuckDBReady = await hybridDataService.getConnection() !== null;
    
    // 各メタデータIDに対して時系列データを取得
    const timeSeriesPromises = metadataIds.map(async (metadataId) => {
      const metadata = metadataByIdMap.get(metadataId);
      const result = await this.fetchTimeSeriesForMetadata(
        metadataId,
        metadata,
        parameterIds,
        maxPointsPerDataset,
        isDuckDBReady,
        true // useDuckDB
      );
      
      return { metadataId, ...result };
    });

    const timeSeriesResults = await Promise.all(timeSeriesPromises);
    
    // データをメタデータIDごとにマップ
    const dataByMetadata = new Map<number, TimeSeriesData[]>();
    const originalCountByMetadata = new Map<number, number>();
    
    timeSeriesResults.forEach(({ metadataId, data, totalCount }) => {
      dataByMetadata.set(metadataId, data);
      originalCountByMetadata.set(metadataId, totalCount || data.length);
    });

    // マージされた時系列データを作成
    const timeSeriesArrays = timeSeriesResults.map(r => r.data);
    const mergedTimeSeries = mergeTimeSeriesData(timeSeriesArrays);

    timer();

    return {
      timeSeries: mergedTimeSeries,
      dataByMetadata,
      metadata: metadataMap,
      parameters: new Map<string, ParameterInfo>(),
      originalCountByMetadata,
      totalOriginalCount: Array.from(originalCountByMetadata.values()).reduce((sum, count) => sum + count, 0)
    };
  }
}

// シングルトンインスタンスをエクスポート
export const dataFetchService = DataFetchService.getInstance();