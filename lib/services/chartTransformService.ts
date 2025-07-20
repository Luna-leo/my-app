/**
 * ChartTransformService
 * 
 * チャートデータの変換処理を担当
 * 責任:
 * - 時系列データからチャート描画用データへの変換
 * - XYチャート用データへの変換
 * - ビューポート計算
 * - データ範囲の計算
 */

import { TimeSeriesData, ParameterInfo } from '@/lib/db/schema';
import { ChartPlotData, ChartViewport } from '@/lib/types/chart';
import {
  transformDataForChart,
  transformDataForXYChart,
  calculateDataRange
} from '@/lib/utils/chartDataUtils';
import { createLogger } from './logger';

export interface TransformOptions {
  xAxisParameter: string;
  yAxisParameters: string[];
  chartType: 'line' | 'scatter';
}

export interface TransformResult {
  plotData: ChartPlotData;
  viewport: ChartViewport;
}

export class ChartTransformService {
  private static instance: ChartTransformService;
  private logger = createLogger('ChartTransformService');

  private constructor() {}

  static getInstance(): ChartTransformService {
    if (!ChartTransformService.instance) {
      ChartTransformService.instance = new ChartTransformService();
    }
    return ChartTransformService.instance;
  }

  /**
   * 時系列データをチャート用データに変換
   */
  async transformData(
    timeSeries: TimeSeriesData[],
    options: TransformOptions,
    parameterInfoMap: Map<string, ParameterInfo>,
    metadataMap: Map<number, {
      label: string;
      plant: string;
      machineNo: string;
      startTime?: Date;
      endTime?: Date;
    }>,
    samplingInfo?: {
      originalCount: number;
      sampledCount: number;
      wasSampled: boolean;
      method?: string;
    }
  ): Promise<TransformResult> {
    const timer = this.logger.startTimer('transformData');

    try {
      let plotData: ChartPlotData;

      if (options.xAxisParameter === 'timestamp') {
        // 時系列チャート
        this.logger.debug('Transforming data for time-series chart', {
          dataPoints: timeSeries.length,
          yAxisParameters: options.yAxisParameters
        });

        const timeChartData = await transformDataForChart(
          timeSeries,
          options.yAxisParameters,
          parameterInfoMap,
          metadataMap
        );

        // Y軸の統合範囲を計算
        let combinedYMin = Number.POSITIVE_INFINITY;
        let combinedYMax = Number.NEGATIVE_INFINITY;

        timeChartData.series.forEach(s => {
          const yRange = calculateDataRange(s.values);
          combinedYMin = Math.min(combinedYMin, yRange.min);
          combinedYMax = Math.max(combinedYMax, yRange.max);
        });

        const combinedYRange = { min: combinedYMin, max: combinedYMax };

        // X軸（時間軸）の全体範囲を計算
        let overallXMin = Number.POSITIVE_INFINITY;
        let overallXMax = Number.NEGATIVE_INFINITY;
        
        timeChartData.series.forEach(s => {
          if (s.timestamps.length > 0) {
            overallXMin = Math.min(overallXMin, s.timestamps[0]);
            overallXMax = Math.max(overallXMax, s.timestamps[s.timestamps.length - 1]);
          }
        });
        
        const overallXRange = overallXMin < overallXMax 
          ? { min: overallXMin, max: overallXMax }
          : { min: 0, max: 1 };

        plotData = {
          xParameterInfo: null,
          series: timeChartData.series.map(s => ({
            metadataId: s.metadataId,
            metadataLabel: s.metadataLabel,
            parameterId: s.parameterId,
            parameterInfo: s.parameterInfo,
            xValues: s.timestamps,
            yValues: s.values.map(v => v ?? NaN),
            xRange: overallXRange,
            yRange: combinedYRange,
          })),
          samplingInfo,
        };

        this.logger.debug('Time-series transformation complete', {
          seriesCount: plotData.series.length,
          xRange: overallXRange,
          yRange: combinedYRange
        });

      } else {
        // XYチャート
        this.logger.debug('Transforming data for XY chart', {
          dataPoints: timeSeries.length,
          xAxisParameter: options.xAxisParameter,
          yAxisParameters: options.yAxisParameters
        });

        const xyData = await transformDataForXYChart(
          timeSeries,
          options.xAxisParameter,
          options.yAxisParameters,
          parameterInfoMap,
          metadataMap
        );

        // Y軸の統合範囲を計算
        let combinedYMin = Number.POSITIVE_INFINITY;
        let combinedYMax = Number.NEGATIVE_INFINITY;

        xyData.series.forEach(s => {
          const yRange = calculateDataRange(s.yValues);
          combinedYMin = Math.min(combinedYMin, yRange.min);
          combinedYMax = Math.max(combinedYMax, yRange.max);
        });

        const combinedYRange = { min: combinedYMin, max: combinedYMax };

        plotData = {
          xParameterInfo: xyData.xParameterInfo,
          series: xyData.series.map(s => {
            const xRange = calculateDataRange(s.xValues);
            return {
              metadataId: s.metadataId,
              metadataLabel: s.metadataLabel,
              parameterId: s.parameterId,
              parameterInfo: s.parameterInfo,
              xValues: s.xValues,
              yValues: s.yValues.map(v => v ?? NaN),
              xRange,
              yRange: combinedYRange,
            };
          }),
          samplingInfo,
        };

        this.logger.debug('XY transformation complete', {
          seriesCount: plotData.series.length,
          xParameterInfo: plotData.xParameterInfo?.parameterId
        });
      }

      // ビューポートを計算
      const viewport = this.calculateViewport(plotData);

      timer();

      return { plotData, viewport };

    } catch (error) {
      this.logger.error('Data transformation failed', error);
      timer();
      throw error;
    }
  }

