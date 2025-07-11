export type StartupMode = 'restore' | 'clean' | 'interactive'

export interface StartupOptions {
  mode: StartupMode
  workspaceId?: string
}

const STARTUP_MODE_KEY = 'default-startup-mode'

export class StartupService {
  /**
   * Parse URL parameters to determine startup mode
   */
  static parseUrlParams(searchParams: URLSearchParams | null): StartupOptions {
    console.log('[StartupService] parseUrlParams called with:', searchParams?.toString())
    
    if (!searchParams) {
      return { mode: 'restore' }
    }

    // Check for clean start
    if (searchParams.get('clean') === 'true') {
      console.log('[StartupService] Clean mode detected')
      return { mode: 'clean' }
    }

    // Check for specific workspace
    const workspaceId = searchParams.get('workspace')
    if (workspaceId) {
      console.log('[StartupService] Workspace mode detected:', workspaceId)
      return { mode: 'restore', workspaceId }
    }

    // Default to restore mode
    return { mode: 'restore' }
  }

  /**
   * Get default startup mode from localStorage
   */
  static getDefaultMode(): StartupMode {
    if (typeof window === 'undefined') return 'restore'
    
    try {
      const stored = localStorage.getItem(STARTUP_MODE_KEY)
      console.log('[StartupService] Stored mode in localStorage:', stored)
      if (stored && ['restore', 'clean', 'interactive'].includes(stored)) {
        return stored as StartupMode
      }
    } catch (error) {
      console.error('Failed to load startup mode preference:', error)
    }
    
    return 'restore'
  }

  /**
   * Save default startup mode to localStorage
   */
  static saveDefaultMode(mode: StartupMode): void {
    if (typeof window === 'undefined') return
    
    try {
      localStorage.setItem(STARTUP_MODE_KEY, mode)
    } catch (error) {
      console.error('Failed to save startup mode preference:', error)
    }
  }

  /**
   * Determine the effective startup mode based on URL params and default settings
   */
  static getEffectiveMode(urlParams: URLSearchParams | null): StartupOptions {
    // URL parameters take precedence
    const urlOptions = this.parseUrlParams(urlParams)
    console.log('[StartupService] URL options:', urlOptions)
    
    if (urlOptions.mode !== 'restore' || urlOptions.workspaceId) {
      console.log('[StartupService] Using URL options')
      return urlOptions
    }

    // Otherwise use default mode
    const defaultMode = this.getDefaultMode()
    console.log('[StartupService] Using default mode:', defaultMode)
    return { mode: defaultMode }
  }

  /**
   * Generate URL for a specific startup mode
   */
  static generateUrl(mode: StartupMode, workspaceId?: string): string {
    const url = new URL(window.location.href)
    url.search = '' // Clear existing params
    
    if (mode === 'clean') {
      url.searchParams.set('clean', 'true')
    } else if (mode === 'restore' && workspaceId) {
      url.searchParams.set('workspace', workspaceId)
    }
    
    return url.toString()
  }
}