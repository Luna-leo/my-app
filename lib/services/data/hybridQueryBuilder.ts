import { createLogger } from '../logger';

export interface HybridQueryParams {
  memoryTableIds: number[];
  parquetPaths: Map<number, string>;
  baseQuery?: string;
}

export interface UnionQueryParams {
  tables: Array<{
    name: string;
    metadataId: number;
    columns?: string[];
  }>;
  whereClause?: string;
  orderBy?: string;
  limit?: number;
}

/**
 * Service for building hybrid queries that combine multiple data sources
 */
export class HybridQueryBuilder {
  private logger = createLogger('HybridQueryBuilder');

  /**
   * Build a UNION query combining memory tables and parquet files
   */
  buildHybridUnionQuery(params: HybridQueryParams): {
    viewName: string;
    createViewSQL: string;
    cleanupSQL: string;
  } {
    const { memoryTableIds, parquetPaths } = params;
    const viewName = `hybrid_view_${Date.now()}`;
    const unionParts: string[] = [];

    // Add memory tables
    for (const metadataId of memoryTableIds) {
      const tableName = `timeseries_${metadataId}`;
      unionParts.push(`SELECT * FROM ${tableName}`);
    }

    // Add parquet files
    for (const [metadataId, parquetPath] of parquetPaths) {
      unionParts.push(`
        SELECT ${metadataId} as metadata_id, * 
        FROM read_parquet('${parquetPath}')
      `);
    }

    if (unionParts.length === 0) {
      throw new Error('No data sources provided for hybrid query');
    }

    const createViewSQL = `
      CREATE TEMPORARY VIEW ${viewName} AS
      ${unionParts.join(' UNION ALL ')}
    `;

    const cleanupSQL = `DROP VIEW IF EXISTS ${viewName}`;

    this.logger.debug(`Built hybrid query with ${memoryTableIds.length} memory tables and ${parquetPaths.size} parquet files`);

    return {
      viewName,
      createViewSQL,
      cleanupSQL
    };
  }

  /**
   * Build a parameterized UNION query
   */
  buildUnionQuery(params: UnionQueryParams): string {
    const { tables, whereClause, orderBy, limit } = params;

    if (tables.length === 0) {
      throw new Error('No tables provided for union query');
    }

    const unionParts = tables.map(table => {
      const columns = table.columns 
        ? table.columns.map(col => `"${col}"`).join(', ')
        : '*';
      
      let query = `SELECT ${table.metadataId} as metadata_id, ${columns} FROM ${table.name}`;
      
      if (whereClause) {
        query += ` WHERE ${whereClause}`;
      }
      
      return `(${query})`;
    });

    let unionQuery = unionParts.join(' UNION ALL ');

    if (orderBy) {
      unionQuery = `SELECT * FROM (${unionQuery}) ORDER BY ${orderBy}`;
    }

    if (limit) {
      unionQuery += ` LIMIT ${limit}`;
    }

    return unionQuery;
  }

  /**
   * Build a query for combining multiple parquet files
   */
  buildParquetUnionQuery(
    parquetPaths: Map<number, string>,
    options?: {
      columns?: string[];
      whereClause?: string;
      orderBy?: string;
      limit?: number;
    }
  ): string {
    const unionParts: string[] = [];

    for (const [metadataId, path] of parquetPaths) {
      const columns = options?.columns 
        ? options.columns.map(col => `"${col}"`).join(', ')
        : '*';
      
      let query = `
        SELECT ${metadataId} as metadata_id, ${columns}
        FROM read_parquet('${path}')
      `;

      if (options?.whereClause) {
        query += ` WHERE ${options.whereClause}`;
      }

      unionParts.push(`(${query})`);
    }

    let unionQuery = unionParts.join(' UNION ALL ');

    if (options?.orderBy) {
      unionQuery = `SELECT * FROM (${unionQuery}) ORDER BY ${options.orderBy}`;
    }

    if (options?.limit) {
      unionQuery += ` LIMIT ${options.limit}`;
    }

    return unionQuery;
  }

  /**
   * Build a query with dynamic column selection
   */
  buildDynamicColumnQuery(
    tableName: string,
    availableColumns: Set<string>,
    requestedColumns: string[],
    options?: {
      whereClause?: string;
      orderBy?: string;
      limit?: number;
    }
  ): string {
    // Filter to only existing columns
    const existingColumns = requestedColumns.filter(col => availableColumns.has(col));
    const missingColumns = requestedColumns.filter(col => !availableColumns.has(col));

    // Build column selection
    const columnSelections: string[] = ['metadata_id', 'timestamp'];
    
    // Add existing columns
    existingColumns.forEach(col => {
      columnSelections.push(`"${col}"`);
    });

    // Add NULL placeholders for missing columns
    missingColumns.forEach(col => {
      columnSelections.push(`NULL AS "${col}"`);
    });

    let query = `SELECT ${columnSelections.join(', ')} FROM ${tableName}`;

    if (options?.whereClause) {
      query += ` WHERE ${options.whereClause}`;
    }

    if (options?.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    }

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    this.logger.debug(`Built dynamic column query with ${existingColumns.length} existing and ${missingColumns.length} missing columns`);

    return query;
  }

