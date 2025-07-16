import { useEffect, useRef } from 'react'
import { chartConfigService } from '@/lib/services/chartConfigurationService'
import { Workspace } from '@/lib/db/schema'

interface UseAutoSaveWorkspaceProps {
  workspace: Workspace | null
  selectedDataKeys: string[]
  enabled?: boolean
  interval?: number // ミリ秒単位
}

export function useAutoSaveWorkspace({
  workspace,
  selectedDataKeys,
  enabled = true,
  interval = 5 * 60 * 1000 // デフォルト5分
}: UseAutoSaveWorkspaceProps) {
  const lastSavedDataRef = useRef<{
    selectedDataKeys: string[]
    workspaceUpdatedAt: Date
  } | null>(null)
  
  useEffect(() => {
    if (!enabled || !workspace?.id) return
    
    // 自動保存関数
    const autoSave = async () => {
      try {
        // 前回保存時から変更があるかチェック
        const hasChanges = 
          !lastSavedDataRef.current ||
          JSON.stringify(selectedDataKeys) !== JSON.stringify(lastSavedDataRef.current.selectedDataKeys) ||
          workspace.updatedAt.getTime() !== lastSavedDataRef.current.workspaceUpdatedAt.getTime()
        
        if (hasChanges && workspace.id) {
          console.log('[AutoSave] Saving workspace changes...')
          
          // selectedDataKeysを更新
          await chartConfigService.updateWorkspace(workspace.id, {
            selectedDataKeys,
            updatedAt: new Date()
          })
          
          // 最後に保存した状態を記録
          lastSavedDataRef.current = {
            selectedDataKeys: [...selectedDataKeys],
            workspaceUpdatedAt: new Date()
          }
          
          console.log('[AutoSave] Workspace saved successfully')
        } else {
          console.log('[AutoSave] No changes detected, skipping save')
        }
      } catch (error) {
        console.error('[AutoSave] Failed to save workspace:', error)
      }
    }
    
    // 初回実行
    autoSave()
    
    // 定期実行
    const intervalId = setInterval(autoSave, interval)
    
    return () => {
      clearInterval(intervalId)
    }
  }, [enabled, workspace, selectedDataKeys, interval])
  
  // 手動保存トリガー
  const triggerSave = async () => {
    if (!workspace?.id) return
    
    try {
      await chartConfigService.updateWorkspace(workspace.id, {
        selectedDataKeys,
        updatedAt: new Date()
      })
      
      lastSavedDataRef.current = {
        selectedDataKeys: [...selectedDataKeys],
        workspaceUpdatedAt: new Date()
      }
      
      console.log('[AutoSave] Manual save completed')
    } catch (error) {
      console.error('[AutoSave] Failed to manually save workspace:', error)
      throw error
    }
  }
  
  return { triggerSave }
}