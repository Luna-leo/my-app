import { db } from '@/lib/db'
import { Metadata } from '@/lib/db/schema'

class MetadataService {
  private metadataCache: Map<number, Metadata> = new Map()

  /**
   * Get metadata by ID with caching
   */
  async getMetadataById(id: number): Promise<Metadata | undefined> {
    // Check cache first
    if (this.metadataCache.has(id)) {
      return this.metadataCache.get(id)
    }

    // Fetch from database
    const metadata = await db.metadata.get(id)
    if (metadata) {
      this.metadataCache.set(id, metadata)
    }
    return metadata
  }

  /**
   * Get multiple metadata entries by IDs
   */
  async getMetadataByIds(ids: number[]): Promise<Map<number, Metadata>> {
    const result = new Map<number, Metadata>()
    const uncachedIds: number[] = []

    // Check cache for each ID
    for (const id of ids) {
      const cached = this.metadataCache.get(id)
      if (cached) {
        result.set(id, cached)
      } else {
        uncachedIds.push(id)
      }
    }

    // Fetch uncached metadata from database
    if (uncachedIds.length > 0) {
      const metadataList = await db.metadata.bulkGet(uncachedIds)
      metadataList.forEach((metadata, index) => {
        if (metadata && metadata.id) {
          this.metadataCache.set(metadata.id, metadata)
          result.set(metadata.id, metadata)
        }
      })
    }

    return result
  }

  /**
   * Get display label for metadata
   */
  getDisplayLabel(metadata: Metadata | undefined, id: number): string {
    if (!metadata) {
      return `Data ${id}`
    }
    return metadata.label || `${metadata.plant}-${metadata.machineNo}` || `Data ${id}`
  }

  /**
   * Get labels for multiple IDs
   */
  async getLabelsForIds(ids: number[]): Promise<Map<number, string>> {
    const metadataMap = await this.getMetadataByIds(ids)
    const labels = new Map<number, string>()

    for (const id of ids) {
      const metadata = metadataMap.get(id)
      labels.set(id, this.getDisplayLabel(metadata, id))
    }

    return labels
  }

  /**
   * Clear the cache
   */
  clearCache(): void {
    this.metadataCache.clear()
  }
}

// Export singleton instance
export const metadataService = new MetadataService()