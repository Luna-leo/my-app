import { LayoutOption } from '@/components/layout/LayoutSelector'

const LAYOUT_STORAGE_KEY = 'chart-grid-layout'

export const layoutService = {
  /**
   * Save layout preference to localStorage
   */
  saveLayout(layout: LayoutOption | null): void {
    if (typeof window === 'undefined') return
    
    if (layout) {
      localStorage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(layout))
    } else {
      localStorage.removeItem(LAYOUT_STORAGE_KEY)
    }
  },

  /**
   * Load layout preference from localStorage
   */
  loadLayout(): LayoutOption | null {
    if (typeof window === 'undefined') return null
    
    try {
      const stored = localStorage.getItem(LAYOUT_STORAGE_KEY)
      if (stored) {
        const layout = JSON.parse(stored) as LayoutOption
        // Validate the loaded data
        if (
          typeof layout.rows === 'number' &&
          typeof layout.cols === 'number' &&
          layout.rows >= 1 && layout.rows <= 4 &&
          layout.cols >= 1 && layout.cols <= 4
        ) {
          return layout
        }
      }
    } catch (error) {
      console.error('Failed to load layout preference:', error)
    }
    
    return null
  },

  /**
   * Clear layout preference
   */
  clearLayout(): void {
    if (typeof window === 'undefined') return
    localStorage.removeItem(LAYOUT_STORAGE_KEY)
  }
}