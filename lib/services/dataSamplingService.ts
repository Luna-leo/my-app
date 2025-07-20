/**
 * DataSamplingService
 * 
 * チャートデータのサンプリング処理を担当
 * 責任:
 * - DuckDBによるサンプリング
 * - クライアントサイドのサンプリング
 * - サンプリング戦略の選択
 * - キャッシュ管理
 */

import { TimeSeriesData } from '@/lib/db/schema';
import { SamplingInfo } from '@/lib/types/chart';
import { SamplingConfig } from '@/lib/utils/chartDataSampling';
import { hybridDataService } from '@/lib/services/hybridDataService';
import { 
  DEFAULT_SAMPLING_CONFIG,
  sampleTimeSeriesDataByMetadata
} from '@/lib/utils/chartDataSampling';
import { getSimpleWorkerPool } from '@/lib/services/simpleWorkerPool';
import { createLogger } from './logger';

export interface SamplingOptions {
  enableSampling: boolean | SamplingConfig;
  targetPointsPerDataset?: number;
  maxPointsPerDataset?: number;
  method?: 'nth' | 'lttb' | 'min-max';
  useDuckDB?: boolean;
  useWorker?: boolean;
}

export interface SampledDataResult {
  timeSeries: TimeSeriesData[];
  samplingInfo: SamplingInfo;
  originalCount: number;
}

export class DataSamplingService {
  private static instance: DataSamplingService;
  private logger = createLogger('DataSamplingService');

  private constructor() {}

  static getInstance(): DataSamplingService {
    if (!DataSamplingService.instance) {
      DataSamplingService.instance = new DataSamplingService();
    }
    return DataSamplingService.instance;
  }

  /**
   * サンプリング設定を正規化
   */
  private normalizeSamplingConfig(
    enableSampling: boolean | SamplingConfig
  ): { enabled: boolean; targetPoints: number; config: SamplingConfig | null } {
    if (enableSampling === false) {
      return { enabled: false, targetPoints: Infinity, config: null };
    }

    if (typeof enableSampling === 'object') {
      if (!enableSampling.enabled || !enableSampling.targetPoints) {
        return { enabled: false, targetPoints: Infinity, config: null };
      }
      return {
        enabled: true,
        targetPoints: enableSampling.targetPoints,
        config: enableSampling
      };
    }

    // enableSampling === true の場合はデフォルト設定を使用
    return {
      enabled: true,
      targetPoints: DEFAULT_SAMPLING_CONFIG.targetPoints,
      config: DEFAULT_SAMPLING_CONFIG
    };
  }

  /**
   * DuckDBを使用したサンプリング
   */
  private async sampleWithDuckDB(
    metadataIds: number[],
    parameterIds: string[],
    targetPointsPerDataset: number,
    originalData: TimeSeriesData[]
  ): Promise<SampledDataResult> {
    const timer = this.logger.startTimer('DuckDB sampling');

    try {
      // DuckDBにデータをロード
      for (const metadataId of metadataIds) {
        const dataForMetadata = originalData.filter(d => d.metadataId === metadataId);
        if (dataForMetadata.length > 0) {
          this.logger.debug(`Loading data for metadataId ${metadataId}: ${dataForMetadata.length} rows`);
          
          const allRequiredParams = [...new Set(parameterIds)];
          await hybridDataService.loadTimeSeriesData(
            metadataId,
            dataForMetadata,
            allRequiredParams
          );
        }
      }

      // DuckDBでサンプリング実行
      const sampledData = await hybridDataService.sampleData(
        metadataIds,
        parameterIds,
        targetPointsPerDataset,
        { method: 'nth' }
      );

      timer();

      return {
        timeSeries: sampledData,
        samplingInfo: {
          originalCount: originalData.length,
          sampledCount: sampledData.length,
          wasSampled: true,
          method: 'duckdb'
        },
        originalCount: originalData.length
      };
    } catch (error) {
      this.logger.error('DuckDB sampling failed', error);
      throw error;
    }
  }

  /**
   * Web Workerを使用したクライアントサイドサンプリング
   */
  private async sampleWithWorker(
    dataByMetadata: Map<number, TimeSeriesData[]>,
    targetPointsPerDataset: number,
    samplingConfig: SamplingConfig,
    originalCount: number
  ): Promise<SampledDataResult> {
    const timer = this.logger.startTimer('Worker sampling');
    const workerPool = getSimpleWorkerPool();

    try {
      const results: TimeSeriesData[] = [];

      for (const [metadataId, data] of dataByMetadata) {
        if (data.length <= targetPointsPerDataset) {
          results.push(...data);
          continue;
        }

        try {
          const sampledData = await workerPool.execute({
            type: 'SAMPLE_DATA',
            data: {
              id: `sample-${metadataId}-${Date.now()}`,
              rawData: data,
              targetPoints: targetPointsPerDataset,
              samplingConfig: {
                samplingConfig: samplingConfig,
                samplingParameter: samplingConfig.method || 'lttb'
              }
            }
          });

          if (sampledData && Array.isArray(sampledData)) {
            results.push(...sampledData);
          }
        } catch (workerError) {
          this.logger.warn(`Worker sampling failed for metadataId ${metadataId}, falling back`, workerError);
          // フォールバック
          const fallbackSampled = sampleTimeSeriesDataByMetadata(
            dataByMetadata,
            samplingConfig
          );
          results.push(...fallbackSampled);
        }
      }

      timer();

      return {
        timeSeries: results,
        samplingInfo: {
          originalCount,
          sampledCount: results.length,
          wasSampled: true,
          method: 'worker'
        },
        originalCount
      };
    } catch (error) {
      this.logger.error('Worker sampling failed', error);
      // フォールバック
      const fallbackSampled = sampleTimeSeriesDataByMetadata(
        dataByMetadata,
        samplingConfig
      );
      
      return {
        timeSeries: fallbackSampled,
        samplingInfo: {
          originalCount,
          sampledCount: fallbackSampled.length,
          wasSampled: true,
          method: 'client'
        },
        originalCount
      };
    }
  }