  /**
   * チャートデータからビューポートを計算
   */
  private calculateViewport(plotData: ChartPlotData): ChartViewport {
    if (plotData.series.length === 0) {
      return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    }

    const validSeries = plotData.series.filter(s => s.xRange && s.yRange);
    if (validSeries.length === 0) {
      return { xMin: 0, xMax: 1, yMin: 0, yMax: 1 };
    }

    const xMin = Math.min(...validSeries.map(s => s.xRange!.min));
    const xMax = Math.max(...validSeries.map(s => s.xRange!.max));
    const yMin = Math.min(...validSeries.map(s => s.yRange!.min));
    const yMax = Math.max(...validSeries.map(s => s.yRange!.max));

    // 範囲が0の場合の処理
    const xRange = xMax - xMin;
    const yRange = yMax - yMin;

    if (xRange === 0 && yRange === 0) {
      return { 
        xMin: xMin - 1, 
        xMax: xMax + 1, 
        yMin: yMin - 1, 
        yMax: yMax + 1 
      };
    } else if (xRange === 0) {
      return { 
        xMin: xMin - 1, 
        xMax: xMax + 1, 
        yMin, 
        yMax 
      };
    } else if (yRange === 0) {
      return { 
        xMin, 
        xMax, 
        yMin: yMin - 1, 
        yMax: yMax + 1 
      };
    }

    return { xMin, xMax, yMin, yMax };
  }

  /**
   * 時系列データから必要なパラメータのみを抽出
   */
  filterDataByParameters(
    timeSeries: TimeSeriesData[],
    requiredParameters: string[]
  ): TimeSeriesData[] {
    if (!requiredParameters || requiredParameters.length === 0) {
      return timeSeries;
    }

    return timeSeries.map(point => ({
      ...point,
      data: Object.fromEntries(
        requiredParameters
          .filter(param => param in point.data)
          .map(param => [param, point.data[param]])
      )
    }));
  }

  /**
   * データが有効かチェック
   */
  validateData(timeSeries: TimeSeriesData[], options: TransformOptions): boolean {
    if (!timeSeries || timeSeries.length === 0) {
      this.logger.warn('No time series data provided');
      return false;
    }

    // X軸パラメータのチェック（timestamp以外の場合）
    if (options.xAxisParameter !== 'timestamp') {
      const hasXParameter = timeSeries.some(point => 
        options.xAxisParameter in point.data
      );
      if (!hasXParameter) {
        this.logger.warn(`X-axis parameter "${options.xAxisParameter}" not found in data`);
        return false;
      }
    }

    // Y軸パラメータのチェック
    for (const yParam of options.yAxisParameters) {
      const hasYParameter = timeSeries.some(point => 
        yParam in point.data
      );
      if (!hasYParameter) {
        this.logger.warn(`Y-axis parameter "${yParam}" not found in data`);
        return false;
      }
    }

    return true;
  }
}

// シングルトンインスタンスをエクスポート
export const chartTransformService = ChartTransformService.getInstance();