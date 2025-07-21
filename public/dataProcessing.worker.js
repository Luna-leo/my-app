// Enhanced Web Worker for data processing
// This file is placed in public folder to be served directly

// LTTB (Largest Triangle Three Buckets) algorithm
function lttbSample(data, targetPoints) {
  if (!data || data.length === 0) return [];
  if (targetPoints >= data.length) return data;
  
  const sampled = [];
  
  // Always include first point
  sampled.push(data[0]);
  
  // Calculate bucket size
  const bucketSize = (data.length - 2) / (targetPoints - 2);
  
  for (let i = 0; i < targetPoints - 2; i++) {
    // Calculate bucket boundaries
    const bucketStart = Math.floor(1 + i * bucketSize);
    const bucketEnd = Math.floor(1 + (i + 1) * bucketSize);
    
    // Get the point from the previous bucket (already selected)
    const prevPoint = sampled[sampled.length - 1];
    
    // Calculate average point for the next bucket (for triangle area calculation)
    let nextBucketStart = Math.floor(1 + (i + 1) * bucketSize);
    let nextBucketEnd = Math.floor(1 + (i + 2) * bucketSize);
    
    if (i === targetPoints - 3) {
      // Last bucket should include the last point
      nextBucketEnd = data.length;
    }
    
    let avgX = 0;
    let avgY = 0;
    let avgPointCount = 0;
    
    for (let j = nextBucketStart; j < nextBucketEnd && j < data.length; j++) {
      avgX += data[j].timestamp;
      avgY += data[j].value;
      avgPointCount++;
    }
    
    if (avgPointCount > 0) {
      avgX /= avgPointCount;
      avgY /= avgPointCount;
    }
    
    // Find the point in the current bucket that forms the largest triangle
    let maxArea = -1;
    let selectedPoint = null;
    
    for (let j = bucketStart; j < bucketEnd && j < data.length; j++) {
      const point = data[j];
      
      // Calculate triangle area using the determinant formula
      const area = Math.abs(
        (prevPoint.timestamp - avgX) * (point.value - prevPoint.value) -
        (prevPoint.timestamp - point.timestamp) * (avgY - prevPoint.value)
      );
      
      if (area > maxArea) {
        maxArea = area;
        selectedPoint = point;
      }
    }
    
    if (selectedPoint) {
      sampled.push(selectedPoint);
    }
  }
  
  // Always include last point
  sampled.push(data[data.length - 1]);
  
  return sampled;
}

// Nth-point sampling
function nthPointSample(data, targetPoints) {
  if (!data || data.length === 0) return [];
  if (targetPoints >= data.length) return data;
  
  const step = Math.max(1, Math.floor(data.length / targetPoints));
  const sampled = [];
  
  for (let i = 0; i < data.length; i += step) {
    sampled.push(data[i]);
  }
  
  // Always include the last point if not already included
  if (sampled[sampled.length - 1] !== data[data.length - 1]) {
    sampled.push(data[data.length - 1]);
  }
  
  return sampled;
}

// Min-max sampling (preserves extremes)
function minMaxSample(data, targetPoints) {
  if (!data || data.length === 0) return [];
  if (targetPoints >= data.length) return data;
  
  const bucketSize = data.length / (targetPoints / 2);
  const sampled = [];
  
  for (let i = 0; i < targetPoints / 2; i++) {
    const bucketStart = Math.floor(i * bucketSize);
    const bucketEnd = Math.floor((i + 1) * bucketSize);
    
    let min = null;
    let max = null;
    let minIdx = -1;
    let maxIdx = -1;
    
    for (let j = bucketStart; j < bucketEnd && j < data.length; j++) {
      const value = data[j].value;
      
      if (min === null || value < min) {
        min = value;
        minIdx = j;
      }
      
      if (max === null || value > max) {
        max = value;
        maxIdx = j;
      }
    }
    
    // Add min first, then max (if different)
    if (minIdx !== -1) {
      sampled.push(data[minIdx]);
    }
    if (maxIdx !== -1 && maxIdx !== minIdx) {
      sampled.push(data[maxIdx]);
    }
  }
  
  // Sort by timestamp to maintain chronological order
  sampled.sort((a, b) => a.timestamp - b.timestamp);
  
  return sampled;
}

