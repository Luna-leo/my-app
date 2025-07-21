/**
 * Schema Manager Service
 * 
 * Manages database schema operations and tracks table schemas
 * Integrates with DuckDBSchemaTracker for schema synchronization
 */

import * as duckdb from '@duckdb/duckdb-wasm';
import { duckDBSchemaTracker } from './duckdbSchemaTracker';
import { 
  escapeColumnName, 
  buildCreateTableStatement, 
  buildDropTableStatement,
  buildTableName,
  TableColumn 
} from '@/lib/utils/sqlBuilder';

export interface SchemaManagerOptions {
  connection: duckdb.AsyncDuckDBConnection;
}

export interface TableInfo {
  tableName: string;
  columns: TableColumn[];
  rowCount?: number;
  indexes?: string[];
}

export class SchemaManager {
  private connection: duckdb.AsyncDuckDBConnection;

  constructor(options: SchemaManagerOptions) {
    this.connection = options.connection;
  }

  /**
   * Create a new table with schema tracking
   */
  async createTable(
    metadataId: number,
    columns: TableColumn[],
    tablePrefix: string = 'timeseries'
  ): Promise<string> {
    const tableName = buildTableName(metadataId, tablePrefix);
    
    try {
      // Drop existing table if it exists
      await this.dropTable(tableName);
      
      // Create the table
      const createTableSql = buildCreateTableStatement(tableName, columns);
      await this.connection.query(createTableSql);
      
      // Register with schema tracker
      const columnNames = columns.map(col => col.name);
      duckDBSchemaTracker.registerTable(metadataId, columnNames);
      
      console.log(`[SchemaManager] Created table ${tableName} with ${columns.length} columns`);
      
      return tableName;
    } catch (error) {
      console.error(`[SchemaManager] Error creating table ${tableName}:`, error);
      
      // Try alternative approach: check if table exists and handle accordingly
      try {
        const tableExists = await this.tableExists(tableName);
        if (tableExists) {
          console.log(`[SchemaManager] Table ${tableName} already exists, returning existing table`);
          
          // Update schema tracker with existing table
          const columnNames = columns.map(col => col.name);
          duckDBSchemaTracker.registerTable(metadataId, columnNames);
          
          return tableName;
        }
      } catch (checkError) {
        console.error(`[SchemaManager] Error checking table existence:`, checkError);
      }
      
      throw error;
    }
  }

  /**
   * Drop a table
   */
  async dropTable(tableName: string): Promise<void> {
    const dropSql = buildDropTableStatement(tableName, true); // Always use IF EXISTS
    await this.connection.query(dropSql);
    
    // Remove from schema tracker
    const metadataId = this.extractMetadataIdFromTableName(tableName);
    if (metadataId) {
      duckDBSchemaTracker.removeTable(metadataId);
    }
  }

  /**
   * Add columns to an existing table
   */
  async addColumns(
    metadataId: number,
    newColumns: TableColumn[]
  ): Promise<void> {
    const schema = duckDBSchemaTracker.getTableSchema(metadataId);
    if (!schema) {
      throw new Error(`Table for metadata ${metadataId} not found`);
    }

    // Add each column
    for (const column of newColumns) {
      const escapedName = escapeColumnName(column.name);
      const alterSql = `ALTER TABLE ${schema.tableName} ADD COLUMN ${escapedName} ${column.type}`;
      
      try {
        await this.connection.query(alterSql);
        console.log(`[SchemaManager] Added column ${column.name} to ${schema.tableName}`);
      } catch (error) {
        // Column might already exist
        console.warn(`[SchemaManager] Failed to add column ${column.name}:`, error);
      }
    }

    // Update schema tracker
    const columnNames = newColumns.map(col => col.name);
    duckDBSchemaTracker.addColumns(metadataId, columnNames);
  }

  /**
   * Check if table needs schema update
   */
  async checkSchemaUpdate(
    metadataId: number,
    requiredColumns: string[]
  ): Promise<{
    needsUpdate: boolean;
    missingColumns: string[];
  }> {
    const hasTable = duckDBSchemaTracker.hasTable(metadataId);
    
    if (!hasTable) {
      return {
        needsUpdate: true,
        missingColumns: requiredColumns
      };
    }

    const missingColumns = duckDBSchemaTracker.getMissingColumns(metadataId, requiredColumns);
    
    return {
      needsUpdate: missingColumns.length > 0,
      missingColumns
    };
  }

