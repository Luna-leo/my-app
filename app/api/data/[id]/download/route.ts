import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { loadMetadata } from '@/lib/api/storage';
import { readTimeSeriesFromParquet } from '@/lib/api/parquet';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const uploadId = params.id;
    // Check if data exists
    try {
      await loadMetadata(uploadId);
    } catch {
      return NextResponse.json(
        { error: 'Data not found' },
        { status: 404 }
      );
    }

    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Load metadata
    const { metadata, parameters } = await loadMetadata(uploadId);

    // Read time series data from parquet
    const timeSeriesData = await readTimeSeriesFromParquet(uploadId);

    // Return data in JSON format for IndexedDB import
    return NextResponse.json({
      metadata,
      parameters,
      timeSeriesData
    });

  } catch (error) {
    console.error('Download error:', error);
    return NextResponse.json(
      { error: 'Failed to download data' },
      { status: 500 }
    );
  }
}