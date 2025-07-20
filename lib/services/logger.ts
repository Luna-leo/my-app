/**
 * Logger Service
 * 
 * 環境変数による制御可能なログシステム
 * - ログレベル管理（debug, info, warn, error）
 * - パフォーマンス測定機能
 * - 本番環境でのログ抑制
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerConfig {
  level: LogLevel;
  enablePerformanceLogging: boolean;
  enableInProduction: boolean;
}

class Logger {
  private static instance: Logger;
  private config: LoggerConfig;
  private readonly logLevels: Record<LogLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  private constructor() {
    this.config = {
      level: (process.env.NEXT_PUBLIC_LOG_LEVEL as LogLevel) || 'warn',
      enablePerformanceLogging: process.env.NEXT_PUBLIC_ENABLE_PERF_LOG === 'true',
      enableInProduction: process.env.NEXT_PUBLIC_ENABLE_PROD_LOG === 'true',
    };
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  private shouldLog(level: LogLevel): boolean {
    // 本番環境でのログ制御
    if (process.env.NODE_ENV === 'production' && !this.config.enableInProduction) {
      return level === 'error'; // 本番環境ではエラーのみ出力
    }

    return this.logLevels[level] >= this.logLevels[this.config.level];
  }

  private formatMessage(level: LogLevel, context: string, message: string, data?: unknown): string {
    const timestamp = new Date().toISOString();
    const prefix = `[${timestamp}] [${level.toUpperCase()}] [${context}]`;
    
    if (data !== undefined) {
      return `${prefix} ${message}`;
    }
    
    return `${prefix} ${message}`;
  }

  debug(context: string, message: string, data?: unknown): void {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', context, message), data);
    }
  }

  info(context: string, message: string, data?: unknown): void {
    if (this.shouldLog('info')) {
      console.info(this.formatMessage('info', context, message), data);
    }
  }

  warn(context: string, message: string, data?: unknown): void {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', context, message), data);
    }
  }

  error(context: string, message: string, error?: unknown): void {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', context, message), error);
    }
  }

  /**
   * パフォーマンス測定用のタイマー
   */
  startTimer(label: string): () => void {
    const startTime = performance.now();
    
    return () => {
      if (this.config.enablePerformanceLogging) {
        const duration = performance.now() - startTime;
        this.debug('Performance', `${label} took ${duration.toFixed(2)}ms`);
      }
    };
  }

  /**
   * 条件付きログ（大量データ処理時など）
   */
  debugSampled(context: string, message: string, data?: unknown, sampleRate = 0.1): void {
    if (Math.random() < sampleRate) {
      this.debug(context, message, data);
    }
  }

  /**
   * ログ設定の動的変更
   */
  setLogLevel(level: LogLevel): void {
    this.config.level = level;
  }

  setPerformanceLogging(enabled: boolean): void {
    this.config.enablePerformanceLogging = enabled;
  }
}

// シングルトンインスタンスをエクスポート
export const logger = Logger.getInstance();

// 便利な関数をエクスポート
export const createLogger = (context: string) => ({
  debug: (message: string, data?: unknown) => logger.debug(context, message, data),
  info: (message: string, data?: unknown) => logger.info(context, message, data),
  warn: (message: string, data?: unknown) => logger.warn(context, message, data),
  error: (message: string, error?: unknown) => logger.error(context, message, error),
  startTimer: (label: string) => logger.startTimer(`${context}: ${label}`),
  debugSampled: (message: string, data?: unknown, sampleRate?: number) => 
    logger.debugSampled(context, message, data, sampleRate),
});