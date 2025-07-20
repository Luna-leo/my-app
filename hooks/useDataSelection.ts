import { useState, useEffect, useCallback } from 'react'
import { db } from '@/lib/db'
import { chartConfigService } from '@/lib/services/chartConfigurationService'
import { metadataService } from '@/lib/services/metadataService'
import { colorService } from '@/lib/services/colorService'

export function useDataSelection() {
  const [selectedDataKeys, setSelectedDataKeys] = useState<string[]>([])
  const [selectedDataIds, setSelectedDataIds] = useState<number[]>([])
  const [selectedDataLabels, setSelectedDataLabels] = useState<Map<number, string>>(new Map())
  const [selectedDataColors, setSelectedDataColors] = useState<Map<number, string>>(new Map())

  // Fetch labels and colors when selectedDataIds change
  useEffect(() => {
    const fetchLabelsAndColors = async () => {
      if (selectedDataIds.length > 0) {
        const labels = await metadataService.getLabelsForIds(selectedDataIds)
        const colors = colorService.getColorsForDataIds(selectedDataIds)
        setSelectedDataLabels(labels)
        setSelectedDataColors(colors)
      } else {
        setSelectedDataLabels(new Map())
        setSelectedDataColors(new Map())
      }
    }
    fetchLabelsAndColors()
  }, [selectedDataIds])

  const handleSelectionChange = useCallback(async (newIds: number[]) => {
    setSelectedDataIds(newIds)
    
    // Convert IDs to data keys
    if (newIds.length > 0) {
      const metadata = await db.metadata.where('id').anyOf(newIds).toArray()
      console.log('[handleSelectionChange] metadata:', metadata)
      const dataKeys = metadata.map(m => m.dataKey).filter(key => key !== undefined)
      console.log('[handleSelectionChange] dataKeys:', dataKeys)
      setSelectedDataKeys(dataKeys)
      
      // Save to workspace
      await chartConfigService.updateActiveWorkspaceSelectedDataKeys(dataKeys)
    } else {
      setSelectedDataKeys([])
      await chartConfigService.updateActiveWorkspaceSelectedDataKeys([])
    }
  }, [])

  return {
    selectedDataKeys,
    setSelectedDataKeys,
    selectedDataIds,
    setSelectedDataIds,
    selectedDataLabels,
    selectedDataColors,
    handleSelectionChange,
  }
}