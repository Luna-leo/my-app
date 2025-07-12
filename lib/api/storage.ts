import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { readTimeSeriesFromParquet } from './parquet';

const UPLOADS_DIR = path.join(process.cwd(), 'uploads');

export async function ensureUploadsDir() {
  try {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
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
  
  const metadataPath = path.join(uploadPath, 'metadata.json');
  await fs.writeFile(metadataPath, JSON.stringify({ metadata, parameters }, null, 2));
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