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
 * Clean up duplicate active workspaces
 * Ensures only one workspace is active at a time
 */
export async function cleanupDuplicateActiveWorkspaces() {
  try {
    console.log('[cleanupDuplicateActiveWorkspaces] Starting cleanup...')
    
    const workspaces = await db.workspaces.toArray()
    const activeWorkspaces = workspaces.filter(w => w.isActive === true || (w.isActive as unknown) === 1)
    
    console.log(`[cleanupDuplicateActiveWorkspaces] Found ${activeWorkspaces.length} active workspaces`)
    
    if (activeWorkspaces.length > 1) {
      // Keep the most recently updated one as active
      const sortedActive = activeWorkspaces.sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return dateB - dateA // Most recent first
      })
      
      console.log('[cleanupDuplicateActiveWorkspaces] Keeping workspace as active:', sortedActive[0].id)
      
      // Deactivate all except the first one using modify for better performance
      const idsToDeactivate = sortedActive.slice(1).map(w => w.id!)
      try {
        await db.workspaces.where('id').anyOf(idsToDeactivate).modify({ isActive: false })
        console.log(`[cleanupDuplicateActiveWorkspaces] Deactivated ${idsToDeactivate.length} workspaces in bulk`)
      } catch (bulkError) {
        console.error('[cleanupDuplicateActiveWorkspaces] Bulk deactivation failed, trying one by one:', bulkError)
        // Fall back to one-by-one updates
        for (let i = 1; i < sortedActive.length; i++) {
          try {
            console.log('[cleanupDuplicateActiveWorkspaces] Deactivating workspace:', sortedActive[i].id)
            await db.workspaces.update(sortedActive[i].id!, { isActive: false })
          } catch (updateError) {
            console.error(`[cleanupDuplicateActiveWorkspaces] Failed to deactivate workspace ${sortedActive[i].id}:`, updateError)
          }
        }
      }
      
      return sortedActive.length - 1 // Return number of workspaces deactivated
    }
    
    return 0
  } catch (error) {
    console.error('[cleanupDuplicateActiveWorkspaces] Error:', error)
    return 0
  }
}

/**
 * Simple function to ensure at least one workspace is active
 * This is a minimal fix that doesn't worry about data types
 */
export async function ensureOneWorkspaceActive() {
  try {
    console.log('[ensureOneWorkspaceActive] Ensuring one workspace is active...')
    
    const workspaces = await db.workspaces.toArray()
    if (workspaces.length === 0) {
      console.log('[ensureOneWorkspaceActive] No workspaces found')
      return false
    }
    
    // Check if any workspace is currently active
    const hasActive = workspaces.some(w => w.isActive === true || (w.isActive as unknown) === 1)
    
    if (!hasActive) {
      console.log('[ensureOneWorkspaceActive] No active workspace found, activating the most recent one')
      
      // Sort by updatedAt to get the most recent
      const sorted = [...workspaces].sort((a, b) => {
        const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
        const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
        return dateB - dateA
      })
      
      const workspaceToActivate = sorted[0]
      
      try {
        // Use modify instead of update to avoid some constraints
        await db.workspaces.where('id').equals(workspaceToActivate.id!).modify({ isActive: true })
        console.log(`[ensureOneWorkspaceActive] Successfully activated workspace ${workspaceToActivate.id}`)
        return true
      } catch (activateError) {
        console.error('[ensureOneWorkspaceActive] Failed to activate workspace:', activateError)
        return false
      }
    }
    
    console.log('[ensureOneWorkspaceActive] Already has an active workspace')
    return true
  } catch (error) {
    console.error('[ensureOneWorkspaceActive] Error:', error)
    return false
  }
}

/**
 * Emergency fix for workspace table when standard methods fail
 * This bypasses some Dexie constraints and works directly with the data
 */
