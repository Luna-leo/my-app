import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { loadMetadata, getUploadPath } from '@/lib/api/storage';
import { promises as fs } from 'fs';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const params = await context.params;
  try {
    const uploadId = params.id;

    // Check if data exists
    try {
      await fs.access(getUploadPath(uploadId));
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

    // Generate download URL
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;
    const downloadUrl = `${baseUrl}/api/data/${uploadId}/download`;

    return NextResponse.json({
      uploadId,
      metadata,
      parameters,
      downloadUrl
    });

  } catch (error) {
    console.error('Data retrieval error:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve data' },
      { status: 500 }
    );
  }
}