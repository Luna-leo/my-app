import * as duckdb from '@duckdb/duckdb-wasm';
import { createLogger } from '../logger';

/**
 * Service for executing queries on DuckDB
 */
export class QueryExecutor {
  private logger = createLogger('QueryExecutor');

  constructor(private connection: duckdb.AsyncDuckDBConnection) {}

  /**
   * Execute a SQL query and return results
   */
  async query(sql: string): Promise<Record<string, unknown>[]> {
    try {
      this.logger.debug('Executing query:', sql.substring(0, 200) + '...');
      const result = await this.connection.query(sql);
      const data = result.toArray();
      this.logger.debug(`Query returned ${data.length} rows`);
      return data;
    } catch (error) {
      this.logger.error('Query failed:', error);
      throw error;
    }
  }

  /**
   * Execute a query with parameterized values
   */
  async queryWithParams(
    sql: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    params: Record<string, any>
  ): Promise<Record<string, unknown>[]> {
    try {
      // Replace parameter placeholders in SQL
      let parameterizedSql = sql;
      Object.entries(params).forEach(([key, value]) => {
        const placeholder = `$${key}`;
        if (typeof value === 'string') {
          parameterizedSql = parameterizedSql.replace(
            new RegExp(`\\${placeholder}`, 'g'),
            `'${value}'`
          );
        } else if (value instanceof Date) {
          parameterizedSql = parameterizedSql.replace(
            new RegExp(`\\${placeholder}`, 'g'),
            `TIMESTAMP '${value.toISOString()}'`
          );
        } else if (value === null || value === undefined) {
          parameterizedSql = parameterizedSql.replace(
            new RegExp(`\\${placeholder}`, 'g'),
            'NULL'
          );
        } else {
          parameterizedSql = parameterizedSql.replace(
            new RegExp(`\\${placeholder}`, 'g'),
            String(value)
          );
        }
      });

      return await this.query(parameterizedSql);
    } catch (error) {
      this.logger.error('Parameterized query failed:', error);
      throw error;
    }
  }

  /**
   * Execute a query and return a single scalar value
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async scalar<T = any>(sql: string): Promise<T | null> {
    try {
      const result = await this.query(sql);
      if (result.length === 0) {
        return null;
      }
      const firstRow = result[0];
      const firstColumn = Object.keys(firstRow)[0];
      return firstRow[firstColumn] as T;
    } catch (error) {
      this.logger.error('Scalar query failed:', error);
      throw error;
    }
  }

  /**
   * Execute multiple queries in a transaction
   */
  async transaction(queries: string[]): Promise<void> {
    try {
      await this.query('BEGIN TRANSACTION');
      
      for (const query of queries) {
        await this.query(query);
      }
      
      await this.query('COMMIT');
    } catch (error) {
      try {
        await this.query('ROLLBACK');
      } catch (rollbackError) {
        this.logger.error('Rollback failed:', rollbackError);
      }
      this.logger.error('Transaction failed:', error);
      throw error;
    }
  }

  /**
   * Check if a table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    try {
      const sql = `
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = '${tableName}'
      `;
      const count = await this.scalar<number>(sql);
      return count !== null && count > 0;
    } catch (error) {
      this.logger.error(`Failed to check table existence for ${tableName}:`, error);
      return false;
    }
  }

  /**
   * Get table schema information
   */
  async getTableSchema(tableName: string): Promise<Array<{
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>> {
    try {
      const sql = `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `;
      const result = await this.query(sql);
      return result as Array<{
        column_name: string;
        data_type: string;
        is_nullable: string;
      }>;
    } catch (error) {
      this.logger.error(`Failed to get schema for table ${tableName}:`, error);
      throw error;
    }
  }

  /**
   * Get row count for a table
   */
  async getRowCount(tableName: string): Promise<number> {
    try {
      const sql = `SELECT COUNT(*) as count FROM ${tableName}`;
      const count = await this.scalar<number>(sql);
      return count || 0;
    } catch (error) {
      this.logger.error(`Failed to get row count for ${tableName}:`, error);
      return 0;
    }
  }

  /**
   * Execute a query and stream results (for large datasets)
   */
  async *streamQuery(
    sql: string,
    batchSize: number = 1000
  ): AsyncGenerator<Record<string, unknown>[], void, unknown> {
    try {
      // Create a cursor-like query using LIMIT and OFFSET
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        const batchSql = `${sql} LIMIT ${batchSize} OFFSET ${offset}`;
        const batch = await this.query(batchSql);
        
        if (batch.length === 0) {
          hasMore = false;
        } else {
          yield batch;
          offset += batchSize;
          
          // If we got fewer rows than batchSize, we're done
          if (batch.length < batchSize) {
            hasMore = false;
          }
        }
      }
    } catch (error) {
      this.logger.error('Stream query failed:', error);
      throw error;
    }
  }

  /**
   * Explain query execution plan
   */
  async explain(sql: string): Promise<string> {
    try {
      const explainSql = `EXPLAIN ${sql}`;
      const result = await this.query(explainSql);
      return result.map(row => Object.values(row).join(' ')).join('\n');
    } catch (error) {
      this.logger.error('Explain query failed:', error);
      throw error;
    }
  }

  /**
   * Create an index on a table
   */
  async createIndex(
    indexName: string,
    tableName: string,
    columns: string[]
  ): Promise<void> {
    try {
      const columnList = columns.map(col => `"${col}"`).join(', ');
      const sql = `CREATE INDEX IF NOT EXISTS ${indexName} ON ${tableName} (${columnList})`;
      await this.query(sql);
      this.logger.info(`Created index ${indexName} on ${tableName}`);
    } catch (error) {
      this.logger.error(`Failed to create index ${indexName}:`, error);
      throw error;
    }
  }

  /**
   * Drop an index
   */
  async dropIndex(indexName: string): Promise<void> {
    try {
      const sql = `DROP INDEX IF EXISTS ${indexName}`;
      await this.query(sql);
      this.logger.info(`Dropped index ${indexName}`);
    } catch (error) {
      this.logger.error(`Failed to drop index ${indexName}:`, error);
      throw error;
    }
  }
}