// Global active chart tracker to prevent cross-chart interference during selection
type ChartInstanceId = string;

class ActiveChartTracker {
  private activeChartId: ChartInstanceId | null = null;
  private listeners: Map<ChartInstanceId, () => void> = new Map();

  /**
   * Set the active chart ID
   * @param chartId The ID of the chart that is now active
   */
  setActiveChart(chartId: ChartInstanceId | null): void {
    if (this.activeChartId === chartId) return;
    
    const previousActiveId = this.activeChartId;
    this.activeChartId = chartId;
    
    // Notify the previously active chart that it's no longer active
    if (previousActiveId && this.listeners.has(previousActiveId)) {
      const listener = this.listeners.get(previousActiveId);
      listener?.();
    }
  }

  /**
   * Check if a specific chart is currently active
   * @param chartId The ID of the chart to check
   * @returns true if the chart is active
   */
  isActiveChart(chartId: ChartInstanceId): boolean {
    return this.activeChartId === chartId;
  }

  /**
   * Get the currently active chart ID
   * @returns The ID of the active chart or null
   */
  getActiveChart(): ChartInstanceId | null {
    return this.activeChartId;
  }

  /**
   * Register a listener for when a chart becomes inactive
   * @param chartId The chart ID
   * @param listener Callback to run when the chart becomes inactive
   */
  registerInactiveListener(chartId: ChartInstanceId, listener: () => void): void {
    this.listeners.set(chartId, listener);
  }

  /**
   * Unregister a listener
   * @param chartId The chart ID
   */
  unregisterInactiveListener(chartId: ChartInstanceId): void {
    this.listeners.delete(chartId);
  }

  /**
   * Clear the active chart (no chart is active)
   */
  clearActiveChart(): void {
    this.setActiveChart(null);
  }
}

// Create a singleton instance
export const activeChartTracker = new ActiveChartTracker();

/**
 * Generate a unique chart instance ID
 */
export function generateChartInstanceId(): ChartInstanceId {
  return `chart-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}