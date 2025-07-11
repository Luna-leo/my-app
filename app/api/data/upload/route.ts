import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { 
  generateUploadId, 
  saveMetadata, 
  updateIndex,
  ensureUploadsDir 
} from '@/lib/api/storage';
import { saveTimeSeriesAsParquet } from '@/lib/api/parquet';

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    if (!validateApiKey(request)) {
      return NextResponse.json(
        { error: 'Invalid API key' },
        { status: 401 }
      );
    }

    await ensureUploadsDir();

    const body = await request.json();
    const { metadata, parameters, timeSeriesData } = body;

    if (!metadata || !parameters || !timeSeriesData) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Generate unique upload ID
    const uploadId = generateUploadId();

    // Save metadata and parameters
    await saveMetadata(uploadId, metadata, parameters);

    // Extract parameter IDs
    const parameterIds = parameters.map((p: { parameterId: string }) => p.parameterId);

    // Save time series data as parquet
    await saveTimeSeriesAsParquet(uploadId, timeSeriesData, parameterIds);

    // Update index
    await updateIndex(uploadId, {
      dataKey: metadata.dataKey,
      plant: metadata.plant,
      machineNo: metadata.machineNo,
      label: metadata.label,
      dataStartTime: metadata.dataStartTime,
      dataEndTime: metadata.dataEndTime,
      parameterCount: parameters.length,
      recordCount: timeSeriesData.length
    });

    // Generate response
    return NextResponse.json({
      uploadId,
      message: 'Data uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    return NextResponse.json(
      { error: 'Failed to upload data' },
      { status: 500 }
    );
  }
}