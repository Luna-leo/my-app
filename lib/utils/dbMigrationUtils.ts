import { db } from '@/lib/db'
import { generateDataKey } from '@/lib/utils/dataKeyUtils'

/**
 * Manually ensure all metadata has dataKey
 */
export async function ensureMetadataHasDataKeys() {
  const allMetadata = await db.metadata.toArray()
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
}

/**
 * Get current database info
 */
export async function getDatabaseInfo() {
  const metadata = await db.metadata.toArray()
  const workspaces = await db.workspaces.toArray()
  
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
}

/**
 * Clean up duplicate workspaces
 */
export async function cleanupDuplicateWorkspaces() {
  const workspaces = await db.workspaces.toArray()
  console.log(`[cleanupDuplicateWorkspaces] Found ${workspaces.length} workspaces`)
  
  if (workspaces.length <= 1) {
    // Ensure the single workspace is active
    if (workspaces.length === 1 && workspaces[0].id && !workspaces[0].isActive) {
      await db.workspaces.update(workspaces[0].id, { isActive: true })
      console.log(`[cleanupDuplicateWorkspaces] Made single workspace active`)
    }
    return 0
  }
  
  // Keep only the active workspace or the first one
  const activeWorkspace = workspaces.find(w => w.isActive) || workspaces[0]
  const toDelete = workspaces.filter(w => w.id !== activeWorkspace.id)
  
  // Delete duplicate workspaces
  for (const workspace of toDelete) {
    if (workspace.id) {
      await db.workspaces.delete(workspace.id)
    }
  }
  
  // Ensure the remaining workspace is active
  if (activeWorkspace.id && !activeWorkspace.isActive) {
    await db.workspaces.update(activeWorkspace.id, { isActive: true })
  }
  
  console.log(`[cleanupDuplicateWorkspaces] Deleted ${toDelete.length} duplicate workspaces`)
  return toDelete.length
}

/**
 * Fix isActive field type in workspaces
 * Some older data might have isActive as 1/0 instead of true/false
 */
export async function fixWorkspaceIsActiveField() {
  const workspaces = await db.workspaces.toArray()
  let fixed = 0
  
  for (const workspace of workspaces) {
    // Check if isActive is a number (1 or 0) instead of boolean
    if (typeof workspace.isActive === 'number') {
      const isActive = workspace.isActive === 1
      await db.workspaces.update(workspace.id!, { isActive })
      fixed++
      console.log(`[fixWorkspaceIsActiveField] Fixed workspace ${workspace.id} isActive: ${workspace.isActive} -> ${isActive}`)
    }
  }
  
  // Ensure at least one workspace is active
  const allWorkspacesForActive = await db.workspaces.toArray()
  const hasActiveWorkspace = allWorkspacesForActive.some(w => w.isActive === true)
  if (!hasActiveWorkspace && allWorkspacesForActive.length > 0) {
    await db.workspaces.update(allWorkspacesForActive[0].id!, { isActive: true })
    console.log(`[fixWorkspaceIsActiveField] No active workspace found, activated workspace ${allWorkspacesForActive[0].id}`)
    fixed++
  }
  
  console.log(`[fixWorkspaceIsActiveField] Fixed ${fixed} workspaces`)
  return fixed
}