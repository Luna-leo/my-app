/**
 * Track loaded parameters for each metadata ID to enable efficient selective column loading
 */
class ParameterTracker {
  private static instance: ParameterTracker;
  private loadedParameters: Map<number, Set<string>> = new Map();

  private constructor() {}

  static getInstance(): ParameterTracker {
    if (!ParameterTracker.instance) {
      ParameterTracker.instance = new ParameterTracker();
    }
    return ParameterTracker.instance;
  }

  /**
   * Get loaded parameters for a metadata ID
   */
  getLoadedParameters(metadataId: number): Set<string> {
    return this.loadedParameters.get(metadataId) || new Set();
  }

  /**
   * Add loaded parameters for a metadata ID
   */
  addLoadedParameters(metadataId: number, parameterIds: string[]): void {
    const existing = this.getLoadedParameters(metadataId);
    parameterIds.forEach(id => existing.add(id));
    this.loadedParameters.set(metadataId, existing);
  }

  /**
   * Get missing parameters that need to be loaded
   */
  getMissingParameters(metadataId: number, requiredParameters: string[]): string[] {
    const loaded = this.getLoadedParameters(metadataId);
    return requiredParameters.filter(id => !loaded.has(id));
  }

  /**
   * Check if all required parameters are loaded
   */
  hasAllParameters(metadataId: number, requiredParameters: string[]): boolean {
    const loaded = this.getLoadedParameters(metadataId);
    return requiredParameters.every(id => loaded.has(id));
  }

  /**
   * Clear tracked parameters for a metadata ID
   */
  clearMetadata(metadataId: number): void {
    this.loadedParameters.delete(metadataId);
  }

  /**
   * Clear all tracked parameters
   */
  clear(): void {
    this.loadedParameters.clear();
  }

  /**
   * Get statistics about tracked parameters
   */
  getStats(): { totalMetadata: number; totalParameters: number } {
    let totalParameters = 0;
    this.loadedParameters.forEach(params => {
      totalParameters += params.size;
    });
    return {
      totalMetadata: this.loadedParameters.size,
      totalParameters
    };
  }
}

export const parameterTracker = ParameterTracker.getInstance();