export async function emergencyFixWorkspaceActive() {
  try {
    console.log('[emergencyFixWorkspaceActive] Starting emergency fix...')
    
    // Get the raw IndexedDB database
    const idb = db.backendDB()
    if (!idb) {
      console.error('[emergencyFixWorkspaceActive] Could not access backend database')
      return 0
    }
    
    const transaction = idb.transaction(['workspaces'], 'readwrite')
    const store = transaction.objectStore('workspaces')
    
    // Get all records
    const getAllRequest = store.getAll()
    
    return new Promise<number>((resolve, reject) => {
      getAllRequest.onsuccess = async () => {
        const workspaces = getAllRequest.result
        console.log(`[emergencyFixWorkspaceActive] Found ${workspaces.length} workspaces in raw store`)
        
        if (workspaces.length === 0) {
          resolve(0)
          return
        }
        
        let fixed = 0
        let activeWorkspaceId: string | null = null
        
        // Find the workspace that should be active
        for (const workspace of workspaces) {
          if (workspace.isActive === true || (workspace.isActive as unknown) === 1) {
            if (!activeWorkspaceId) {
              activeWorkspaceId = workspace.id
            }
          }
        }
        
        // If no active workspace, use the most recent one
        if (!activeWorkspaceId) {
          const sorted = workspaces.sort((a: Workspace, b: Workspace) => {
            const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
            const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
            return dateB - dateA
          })
          activeWorkspaceId = sorted[0]?.id
        }
        
        // Update all workspaces
        for (const workspace of workspaces) {
          workspace.isActive = workspace.id === activeWorkspaceId
          
          const putRequest = store.put(workspace)
          putRequest.onsuccess = () => {
            fixed++
            console.log(`[emergencyFixWorkspaceActive] Updated workspace ${workspace.id}: isActive=${workspace.isActive}`)
          }
          putRequest.onerror = (event) => {
            console.error(`[emergencyFixWorkspaceActive] Failed to update workspace ${workspace.id}:`, event)
          }
        }
        
        transaction.oncomplete = () => {
          console.log(`[emergencyFixWorkspaceActive] Emergency fix completed. Fixed ${fixed} workspaces`)
          resolve(fixed)
        }
        
        transaction.onerror = (event) => {
          console.error('[emergencyFixWorkspaceActive] Transaction error:', event)
          reject(new Error('Emergency fix transaction failed'))
        }
      }
      
      getAllRequest.onerror = (event) => {
        console.error('[emergencyFixWorkspaceActive] Failed to get workspaces:', event)
        reject(new Error('Failed to get workspaces'))
      }
    })
  } catch (error) {
    console.error('[emergencyFixWorkspaceActive] Emergency fix error:', error)
    return 0
  }
}

/**
 * Fix isActive field type in workspaces with timeout
 * Some older data might have isActive as 1/0 instead of true/false
 */
