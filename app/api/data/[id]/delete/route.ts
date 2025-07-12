import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { deleteUploadData, loadIndex } from '@/lib/api/storage';

export async function DELETE(
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

    // Check if data exists
    const index = await loadIndex();
    if (!index[uploadId]) {
      return NextResponse.json(
        { error: 'Data not found' },
        { status: 404 }
      );
    }

    // Delete the data
    await deleteUploadData(uploadId);

    return NextResponse.json({
      message: 'Data deleted successfully',
      uploadId
    });

  } catch (error) {
    console.error('Delete error:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}