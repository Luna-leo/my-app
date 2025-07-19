/**
 * DuckDB Table Schema Tracker
 * Tracks which columns (parameters) are loaded in each DuckDB table
 * to avoid redundant data reloading
 */

interface TableSchema {
  tableName: string;
  metadataId: number;
  columns: Set<string>;
  lastUpdated: Date;
  rowCount: number;
}

export class DuckDBSchemaTracker {
  private static instance: DuckDBSchemaTracker;
  private tableSchemas: Map<number, TableSchema> = new Map();

  private constructor() {}

  static getInstance(): DuckDBSchemaTracker {
    if (!DuckDBSchemaTracker.instance) {
      DuckDBSchemaTracker.instance = new DuckDBSchemaTracker();
    }
    return DuckDBSchemaTracker.instance;
  }

  /**
   * Register a table with its initial columns
   */
  registerTable(metadataId: number, columns: string[], rowCount: number = 0): void {
    const tableName = `timeseries_${metadataId}`;
    this.tableSchemas.set(metadataId, {
      tableName,
      metadataId,
      columns: new Set(columns),
      lastUpdated: new Date(),
      rowCount
    });
    
    console.log(`[SchemaTracker] Registered table ${tableName} with columns:`, columns);
  }

  /**
   * Add columns to an existing table
   */
  addColumns(metadataId: number, columns: string[]): void {
    const schema = this.tableSchemas.get(metadataId);
    if (!schema) {
      console.warn(`[SchemaTracker] Table for metadata ${metadataId} not found`);
      return;
    }

    columns.forEach(col => schema.columns.add(col));
    schema.lastUpdated = new Date();
    
    console.log(`[SchemaTracker] Added columns to ${schema.tableName}:`, columns);
  }

  /**
   * Check if a table has all required columns
   */
  hasAllColumns(metadataId: number, requiredColumns: string[]): boolean {
    const schema = this.tableSchemas.get(metadataId);
    if (!schema) {
      return false;
    }

    return requiredColumns.every(col => schema.columns.has(col));
  }

  /**
   * Get missing columns for a table
   */
  getMissingColumns(metadataId: number, requiredColumns: string[]): string[] {
    const schema = this.tableSchemas.get(metadataId);
    if (!schema) {
      return requiredColumns;
    }

    return requiredColumns.filter(col => !schema.columns.has(col));
  }

  /**
   * Check if a table exists
   */
  hasTable(metadataId: number): boolean {
    return this.tableSchemas.has(metadataId);
  }

  /**
   * Get table schema
   */
  getTableSchema(metadataId: number): TableSchema | undefined {
    return this.tableSchemas.get(metadataId);
  }

  /**
   * Update row count for a table
   */
  updateRowCount(metadataId: number, rowCount: number): void {
    const schema = this.tableSchemas.get(metadataId);
    if (schema) {
      schema.rowCount = rowCount;
      schema.lastUpdated = new Date();
    }
  }

  /**
   * Remove a table from tracking (e.g., when dropped)
   */
  removeTable(metadataId: number): void {
    this.tableSchemas.delete(metadataId);
    console.log(`[SchemaTracker] Removed table for metadata ${metadataId}`);
  }

  /**
   * Clear all tracked schemas
   */
  clear(): void {
    this.tableSchemas.clear();
    console.log(`[SchemaTracker] Cleared all tracked schemas`);
  }

  /**
   * Get statistics about tracked tables
   */
  getStats(): {
    tableCount: number;
    totalColumns: number;
    totalRows: number;
    oldestTable: Date | null;
  } {
    let totalColumns = 0;
    let totalRows = 0;
    let oldestTable: Date | null = null;

    this.tableSchemas.forEach(schema => {
      totalColumns += schema.columns.size;
      totalRows += schema.rowCount;
      
      if (!oldestTable || schema.lastUpdated < oldestTable) {
        oldestTable = schema.lastUpdated;
      }
    });

    return {
      tableCount: this.tableSchemas.size,
      totalColumns,
      totalRows,
      oldestTable
    };
  }

  /**
   * Get tables that haven't been used recently (for cleanup)
   */
  getStaleTableIds(maxAgeMinutes: number = 30): number[] {
    const now = new Date();
    const staleIds: number[] = [];

    this.tableSchemas.forEach((schema, metadataId) => {
      const ageMinutes = (now.getTime() - schema.lastUpdated.getTime()) / (1000 * 60);
      if (ageMinutes > maxAgeMinutes) {
        staleIds.push(metadataId);
      }
    });

    return staleIds;
  }
}

export const duckDBSchemaTracker = DuckDBSchemaTracker.getInstance();