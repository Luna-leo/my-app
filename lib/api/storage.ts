import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { readTimeSeriesFromParquet } from './parquet';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const CHUNKS_DIR = path.join(process.cwd(), 'uploads', 'chunks');

export async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    await fs.mkdir(CHUNKS_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create uploads directory:', error);
  }
}

export function generateUploadId(): string {
  return nanoid();
}

export function getUploadPath(uploadId: string): string {
  return path.join(UPLOADS_DIR, uploadId);
}

export async function saveMetadata(uploadId: string, metadata: Record<string, unknown>, parameters: Array<Record<string, unknown>>) {
  const uploadPath = getUploadPath(uploadId);
  await fs.mkdir(uploadPath, { recursive: true });
  
  // Include dataKey in metadata if not already present
  const metadataWithKey = {
    ...metadata,
    dataKey: metadata.dataKey || undefined
  };
  
  const metadataPath = path.join(uploadPath, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify({ metadata: metadataWithKey, parameters }, null, 2));
}

export async function loadMetadata(uploadId: string) {
  const metadataPath = path.join(getUploadPath(uploadId), 'metadata.json');
  const content = await fs.readFile(metadataPath, 'utf-8');
  return JSON.parse(content);
}

export async function loadTimeSeriesData(uploadId: string, options?: { limit?: number }) {
  const data = await readTimeSeriesFromParquet(uploadId);
  
  if (options?.limit) {
    return data.slice(0, options.limit);
  }
  
  return data;
}


export async function updateIndex(uploadId: string, uploadInfo: Record<string, unknown>) {
  await ensureUploadsDir();
  const indexPath = path.join(UPLOADS_DIR, 'index.json');
  
  let index: Record<string, Record<string, unknown>> = {};
  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    index = JSON.parse(content);
  } catch {
    // Index doesn't exist yet
  }
  
  index[uploadId] = {
    ...uploadInfo,
    uploadedAt: new Date().toISOString()
  };
  
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

export async function loadIndex() {
  try {
    const indexPath = path.join(UPLOADS_DIR, 'index.json');
    const content = await fs.readFile(indexPath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

export async function deleteFromIndex(uploadId: string) {
  await ensureUploadsDir();
  const indexPath = path.join(UPLOADS_DIR, 'index.json');
  
  let index: Record<string, Record<string, unknown>> = {};
  try {
    const content = await fs.readFile(indexPath, 'utf-8');
    index = JSON.parse(content);
  } catch {
    // Index doesn't exist yet
  }
  
  // Delete the entry
  delete index[uploadId];
  
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

export async function deleteUploadData(uploadId: string) {
  // Delete from index first
  await deleteFromIndex(uploadId);
  
  // Delete the upload directory
  const uploadPath = getUploadPath(uploadId);
  try {
    await fs.rm(uploadPath, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to delete upload directory ${uploadPath}:`, error);
  }
}

// Chunk upload functions
export interface ChunkInfo {
  index: number;
  total: number;
}

export interface ChunkSession {
  uploadId: string;
  metadata: Record<string, unknown>;
  parameters: Array<{ parameterId: string; parameterName: string; unit: string; [key: string]: unknown }>;
  totalChunks: number;
  receivedChunks: number[];
  createdAt: Date;
  dataKey: string;
}

export async function getChunkSessionPath(dataKey: string): Promise<string> {
  return path.join(CHUNKS_DIR, dataKey);
}

export async function saveChunkSession(session: ChunkSession): Promise<void> {
  const sessionPath = await getChunkSessionPath(session.dataKey);
  await fs.mkdir(sessionPath, { recursive: true });
  
  const sessionFile = path.join(sessionPath, 'session.json');
  // Convert Date to ISO string for JSON serialization
  const sessionData = {
    ...session,
    createdAt: session.createdAt instanceof Date ? session.createdAt.toISOString() : session.createdAt
  };
  await fs.writeFile(sessionFile, JSON.stringify(sessionData, null, 2));
}

export async function loadChunkSession(dataKey: string): Promise<ChunkSession | null> {
  try {
    const sessionPath = await getChunkSessionPath(dataKey);
    const sessionFile = path.join(sessionPath, 'session.json');
    const content = await fs.readFile(sessionFile, 'utf-8');
    const session = JSON.parse(content);
    // Convert createdAt back to Date object
    return {
      ...session,
      createdAt: new Date(session.createdAt)
    };
  } catch {
    return null;
  }
}

interface TimeSeriesRecord {
  timestamp: string | Date;
  data: Record<string, number | null>;
  metadataId?: number;
}

export async function saveChunk(dataKey: string, chunkIndex: number, data: TimeSeriesRecord[]): Promise<void> {
  const sessionPath = await getChunkSessionPath(dataKey);
  const chunkFile = path.join(sessionPath, `chunk_${chunkIndex}.json`);
  await fs.writeFile(chunkFile, JSON.stringify(data));
}

export async function loadChunk(dataKey: string, chunkIndex: number): Promise<TimeSeriesRecord[]> {
  const sessionPath = await getChunkSessionPath(dataKey);
  const chunkFile = path.join(sessionPath, `chunk_${chunkIndex}.json`);
  const content = await fs.readFile(chunkFile, 'utf-8');
  return JSON.parse(content);
}

export async function combineChunks(dataKey: string): Promise<TimeSeriesRecord[]> {
  const session = await loadChunkSession(dataKey);
  if (!session) {
    throw new Error('Chunk session not found');
  }

  const allData: TimeSeriesRecord[] = [];
  
  // Load and combine all chunks in order
  for (let i = 0; i < session.totalChunks; i++) {
    const chunkData = await loadChunk(dataKey, i);
    allData.push(...chunkData);
  }
  
  return allData;
}

export async function cleanupChunkSession(dataKey: string): Promise<void> {
  const sessionPath = await getChunkSessionPath(dataKey);
  try {
    await fs.rm(sessionPath, { recursive: true, force: true });
  } catch (error) {
    console.error(`Failed to cleanup chunk session ${dataKey}:`, error);
  }
}

// Cleanup old chunk sessions (older than 1 hour)
export async function cleanupOldChunkSessions(): Promise<void> {
  try {
    const chunkDirs = await fs.readdir(CHUNKS_DIR);
    const now = new Date();
    
    for (const dir of chunkDirs) {
      const sessionPath = path.join(CHUNKS_DIR, dir);
      const sessionFile = path.join(sessionPath, 'session.json');
      
      try {
        const content = await fs.readFile(sessionFile, 'utf-8');
        const session: ChunkSession = JSON.parse(content);
        const createdAt = new Date(session.createdAt);
        
        // If session is older than 1 hour, clean it up
        if (now.getTime() - createdAt.getTime() > 3600000) {
          await fs.rm(sessionPath, { recursive: true, force: true });
          console.log(`Cleaned up old chunk session: ${dir}`);
        }
      } catch {
        // If we can't read the session file, clean up the directory
        await fs.rm(sessionPath, { recursive: true, force: true });
      }
    }
  } catch (error) {
    console.error('Failed to cleanup old chunk sessions:', error);
  }
}