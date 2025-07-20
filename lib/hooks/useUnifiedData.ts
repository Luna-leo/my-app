'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'
import { hybridDataService } from '@/lib/services/hybridDataService'
import { createDataPersistenceService } from '@/lib/services/dataPersistenceService'

export type DataLocation = 'local' | 'server' | 'synced'

export interface UnifiedDataItem {
  id: string
  metadata: Metadata | null
  serverData: UploadedData | null
  location: DataLocation
  syncStatus?: {
    lastLocalUpdate?: Date
    lastServerUpdate?: Date
    isOutdated?: boolean
  }
  persistenceStatus?: {
    isPersisted: boolean
    chunkCount: number
    totalSize: number
    compressionRatio?: number
    lastPersisted?: Date
  }
}

export interface UploadedData {
  id: string
  uploadId: string
  dataKey?: string
  plantNm: string
  machineNo: string
  label?: string
  startTime: string
  endTime: string
  uploadDate: string
  parameterCount: number
  recordCount: number
}

export function useUnifiedData() {
  const [data, setData] = useState<UnifiedDataItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const loadLocalData = async () => {
    try {
      const localData = await db.metadata.toArray()
      return localData
    } catch (err) {
      console.error('Failed to load local data:', err)
      return []
    }
  }

  const loadServerData = async () => {
    try {
      const response = await fetch('/api/data/list')
      
      if (!response.ok) {
        throw new Error('Failed to fetch server data')
      }
      
      const serverData = await response.json()
      return serverData.data || []
    } catch (err) {
      console.error('Failed to load server data:', err)
      return []
    }
  }

  const mergeData = (localData: Metadata[], serverData: UploadedData[]): UnifiedDataItem[] => {
    const unified: UnifiedDataItem[] = []
    const processedIds = new Set<string>()
    
    console.log('[useUnifiedData] Merging data:', {
      localCount: localData.length,
      serverCount: serverData.length,
      localDataKeys: localData.map(l => ({ 
        id: l.id, 
        dataKey: l.dataKey,
        plant: l.plant,
        machineNo: l.machineNo
      })),
      serverDataKeys: serverData.map(s => ({ 
        uploadId: s.uploadId, 
        dataKey: s.dataKey,
        plantNm: s.plantNm,
        machineNo: s.machineNo
      }))
    })
    
    // Process local data
    localData.forEach(local => {
      const key = `${local.plant}-${local.machineNo}-${local.label || ''}`
      processedIds.add(key)
      
      // Check if this data exists on server using dataKey
      const serverMatch = serverData.find(s => {
        // First try to match by dataKey
        if (local.dataKey && s.dataKey) {
          const match = s.dataKey === local.dataKey
          if (match) {
            console.log('[useUnifiedData] Found match by dataKey:', {
              local: { dataKey: local.dataKey, plant: local.plant, machineNo: local.machineNo },
              server: { dataKey: s.dataKey, plantNm: s.plantNm, machineNo: s.machineNo }
            })
          }
          return match
        }
        
        // Fallback to old matching logic
        const match = s.plantNm === local.plant && 
          s.machineNo === local.machineNo &&
          (s.label === local.label || (!s.label && !local.label))
        
        if (match) {
          console.log('[useUnifiedData] Found match by plant/machine/label:', {
            local: { plant: local.plant, machineNo: local.machineNo, label: local.label },
            server: { plantNm: s.plantNm, machineNo: s.machineNo, label: s.label }
          })
        }
        
        return match
      })
      
      if (serverMatch) {
        // Data exists in both places
        unified.push({
          id: `local-${local.id}`,
          metadata: local,
          serverData: serverMatch,
          location: 'synced',
          syncStatus: {
            lastLocalUpdate: local.importedAt,
            lastServerUpdate: new Date(serverMatch.uploadDate),
            isOutdated: local.importedAt > new Date(serverMatch.uploadDate)
          }
        })
      } else {
        // Local only
        unified.push({
          id: `local-${local.id}`,
          metadata: local,
          serverData: null,
          location: 'local'
        })
      }
    })
    
    // Process server-only data
    serverData.forEach(server => {
      const key = `${server.plantNm}-${server.machineNo}-${server.label || ''}`
      if (!processedIds.has(key)) {
        unified.push({
          id: `server-${server.uploadId}`,
          metadata: null,
          serverData: server,
          location: 'server'
        })
      }
    })
    
    return unified
  }

  const refreshData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      const [localData, serverData] = await Promise.all([
        loadLocalData(),
        loadServerData()
      ])
      
      const unifiedData = mergeData(localData, serverData)
      
      // Load persistence status for local data
      try {
        const connection = await hybridDataService.getConnection()
        if (connection) {
          const persistenceService = createDataPersistenceService(connection)
          
          // Add persistence status to unified data
          const unifiedDataWithPersistence = await Promise.all(
            unifiedData.map(async (item) => {
              if (item.metadata && item.metadata.id) {
                const status = await persistenceService.getPersistenceStatus(item.metadata.id)
                
                if (status.isPersisted) {
                  // Calculate compression ratio
                  const originalSize = status.totalRows * 100 // Estimate 100 bytes per row
                  const compressionRatio = originalSize > 0 
                    ? (originalSize - status.totalSize) / originalSize 
                    : 0
                  
                  return {
                    ...item,
                    persistenceStatus: {
                      isPersisted: status.isPersisted,
                      chunkCount: status.chunkCount,
                      totalSize: status.totalSize,
                      compressionRatio,
                      lastPersisted: status.lastUpdated
                    }
                  }
                }
              }
              return item
            })
          )
          
          setData(unifiedDataWithPersistence)
        } else {
          setData(unifiedData)
        }
      } catch (err) {
        console.warn('[useUnifiedData] Failed to load persistence status:', err)
        setData(unifiedData)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    refreshData()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return {
    data,
    loading,
    error,
    refreshData
  }
}