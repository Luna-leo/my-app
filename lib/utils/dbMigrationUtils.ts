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
 * NOTE: This function is currently DISABLED because it was deleting all saved sessions
 * It should only delete actual duplicates (same name, same creation time, etc.)
 */
export async function cleanupDuplicateWorkspaces() {
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