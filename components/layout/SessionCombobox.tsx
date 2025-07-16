'use client'

import * as React from 'react'
import { Plus, Save, Download, Upload, FolderOpen, Clock, ChevronDown } from 'lucide-react'
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
} from '@/components/ui/command'
import { Workspace } from '@/lib/db/schema'
import { chartConfigService } from '@/lib/services/chartConfigurationService'

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
  const [loading, setLoading] = React.useState(false)
  const [searchValue, setSearchValue] = React.useState('')
  
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
  
  // ドロップダウンが開いたときにワークスペースを読み込む
  React.useEffect(() => {
    if (open) {
      loadWorkspaces()
    }
  }, [open, loadWorkspaces])
  
  // 検索フィルタリング
  const filteredWorkspaces = React.useMemo(() => {
    if (!searchValue) return workspaces
    
    const searchLower = searchValue.toLowerCase()
    return workspaces.filter(workspace => 
      workspace.name.toLowerCase().includes(searchLower) ||
      workspace.description?.toLowerCase().includes(searchLower)
    )
  }, [workspaces, searchValue])
  
  const handleSelectWorkspace = (workspaceId: string) => {
    if (workspaceId === currentWorkspace?.id) {
      setOpen(false)
      return
    }
    
    onSelectWorkspace(workspaceId)
    setOpen(false)
    setSearchValue('')
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
        <DropdownMenuLabel>保存済みセッション</DropdownMenuLabel>
        
        {/* セッション検索と一覧 */}
        <Command>
          <CommandInput 
            placeholder="セッションを検索..." 
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className="max-h-[300px]">
            {loading ? (
              <CommandEmpty>読み込み中...</CommandEmpty>
            ) : filteredWorkspaces.length === 0 ? (
              <CommandEmpty>
                {searchValue ? 'セッションが見つかりません' : '保存済みセッションはありません'}
              </CommandEmpty>
            ) : (
              <CommandGroup>
                {filteredWorkspaces.map((workspace) => (
                  <CommandItem
                    key={workspace.id}
                    value={workspace.id}
                    onSelect={() => handleSelectWorkspace(workspace.id!)}
                    className="flex items-start gap-2 py-2"
                  >
                    <FolderOpen className="h-4 w-4 mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {workspace.name}
                        {workspace.id === currentWorkspace?.id && (
                          <span className="ml-2 text-xs text-primary">(現在)</span>
                        )}
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
            )}
          </CommandList>
        </Command>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}