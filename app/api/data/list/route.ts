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

    return NextResponse.json({
      uploads,
      count: uploads.length
    });

  } catch (error) {
    console.error('List error:', error);
    return NextResponse.json(
      { error: 'Failed to list data' },
      { status: 500 }
    );
  }
}