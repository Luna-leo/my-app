import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { loadIndex } from '@/lib/api/storage';

export async function GET(request: NextRequest) {
  try {
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    // Load index of uploaded data
    const index = await loadIndex();
    
    // Convert index object to array and sort by upload date
    interface UploadRecord {
      uploadId: string;
      uploadedAt: string;
      [key: string]: unknown;
    }
    
    const uploads = Object.entries(index).map(([uploadId, data]) => ({
      uploadId,
      ...(data as Record<string, unknown>)
    }) as UploadRecord).sort((a, b) => {
      const dateA = new Date(a.uploadedAt).getTime();
      const dateB = new Date(b.uploadedAt).getTime();
      return dateB - dateA; // Newest first
    });

    // Transform uploads to match the expected UploadedData structure
    const data = uploads.map(upload => {
      // Ensure we have consistent field names
      const transformed = {
        id: upload.uploadId,
        uploadId: upload.uploadId,
        dataKey: upload.dataKey as string | undefined,
        plantNm: upload.plantNm as string,
        machineNo: upload.machineNo as string,
        label: upload.label as string | undefined,
        startTime: upload.startTime as string,
        endTime: upload.endTime as string,
        uploadDate: (upload.uploadDate || upload.uploadedAt) as string,
        parameterCount: upload.parameterCount as number,
        recordCount: upload.recordCount as number
      };
      
      return transformed;
    });

    return NextResponse.json({
      data,
      count: data.length
    });

  } catch (error) {
    console.error('List error:', error);
    return NextResponse.json(
      { error: 'Failed to list data' },
      { status: 500 }
    );
  }
}