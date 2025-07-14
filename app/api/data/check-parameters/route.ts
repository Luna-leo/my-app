import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { loadIndex, loadMetadata } from '@/lib/api/storage';

interface ParameterIssue {
  parameterId: string;
  parameterName: string;
  issue: string;
}

// This endpoint now only reports issues with parameter names
// It does not attempt to fix them automatically

export async function GET(request: NextRequest) {
  try {
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Analyze all uploads to find which ones have parameter name issues
    const index = await loadIndex();
    const analysis: Record<string, {
      hasIssues: boolean;
      totalParameters: number;
      parametersWithIssues: number;
      issues?: ParameterIssue[];
      uploadInfo?: Record<string, unknown>;
    }> = {};

    for (const [uploadId, uploadInfo] of Object.entries(index)) {
      try {
        const { metadata, parameters } = await loadMetadata(uploadId);
        
        if (!parameters || parameters.length === 0) {
          analysis[uploadId] = {
            hasIssues: false,
            totalParameters: 0,
            parametersWithIssues: 0,
            uploadInfo: uploadInfo as Record<string, unknown>
          };
          continue;
        }

        const issues: ParameterIssue[] = [];
        
        for (const param of parameters) {
          let issue: string | null = null;
          
          // Check for various issues
          if (!param.parameterName) {
            issue = 'Missing parameter name';
          } else if (param.parameterName === param.parameterId) {
            issue = 'Parameter name is same as ID';
          } else if (/^\d+$/.test(param.parameterName)) {
            issue = 'Parameter name is just a number';
          }
          
          if (issue) {
            issues.push({
              parameterId: param.parameterId,
              parameterName: param.parameterName,
              issue
            });
          }
        }

        analysis[uploadId] = {
          hasIssues: issues.length > 0,
          totalParameters: parameters.length,
          parametersWithIssues: issues.length,
          issues: issues.slice(0, 5), // Show first 5 examples
          uploadInfo: {
            ...(uploadInfo as Record<string, unknown>),
            metadata: {
              plant: metadata.plant,
              machineNo: metadata.machineNo,
              dataSource: metadata.dataSource,
              importedAt: metadata.importedAt
            }
          }
        };
      } catch (error) {
        console.error(`Error analyzing upload ${uploadId}:`, error);
        analysis[uploadId] = {
          hasIssues: false,
          totalParameters: 0,
          parametersWithIssues: 0,
          uploadInfo: uploadInfo as Record<string, unknown>
        };
      }
    }

    const uploadsWithIssues = Object.values(analysis).filter(a => a.hasIssues).length;
    const totalParametersWithIssues = Object.values(analysis).reduce((sum, a) => sum + a.parametersWithIssues, 0);

    return NextResponse.json({
      summary: {
        totalUploads: Object.keys(index).length,
        uploadsWithIssues,
        totalParametersWithIssues,
        message: uploadsWithIssues > 0 
          ? 'Found uploads with parameter name issues. These uploads need to be re-uploaded with proper CSV header information.'
          : 'No parameter name issues found.'
      },
      uploads: analysis
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