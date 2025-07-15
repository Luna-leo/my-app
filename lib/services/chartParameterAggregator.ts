// ChartConfigurationWithData type (should match the one in ChartDataContext)
interface ChartConfigurationWithData {
  id?: string;
  selectedDataIds: number[];
  xAxisParameter: string;
  yAxisParameters: string[];
  chartType: 'line' | 'scatter';
  title: string;
}

/**
 * Aggregates required parameters for charts sharing the same metadata ID
 * This optimization allows us to fetch all required data in a single database query
 */
export class ChartParameterAggregator {
  // Map: metadataId -> Set of required parameter IDs
  private requiredParameters: Map<number, Set<string>> = new Map();
  
  // Map: metadataId -> list of chart configurations using this metadata
  private chartsByMetadata: Map<number, ChartConfigurationWithData[]> = new Map();

  /**
   * Analyze chart configurations and collect required parameters per metadata ID
   */
  collectRequiredParameters(charts: ChartConfigurationWithData[]): void {
    console.log(`[ChartParameterAggregator] Analyzing ${charts.length} charts`);
    
    // Clear previous data
    this.requiredParameters.clear();
    this.chartsByMetadata.clear();
    
    charts.forEach(chart => {
      if (!chart.selectedDataIds || chart.selectedDataIds.length === 0) {
        return;
      }
      
      // Collect all parameter IDs needed for this chart
      const chartParams: string[] = [];
      
      // Add X-axis parameter if not timestamp
      if (chart.xAxisParameter && chart.xAxisParameter !== 'timestamp') {
        chartParams.push(chart.xAxisParameter);
      }
      
      // Add all Y-axis parameters
      if (chart.yAxisParameters && chart.yAxisParameters.length > 0) {
        chartParams.push(...chart.yAxisParameters);
      }
      
      // Process each metadata ID used by this chart
      chart.selectedDataIds.forEach(metadataId => {
        // Get or create parameter set for this metadata ID
        if (!this.requiredParameters.has(metadataId)) {
          this.requiredParameters.set(metadataId, new Set());
        }
        
        // Get or create chart list for this metadata ID
        if (!this.chartsByMetadata.has(metadataId)) {
          this.chartsByMetadata.set(metadataId, []);
        }
        
        // Add parameters to the set
        const paramSet = this.requiredParameters.get(metadataId)!;
        chartParams.forEach(param => paramSet.add(param));
        
        // Track which charts use this metadata
        const chartList = this.chartsByMetadata.get(metadataId)!;
        if (!chartList.includes(chart)) {
          chartList.push(chart);
        }
      });
    });
    
    // Log aggregation results
    this.requiredParameters.forEach((params, metadataId) => {
      const chartCount = this.chartsByMetadata.get(metadataId)?.length || 0;
      console.log(`[ChartParameterAggregator] MetadataId ${metadataId}: ${params.size} unique parameters for ${chartCount} charts`);
      if (params.size <= 20) {
        console.log(`[ChartParameterAggregator] Parameters:`, Array.from(params));
      }
    });
  }

  /**
   * Get all required parameters for a specific metadata ID
   */
  getRequiredParameters(metadataId: number): string[] {
    const params = this.requiredParameters.get(metadataId);
    return params ? Array.from(params) : [];
  }

  /**
   * Get all metadata IDs that need data fetching
   */
  getMetadataIds(): number[] {
    return Array.from(this.requiredParameters.keys());
  }

  /**
   * Get charts that use a specific metadata ID
   */
  getChartsForMetadata(metadataId: number): ChartConfigurationWithData[] {
    return this.chartsByMetadata.get(metadataId) || [];
  }

  /**
   * Get aggregation statistics
   */
  getStats(): {
    totalMetadataIds: number;
    totalUniqueParameters: number;
    averageParametersPerMetadata: number;
    metadataUsageDistribution: { metadataId: number; chartCount: number; paramCount: number }[];
  } {
    let totalParams = 0;
    const distribution: { metadataId: number; chartCount: number; paramCount: number }[] = [];
    
    this.requiredParameters.forEach((params, metadataId) => {
      totalParams += params.size;
      distribution.push({
        metadataId,
        chartCount: this.chartsByMetadata.get(metadataId)?.length || 0,
        paramCount: params.size
      });
    });
    
    return {
      totalMetadataIds: this.requiredParameters.size,
      totalUniqueParameters: totalParams,
      averageParametersPerMetadata: this.requiredParameters.size > 0 
        ? totalParams / this.requiredParameters.size 
        : 0,
      metadataUsageDistribution: distribution.sort((a, b) => b.chartCount - a.chartCount)
    };
  }

  /**
   * Check if all parameters are already loaded for a metadata ID
   */
  hasAllParameters(metadataId: number, loadedParameters: Set<string>): boolean {
    const required = this.requiredParameters.get(metadataId);
    if (!required) return true;
    
    for (const param of required) {
      if (!loadedParameters.has(param)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get missing parameters that need to be loaded
   */
  getMissingParameters(metadataId: number, loadedParameters: Set<string>): string[] {
    const required = this.requiredParameters.get(metadataId);
    if (!required) return [];
    
    const missing: string[] = [];
    for (const param of required) {
      if (!loadedParameters.has(param)) {
        missing.push(param);
      }
    }
    return missing;
  }
}