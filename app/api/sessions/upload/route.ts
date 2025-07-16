import { NextRequest, NextResponse } from 'next/server'
import { UploadSessionRequest, UploadSessionResponse, SharedSessionMetadata, SharedSession } from '@/lib/types/sharedSession'
import { promises as fs } from 'fs'
import path from 'path'
import { nanoid } from 'nanoid'

// 共有セッション保存ディレクトリ
const SHARED_SESSIONS_DIR = path.join(process.cwd(), 'shared-sessions')

// ディレクトリを確保
async function ensureSharedSessionsDir() {
  try {
    await fs.mkdir(SHARED_SESSIONS_DIR, { recursive: true })
  } catch (error) {
    console.error('Failed to create shared sessions directory:', error)
  }
}

// メタデータファイルのパス
function getMetadataPath() {
  return path.join(SHARED_SESSIONS_DIR, 'metadata.json')
}

// セッションファイルのパス
function getSessionPath(sessionId: string) {
  return path.join(SHARED_SESSIONS_DIR, `${sessionId}.json`)
}

// メタデータを読み込む
async function loadMetadata(): Promise<Record<string, SharedSessionMetadata>> {
  try {
    const metadataPath = getMetadataPath()
    const content = await fs.readFile(metadataPath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

// メタデータを保存
async function saveMetadata(metadata: Record<string, SharedSessionMetadata>) {
  const metadataPath = getMetadataPath()
  await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2))
}

// アップロードサイズ制限（10MB）
const MAX_UPLOAD_SIZE = 10 * 1024 * 1024

export async function POST(request: NextRequest) {
  try {
    await ensureSharedSessionsDir()
    
    // リクエストボディを取得
    const data: UploadSessionRequest = await request.json()
    
    // バリデーション
    if (!data.workspace || !data.charts) {
      return NextResponse.json(
        { error: 'Invalid request: workspace and charts are required' },
        { status: 400 }
      )
    }
    
    // セッションサイズをチェック
    const sessionSize = new Blob([JSON.stringify(data)]).size
    if (sessionSize > MAX_UPLOAD_SIZE) {
      return NextResponse.json(
        { error: `Session size (${(sessionSize / 1024 / 1024).toFixed(2)}MB) exceeds maximum allowed size (10MB)` },
        { status: 413 }
      )
    }
    
    // セッションIDを生成
    const sessionId = nanoid(12)
    const now = new Date()
    
    // メタデータを作成
    const metadata: SharedSessionMetadata = {
      id: sessionId,
      name: data.workspace.name,
      description: data.description || data.workspace.description,
      uploadedAt: now,
      uploadedBy: undefined, // TODO: 認証機能を追加したらユーザー情報を設定
      downloadCount: 0,
      lastAccessedAt: now,
      size: sessionSize,
      chartCount: data.charts.length,
      dataCount: data.workspace.selectedDataKeys?.length || 0,
      version: '1.0'
    }
    
    // セッションデータを作成
    const session: SharedSession = {
      metadata,
      workspace: data.workspace,
      charts: data.charts
    }
    
    // セッションをファイルに保存
    const sessionPath = getSessionPath(sessionId)
    await fs.writeFile(sessionPath, JSON.stringify(session, null, 2))
    
    // メタデータを更新
    const allMetadata = await loadMetadata()
    allMetadata[sessionId] = metadata
    await saveMetadata(allMetadata)
    
    // レスポンスを返す
    const response: UploadSessionResponse = {
      id: sessionId,
      success: true,
      message: 'Session uploaded successfully'
    }
    
    return NextResponse.json(response)
  } catch (error) {
    console.error('Error uploading session:', error)
    return NextResponse.json(
      { 
        id: '',
        success: false,
        message: error instanceof Error ? error.message : 'Failed to upload session'
      },
      { status: 500 }
    )
  }
}