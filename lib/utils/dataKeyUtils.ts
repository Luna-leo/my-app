import { Metadata } from '@/lib/db/schema'

/**
 * Generate a unique data key from metadata
 * Format: plant:machineNo:dataSource:dataStartTime:dataEndTime
 * 
 * This key is used to identify data uniquely across different users/systems
 * Label and event are excluded as they are descriptive fields that don't affect the actual data
 */
export function generateDataKey(metadata: {
  plant: string
  machineNo: string
  dataSource: 'CASS' | 'Chinami'
  dataStartTime?: Date
  dataEndTime?: Date
}): string {
  const parts = [
    metadata.plant,
    metadata.machineNo,
    metadata.dataSource,
    metadata.dataStartTime ? metadata.dataStartTime.toISOString() : 'null',
    metadata.dataEndTime ? metadata.dataEndTime.toISOString() : 'null'
  ]
  
  return parts.join(':')
}

/**
 * Parse a data key back into its components
 */
export function parseDataKey(dataKey: string): {
  plant: string
  machineNo: string
  dataSource: 'CASS' | 'Chinami'
  dataStartTime?: Date
  dataEndTime?: Date
} | null {
  const parts = dataKey.split(':')
  
  if (parts.length !== 5) {
    console.error('Invalid data key format:', dataKey)
    return null
  }
  
  const [plant, machineNo, dataSource, dataStartTimeStr, dataEndTimeStr] = parts
  
  if (dataSource !== 'CASS' && dataSource !== 'Chinami') {
    console.error('Invalid data source in key:', dataSource)
    return null
  }
  
  return {
    plant,
    machineNo,
    dataSource,
    dataStartTime: dataStartTimeStr === 'null' ? undefined : new Date(dataStartTimeStr),
    dataEndTime: dataEndTimeStr === 'null' ? undefined : new Date(dataEndTimeStr)
  }
}

/**
 * Check if two metadata objects represent the same data
 */
export function isSameData(metadata1: Metadata, metadata2: Metadata): boolean {
  return generateDataKey(metadata1) === generateDataKey(metadata2)
}