/**
 * DuckDB Parquet Service
 * 
 * Provides direct Parquet file reading capabilities using DuckDB
 * Supports both local and remote Parquet files with efficient columnar access
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { TimeSeriesData } from '@/lib/db/schema';

export interface ParquetReadOptions {
  columns?: string[];  // Specific columns to read (column pruning)
  filters?: ParquetFilter[];  // Push-down filters
  limit?: number;  // Row limit
  offset?: number;  // Row offset for pagination
}

export interface ParquetFilter {
  column: string;
  operator: '=' | '!=' | '>' | '<' | '>=' | '<=' | 'IN' | 'BETWEEN';
  value: string | number | Date | boolean | null;
  value2?: string | number | Date | boolean | null;  // For BETWEEN operator
}

export interface ParquetFileInfo {
  rowCount: number;
  columns: string[];
  sizeBytes: number;
  rowGroups: number;
  compression: string;
}

export class DuckDBParquetService {
  private static instance: DuckDBParquetService;
  private connection: duckdb.AsyncDuckDBConnection | null = null;

  private constructor() {}

  static getInstance(): DuckDBParquetService {
    if (!DuckDBParquetService.instance) {
      DuckDBParquetService.instance = new DuckDBParquetService();
    }
    return DuckDBParquetService.instance;
  }

  /**
   * Set the DuckDB connection
   */
  setConnection(connection: duckdb.AsyncDuckDBConnection): void {
    this.connection = connection;
  }

  /**
   * Get information about a Parquet file
   */
  async getParquetInfo(filePath: string): Promise<ParquetFileInfo> {
    if (!this.connection) {
      throw new Error('DuckDB connection not initialized');
    }

    try {
      // Use DuckDB's parquet_metadata function
      const metadataQuery = `
        SELECT 
          COUNT(*) as row_count,
          LIST(column_name ORDER BY column_id) as columns,
          SUM(uncompressed_size) as size_bytes,
          COUNT(DISTINCT row_group_id) as row_groups,
          MIN(compression) as compression
        FROM parquet_metadata('${filePath}')
      `;
      
      const result = await this.connection.query(metadataQuery);
      const metadata = result.toArray()[0];

      return {
        rowCount: metadata.row_count,
        columns: metadata.columns,
        sizeBytes: metadata.size_bytes,
        rowGroups: metadata.row_groups,
        compression: metadata.compression || 'none'
      };
    } catch (error) {
      console.error('[DuckDBParquetService] Failed to get parquet info:', error);
      throw error;
    }
  }

  /**
   * Read time series data directly from a Parquet file
   */
  async readTimeSeriesFromParquet(
    filePath: string,
    metadataId: number,
    options?: ParquetReadOptions
  ): Promise<TimeSeriesData[]> {
    if (!this.connection) {
      throw new Error('DuckDB connection not initialized');
    }

    const startTime = performance.now();

    try {
      // Build column selection
      let columnList = '*';
      if (options?.columns && options.columns.length > 0) {
        // Always include timestamp
        const columnsWithTimestamp = ['timestamp', ...options.columns.filter(c => c !== 'timestamp')];
        columnList = columnsWithTimestamp.map(col => `"${col}"`).join(', ');
      }

      // Build WHERE clause from filters
      const whereConditions: string[] = [];
      if (options?.filters) {
        for (const filter of options.filters) {
          switch (filter.operator) {
            case '=':
              whereConditions.push(`"${filter.column}" = ${this.formatValue(filter.value)}`);
              break;
            case '!=':
              whereConditions.push(`"${filter.column}" != ${this.formatValue(filter.value)}`);
              break;
            case '>':
              whereConditions.push(`"${filter.column}" > ${this.formatValue(filter.value)}`);
              break;
            case '<':
              whereConditions.push(`"${filter.column}" < ${this.formatValue(filter.value)}`);
              break;
            case '>=':
              whereConditions.push(`"${filter.column}" >= ${this.formatValue(filter.value)}`);
              break;
            case '<=':
              whereConditions.push(`"${filter.column}" <= ${this.formatValue(filter.value)}`);
              break;
            case 'IN':
              const inValues = Array.isArray(filter.value) 
                ? filter.value.map(v => this.formatValue(v)).join(', ')
                : this.formatValue(filter.value);
              whereConditions.push(`"${filter.column}" IN (${inValues})`);
              break;
            case 'BETWEEN':
              whereConditions.push(
                `"${filter.column}" BETWEEN ${this.formatValue(filter.value)} AND ${this.formatValue(filter.value2)}`
              );
              break;
          }
        }
      }

      const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';
      
      // Build LIMIT/OFFSET clause
      const limitClause = options?.limit ? `LIMIT ${options.limit}` : '';
      const offsetClause = options?.offset ? `OFFSET ${options.offset}` : '';

      // Construct and execute query
      const query = `
        SELECT ${columnList}
        FROM read_parquet('${filePath}')
        ${whereClause}
        ORDER BY timestamp
        ${limitClause}
        ${offsetClause}
      `;

      console.log(`[DuckDBParquetService] Executing query:`, query);
      const result = await this.connection.query(query);
      
      // Convert to TimeSeriesData format
      const data: TimeSeriesData[] = [];
      const resultArray = result.toArray();
      
      for (const row of resultArray) {
        const timestamp = new Date(row.timestamp);
        const dataPoint: TimeSeriesData = {
          metadataId,
          timestamp,
          data: {}
        };

        // Extract parameter values
        for (const key in row) {
          if (key !== 'timestamp') {
            dataPoint.data[key] = row[key] as number | null;
          }
        }

        data.push(dataPoint);
      }

      const duration = performance.now() - startTime;
      console.log(`[DuckDBParquetService] Read ${data.length} rows from parquet in ${duration.toFixed(2)}ms`);

      return data;

    } catch (error) {
      console.error('[DuckDBParquetService] Failed to read parquet file:', error);
      throw error;
    }
  }

  /**
   * Query multiple Parquet files with UNION
   */
  async queryMultipleParquets(
    filePaths: string[],
    query: string
  ): Promise<Record<string, unknown>[]> {
    if (!this.connection) {
      throw new Error('DuckDB connection not initialized');
    }

    try {
      // Create a view that unions all parquet files
      const viewName = `parquet_union_${Date.now()}`;
      const unionParts = filePaths.map(path => `SELECT * FROM read_parquet('${path}')`);
      const createViewSQL = `
        CREATE TEMPORARY VIEW ${viewName} AS
        ${unionParts.join(' UNION ALL ')}
      `;

      await this.connection.query(createViewSQL);

      // Execute the actual query on the view
      const result = await this.connection.query(query.replace(/FROM\s+\$table/gi, `FROM ${viewName}`));
      
      // Clean up the temporary view
      await this.connection.query(`DROP VIEW ${viewName}`);

      return result.toArray();

    } catch (error) {
      console.error('[DuckDBParquetService] Failed to query multiple parquet files:', error);
      throw error;
    }
  }

  /**
   * Export query results to Parquet
   */
  async exportToParquet(
    query: string,
    outputPath: string,
    options?: {
      compression?: 'snappy' | 'gzip' | 'zstd' | 'lz4' | 'brotli' | 'none';
      rowGroupSize?: number;
    }
  ): Promise<void> {
    if (!this.connection) {
      throw new Error('DuckDB connection not initialized');
    }

    try {
      const compression = options?.compression || 'snappy';
      const rowGroupSize = options?.rowGroupSize || 100000;

      const exportQuery = `
        COPY (${query})
        TO '${outputPath}'
        (FORMAT PARQUET, COMPRESSION '${compression}', ROW_GROUP_SIZE ${rowGroupSize})
      `;

      await this.connection.query(exportQuery);
      console.log(`[DuckDBParquetService] Exported to parquet: ${outputPath}`);

    } catch (error) {
      console.error('[DuckDBParquetService] Failed to export to parquet:', error);
      throw error;
    }
  }

  /**
   * Format value for SQL query
   */
  private formatValue(value: string | number | Date | boolean | null | undefined): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    if (typeof value === 'string') {
      return `'${value.replace(/'/g, "''")}'`;
    }
    if (value instanceof Date) {
      return `TIMESTAMP '${value.toISOString()}'`;
    }
    return String(value);
  }

  /**
   * Sample data from Parquet file using DuckDB's efficient sampling
   */
  async sampleParquetData(
    filePath: string,
    targetRows: number,
    options?: {
      method?: 'reservoir' | 'bernoulli' | 'system';
      columns?: string[];
    }
  ): Promise<Record<string, unknown>[]> {
    if (!this.connection) {
      throw new Error('DuckDB connection not initialized');
    }

    try {
      const method = options?.method || 'reservoir';
      const columnList = options?.columns 
        ? options.columns.map(col => `"${col}"`).join(', ')
        : '*';

      let query: string;

      switch (method) {
        case 'bernoulli':
          // Bernoulli sampling - each row has equal probability
          const percentage = Math.min(100, (targetRows / await this.getRowCount(filePath)) * 100 * 1.2);
          query = `
            SELECT ${columnList}
            FROM read_parquet('${filePath}')
            USING SAMPLE ${percentage} PERCENT (BERNOULLI)
            LIMIT ${targetRows}
          `;
          break;

        case 'system':
          // System sampling - samples blocks of rows
          const sysPercentage = Math.min(100, (targetRows / await this.getRowCount(filePath)) * 100 * 1.2);
          query = `
            SELECT ${columnList}
            FROM read_parquet('${filePath}')
            USING SAMPLE ${sysPercentage} PERCENT (SYSTEM)
            LIMIT ${targetRows}
          `;
          break;

        case 'reservoir':
        default:
          // Reservoir sampling - exact number of rows
          query = `
            SELECT ${columnList}
            FROM read_parquet('${filePath}')
            USING SAMPLE ${targetRows} ROWS
          `;
          break;
      }

      const result = await this.connection.query(query);
      return result.toArray();

    } catch (error) {
      console.error('[DuckDBParquetService] Failed to sample parquet data:', error);
      throw error;
    }
  }

  /**
   * Get row count from Parquet file
   */
  private async getRowCount(filePath: string): Promise<number> {
    const result = await this.connection!.query(
      `SELECT COUNT(*) as count FROM read_parquet('${filePath}')`
    );
    return result.toArray()[0].count;
  }
}

// Export singleton instance
export const duckDBParquetService = DuckDBParquetService.getInstance();