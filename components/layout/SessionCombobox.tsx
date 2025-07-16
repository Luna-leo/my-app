'use client'

import * as React from 'react'
import { Plus, Save, Download, Upload, FolderOpen, Clock, ChevronDown, CloudUpload, CloudDownload, Globe } from 'lucide-react'
import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { Workspace } from '@/lib/db/schema'
import { chartConfigService } from '@/lib/services/chartConfigurationService'
import { sessionSharingService } from '@/lib/services/sessionSharingService'
import { SharedSessionMetadata } from '@/lib/types/sharedSession'

interface SessionComboboxProps {
  currentWorkspace: { id: string; name: string; description?: string } | null
  onSelectWorkspace: (workspaceId: string) => void
  onCreateNewSession: () => void
  onSaveSession: () => void
  onExportSession: () => void
  onImportSession: () => void
  hasDataOrCharts?: boolean
  className?: string
}

export function SessionCombobox({
  currentWorkspace,
  onSelectWorkspace,
  onCreateNewSession,
  onSaveSession,
  onExportSession,
  onImportSession,
  hasDataOrCharts = false,
  className,
}: SessionComboboxProps) {
  const [open, setOpen] = React.useState(false)
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([])
  const [sharedSessions, setSharedSessions] = React.useState<SharedSessionMetadata[]>([])
  const [loading, setLoading] = React.useState(false)
  const [loadingShared, setLoadingShared] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState('')
  const [uploadingWorkspaceId, setUploadingWorkspaceId] = React.useState<string | null>(null)
  const [downloadingSessionId, setDownloadingSessionId] = React.useState<string | null>(null)
  
  // ワークスペース一覧を読み込む
  const loadWorkspaces = React.useCallback(async () => {
    try {
      setLoading(true)
      const allWorkspaces = await chartConfigService.getAllWorkspaces()
      // 更新日時でソート（新しい順）
      const sorted = allWorkspaces.sort((a, b) => {
        const dateA = new Date(a.updatedAt).getTime()
        const dateB = new Date(b.updatedAt).getTime()
        return dateB - dateA
      })
      setWorkspaces(sorted)
    } catch (error) {
      console.error('Failed to load workspaces:', error)
    } finally {
      setLoading(false)
    }
  }, [])
  
  // 共有セッション一覧を読み込む
  const loadSharedSessions = React.useCallback(async () => {
    try {
      setLoadingShared(true)
      const response = await sessionSharingService.getSharedSessions({
        limit: 50 // 最初は50件まで表示
      })
      setSharedSessions(response.sessions)
    } catch (error) {
      console.error('Failed to load shared sessions:', error)
    } finally {
      setLoadingShared(false)
    }
  }, [])
  
  // ドロップダウンが開いたときにワークスペースを読み込む
  React.useEffect(() => {
    if (open) {
      loadWorkspaces()
      loadSharedSessions()
    }
  }, [open, loadWorkspaces, loadSharedSessions])
  
  // 検索フィルタリング
  const filteredWorkspaces = React.useMemo(() => {
    if (!searchValue) return workspaces
    
    const searchLower = searchValue.toLowerCase()
    return workspaces.filter(workspace => 
      workspace.name.toLowerCase().includes(searchLower) ||
      workspace.description?.toLowerCase().includes(searchLower)
    )
  }, [workspaces, searchValue])
  
  const filteredSharedSessions = React.useMemo(() => {
    if (!searchValue) return sharedSessions
    
    const searchLower = searchValue.toLowerCase()
    return sharedSessions.filter(session => 
      session.name.toLowerCase().includes(searchLower) ||
      session.description?.toLowerCase().includes(searchLower)
    )
  }, [sharedSessions, searchValue])
  
  const handleSelectWorkspace = (workspaceId: string) => {
    if (workspaceId === currentWorkspace?.id) {
      setOpen(false)
      return
    }
    
    onSelectWorkspace(workspaceId)
    setOpen(false)
    setSearchValue('')
  }
  
  // セッションをアップロード
  const handleUploadSession = async (workspaceId: string) => {
    try {
      setUploadingWorkspaceId(workspaceId)
      const workspace = workspaces.find(w => w.id === workspaceId)
      if (!workspace) return
      
      // ワークスペースのチャート設定を取得
      const charts = await chartConfigService.loadChartConfigurations(workspaceId)
      
      // アップロード実行
      const response = await sessionSharingService.uploadSession(
        workspace,
        charts,
        workspace.description
      )
      
      if (response.success) {
        console.log('アップロード成功:', 'セッションがWebにアップロードされました')
        // 共有セッション一覧を再読み込み
        await loadSharedSessions()
      } else {
        console.error('アップロード失敗:', response.message || 'セッションのアップロードに失敗しました')
        alert(`アップロード失敗: ${response.message || 'セッションのアップロードに失敗しました'}`)
      }
    } catch (error) {
      console.error('Failed to upload session:', error)
      alert('セッションのアップロード中にエラーが発生しました')
    } finally {
      setUploadingWorkspaceId(null)
    }
  }
  
  // 共有セッションをダウンロード
  const handleDownloadSharedSession = async (sessionId: string) => {
    try {
      setDownloadingSessionId(sessionId)
      
      const result = await sessionSharingService.importSharedSession(sessionId)
      
      if (result.success && result.workspaceId) {
        console.log('ダウンロード成功:', 'セッションがダウンロードされました')
        // ワークスペース一覧を再読み込み
        await loadWorkspaces()
        // 新しいワークスペースに切り替え
        onSelectWorkspace(result.workspaceId)
        setOpen(false)
      } else {
        console.error('ダウンロード失敗:', result.message || 'セッションのダウンロードに失敗しました')
        alert(`ダウンロード失敗: ${result.message || 'セッションのダウンロードに失敗しました'}`)
      }
    } catch (error) {
      console.error('Failed to download session:', error)
      alert('セッションのダウンロード中にエラーが発生しました')
    } finally {
      setDownloadingSessionId(null)
    }
  }
  
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button 
          variant="outline" 
          className={cn("w-[300px] justify-between", className)}
        >
          <div className="flex items-center gap-2 truncate">
            <FolderOpen className="h-4 w-4" />
            <span className="truncate">
              {currentWorkspace?.name || 'セッションを選択'}
            </span>
          </div>
          <ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-[300px]" align="start">
        <DropdownMenuLabel>セッション管理</DropdownMenuLabel>
        <DropdownMenuSeparator />
        
        {/* アクションメニュー */}
        <DropdownMenuItem onClick={onCreateNewSession}>
          <Plus className="mr-2 h-4 w-4" />
          新規セッション
        </DropdownMenuItem>
        
        {hasDataOrCharts && currentWorkspace && (
          <DropdownMenuItem onClick={onSaveSession}>
            <Save className="mr-2 h-4 w-4" />
            現在のセッションを保存
          </DropdownMenuItem>
        )}
        
        <DropdownMenuSeparator />
        
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Download className="mr-2 h-4 w-4" />
            Export / Import
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem 
              onClick={onExportSession}
              disabled={!hasDataOrCharts}
            >
              <Download className="mr-2 h-4 w-4" />
              セッションをエクスポート
            </DropdownMenuItem>
            <DropdownMenuItem onClick={onImportSession}>
              <Upload className="mr-2 h-4 w-4" />
              セッションをインポート
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        
        <DropdownMenuSeparator />
        
        {/* セッション検索と一覧 */}
        <Command>
          <CommandInput 
            placeholder="セッションを検索..." 
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className="max-h-[400px]">
            {(loading && loadingShared) ? (
              <CommandEmpty>読み込み中...</CommandEmpty>
            ) : (
              <>
                {/* ローカルセッション */}
                {filteredWorkspaces.length > 0 && (
                  <>
                    <CommandGroup heading="📁 ローカルセッション">
                      {filteredWorkspaces.map((workspace) => (
                        <CommandItem
                          key={workspace.id}
                          value={workspace.id}
                          onSelect={() => handleSelectWorkspace(workspace.id!)}
                          className="flex items-start gap-2 py-2 group"
                        >
                          <FolderOpen className="h-4 w-4 mt-0.5 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <div className="font-medium truncate flex-1">
                                {workspace.name}
                                {workspace.id === currentWorkspace?.id && (
                                  <span className="ml-2 text-xs text-primary">(現在)</span>
                                )}
                              </div>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                                onClick={(e) => {
                                  e.stopPropagation()
                                  handleUploadSession(workspace.id!)
                                }}
                                disabled={uploadingWorkspaceId === workspace.id}
                              >
                                {uploadingWorkspaceId === workspace.id ? (
                                  <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-current" />
                                ) : (
                                  <CloudUpload className="h-3 w-3" />
                                )}
                              </Button>
                            </div>
                            {workspace.description && (
                              <div className="text-xs text-muted-foreground truncate">
                                {workspace.description}
                              </div>
                            )}
                            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(workspace.updatedAt), { 
                                addSuffix: true,
                                locale: {
                                  formatDistance: (token, count) => {
                                    const translations: Record<string, string> = {
                                      'lessThanXSeconds': `${count}秒前`,
                                      'xSeconds': `${count}秒前`,
                                      'halfAMinute': '30秒前',
                                      'lessThanXMinutes': `${count}分前`,
                                      'xMinutes': `${count}分前`,
                                      'aboutXHours': `約${count}時間前`,
                                      'xHours': `${count}時間前`,
                                      'xDays': `${count}日前`,
                                      'aboutXWeeks': `約${count}週間前`,
                                      'xWeeks': `${count}週間前`,
                                      'aboutXMonths': `約${count}ヶ月前`,
                                      'xMonths': `${count}ヶ月前`,
                                      'aboutXYears': `約${count}年前`,
                                      'xYears': `${count}年前`,
                                      'overXYears': `${count}年以上前`,
                                      'almostXYears': `約${count}年前`,
                                    }
                                    return translations[token] || `${count} ${token}`
                                  }
                                }
                              })}
                            </div>
                          </div>
                        </CommandItem>
                      ))}
                    </CommandGroup>
                    {filteredSharedSessions.length > 0 && <CommandSeparator />}
                  </>
                )}
                
                {/* 共有セッション */}
                {filteredSharedSessions.length > 0 && (
                  <CommandGroup heading="🌐 共有セッション">
                    {filteredSharedSessions.map((session) => (
                      <CommandItem
                        key={session.id}
                        value={session.id}
                        className="flex items-start gap-2 py-2 group"
                      >
                        <Globe className="h-4 w-4 mt-0.5 shrink-0 text-blue-500" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between">
                            <div className="font-medium truncate flex-1">
                              {session.name}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDownloadSharedSession(session.id)
                              }}
                              disabled={downloadingSessionId === session.id}
                            >
                              {downloadingSessionId === session.id ? (
                                <div className="h-3 w-3 animate-spin rounded-full border-b-2 border-current" />
                              ) : (
                                <CloudDownload className="h-3 w-3" />
                              )}
                            </Button>
                          </div>
                          {session.description && (
                            <div className="text-xs text-muted-foreground truncate">
                              {session.description}
                            </div>
                          )}
                          <div className="text-xs text-muted-foreground flex items-center gap-2 mt-1">
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDistanceToNow(new Date(session.uploadedAt), { 
                                addSuffix: true,
                                locale: {
                                  formatDistance: (token, count) => {
                                    const translations: Record<string, string> = {
                                      'lessThanXSeconds': `${count}秒前`,
                                      'xSeconds': `${count}秒前`,
                                      'halfAMinute': '30秒前',
                                      'lessThanXMinutes': `${count}分前`,
                                      'xMinutes': `${count}分前`,
                                      'aboutXHours': `約${count}時間前`,
                                      'xHours': `${count}時間前`,
                                      'xDays': `${count}日前`,
                                      'aboutXWeeks': `約${count}週間前`,
                                      'xWeeks': `${count}週間前`,
                                      'aboutXMonths': `約${count}ヶ月前`,
                                      'xMonths': `${count}ヶ月前`,
                                      'aboutXYears': `約${count}年前`,
                                      'xYears': `${count}年前`,
                                      'overXYears': `${count}年以上前`,
                                      'almostXYears': `約${count}年前`,
                                    }
                                    return translations[token] || `${count} ${token}`
                                  }
                                }
                              })}
                            </div>
                            <span className="text-muted-foreground">•</span>
                            <span>{session.downloadCount} DL</span>
                            <span className="text-muted-foreground">•</span>
                            <span>{session.chartCount} charts</span>
                          </div>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                
                {filteredWorkspaces.length === 0 && filteredSharedSessions.length === 0 && (
                  <CommandEmpty>
                    {searchValue ? 'セッションが見つかりません' : 'セッションがありません'}
                  </CommandEmpty>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}