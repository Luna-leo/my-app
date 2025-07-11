declare module 'parquetjs' {
  export class ParquetSchema {
    constructor(fields: Record<string, { type: string; optional?: boolean }>);
  }

  export class ParquetWriter {
    static openFile(schema: ParquetSchema, filePath: string): Promise<ParquetWriter>;
    appendRow(row: Record<string, unknown>): Promise<void>;
    close(): Promise<void>;
  }

  export class ParquetReader {
    static openFile(filePath: string): Promise<ParquetReader>;
    getCursor(): ParquetCursor;
    close(): Promise<void>;
  }

  export interface ParquetCursor {
    next(): Promise<Record<string, unknown> | null>;
  }
}