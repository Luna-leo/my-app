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
      const transformed: any = {
        id: upload.uploadId,
        uploadId: upload.uploadId,
        plantNm: upload.plantNm,
        machineNo: upload.machineNo,
        label: upload.label,
        startTime: upload.startTime,
        endTime: upload.endTime,
        uploadDate: upload.uploadDate || upload.uploadedAt, // Use uploadDate if available, fallback to uploadedAt
        parameterCount: upload.parameterCount,
        recordCount: upload.recordCount
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