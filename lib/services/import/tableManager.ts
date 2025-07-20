/**
 * Table Manager Service
 * 
 * Manages DuckDB table creation and schema operations for CSV import
 * Extracted from duckdbCsvImporter.ts
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { SchemaManager } from '@/lib/services/schemaManager';
import { 
  buildTableName, 
  TableColumn,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  escapeColumnName,
  getSqlDataType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  buildCreateIndexStatement
} from '@/lib/utils/sqlBuilder';

export interface TableManagerOptions {
  connection: duckdb.AsyncDuckDBConnection;
  schemaManager?: SchemaManager;
}

export interface CreateTableResult {
  tableName: string;
  actualColumnNames: string[];
  columns: TableColumn[];
}

export class TableManager {
  private connection: duckdb.AsyncDuckDBConnection;
  private schemaManager: SchemaManager;

  constructor(options: TableManagerOptions) {
    this.connection = options.connection;
    this.schemaManager = options.schemaManager || new SchemaManager({ connection: options.connection });
  }

  /**
   * Create table for CSV data
   */
  async createTableForCsvData(
    metadataId: number,
    uniqueHeaders: string[],
    options?: {
      tablePrefix?: string;
      createIndexes?: boolean;
    }
  ): Promise<CreateTableResult> {
    const tablePrefix = options?.tablePrefix || 'timeseries';
    const tableName = buildTableName(metadataId, tablePrefix);

    // Build column definitions
    const columns: TableColumn[] = [
      { name: 'metadata_id', type: 'INTEGER', nullable: false },
      { name: 'timestamp', type: 'TIMESTAMP', nullable: false }
    ];

    // Create actual column names with escaping
    const actualColumnNames: string[] = [];
    
    for (const header of uniqueHeaders) {
      // Create safe column name
      const safeName = header.replace(/[^a-zA-Z0-9_]/g, '_');
      actualColumnNames.push(safeName);
      
      columns.push({
        name: safeName,
        type: getSqlDataType(header),
        nullable: true
      });
    }

    // Create the table
    await this.schemaManager.createTable(metadataId, columns, tablePrefix);

    // Create indexes if requested
    if (options?.createIndexes) {
      await this.createDefaultIndexes(tableName);
    }

    return {
      tableName,
      actualColumnNames,
      columns
    };
  }

  /**
   * Create default indexes for time series table
   */
  async createDefaultIndexes(tableName: string): Promise<void> {
    const indexes = [
      {
        name: `idx_${tableName}_timestamp`,
        columns: ['timestamp']
      },
      {
        name: `idx_${tableName}_metadata_timestamp`,
        columns: ['metadata_id', 'timestamp']
      }
    ];

    await this.schemaManager.createIndexes(tableName, indexes);
  }

  /**
   * Check if table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.connection.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_name = '${tableName}'
      `);
      
      const rows = result.toArray();
      return rows[0]?.count > 0;
    } catch (error) {
      console.error(`[TableManager] Error checking table existence:`, error);
      return false;
    }
  }

  /**
   * Drop table if exists
   */
  async dropTableIfExists(tableName: string): Promise<void> {
    try {
      await this.connection.query(`DROP TABLE IF EXISTS ${tableName}`);
      console.log(`[TableManager] Dropped table ${tableName}`);
    } catch (error) {
      console.error(`[TableManager] Error dropping table:`, error);
    }
  }

  /**
   * Get row count for table
   */
  async getRowCount(tableName: string): Promise<number> {
    try {
      const result = await this.connection.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `);
      
      const rows = result.toArray();
      return rows[0]?.count || 0;
    } catch (error) {
      console.error(`[TableManager] Error getting row count:`, error);
      return 0;
    }
  }

  /**
   * Verify table schema matches expected columns
   */
  async verifyTableSchema(
    tableName: string,
    expectedColumns: string[]
  ): Promise<{
    valid: boolean;
    missingColumns: string[];
    extraColumns: string[];
  }> {
    const tableInfo = await this.schemaManager.getTableInfo(tableName);
    
    if (!tableInfo) {
      return {
        valid: false,
        missingColumns: expectedColumns,
        extraColumns: []
      };
    }

    const actualColumns = tableInfo.columns
      .map(col => col.name)
      .filter(name => !['metadata_id', 'timestamp'].includes(name));

    const expectedSet = new Set(expectedColumns);
    const actualSet = new Set(actualColumns);

    const missingColumns = expectedColumns.filter(col => !actualSet.has(col));
    const extraColumns = actualColumns.filter(col => !expectedSet.has(col));

    return {
      valid: missingColumns.length === 0 && extraColumns.length === 0,
      missingColumns,
      extraColumns
    };
  }

  /**
   * Add missing columns to existing table
   */
  async addMissingColumns(
    metadataId: number,
    missingHeaders: string[]
  ): Promise<void> {
    const newColumns: TableColumn[] = missingHeaders.map(header => ({
      name: header.replace(/[^a-zA-Z0-9_]/g, '_'),
      type: getSqlDataType(header),
      nullable: true
    }));

    await this.schemaManager.addColumns(metadataId, newColumns);
  }

  /**
   * Optimize table after import
   */
  async optimizeTable(tableName: string): Promise<void> {
    try {
      // Analyze table statistics
      await this.connection.query(`ANALYZE ${tableName}`);
      console.log(`[TableManager] Optimized table ${tableName}`);
    } catch (error) {
      console.error(`[TableManager] Error optimizing table:`, error);
    }
  }
}