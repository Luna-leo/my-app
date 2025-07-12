import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { 
  generateUploadId, 
  saveMetadata, 
  updateIndex,
  ensureUploadsDir,
  loadIndex
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
    const { metadata, timeSeriesData, dataPeriods } = body;

    // Log incoming data for debugging
    console.log('Upload request received:', {
      hasMetadata: !!metadata,
      hasTimeSeriesData: !!timeSeriesData,
      timeSeriesDataLength: timeSeriesData?.length,
      dataPeriods
    });

    if (!metadata || !timeSeriesData) {
      return NextResponse.json(
        { error: 'Missing required fields: metadata or timeSeriesData' },
        { status: 400 }
      );
    }

    // Check for duplicate data
    const existingIndex = await loadIndex();
    
    // Create a unique key for this data
    const dataKey = `${metadata.plant}_${metadata.machineNo}_${metadata.label || 'no-label'}_${metadata.dataStartTime}_${metadata.dataEndTime}`;
    console.log('Checking for duplicate with key:', dataKey);
    
    // Check if data with same key already exists
    const duplicateEntry = Object.entries(existingIndex).find(([, data]) => {
      const uploadData = data as Record<string, unknown>;
      const existingKey = `${uploadData.plantNm}_${uploadData.machineNo}_${uploadData.label || 'no-label'}_${uploadData.startTime}_${uploadData.endTime}`;
      return existingKey === dataKey;
    });
    
    if (duplicateEntry) {
      console.log('Duplicate data found:', duplicateEntry[0]);
      return NextResponse.json({
        uploadId: duplicateEntry[0],
        message: 'Data already exists on server',
        duplicate: true
      });
    }

    // Generate unique upload ID
    const uploadId = generateUploadId();

    // Extract parameters from time series data if not provided
    let parameters: Array<{
      parameterId: string;
      parameterName: string;
      unit: string;
      plant: string;
      machineNo: string;
    }> = [];
    
    if (timeSeriesData.length > 0) {
      const firstRow = timeSeriesData[0];
      const dataKeys = Object.keys(firstRow.data || {});
      parameters = dataKeys.map(key => ({
        parameterId: key,
        parameterName: key,
        unit: '',
        plant: metadata.plant,
        machineNo: metadata.machineNo
      }));
    }

    console.log('Extracted parameters:', parameters);

    // Save metadata and parameters
    await saveMetadata(uploadId, metadata, parameters);

    // Extract parameter IDs
    const parameterIds = parameters.map((p: { parameterId: string }) => p.parameterId);

    // Save time series data as parquet
    await saveTimeSeriesAsParquet(uploadId, timeSeriesData, parameterIds);

    // Update index
    const uploadInfo = {
      uploadId: uploadId,
      uploadDate: new Date().toISOString(),
      plantNm: metadata.plant,
      machineNo: metadata.machineNo,
      label: metadata.label,
      startTime: metadata.dataStartTime || metadata.startTime,
      endTime: metadata.dataEndTime || metadata.endTime,
      parameterCount: parameters.length,
      recordCount: timeSeriesData.length
    };
    
    console.log('Updating index with:', uploadInfo);
    
    await updateIndex(uploadId, uploadInfo);

    // Generate response
    return NextResponse.json({
      uploadId,
      message: 'Data uploaded successfully'
    });

  } catch (error) {
    console.error('Upload error:', error);
    console.error('Error details:', {
      message: error instanceof Error ? error.message : 'Unknown error',
      stack: error instanceof Error ? error.stack : undefined
    });
    
    return NextResponse.json(
      { 
        error: 'Failed to upload data',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}