import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { loadIndex, loadMetadata, saveMetadata } from '@/lib/api/storage';
import { generateParameterName, validateParameterName } from '@/lib/utils/parameterNameUtils';

interface FixParametersRequest {
  uploadId?: string;
  fixAll?: boolean;
}

interface ParameterFix {
  parameterId: string;
  oldName: string;
  newName: string;
  needsFix: boolean;
}

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    const body: FixParametersRequest = await request.json();
    const { uploadId, fixAll = false } = body;

    if (!uploadId && !fixAll) {
      return NextResponse.json(
        { error: 'Either uploadId or fixAll must be specified' },
        { status: 400 }
      );
    }

    const results: Record<string, {
      fixed: boolean;
      parametersFixed: number;
      errors?: string;
      details?: ParameterFix[];
    }> = {};

    // Get list of uploads to process
    const uploadsToProcess: string[] = [];
    
    if (fixAll) {
      const index = await loadIndex();
      uploadsToProcess.push(...Object.keys(index));
    } else if (uploadId) {
      uploadsToProcess.push(uploadId);
    }

    // Process each upload
    for (const id of uploadsToProcess) {
      try {
        const { metadata, parameters } = await loadMetadata(id);
        
        if (!parameters || parameters.length === 0) {
          results[id] = {
            fixed: false,
            parametersFixed: 0,
            errors: 'No parameters found'
          };
          continue;
        }

        const fixes: ParameterFix[] = [];
        let needsUpdate = false;

        // Check and fix each parameter
        for (const param of parameters) {
          const validation = validateParameterName(param.parameterName);
          const needsFix = !validation.isValid || param.parameterId === param.parameterName;
          
          if (needsFix) {
            const newName = generateParameterName(param.parameterId);
            fixes.push({
              parameterId: param.parameterId,
              oldName: param.parameterName,
              newName: newName,
              needsFix: true
            });
            param.parameterName = newName;
            needsUpdate = true;
          } else {
            fixes.push({
              parameterId: param.parameterId,
              oldName: param.parameterName,
              newName: param.parameterName,
              needsFix: false
            });
          }
        }

        if (needsUpdate) {
          // Save updated metadata
          await saveMetadata(id, metadata, parameters);
          
          results[id] = {
            fixed: true,
            parametersFixed: fixes.filter(f => f.needsFix).length,
            details: fixes
          };
        } else {
          results[id] = {
            fixed: false,
            parametersFixed: 0,
            details: fixes
          };
        }
      } catch (error) {
        results[id] = {
          fixed: false,
          parametersFixed: 0,
          errors: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }

    // Summary
    const totalFixed = Object.values(results).filter(r => r.fixed).length;
    const totalParametersFixed = Object.values(results).reduce((sum, r) => sum + r.parametersFixed, 0);

    return NextResponse.json({
      success: true,
      message: `Fixed ${totalParametersFixed} parameters across ${totalFixed} uploads`,
      results
    });

  } catch (error) {
    console.error('Fix parameters error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to fix parameters',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Analyze all uploads to find which ones need fixing
    const index = await loadIndex();
    const analysis: Record<string, {
      needsFix: boolean;
      totalParameters: number;
      parametersNeedingFix: number;
      examples?: ParameterFix[];
    }> = {};

    for (const [uploadId] of Object.entries(index)) {
      try {
        const { parameters } = await loadMetadata(uploadId);
        
        if (!parameters || parameters.length === 0) {
          analysis[uploadId] = {
            needsFix: false,
            totalParameters: 0,
            parametersNeedingFix: 0
          };
          continue;
        }

        const fixes: ParameterFix[] = [];
        
        for (const param of parameters) {
          const validation = validateParameterName(param.parameterName);
          const needsFix = !validation.isValid || param.parameterId === param.parameterName;
          
          if (needsFix) {
            fixes.push({
              parameterId: param.parameterId,
              oldName: param.parameterName,
              newName: generateParameterName(param.parameterId),
              needsFix: true
            });
          }
        }

        analysis[uploadId] = {
          needsFix: fixes.length > 0,
          totalParameters: parameters.length,
          parametersNeedingFix: fixes.length,
          examples: fixes.slice(0, 3) // Show first 3 examples
        };
      } catch {
        analysis[uploadId] = {
          needsFix: false,
          totalParameters: 0,
          parametersNeedingFix: 0
        };
      }
    }

    const totalUploadsNeedingFix = Object.values(analysis).filter(a => a.needsFix).length;
    const totalParametersNeedingFix = Object.values(analysis).reduce((sum, a) => sum + a.parametersNeedingFix, 0);

    return NextResponse.json({
      totalUploads: Object.keys(index).length,
      uploadsNeedingFix: totalUploadsNeedingFix,
      totalParametersNeedingFix: totalParametersNeedingFix,
      analysis
    });

  } catch (error) {
    console.error('Analysis error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to analyze parameters',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}