// Sample time series data
function sampleTimeSeriesData(data, samplingConfig, parameter) {
  if (!data || data.length === 0) return [];
  
  const { method = 'nth', targetPoints = 1000, preserveExtremes = false } = samplingConfig;
  
  // Transform data for sampling (extract timestamp and value for specific parameter)
  const transformedData = [];
  
  for (let i = 0; i < data.length; i++) {
    const point = data[i];
    const value = parameter ? point.data[parameter] : null;
    
    if (value !== null && value !== undefined) {
      transformedData.push({
        timestamp: point.timestamp.getTime ? point.timestamp.getTime() : point.timestamp,
        value: value,
        originalIndex: i
      });
    }
  }
  
  if (transformedData.length === 0) return [];
  if (transformedData.length <= targetPoints) return data;
  
  // Apply sampling method
  let sampledIndices;
  
  switch (method) {
    case 'lttb':
      sampledIndices = lttbSample(transformedData, targetPoints).map(p => p.originalIndex);
      break;
    case 'minmax':
      sampledIndices = minMaxSample(transformedData, targetPoints).map(p => p.originalIndex);
      break;
    case 'nth':
    default:
      sampledIndices = nthPointSample(transformedData, targetPoints).map(p => p.originalIndex);
      break;
  }
  
  // Return original data points at sampled indices
  return sampledIndices.map(idx => data[idx]);
}

// Sample time series data by metadata
function sampleTimeSeriesDataByMetadata(dataByMetadata, samplingConfig, parameter) {
  const result = [];
  const totalTargetPoints = samplingConfig.targetPoints || 2000;
  
  // Calculate points per metadata based on data distribution
  const metadataIds = Object.keys(dataByMetadata);
  const totalPoints = metadataIds.reduce((sum, id) => sum + (dataByMetadata[id]?.length || 0), 0);
  
  if (totalPoints === 0) return result;
  
  // Process each metadata group
  for (const metadataId of metadataIds) {
    const data = dataByMetadata[metadataId];
    if (!data || data.length === 0) continue;
    
    // Proportional allocation of target points
    const proportion = data.length / totalPoints;
    const targetPointsForMetadata = Math.max(10, Math.round(totalTargetPoints * proportion));
    
    // Sample this metadata's data
    const metadataSamplingConfig = {
      ...samplingConfig,
      targetPoints: targetPointsForMetadata
    };
    
    const sampled = sampleTimeSeriesData(data, metadataSamplingConfig, parameter);
    result.push(...sampled);
    
    // Metadata ${metadataId}: ${data.length} → ${sampled.length} points
  }
  
  // Total: ${totalPoints} → ${result.length} points across ${metadataIds.length} series
  
  return result;
}

// Transform data for charts
function transformDataForChart(data, yAxisParameters, parameterInfoMap, metadataMap) {
  const seriesDataMap = new Map();
  
  // Process data points
  for (let i = 0; i < data.length; i++) {
    const dataPoint = data[i];
    const metadataId = dataPoint.metadataId;
    
    if (!seriesDataMap.has(metadataId)) {
      const metadata = metadataMap[metadataId];
      const metadataLabel = metadata?.label || `${metadata?.plant}-${metadata?.machineNo}` || `Data ${metadataId}`;
      
      seriesDataMap.set(metadataId, {
        timestamps: [],
        values: new Map(yAxisParameters.map(p => [p, []])),
        metadataLabel
      });
    }
    
    const series = seriesDataMap.get(metadataId);
    series.timestamps.push(dataPoint.timestamp.getTime ? dataPoint.timestamp.getTime() : dataPoint.timestamp);
    
    for (const parameterId of yAxisParameters) {
      const value = dataPoint.data[parameterId] ?? null;
      series.values.get(parameterId).push(value);
    }
  }
  
  // Convert to chart series data
  const chartSeriesData = [];
  
  for (const [metadataId, series] of seriesDataMap) {
    for (const parameterId of yAxisParameters) {
      const parameterInfo = parameterInfoMap[parameterId];
      if (!parameterInfo) continue;
      
      chartSeriesData.push({
        metadataId,
        metadataLabel: series.metadataLabel,
        parameterId,
        parameterInfo,
        timestamps: series.timestamps,
        values: series.values.get(parameterId)
      });
    }
  }
  
  return chartSeriesData;
}