  /**
   * Get table information
   */
  async getTableInfo(tableName: string): Promise<TableInfo | null> {
    try {
      // Query table schema
      const result = await this.connection.query(`
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position
      `);

      const rows = result.toArray();
      if (rows.length === 0) {
        return null;
      }

      const columns: TableColumn[] = rows.map(row => ({
        name: row.column_name as string,
        type: row.data_type as string,
        nullable: row.is_nullable === 'YES'
      }));

      // Get row count
      const countResult = await this.connection.query(`
        SELECT COUNT(*) as count FROM ${tableName}
      `);
      const rowCount = countResult.toArray()[0]?.count as number || 0;

      return {
        tableName,
        columns,
        rowCount
      };
    } catch (error) {
      console.error(`[SchemaManager] Failed to get table info for ${tableName}:`, error);
      return null;
    }
  }

  /**
   * List all tables matching a pattern
   */
  async listTables(pattern?: string): Promise<string[]> {
    let query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'main'
    `;

    if (pattern) {
      query += ` AND table_name LIKE '${pattern}'`;
    }

    try {
      const result = await this.connection.query(query);
      return result.toArray().map(row => row.table_name as string);
    } catch (error) {
      console.error('[SchemaManager] Failed to list tables:', error);
      return [];
    }
  }

  /**
   * Check if a table exists
   */
  async tableExists(tableName: string): Promise<boolean> {
    try {
      const result = await this.connection.query(`
        SELECT COUNT(*) as count 
        FROM information_schema.tables 
        WHERE table_schema = 'main' AND table_name = '${tableName}'
      `);
      
      const rows = result.toArray();
      return rows[0]?.count > 0;
    } catch (error) {
      console.error(`[SchemaManager] Error checking table existence:`, error);
      return false;
    }
  }

  /**
   * Sync schema tracker with actual database tables
   */
  async syncSchemaTracker(): Promise<void> {
    const tables = await this.listTables('timeseries_%');
    
    for (const tableName of tables) {
      const metadataId = this.extractMetadataIdFromTableName(tableName);
      if (!metadataId) continue;

      const tableInfo = await this.getTableInfo(tableName);
      if (!tableInfo) continue;

      const columnNames = tableInfo.columns
        .filter(col => !['metadata_id', 'timestamp'].includes(col.name))
        .map(col => col.name);

      duckDBSchemaTracker.registerTable(
        metadataId, 
        columnNames, 
        tableInfo.rowCount || 0
      );
    }

    console.log(`[SchemaManager] Synced ${tables.length} tables with schema tracker`);
  }

  /**
   * Extract metadata ID from table name
   */
  private extractMetadataIdFromTableName(tableName: string): number | null {
    const match = tableName.match(/_(\d+)$/);
    return match ? parseInt(match[1]) : null;
  }

  /**
   * Create indexes for a table
   */
  async createIndexes(
    tableName: string,
    indexes: Array<{ name: string; columns: string[] }>
  ): Promise<void> {
    for (const index of indexes) {
      const columnList = index.columns.map(col => escapeColumnName(col)).join(', ');
      const createIndexSql = `CREATE INDEX IF NOT EXISTS ${index.name} ON ${tableName}(${columnList})`;
      
      try {
        await this.connection.query(createIndexSql);
        console.log(`[SchemaManager] Created index ${index.name} on ${tableName}`);
      } catch (error) {
        console.warn(`[SchemaManager] Failed to create index ${index.name}:`, error);
      }
    }
  }
}

// Create singleton instance
let schemaManagerInstance: SchemaManager | null = null;

export function getSchemaManager(connection: duckdb.AsyncDuckDBConnection): SchemaManager {
  if (!schemaManagerInstance) {
    schemaManagerInstance = new SchemaManager({ connection });
  }
  return schemaManagerInstance;
}