  /**
   * Build an aggregation query
   */
  buildAggregationQuery(
    tableName: string,
    aggregations: Array<{
      column: string;
      function: 'avg' | 'sum' | 'min' | 'max' | 'count' | 'stddev';
      alias?: string;
    }>,
    options?: {
      groupBy?: string[];
      whereClause?: string;
      having?: string;
      orderBy?: string;
      limit?: number;
    }
  ): string {
    const aggSelections = aggregations.map(agg => {
      const alias = agg.alias || `${agg.function}_${agg.column}`;
      return `${agg.function.toUpperCase()}("${agg.column}") AS "${alias}"`;
    });

    const selections = options?.groupBy 
      ? [...options.groupBy.map(col => `"${col}"`), ...aggSelections]
      : aggSelections;

    let query = `SELECT ${selections.join(', ')} FROM ${tableName}`;

    if (options?.whereClause) {
      query += ` WHERE ${options.whereClause}`;
    }

    if (options?.groupBy && options.groupBy.length > 0) {
      query += ` GROUP BY ${options.groupBy.map(col => `"${col}"`).join(', ')}`;
    }

    if (options?.having) {
      query += ` HAVING ${options.having}`;
    }

    if (options?.orderBy) {
      query += ` ORDER BY ${options.orderBy}`;
    }

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    return query;
  }

  /**
   * Build a window function query
   */
  buildWindowQuery(
    tableName: string,
    windowFunctions: Array<{
      function: string;
      column?: string;
      partitionBy?: string[];
      orderBy?: string;
      alias: string;
    }>,
    options?: {
      columns?: string[];
      whereClause?: string;
      finalOrderBy?: string;
      limit?: number;
    }
  ): string {
    const baseColumns = options?.columns 
      ? options.columns.map(col => `"${col}"`)
      : ['metadata_id', 'timestamp'];

    const windowSelections = windowFunctions.map(wf => {
      let windowDef = wf.function;
      
      if (wf.column) {
        windowDef += `("${wf.column}")`;
      } else {
        windowDef += '()';
      }

      windowDef += ' OVER (';
      
      const windowParts: string[] = [];
      
      if (wf.partitionBy && wf.partitionBy.length > 0) {
        windowParts.push(`PARTITION BY ${wf.partitionBy.map(col => `"${col}"`).join(', ')}`);
      }
      
      if (wf.orderBy) {
        windowParts.push(`ORDER BY ${wf.orderBy}`);
      }
      
      windowDef += windowParts.join(' ');
      windowDef += `)`;
      
      return `${windowDef} AS "${wf.alias}"`;
    });

    const allSelections = [...baseColumns, ...windowSelections];
    
    let query = `SELECT ${allSelections.join(', ')} FROM ${tableName}`;

    if (options?.whereClause) {
      query += ` WHERE ${options.whereClause}`;
    }

    if (options?.finalOrderBy) {
      query += ` ORDER BY ${options.finalOrderBy}`;
    }

    if (options?.limit) {
      query += ` LIMIT ${options.limit}`;
    }

    return query;
  }

  /**
   * Build a pivot query
   */
  buildPivotQuery(
    tableName: string,
    pivotColumn: string,
    valueColumn: string,
    aggregation: 'sum' | 'avg' | 'max' | 'min' | 'count',
    pivotValues: string[],
    options?: {
      groupBy?: string[];
      whereClause?: string;
    }
  ): string {
    const groupByColumns = options?.groupBy || ['metadata_id', 'timestamp'];
    
    const pivotSelections = pivotValues.map(value => {
      return `${aggregation.toUpperCase()}(CASE WHEN "${pivotColumn}" = '${value}' THEN "${valueColumn}" END) AS "${value}"`;
    });

    const allSelections = [
      ...groupByColumns.map(col => `"${col}"`),
      ...pivotSelections
    ];

    let query = `
      SELECT ${allSelections.join(', ')}
      FROM ${tableName}
    `;

    if (options?.whereClause) {
      query += ` WHERE ${options.whereClause}`;
    }

    query += ` GROUP BY ${groupByColumns.map(col => `"${col}"`).join(', ')}`;

    return query;
  }
}