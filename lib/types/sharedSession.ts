import { Workspace, ChartConfiguration } from '@/lib/db/schema'

/**
 * 共有セッションのメタデータ
 */
export interface SharedSessionMetadata {
  id: string
  name: string
  description?: string
  uploadedAt: Date
  uploadedBy?: string
  downloadCount: number
  lastAccessedAt: Date
  size: number // バイト数
  chartCount: number
  dataCount: number
  version: string // データフォーマットのバージョン
}

/**
 * 共有セッション全体のデータ
 */
export interface SharedSession {
  metadata: SharedSessionMetadata
  workspace: Workspace
  charts: ChartConfiguration[]
}

/**
 * 共有セッション一覧APIのレスポンス
 */
export interface SharedSessionListResponse {
  sessions: SharedSessionMetadata[]
  total: number
  hasMore: boolean
}

/**
 * セッションアップロードのリクエスト
 */
export interface UploadSessionRequest {
  workspace: Workspace
  charts: ChartConfiguration[]
  description?: string
}

/**
 * セッションアップロードのレスポンス
 */
export interface UploadSessionResponse {
  id: string
  success: boolean
  message?: string
}

/**
 * セッションタイプ（ローカルか共有か）
 */
export type SessionType = 'local' | 'shared'

/**
 * 統合セッションアイテム（UI表示用）
 */
export interface UnifiedSessionItem {
  id: string
  name: string
  description?: string
  type: SessionType
  lastModified: Date
  // ローカルセッション用
  workspace?: Workspace
  isActive?: boolean
  // 共有セッション用
  metadata?: SharedSessionMetadata
  isDownloaded?: boolean // 既にダウンロード済みかどうか
}