// Message handler
self.addEventListener('message', async (event) => {
  const { type, data, id, workerId, timestamp } = event.data;
  const startTime = performance.now();
  
  try {
    switch (type) {
      case 'SAMPLE_DATA': {
        // Enhanced sampling with multiple methods
        const { id, rawData, targetPoints, samplingConfig } = data;
        
        // Use advanced sampling if config provided
        if (samplingConfig) {
          let sampled;
          
          // Check if we have metadata-grouped data
          if (samplingConfig.dataByMetadata) {
            sampled = sampleTimeSeriesDataByMetadata(
              samplingConfig.dataByMetadata,
              samplingConfig.samplingConfig,
              samplingConfig.samplingParameter
            );
          } else if (samplingConfig.data && samplingConfig.samplingConfig) {
            sampled = sampleTimeSeriesData(
              samplingConfig.data,
              samplingConfig.samplingConfig,
              samplingConfig.samplingParameter
            );
          } else {
            throw new Error('Invalid sampling config');
          }
          
          self.postMessage({
            type: 'SUCCESS',
            result: sampled,
            id: id || data.id,
            workerId,
            executionTime: performance.now() - startTime
          });
        } else {
          // Simple nth-point sampling for backward compatibility
          const step = Math.max(1, Math.floor(rawData.length / targetPoints));
          const sampled = [];
          
          for (let i = 0; i < rawData.length; i += step) {
            sampled.push(rawData[i]);
          }
          
          self.postMessage({
            type: 'SUCCESS',
            result: sampled,
            id: id || data.id,
            workerId,
            executionTime: performance.now() - startTime
          });
        }
        break;
      }
      
      case 'TRANSFORM_DATA': {
        // Transform data for chart rendering
        const { id, data: transformData, yAxisParameters, parameterInfoMap, metadataMap } = data;
        
        const transformed = transformDataForChart(
          transformData,
          yAxisParameters,
          parameterInfoMap,
          metadataMap
        );
        
        self.postMessage({
          type: 'SUCCESS',
          result: transformed,
          id: id || data.id,
          workerId,
          executionTime: performance.now() - startTime
        });
        break;
      }
      
      case 'PROCESS_DATA': {
        // Combined sampling and transformation
        const { id, data: processData, samplingConfig, parameters } = data;
        
        let processed = processData;
        
        // Apply sampling if needed
        if (samplingConfig && samplingConfig.enabled && processData.length > samplingConfig.samplingThreshold) {
          processed = sampleTimeSeriesData(processData, samplingConfig, parameters[0]);
        }
        
        const result = {
          data: processed,
          stats: {
            originalCount: processData.length,
            processedCount: processed.length,
            parameters: parameters.length
          }
        };
        
        self.postMessage({
          type: 'SUCCESS',
          result: result,
          id: id || data.id,
          workerId,
          executionTime: performance.now() - startTime
        });
        break;
      }
      
      case 'CALCULATE_VIEWPORT': {
        // Calculate optimal viewport for chart data
        const { chartData, width, height, padding = 0.1 } = data;
        
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;
        
        for (const series of chartData) {
          for (let i = 0; i < series.timestamps.length; i++) {
            const x = series.timestamps[i];
            const y = series.values[i];
            
            if (x < minX) minX = x;
            if (x > maxX) maxX = x;
            if (y !== null && y !== undefined) {
              if (y < minY) minY = y;
              if (y > maxY) maxY = y;
            }
          }
        }
        
        const viewport = {
          xMin: minX - (maxX - minX) * padding,
          xMax: maxX + (maxX - minX) * padding,
          yMin: minY - (maxY - minY) * padding,
          yMax: maxY + (maxY - minY) * padding,
          width,
          height
        };
        
        self.postMessage({
          type: 'SUCCESS',
          result: viewport,
          id: id || data.id,
          workerId,
          executionTime: performance.now() - startTime
        });
        break;
      }
      
      case 'BATCH_PROCESS': {
        // Process multiple tasks in batch
        const { tasks } = data;
        const results = [];
        
        for (const task of tasks) {
          try {
            let result;
            
            switch (task.type) {
              case 'sample':
                if (task.config) {
                  result = sampleTimeSeriesDataByMetadata(
                    task.dataByMetadata || { [task.metadataId]: task.data },
                    task.config,
                    task.samplingParameter
                  );
                } else {
                  // Simple sampling
                  const step = Math.max(1, Math.floor(task.data.length / task.targetPoints));
                  result = [];
                  for (let i = 0; i < task.data.length; i += step) {
                    result.push(task.data[i]);
                  }
                }
                break;
                
              case 'transform':
                result = transformDataForChart(
                  task.data,
                  task.yAxisParameters,
                  task.parameterInfoMap,
                  task.metadataMap
                );
                break;
                
              default:
                throw new Error(`Unknown batch task type: ${task.type}`);
            }
            
            results.push({ 
              id: task.id, 
              success: true, 
              result 
            });
          } catch (error) {
            results.push({ 
              id: task.id, 
              success: false, 
              error: error.message 
            });
          }
        }
        
        self.postMessage({
          type: 'SUCCESS',
          result: results,
          id: id || data.id,
          workerId,
          executionTime: performance.now() - startTime
        });
        break;
      }
      
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error.message,
      id: id || data?.id,
      workerId,
      executionTime: performance.now() - startTime
    });
  }
});