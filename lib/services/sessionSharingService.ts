import { 
  SharedSession, 
  SharedSessionMetadata, 
  SharedSessionListResponse,
  UploadSessionRequest,
  UploadSessionResponse,
  UnifiedSessionItem
} from '@/lib/types/sharedSession'
import { Workspace, ChartConfiguration } from '@/lib/db/schema'
import { chartConfigService } from './chartConfigurationService'

/**
 * セッション共有サービス
 * ローカルセッションのアップロードと共有セッションのダウンロードを管理
 */
export class SessionSharingService {
  private static instance: SessionSharingService
  private baseUrl: string
  
  private constructor() {
    // 環境変数からAPIのベースURLを取得（デフォルトは現在のorigin）
    this.baseUrl = process.env.NEXT_PUBLIC_API_URL || ''
  }
  
  static getInstance(): SessionSharingService {
    if (!SessionSharingService.instance) {
      SessionSharingService.instance = new SessionSharingService()
    }
    return SessionSharingService.instance
  }
  
  /**
   * 共有セッション一覧を取得
   */
  async getSharedSessions(
    options?: {
      page?: number
      limit?: number
      search?: string
    }
  ): Promise<SharedSessionListResponse> {
    const params = new URLSearchParams({
      page: String(options?.page || 1),
      limit: String(options?.limit || 20),
      ...(options?.search && { search: options.search })
    })
    
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/shared/list?${params}`)
      if (!response.ok) {
        throw new Error('Failed to fetch shared sessions')
      }
      
      return await response.json()
    } catch (error) {
      console.error('[SessionSharingService] Error fetching shared sessions:', error)
      // 開発中はモックデータを返す
      return {
        sessions: [],
        total: 0,
        hasMore: false
      }
    }
  }
  
  /**
   * セッションをアップロード
   */
  async uploadSession(
    workspace: Workspace,
    charts: ChartConfiguration[],
    description?: string
  ): Promise<UploadSessionResponse> {
    const request: UploadSessionRequest = {
      workspace,
      charts,
      description
    }
    
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/upload`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request)
      })
      
      if (!response.ok) {
        const error = await response.text()
        throw new Error(error || 'Failed to upload session')
      }
      
      return await response.json()
    } catch (error) {
      console.error('[SessionSharingService] Error uploading session:', error)
      return {
        id: '',
        success: false,
        message: error instanceof Error ? error.message : 'Upload failed'
      }
    }
  }
  
  /**
   * 共有セッションをダウンロード
   */
  async downloadSharedSession(sessionId: string): Promise<SharedSession | null> {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions/shared/${sessionId}`)
      if (!response.ok) {
        throw new Error('Failed to download session')
      }
      
      return await response.json()
    } catch (error) {
      console.error('[SessionSharingService] Error downloading session:', error)
      return null
    }
  }
  
  /**
   * 共有セッションをローカルにインポート
   */
  async importSharedSession(sessionId: string): Promise<{
    success: boolean
    workspaceId?: string
    message?: string
  }> {
    try {
      // 共有セッションをダウンロード
      const sharedSession = await this.downloadSharedSession(sessionId)
      if (!sharedSession) {
        return { success: false, message: 'Failed to download session' }
      }
      
      // 新しいワークスペースとして作成
      const newWorkspace = await chartConfigService.createWorkspace(
        `${sharedSession.workspace.name} (Downloaded)`,
        sharedSession.workspace.description || `Downloaded from shared session on ${new Date().toLocaleDateString()}`
      )
      
      // チャート設定をインポート
      for (const chart of sharedSession.charts) {
        await chartConfigService.saveChartConfiguration({
          ...chart,
          workspaceId: newWorkspace.id!,
          id: undefined, // 新しいIDを生成させる
          createdAt: new Date(),
          updatedAt: new Date()
        })
      }
      
      // 選択されたデータキーを設定
      if (sharedSession.workspace.selectedDataKeys?.length > 0) {
        await chartConfigService.updateWorkspaceSelectedDataKeys(
          newWorkspace.id!,
          sharedSession.workspace.selectedDataKeys
        )
      }
      
      // 新しいワークスペースに切り替え
      await chartConfigService.switchWorkspace(newWorkspace.id!)
      
      return {
        success: true,
        workspaceId: newWorkspace.id
      }
    } catch (error) {
      console.error('[SessionSharingService] Error importing session:', error)
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Import failed'
      }
    }
  }
  
  /**
   * ローカルと共有の統合セッションリストを作成
   */
  async getUnifiedSessionList(
    localWorkspaces: Workspace[],
    sharedSessions: SharedSessionMetadata[]
  ): Promise<{
    local: UnifiedSessionItem[]
    shared: UnifiedSessionItem[]
  }> {
    // ローカルセッションを変換
    const local: UnifiedSessionItem[] = localWorkspaces.map(workspace => ({
      id: workspace.id!,
      name: workspace.name,
      description: workspace.description,
      type: 'local' as const,
      lastModified: workspace.updatedAt,
      workspace,
      isActive: workspace.isActive
    }))
    
    // 共有セッションを変換
    const shared: UnifiedSessionItem[] = sharedSessions.map(metadata => ({
      id: metadata.id,
      name: metadata.name,
      description: metadata.description,
      type: 'shared' as const,
      lastModified: metadata.uploadedAt,
      metadata,
      isDownloaded: false // TODO: ダウンロード済みかどうかをチェックする機能を追加
    }))
    
    return { local, shared }
  }
  
  /**
   * セッションサイズを計算（概算）
   */
  calculateSessionSize(
    workspace: Workspace,
    charts: ChartConfiguration[]
  ): number {
    // JSON文字列のサイズを概算
    const data = { workspace, charts }
    return new Blob([JSON.stringify(data)]).size
  }
}

export const sessionSharingService = SessionSharingService.getInstance()