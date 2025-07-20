/**
 * SQL Builder Utility
 * 
 * Common utility functions for building SQL statements
 * Extracted from duckdbCsvImporter.ts for reusability
 */

/**
 * Escape column name for SQL
 */
export function escapeColumnName(name: string): string {
  // Replace special characters with underscores and escape quotes
  const escaped = name
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/"/g, '""');
  return `"${escaped}"`;
}

/**
 * Get SQL data type based on column name
 */
export function getSqlDataType(columnName: string): string {
  const lowerName = columnName.toLowerCase();
  
  if (lowerName.includes('timestamp') || lowerName.includes('time')) {
    return 'TIMESTAMP';
  }
  
  if (lowerName.includes('id') || lowerName.includes('count')) {
    return 'INTEGER';
  }
  
  // Default to DOUBLE for numeric values
  return 'DOUBLE';
}

/**
 * Build CREATE TABLE statement
 */
export interface TableColumn {
  name: string;
  type: string;
  nullable?: boolean;
}

export function buildCreateTableStatement(
  tableName: string,
  columns: TableColumn[]
): string {
  const columnDefs = columns.map(col => {
    const escapedName = escapeColumnName(col.name);
    const nullClause = col.nullable === false ? ' NOT NULL' : '';
    return `${escapedName} ${col.type}${nullClause}`;
  }).join(', ');

  return `CREATE TABLE ${tableName} (${columnDefs})`;
}

/**
 * Build CREATE INDEX statement
 */
export function buildCreateIndexStatement(
  indexName: string,
  tableName: string,
  columns: string[]
): string {
  const columnList = columns.map(col => escapeColumnName(col)).join(', ');
  return `CREATE INDEX ${indexName} ON ${tableName}(${columnList})`;
}

/**
 * Build INSERT statement
 */
export function buildInsertStatement(
  tableName: string,
  columns: string[],
  values: string[][]
): string {
  const columnList = columns.map(col => escapeColumnName(col)).join(', ');
  
  const valuesList = values.map(row => {
    const valueStr = row.map(val => {
      if (val === null || val === undefined || val === 'NULL') {
        return 'NULL';
      }
      // Check if it's already a SQL expression (like TIMESTAMP '...')
      if (val.startsWith('TIMESTAMP ') || val.includes('::')) {
        return val;
      }
      // Otherwise, quote the value
      return `'${val.replace(/'/g, "''")}'`;
    }).join(', ');
    
    return `(${valueStr})`;
  }).join(', ');

  return `INSERT INTO ${tableName} (${columnList}) VALUES ${valuesList}`;
}

/**
 * Build column definition from headers
 */
export function buildColumnDefinitions(headers: string[]): TableColumn[] {
  return headers.map(header => ({
    name: header,
    type: getSqlDataType(header),
    nullable: true
  }));
}

/**
 * Build table name from metadata
 */
export function buildTableName(metadataId: number, prefix: string = 'data'): string {
  return `${prefix}_${metadataId}`;
}

/**
 * Format timestamp value for SQL
 */
export function formatTimestampForSql(timestamp: string): string {
  if (!timestamp || timestamp === '') {
    return 'NULL';
  }
  
  // Remove any timezone information to force local time interpretation
  const cleanTimestamp = timestamp.replace(/[+-]\d{2}:\d{2}$/, '').trim();
  
  return `TIMESTAMP '${cleanTimestamp}'::TIMESTAMP`;
}

/**
 * Build batch INSERT values
 */
export interface BatchInsertOptions {
  batchSize: number;
  columns: string[];
  onBatch?: (batchSql: string, batchIndex: number) => void;
}

export function buildBatchInsertStatements(
  tableName: string,
  data: string[][],
  options: BatchInsertOptions
): string[] {
  const statements: string[] = [];
  const { batchSize, columns } = options;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, Math.min(i + batchSize, data.length));
    const sql = buildInsertStatement(tableName, columns, batch);
    
    statements.push(sql);
    
    if (options.onBatch) {
      options.onBatch(sql, Math.floor(i / batchSize));
    }
  }

  return statements;
}

/**
 * Build DROP TABLE statement
 */
export function buildDropTableStatement(tableName: string, ifExists: boolean = true): string {
  return ifExists 
    ? `DROP TABLE IF EXISTS ${tableName}`
    : `DROP TABLE ${tableName}`;
}

/**
 * Build SELECT statement for sampling
 */
export interface SamplingOptions {
  sampleRate?: number;
  limit?: number;
  orderBy?: string;
}

export function buildSamplingSelectStatement(
  tableName: string,
  columns: string[],
  options: SamplingOptions = {}
): string {
  const columnList = columns.map(col => escapeColumnName(col)).join(', ');
  let sql = `SELECT ${columnList} FROM ${tableName}`;

  if (options.sampleRate && options.sampleRate < 1) {
    sql += ` USING SAMPLE ${Math.floor(options.sampleRate * 100)}%`;
  }

  if (options.orderBy) {
    sql += ` ORDER BY ${escapeColumnName(options.orderBy)}`;
  }

  if (options.limit) {
    sql += ` LIMIT ${options.limit}`;
  }

  return sql;
}