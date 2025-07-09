/**
 * Centralized color service for consistent color assignment across the application
 */

// Default color palette (matching uplotUtils.ts colors)
const DEFAULT_COLORS = [
  'rgb(99, 110, 250)',   // Blue
  'rgb(239, 85, 59)',    // Red
  'rgb(0, 204, 150)',    // Green
  'rgb(171, 99, 250)',   // Purple
  'rgb(255, 161, 90)',   // Orange
  'rgb(25, 211, 243)',   // Cyan
  'rgb(255, 102, 146)',  // Pink
  'rgb(182, 232, 128)',  // Light green
  'rgb(255, 151, 255)',  // Light purple
  'rgb(254, 203, 82)'    // Yellow
]

class ColorService {
  private colorCache: Map<number, string> = new Map()
  private dataIdColorIndex: Map<number, number> = new Map()
  private nextColorIndex = 0

  /**
   * Get a consistent color for a data ID
   * Colors are assigned sequentially and cached for consistency
   */
  getColorForDataId(dataId: number): string {
    // Check cache first
    if (this.colorCache.has(dataId)) {
      return this.colorCache.get(dataId)!
    }

    // Assign next available color
    let colorIndex: number
    if (this.dataIdColorIndex.has(dataId)) {
      colorIndex = this.dataIdColorIndex.get(dataId)!
    } else {
      colorIndex = this.nextColorIndex % DEFAULT_COLORS.length
      this.dataIdColorIndex.set(dataId, colorIndex)
      this.nextColorIndex++
    }

    const color = DEFAULT_COLORS[colorIndex]
    this.colorCache.set(dataId, color)
    return color
  }

  /**
   * Get colors for multiple data IDs
   */
  getColorsForDataIds(dataIds: number[]): Map<number, string> {
    const colors = new Map<number, string>()
    dataIds.forEach(id => {
      colors.set(id, this.getColorForDataId(id))
    })
    return colors
  }

  /**
   * Generate colors for a specific count (for compatibility with existing code)
   */
  generateColors(count: number): string[] {
    const colors: string[] = []
    for (let i = 0; i < count; i++) {
      colors.push(DEFAULT_COLORS[i % DEFAULT_COLORS.length])
    }
    return colors
  }

  /**
   * Reset color assignments (useful when data is reloaded)
   */
  reset(): void {
    this.colorCache.clear()
    this.dataIdColorIndex.clear()
    this.nextColorIndex = 0
  }

  /**
   * Get the color palette
   */
  getColorPalette(): string[] {
    return [...DEFAULT_COLORS]
  }
}

// Export singleton instance
export const colorService = new ColorService()