export async function fixWorkspaceIsActiveField() {
  const timeout = 5000 // 5 second timeout
  
  try {
    console.log('[fixWorkspaceIsActiveField] Starting...')
    
    // First, get all workspaces without using a transaction
    const workspaces = await Promise.race([
      db.workspaces.toArray(),
      new Promise<Workspace[]>((_, reject) => 
        setTimeout(() => reject(new Error('Workspaces query timeout')), timeout)
      )
    ])
    
    console.log(`[fixWorkspaceIsActiveField] Found ${workspaces.length} workspaces`)
    
    if (workspaces.length === 0) {
      console.log('[fixWorkspaceIsActiveField] No workspaces found, skipping')
      return 0
    }
    
    let fixed = 0
    let needsFix = false
    let activeWorkspaceId: string | null = null
    let hasNumericValues = false
    
    // Check if we need to fix anything
    for (const workspace of workspaces) {
      console.log(`[fixWorkspaceIsActiveField] Workspace ${workspace.id}: isActive=${workspace.isActive} (type: ${typeof workspace.isActive})`)
      
      if (typeof workspace.isActive === 'number') {
        hasNumericValues = true
        needsFix = true
        if (workspace.isActive === 1 && !activeWorkspaceId) {
          activeWorkspaceId = workspace.id!
        }
      } else if (workspace.isActive === true) {
        if (!activeWorkspaceId) {
          activeWorkspaceId = workspace.id!
        }
      }
    }
    
    // Count how many workspaces are currently active
    const activeCount = workspaces.filter(w => w.isActive === true || (w.isActive as unknown) === 1).length
    
    // If there are multiple active workspaces or no active workspace, we need to fix
    if (activeCount > 1 || activeCount === 0) {
      needsFix = true
    }
    
    if (!needsFix) {
      console.log('[fixWorkspaceIsActiveField] No fixes needed')
      return 0
    }
    
    console.log(`[fixWorkspaceIsActiveField] Needs fix: hasNumericValues=${hasNumericValues}, activeCount=${activeCount}`)
    
    // Method 1: Try to fix without a transaction first (safer for constraint issues)
    try {
      console.log('[fixWorkspaceIsActiveField] Attempting fix without transaction...')
      
      // Step 1: Deactivate all workspaces one by one
      for (const workspace of workspaces) {
        try {
          await db.workspaces.where('id').equals(workspace.id!).modify({ isActive: false })
          console.log(`[fixWorkspaceIsActiveField] Deactivated workspace ${workspace.id}`)
        } catch (modifyError) {
          console.error(`[fixWorkspaceIsActiveField] Error deactivating workspace ${workspace.id}:`, modifyError)
          // Try update method as fallback
          try {
            await db.workspaces.update(workspace.id!, { isActive: false })
          } catch (updateError) {
            console.error(`[fixWorkspaceIsActiveField] Update also failed for workspace ${workspace.id}:`, updateError)
          }
        }
      }
      
      // Small delay to ensure all updates are processed
      await new Promise(resolve => setTimeout(resolve, 100))
      
      // Step 2: Choose and activate one workspace
      if (!activeWorkspaceId && workspaces.length > 0) {
        // Sort by updatedAt to get the most recent one
        const sortedWorkspaces = [...workspaces].sort((a, b) => {
          const dateA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0
          const dateB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0
          return dateB - dateA
        })
        activeWorkspaceId = sortedWorkspaces[0].id!
      }
      
      if (activeWorkspaceId) {
        console.log(`[fixWorkspaceIsActiveField] Activating workspace ${activeWorkspaceId}`)
        try {
          await db.workspaces.where('id').equals(activeWorkspaceId).modify({ isActive: true })
          console.log(`[fixWorkspaceIsActiveField] Successfully activated workspace ${activeWorkspaceId}`)
          fixed = hasNumericValues ? workspaces.filter(w => typeof w.isActive === 'number').length : 1
        } catch (activateError) {
          console.error(`[fixWorkspaceIsActiveField] Error activating workspace:`, activateError)
          // Try update method as fallback
          try {
            await db.workspaces.update(activeWorkspaceId, { isActive: true })
            console.log(`[fixWorkspaceIsActiveField] Successfully activated workspace ${activeWorkspaceId} using update`)
            fixed = hasNumericValues ? workspaces.filter(w => typeof w.isActive === 'number').length : 1
          } catch (updateError) {
            console.error(`[fixWorkspaceIsActiveField] Update also failed:`, updateError)
            throw updateError
          }
        }
      }
      
      console.log(`[fixWorkspaceIsActiveField] Fixed ${fixed} workspaces without transaction`)
      return fixed
      
    } catch (nonTransactionError) {
      console.error('[fixWorkspaceIsActiveField] Non-transaction approach failed:', nonTransactionError)
      
      // Method 2: Fall back to transaction approach if needed
      console.log('[fixWorkspaceIsActiveField] Attempting transaction-based fix...')
      return await db.transaction('rw', db.workspaces, async () => {
        // Deactivate all
        await db.workspaces.toCollection().modify({ isActive: false })
        
        // Activate one
        if (activeWorkspaceId) {
          await db.workspaces.update(activeWorkspaceId, { isActive: true })
        }
        
        return fixed
      })
    }
  } catch (error) {
    console.error('[fixWorkspaceIsActiveField] Error:', error)
    if (error instanceof Error) {
      console.error('[fixWorkspaceIsActiveField] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack
      })
      
      // Check if it's a Dexie error
      if (error.name === 'ConstraintError') {
        console.error('[fixWorkspaceIsActiveField] Constraint error detected. This might be due to:')
        console.error('1. Multiple workspaces with isActive=true')
        console.error('2. Database schema mismatch')
        console.error('3. Corrupted database state')
        console.error('Consider using ?skipDbChecks=true URL parameter to bypass this check')
        
        // Try emergency fix as last resort
        console.log('[fixWorkspaceIsActiveField] Attempting emergency fix...')
        try {
          const emergencyFixed = await emergencyFixWorkspaceActive()
          if (emergencyFixed > 0) {
            console.log(`[fixWorkspaceIsActiveField] Emergency fix succeeded, fixed ${emergencyFixed} workspaces`)
            return emergencyFixed
          }
        } catch (emergencyError) {
          console.error('[fixWorkspaceIsActiveField] Emergency fix also failed:', emergencyError)
        }
      }
    }
    
    // Re-throw the error if it's a constraint error so the caller can handle it
    if (error instanceof Error && error.name === 'ConstraintError') {
      throw error
    }
    
    return 0
  }
}