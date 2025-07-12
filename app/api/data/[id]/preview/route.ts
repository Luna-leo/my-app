import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { loadTimeSeriesData, loadMetadata } from '@/lib/api/storage';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const uploadId = params.id;

    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Load metadata
    const { metadata } = await loadMetadata(uploadId);

    // Load time series data with limit for preview
    const data = await loadTimeSeriesData(uploadId, { limit: 100 });

    return NextResponse.json({
      uploadId,
      metadata,
      data,
      totalRecords: metadata.recordCount,
      previewLimit: 100
    });

  } catch (error) {
    console.error('Preview error:', error);
    return NextResponse.json(
      { error: 'Failed to load preview' },
      { status: 500 }
    );
  }
}