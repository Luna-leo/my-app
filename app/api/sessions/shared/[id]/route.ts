import { NextRequest, NextResponse } from 'next/server'
import { SharedSession, SharedSessionMetadata } from '@/lib/types/sharedSession'
import { promises as fs } from 'fs'
import path from 'path'

// 共有セッション保存ディレクトリ
const SHARED_SESSIONS_DIR = path.join(process.cwd(), 'shared-sessions')

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: sessionId } = await params
    
    // セッションファイルを読み込む
    const sessionPath = getSessionPath(sessionId)
    
    try {
      const content = await fs.readFile(sessionPath, 'utf-8')
      const session: SharedSession = JSON.parse(content)
      
      // ダウンロード回数と最終アクセス日時を更新
      const allMetadata = await loadMetadata()
      if (allMetadata[sessionId]) {
        allMetadata[sessionId].downloadCount++
        allMetadata[sessionId].lastAccessedAt = new Date()
        await saveMetadata(allMetadata)
      }
      
      // 日付文字列をDateオブジェクトに変換
      const sessionWithDates: SharedSession = {
        ...session,
        metadata: {
          ...session.metadata,
          uploadedAt: new Date(session.metadata.uploadedAt),
          lastAccessedAt: new Date(session.metadata.lastAccessedAt)
        },
        workspace: {
          ...session.workspace,
          createdAt: new Date(session.workspace.createdAt),
          updatedAt: new Date(session.workspace.updatedAt)
        },
        charts: session.charts.map(chart => ({
          ...chart,
          createdAt: new Date(chart.createdAt),
          updatedAt: new Date(chart.updatedAt)
        }))
      }
      
      return NextResponse.json(sessionWithDates)
    } catch {
      // ファイルが見つからない場合
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      )
    }
  } catch (error) {
    console.error('Error fetching shared session:', error)
    return NextResponse.json(
      { error: 'Failed to fetch shared session' },
      { status: 500 }
    )
  }
}