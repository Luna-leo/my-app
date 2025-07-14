import { db } from '@/lib/db'
import { generateDataKey } from '@/lib/utils/dataKeyUtils'
import { Metadata, Workspace } from '@/lib/db/schema'

/**
 * Manually ensure all metadata has dataKey with timeout
 */
export async function ensureMetadataHasDataKeys() {
  const timeout = 5000 // 5 second timeout
  
  try {
    console.log('[ensureMetadataHasDataKeys] Starting...')
    
    let allMetadata: Metadata[];
    try {
      allMetadata = await Promise.race([
        db.metadata.toArray(),
        new Promise<Metadata[]>((_, reject) => 
          setTimeout(() => reject(new Error('Metadata query timeout')), timeout)
        )
      ])
    } catch (e) {
      throw e;
    }
    
    let updated = 0
    
    for (const metadata of allMetadata) {
      if (!metadata.dataKey) {
        const dataKey = generateDataKey({
          plant: metadata.plant,
          machineNo: metadata.machineNo,
          dataSource: metadata.dataSource,
          dataStartTime: metadata.dataStartTime,
          dataEndTime: metadata.dataEndTime
        })
        
        await db.metadata.update(metadata.id!, { dataKey })
        updated++
        console.log(`[ensureMetadataHasDataKeys] Updated metadata ${metadata.id} with dataKey: ${dataKey}`)
      }
    }
    
    console.log(`[ensureMetadataHasDataKeys] Updated ${updated} out of ${allMetadata.length} metadata records`)
    return updated
  } catch (error) {
    console.error('[ensureMetadataHasDataKeys] Error:', error)
    return 0
  }
}

/**
 * Get current database info with timeout
 */
export async function getDatabaseInfo() {
  const timeout = 5000 // 5 second timeout
  
  try {
    console.log('[getDatabaseInfo] Starting database query...')
    
    const metadata = await Promise.race([
      db.metadata.toArray(),
      new Promise<Metadata[]>((_, reject) => 
        setTimeout(() => reject(new Error('Metadata query timeout')), timeout)
      )
    ])
    
    const workspaces = await Promise.race([
      db.workspaces.toArray(),
      new Promise<Workspace[]>((_, reject) => 
        setTimeout(() => reject(new Error('Workspaces query timeout')), timeout)
      )
    ])
    
    console.log('[getDatabaseInfo] Waiting for queries...')
    console.log('[getDatabaseInfo] Queries completed successfully')
    
    return {
      version: db.verno,
      metadataCount: metadata.length,
      metadataWithDataKey: metadata.filter(m => !!m.dataKey).length,
      workspacesCount: workspaces.length,
      activeWorkspace: workspaces.find(w => w.isActive),
      workspaces: workspaces.map(w => ({
        id: w.id,
        name: w.name,
        isActive: w.isActive,
        selectedDataKeys: w.selectedDataKeys || []
      }))
    }
  } catch (error) {
    console.error('[getDatabaseInfo] Error:', error)
    // Return default values on error
    return {
      version: 0,
      metadataCount: 0,
      metadataWithDataKey: 0,
      workspacesCount: 0,
      activeWorkspace: undefined,
      workspaces: []
    }
  }
}

/**
 * Clean up duplicate workspaces
 * NOTE: This function is currently DISABLED because it was deleting all saved sessions
 * It should only delete actual duplicates (same name, same creation time, etc.)
 */
export async function cleanupDuplicateWorkspaces() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const workspaces = await db.workspaces.toArray()
  console.log(`[cleanupDuplicateWorkspaces] WARNING: This function is currently destructive and should not be used`)
  
  // DISABLED: This was deleting all non-active workspaces, which is wrong
  // Non-active workspaces are saved sessions, not duplicates!
  return 0
  
  // TODO: Implement proper duplicate detection based on:
  // - Same name AND same creation time (within a few seconds)
  // - Or workspaces with no charts and no data selection
  // - But NEVER delete workspaces just because they're not active
}

/**
 * Fix isActive field type in workspaces with timeout
 * Some older data might have isActive as 1/0 instead of true/false
 */
export async function fixWorkspaceIsActiveField() {
  const timeout = 5000 // 5 second timeout
  
  try {
    console.log('[fixWorkspaceIsActiveField] Starting...')
    
    const workspaces = await Promise.race([
      db.workspaces.toArray(),
      new Promise<Workspace[]>((_, reject) => 
        setTimeout(() => reject(new Error('Workspaces query timeout')), timeout)
      )
    ])
    
    console.log(`[fixWorkspaceIsActiveField] Found ${workspaces.length} workspaces`)
    
    // Use a transaction to ensure atomicity
    return await db.transaction('rw', db.workspaces, async () => {
      let fixed = 0
      let activeWorkspaceId: string | null = null
      
      // First pass: Fix numeric isActive values and identify which should be active
      for (const workspace of workspaces) {
        console.log(`[fixWorkspaceIsActiveField] Checking workspace ${workspace.id}: isActive=${workspace.isActive} (type: ${typeof workspace.isActive})`)
        
        // Check if isActive is a number (1 or 0) instead of boolean
        if (typeof workspace.isActive === 'number') {
          if (workspace.isActive === 1 && !activeWorkspaceId) {
            // Remember the first workspace that should be active
            activeWorkspaceId = workspace.id!
          }
          fixed++
        } else if (workspace.isActive === true && !activeWorkspaceId) {
          // Remember the first already-active workspace
          activeWorkspaceId = workspace.id!
        }
      }
      
      // Second pass: Deactivate all workspaces first to avoid constraint violations
      console.log('[fixWorkspaceIsActiveField] Deactivating all workspaces...')
      for (const workspace of workspaces) {
        try {
          await db.workspaces.update(workspace.id!, { isActive: false })
        } catch (updateError) {
          console.error(`[fixWorkspaceIsActiveField] Error deactivating workspace ${workspace.id}:`, updateError)
        }
      }
      
      // Third pass: Activate the chosen workspace
      if (!activeWorkspaceId && workspaces.length > 0) {
        // No active workspace found, use the first one
        activeWorkspaceId = workspaces[0].id!
        fixed++
      }
      
      if (activeWorkspaceId) {
        console.log(`[fixWorkspaceIsActiveField] Activating workspace ${activeWorkspaceId}`)
        try {
          await db.workspaces.update(activeWorkspaceId, { isActive: true })
          console.log(`[fixWorkspaceIsActiveField] Successfully activated workspace ${activeWorkspaceId}`)
        } catch (activateError) {
          console.error(`[fixWorkspaceIsActiveField] Error activating workspace ${activeWorkspaceId}:`, activateError)
          throw activateError
        }
      }
      
      console.log(`[fixWorkspaceIsActiveField] Fixed ${fixed} workspaces`)
      return fixed
    })
  } catch (error) {
    console.error('[fixWorkspaceIsActiveField] Error:', error)
    if (error instanceof Error) {
      console.error('[fixWorkspaceIsActiveField] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
    }
    return 0
  }
}