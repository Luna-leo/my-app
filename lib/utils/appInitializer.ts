import { 
  getDatabaseInfo, 
  cleanupDuplicateActiveWorkspaces, 
  fixWorkspaceIsActiveField, 
  ensureOneWorkspaceActive, 
  ensureMetadataHasDataKeys 
} from '@/lib/utils/dbMigrationUtils'
import { StartupService } from '@/lib/services/startupService'
import { ReadonlyURLSearchParams } from 'next/navigation'

export interface InitializationResult {
  mode: 'interactive' | 'clean' | 'restore'
  workspaceId?: string
}

export async function initializeApp(
  searchParams: ReadonlyURLSearchParams | null
): Promise<InitializationResult> {
  console.log('[initializeApp] Starting...')
  
  // Skip database checks if URL parameter is set
  const skipDbChecks = searchParams?.get('skipDbChecks') === 'true'
  
  if (!skipDbChecks) {
    // Check and fix database issues before proceeding
    try {
      console.log('[initializeApp] Starting database checks...')
      const info = await getDatabaseInfo()
      console.log('[Debug] Database info:', info)
      
      // First clean up duplicate active workspaces
      console.log('[initializeApp] Cleaning up duplicate active workspaces...')
      try {
        const cleaned = await cleanupDuplicateActiveWorkspaces()
        if (cleaned > 0) {
          console.log(`[Debug] Deactivated ${cleaned} duplicate active workspaces`)
        }
      } catch (cleanupError) {
        console.error('[initializeApp] Error cleaning up duplicate active workspaces:', cleanupError)
      }
      
      // Then fix workspace isActive field type if needed
      console.log('[initializeApp] Checking workspace isActive fields...')
      try {
        const fixedWorkspaces = await fixWorkspaceIsActiveField()
        if (fixedWorkspaces > 0) {
          console.log('[Debug] Fixed workspace isActive fields')
        }
      } catch (fixError) {
        console.error('[initializeApp] Error fixing workspace isActive fields:', fixError)
        
        // If it's a constraint error, log more details
        if (fixError instanceof Error && fixError.name === 'ConstraintError') {
          console.error('[initializeApp] Constraint error details:', {
            message: fixError.message,
            stack: fixError.stack
          })
          console.log('[initializeApp] This error might be due to database corruption.')
          console.log('[initializeApp] You can skip database checks by adding ?skipDbChecks=true to the URL')
          
          // Try a simpler approach as fallback
          console.log('[initializeApp] Attempting simpler workspace fix...')
          try {
            const ensured = await ensureOneWorkspaceActive()
            if (ensured) {
              console.log('[initializeApp] Successfully ensured one workspace is active')
            } else {
              console.log('[initializeApp] Could not ensure active workspace, but continuing anyway')
            }
          } catch (ensureError) {
            console.error('[initializeApp] Even the simple fix failed:', ensureError)
          }
        }
        
        // Continue without fixing - the app should still work
        console.log('[initializeApp] Continuing despite the error...')
      }
      
      // Fix metadata without dataKey if needed
      if (info.metadataCount > 0 && info.metadataWithDataKey === 0) {
        console.log('[Debug] Fixing metadata without dataKey...')
        const updated = await ensureMetadataHasDataKeys()
        console.log('[Debug] Fixed metadata:', updated)
      }
      
      console.log('[initializeApp] Database checks completed')
    } catch (dbError) {
      console.error('[initializeApp] Database check error:', dbError)
      console.log('[initializeApp] Continuing without database checks...')
      // Continue initialization even if database checks fail
    }
  } else {
    console.log('[initializeApp] Skipping database checks (skipDbChecks=true)')
  }
  
  // Now determine startup mode and proceed
  const startupOptions = StartupService.getEffectiveMode(searchParams)
  console.log('[Startup] Mode:', startupOptions)
  
  return {
    mode: startupOptions.mode === 'clean' ? 'clean' : 
          startupOptions.mode === 'interactive' ? 'interactive' : 
          'restore',
    workspaceId: startupOptions.workspaceId
  }
}