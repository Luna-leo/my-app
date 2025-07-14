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
import { generateDataKey } from '@/lib/utils/dataKeyUtils';
import { generateParameterName } from '@/lib/utils/parameterNameUtils';

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
    const { metadata, parameters, timeSeriesData, dataPeriods } = body;

    // Log incoming data for debugging
    console.log('Upload request received:', {
      hasMetadata: !!metadata,
      hasParameters: !!parameters,
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
    
    // Generate dataKey using the same logic as local
    const dataKey = generateDataKey({
      plant: metadata.plant,
      machineNo: metadata.machineNo,
      dataSource: metadata.dataSource,
      dataStartTime: metadata.dataStartTime ? new Date(metadata.dataStartTime) : undefined,
      dataEndTime: metadata.dataEndTime ? new Date(metadata.dataEndTime) : undefined
    });
    console.log('Checking for duplicate with dataKey:', dataKey);
    
    // Check if data with same dataKey already exists
    const duplicateEntry = Object.entries(existingIndex).find(([, data]) => {
      const uploadData = data as Record<string, unknown>;
      return uploadData.dataKey === dataKey;
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

    // Use provided parameters or extract from time series data
    let parametersToSave = parameters;
    
    if (!parametersToSave && timeSeriesData.length > 0) {
      const firstRow = timeSeriesData[0];
      const dataKeys = Object.keys(firstRow.data || {});
      parametersToSave = dataKeys.map(key => ({
        parameterId: key,
        parameterName: generateParameterName(key),
        unit: '',
        plant: metadata.plant,
        machineNo: metadata.machineNo
      }));
      
      console.log('Generated parameter names:', parametersToSave.map((p: { parameterId: string; parameterName: string }) => ({
        id: p.parameterId,
        name: p.parameterName
      })));
    }

    console.log('Parameters to save:', parametersToSave?.length || 0);

    // Save metadata with dataKey and parameters
    const metadataWithKey = {
      ...metadata,
      dataKey
    };
    await saveMetadata(uploadId, metadataWithKey, parametersToSave || []);

    // Extract parameter IDs
    const parameterIds = (parametersToSave || []).map((p: { parameterId: string }) => p.parameterId);

    // Save time series data as parquet
    await saveTimeSeriesAsParquet(uploadId, timeSeriesData, parameterIds);

    // Update index
    const uploadInfo = {
      uploadId: uploadId,
      dataKey: dataKey,
      uploadDate: new Date().toISOString(),
      plantNm: metadata.plant,
      machineNo: metadata.machineNo,
      label: metadata.label,
      startTime: metadata.dataStartTime || metadata.startTime,
      endTime: metadata.dataEndTime || metadata.endTime,
      parameterCount: (parametersToSave || []).length,
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