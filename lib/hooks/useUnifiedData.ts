'use client'

import { useState, useEffect } from 'react'
import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'

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
}

export interface UploadedData {
  id: string
  uploadId: string
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
      serverData: serverData
    })
    
    // Process local data
    localData.forEach(local => {
      const key = `${local.plant}-${local.machineNo}-${local.label || ''}`
      processedIds.add(key)
      
      // Check if this data exists on server
      const serverMatch = serverData.find(s => {
        const match = s.plantNm === local.plant && 
          s.machineNo === local.machineNo &&
          (s.label === local.label || (!s.label && !local.label))
        
        if (match) {
          console.log('[useUnifiedData] Found match:', {
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
      setData(unifiedData)
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