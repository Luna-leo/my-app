/**
 * Parameter Saver Service
 * 
 * Handles saving parameter information to IndexedDB
 * Extracted from duckdbCsvImporter.ts
 */

import { ParameterInfo } from '@/lib/db/schema';
import { db } from '@/lib/db';
import { parseCsvFile } from '@/lib/utils/csvParser';

export interface ParameterSaveResult {
  success: boolean;
  savedCount: number;
  errors: string[];
}

export class ParameterSaver {
  /**
   * Save parameters from CSV files to IndexedDB
   */
  async saveParametersFromFiles(
    files: File[],
    metadata: {
      plant: string;
      machineNo: string;
    }
  ): Promise<ParameterSaveResult> {
    const errors: string[] = [];
    const uniqueParameters = new Map<string, ParameterInfo>();

    try {
      // Extract parameters from all files
      for (const file of files) {
        try {
          const { parameterIds, parameterNames } = await parseCsvFile(file);
          
          // Parse units from the third row if available
          const text = await file.text();
          const lines = text.split('\n');
          const units = lines[2] ? lines[2].split(',').slice(1).map(u => u.trim()) : [];

          // Collect unique parameters
          for (let i = 0; i < parameterIds.length; i++) {
            const parameterId = parameterIds[i];
            const parameterName = parameterNames[i];
            const unit = units[i] || '-';

            // Skip empty or invalid parameters
            if (!parameterId || parameterId === '' || 
                !parameterName || parameterName === '-') {
              continue;
            }

            // Use parameterId as key to ensure uniqueness
            if (!uniqueParameters.has(parameterId)) {
              uniqueParameters.set(parameterId, {
                parameterId,
                parameterName,
                unit: unit === '-' ? '' : unit,
                plant: metadata.plant,
                machineNo: metadata.machineNo
              });
            }
          }
        } catch (error) {
          const errorMsg = `Failed to extract parameters from ${file.name}: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`;
          errors.push(errorMsg);
          console.warn(`[ParameterSaver] ${errorMsg}`);
        }
      }

      // Save unique parameters to IndexedDB
      if (uniqueParameters.size > 0) {
        const parametersArray = Array.from(uniqueParameters.values());
        await db.parameters.bulkPut(parametersArray);
        
        console.log(`[ParameterSaver] Saved ${parametersArray.length} unique parameters to IndexedDB`);
        
        return {
          success: true,
          savedCount: parametersArray.length,
          errors
        };
      } else {
        return {
          success: true,
          savedCount: 0,
          errors: errors.length > 0 ? errors : ['No valid parameters found in CSV files']
        };
      }
    } catch (error) {
      const errorMsg = `Failed to save parameters: ${
        error instanceof Error ? error.message : 'Unknown error'
      }`;
      errors.push(errorMsg);
      
      return {
        success: false,
        savedCount: 0,
        errors
      };
    }
  }

  /**
   * Update existing parameters with new information
   */
  async updateParameters(
    parameters: ParameterInfo[]
  ): Promise<ParameterSaveResult> {
    try {
      await db.parameters.bulkPut(parameters);
      
      return {
        success: true,
        savedCount: parameters.length,
        errors: []
      };
    } catch (error) {
      return {
        success: false,
        savedCount: 0,
        errors: [`Failed to update parameters: ${
          error instanceof Error ? error.message : 'Unknown error'
        }`]
      };
    }
  }

  /**
   * Get existing parameters for a plant and machine
   */
  async getExistingParameters(
    plant: string,
    machineNo: string
  ): Promise<ParameterInfo[]> {
    try {
      const parameters = await db.parameters
        .where('[plant+machineNo]')
        .equals([plant, machineNo])
        .toArray();
      
      return parameters;
    } catch (error) {
      console.error('[ParameterSaver] Failed to get existing parameters:', error);
      return [];
    }
  }

  /**
   * Merge new parameters with existing ones
   */
  async mergeParameters(
    newParameters: ParameterInfo[],
    existingParameters: ParameterInfo[]
  ): Promise<ParameterInfo[]> {
    const parameterMap = new Map<string, ParameterInfo>();

    // Add existing parameters
    existingParameters.forEach(param => {
      parameterMap.set(param.parameterId, param);
    });

    // Merge new parameters (overwrite if exists)
    newParameters.forEach(param => {
      parameterMap.set(param.parameterId, param);
    });

    return Array.from(parameterMap.values());
  }

  /**
   * Validate parameter information
   */
  validateParameter(param: ParameterInfo): boolean {
    return !!(
      param.parameterId &&
      param.parameterId !== '' &&
      param.parameterName &&
      param.parameterName !== '-' &&
      param.plant &&
      param.machineNo
    );
  }

  /**
   * Clean up invalid parameters
   */
  async cleanupInvalidParameters(): Promise<number> {
    try {
      const allParameters = await db.parameters.toArray();
      const invalidParameters = allParameters.filter(param => !this.validateParameter(param));
      
      if (invalidParameters.length > 0) {
        const idsToDelete = invalidParameters.map(p => p.parameterId);
        await db.parameters.bulkDelete(idsToDelete);
        
        console.log(`[ParameterSaver] Cleaned up ${invalidParameters.length} invalid parameters`);
        return invalidParameters.length;
      }
      
      return 0;
    } catch (error) {
      console.error('[ParameterSaver] Failed to cleanup invalid parameters:', error);
      return 0;
    }
  }
}