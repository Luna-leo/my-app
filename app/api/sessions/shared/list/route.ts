import { NextRequest, NextResponse } from 'next/server'
import { SharedSessionListResponse, SharedSessionMetadata } from '@/lib/types/sharedSession'
import { promises as fs } from 'fs'
import path from 'path'

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

export async function GET(request: NextRequest) {
  try {
    await ensureSharedSessionsDir()
    
    // クエリパラメータを取得
    const searchParams = request.nextUrl.searchParams
    const page = parseInt(searchParams.get('page') || '1')
    const limit = parseInt(searchParams.get('limit') || '20')
    const search = searchParams.get('search') || ''
    
    // メタデータを読み込む
    const allMetadata = await loadMetadata()
    let sessions = Object.values(allMetadata)
    
    // 検索フィルタリング
    if (search) {
      const searchLower = search.toLowerCase()
      sessions = sessions.filter(session => 
        session.name.toLowerCase().includes(searchLower) ||
        session.description?.toLowerCase().includes(searchLower)
      )
    }
    
    // アップロード日時でソート（新しい順）
    sessions.sort((a, b) => 
      new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime()
    )
    
    // ページネーション
    const startIndex = (page - 1) * limit
    const endIndex = startIndex + limit
    const paginatedSessions = sessions.slice(startIndex, endIndex)
    
    // 日付文字列をDateオブジェクトに変換
    const sessionsWithDates = paginatedSessions.map(session => ({
      ...session,
      uploadedAt: new Date(session.uploadedAt),
      lastAccessedAt: new Date(session.lastAccessedAt)
    }))
    
    const response: SharedSessionListResponse = {
      sessions: sessionsWithDates,
      total: sessions.length,
      hasMore: endIndex < sessions.length
    }
    
    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching shared sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch shared sessions' },
      { status: 500 }
    )
  }
}