  /**
   * クライアントサイドのサンプリング（フォールバック）
   */
  private async sampleOnClient(
    dataByMetadata: Map<number, TimeSeriesData[]>,
    targetPointsPerDataset: number,
    samplingConfig: SamplingConfig,
    originalCount: number
  ): Promise<SampledDataResult> {
    const timer = this.logger.startTimer('Client-side sampling');

    const sampledData = sampleTimeSeriesDataByMetadata(
      dataByMetadata,
      samplingConfig
    );

    timer();

    return {
      timeSeries: sampledData,
      samplingInfo: {
        originalCount,
        sampledCount: sampledData.length,
        wasSampled: true,
        method: 'client'
      },
      originalCount
    };
  }

  /**
   * データをサンプリング
   */
  async sampleData(
    originalData: TimeSeriesData[],
    dataByMetadata: Map<number, TimeSeriesData[]>,
    metadataIds: number[],
    parameterIds: string[],
    options: SamplingOptions
  ): Promise<SampledDataResult> {
    const timer = this.logger.startTimer('sampleData');

    // サンプリング設定を正規化
    const { enabled, targetPoints, config } = this.normalizeSamplingConfig(
      options.enableSampling
    );

    // サンプリング不要な場合
    if (!enabled || originalData.length <= targetPoints * metadataIds.length) {
      this.logger.debug('Sampling not needed', {
        enabled,
        originalCount: originalData.length,
        targetTotal: targetPoints * metadataIds.length
      });

      timer();

      return {
        timeSeries: originalData,
        samplingInfo: {
          originalCount: originalData.length,
          sampledCount: originalData.length,
          wasSampled: false,
          method: 'none'
        },
        originalCount: originalData.length
      };
    }

    const targetPointsPerDataset = Math.floor(targetPoints);
    
    this.logger.info('Starting data sampling', {
      originalCount: originalData.length,
      targetPointsPerDataset,
      metadataCount: metadataIds.length,
      method: config?.method || 'default'
    });

    try {
      let result: SampledDataResult;

      // DuckDBが利用可能で、useDuckDBが明示的にfalseでない場合
      if (options.useDuckDB !== false && await this.isDuckDBAvailable()) {
        try {
          result = await this.sampleWithDuckDB(
            metadataIds,
            parameterIds,
            targetPointsPerDataset,
            originalData
          );
        } catch (duckdbError) {
          this.logger.warn('DuckDB sampling failed, falling back', duckdbError);
          // フォールバック
          if (options.useWorker && config) {
            result = await this.sampleWithWorker(
              dataByMetadata,
              targetPointsPerDataset,
              config,
              originalData.length
            );
          } else if (config) {
            result = await this.sampleOnClient(
              dataByMetadata,
              targetPointsPerDataset,
              config,
              originalData.length
            );
          } else {
            // 設定なしの場合はそのまま返す
            result = {
              timeSeries: originalData,
              samplingInfo: {
                originalCount: originalData.length,
                sampledCount: originalData.length,
                wasSampled: false,
                method: 'none'
              },
              originalCount: originalData.length
            };
          }
        }
      } else if (options.useWorker && config) {
        // Web Workerを使用
        result = await this.sampleWithWorker(
          dataByMetadata,
          targetPointsPerDataset,
          config,
          originalData.length
        );
      } else if (config) {
        // クライアントサイドサンプリング
        result = await this.sampleOnClient(
          dataByMetadata,
          targetPointsPerDataset,
          config,
          originalData.length
        );
      } else {
        // サンプリングなし
        result = {
          timeSeries: originalData,
          samplingInfo: {
            originalCount: originalData.length,
            sampledCount: originalData.length,
            wasSampled: false,
            method: 'none'
          },
          originalCount: originalData.length
        };
      }

      this.logger.info('Sampling completed', {
        method: result.samplingInfo.method,
        originalCount: result.samplingInfo.originalCount,
        sampledCount: result.samplingInfo.sampledCount,
        reduction: `${((1 - result.samplingInfo.sampledCount / result.samplingInfo.originalCount) * 100).toFixed(1)}%`
      });

      timer();
      return result;

    } catch (error) {
      this.logger.error('Sampling failed', error);
      timer();
      
      // エラー時は元のデータを返す
      return {
        timeSeries: originalData,
        samplingInfo: {
          originalCount: originalData.length,
          sampledCount: originalData.length,
          wasSampled: false,
          method: 'none'
        },
        originalCount: originalData.length
      };
    }
  }

  /**
   * DuckDBが利用可能かチェック
   */
  private async isDuckDBAvailable(): Promise<boolean> {
    try {
      const connection = await hybridDataService.getConnection();
      return connection !== null;
    } catch {
      return false;
    }
  }
}

// シングルトンインスタンスをエクスポート
export const dataSamplingService = DataSamplingService.getInstance();