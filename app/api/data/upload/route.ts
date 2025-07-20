import { NextRequest, NextResponse } from 'next/server';
import { validateApiKey } from '@/lib/api/auth';
import { 
  generateUploadId, 
  saveMetadata, 
  updateIndex,
  ensureUploadsDir,
  loadIndex,
  saveChunkSession,
  loadChunkSession,
  saveChunk,
  combineChunks,
  cleanupChunkSession,
  cleanupOldChunkSessions
} from '@/lib/api/storage';
import { saveTimeSeriesAsParquet } from '@/lib/api/parquet';
import { generateDataKey } from '@/lib/utils/dataKeyUtils';

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
    
    // Cleanup old chunk sessions periodically
    await cleanupOldChunkSessions();

    const body = await request.json();
    const { metadata, parameters, timeSeriesData, dataPeriods, chunkInfo } = body;

    // Log incoming data for debugging
    console.log('Upload request received:', {
      hasMetadata: !!metadata,
      hasParameters: !!parameters,
      parametersLength: parameters?.length,
      hasTimeSeriesData: !!timeSeriesData,
      timeSeriesDataLength: timeSeriesData?.length,
      dataPeriods,
      chunkInfo
    });
    
    // Debug: Check first few parameters
    if (parameters && parameters.length > 0) {
      console.log('First 5 parameters received:', parameters.slice(0, 5).map((p: { parameterId: string; parameterName: string; unit: string }) => ({
        id: p.parameterId,
        name: p.parameterName,
        unit: p.unit
      })));
    }

    if (!metadata || !timeSeriesData) {
      return NextResponse.json(
        { error: 'Missing required fields: metadata or timeSeriesData' },
        { status: 400 }
      );
    }

    // Generate dataKey using the same logic as local
    // For chunked uploads, exclude importedAt to ensure consistent key across chunks
    const dataKey = generateDataKey({
      plant: metadata.plant,
      machineNo: metadata.machineNo,
      dataSource: metadata.dataSource,
      dataStartTime: metadata.dataStartTime ? new Date(metadata.dataStartTime) : undefined,
      dataEndTime: metadata.dataEndTime ? new Date(metadata.dataEndTime) : undefined,
      importedAt: metadata.importedAt ? new Date(metadata.importedAt) : undefined
    }, { excludeImportedAt: !!chunkInfo }); // Exclude importedAt for chunked uploads
    console.log('Generated dataKey:', dataKey);

    // Handle chunked upload
    if (chunkInfo) {
      console.log(`Processing chunk ${chunkInfo.index + 1} of ${chunkInfo.total} for dataKey: ${dataKey}`);
      console.log('Chunk data info:', {
        dataLength: timeSeriesData.length,
        firstTimestamp: timeSeriesData[0]?.timestamp,
        lastTimestamp: timeSeriesData[timeSeriesData.length - 1]?.timestamp
      });
      
      // Check if this is the first chunk
      let session = await loadChunkSession(dataKey);
      
      if (!session) {
        // First chunk - check for duplicates
        const existingIndex = await loadIndex();
        const duplicateEntry = Object.entries(existingIndex).find(([, data]) => {
          const uploadData = data as Record<string, unknown>;
          return uploadData.dataKey === dataKey;
        });
        
        if (duplicateEntry) {
          console.log('Duplicate data found:', duplicateEntry[0]);
          return NextResponse.json({
            uploadId: duplicateEntry[0],
            dataKey: dataKey,
            message: 'Data already exists on server',
            duplicate: true
          });
        }
        
        // Create new session
        const uploadId = generateUploadId();
        session = {
          uploadId,
          metadata,
          parameters,
          totalChunks: chunkInfo.total,
          receivedChunks: [],
          createdAt: new Date(),
          dataKey
        };
        await saveChunkSession(session);
      }
      
      // Save chunk data
      await saveChunk(dataKey, chunkInfo.index, timeSeriesData);
      
      // Reload session to get the latest state
      const latestSession = await loadChunkSession(dataKey);
      if (!latestSession) {
        throw new Error('Failed to load chunk session after saving chunk');
      }
      
      // Update session with received chunk (avoid duplicates)
      if (!latestSession.receivedChunks.includes(chunkInfo.index)) {
        latestSession.receivedChunks.push(chunkInfo.index);
        await saveChunkSession(latestSession);
        console.log(`Added chunk ${chunkInfo.index} to session`);
      } else {
        console.log(`Chunk ${chunkInfo.index} already in session`);
      }
      
      // Use the latest session for the rest of the processing
      session = latestSession;
      
      console.log(`Received chunks: ${session.receivedChunks.length}/${session.totalChunks}`, session.receivedChunks);
      
      // Check if all chunks have been received
      if (session.receivedChunks.length === session.totalChunks) {
        console.log('All chunks received, combining data...');
        
        // Combine all chunks
        const allTimeSeriesData = await combineChunks(dataKey);
        console.log(`Combined data length: ${allTimeSeriesData.length}`);
        
        // Process combined data as normal upload
        const uploadId = session.uploadId;
        
        // Save metadata and parameters with full dataKey (including importedAt)
        const fullDataKey = generateDataKey({
          plant: session.metadata.plant as string,
          machineNo: session.metadata.machineNo as string,
          dataSource: session.metadata.dataSource as 'CASS' | 'Chinami',
          dataStartTime: session.metadata.dataStartTime ? new Date(session.metadata.dataStartTime as string) : undefined,
          dataEndTime: session.metadata.dataEndTime ? new Date(session.metadata.dataEndTime as string) : undefined,
          importedAt: session.metadata.importedAt ? new Date(session.metadata.importedAt as string) : undefined
        });
        const metadataWithKey = {
          ...session.metadata,
          dataKey: fullDataKey
        };
        await saveMetadata(uploadId, metadataWithKey, session.parameters);
        
        // Process timestamps
        const processedTimeSeriesData = allTimeSeriesData.map((item: { timestamp: string | Date; data: Record<string, number | null>; metadataId?: number }) => ({
          ...item,
          timestamp: new Date(item.timestamp),
          metadataId: item.metadataId || 0 // Use 0 as a placeholder for server-side processing
        }));
        
        // Extract parameter IDs
        const parameterIds = (session.parameters || []).map((p: { parameterId: string }) => p.parameterId);
        
        // Save time series data as parquet
        await saveTimeSeriesAsParquet(uploadId, processedTimeSeriesData, parameterIds);
        
        // Update index with full dataKey
        const uploadInfo = {
          uploadId: uploadId,
          dataKey: fullDataKey,
          uploadDate: new Date().toISOString(),
          plantNm: session.metadata.plant as string,
          machineNo: session.metadata.machineNo as string,
          label: session.metadata.label as string | undefined,
          startTime: (session.metadata.dataStartTime || session.metadata.startTime) as string,
          endTime: (session.metadata.dataEndTime || session.metadata.endTime) as string,
          parameterCount: (session.parameters || []).length,
          recordCount: allTimeSeriesData.length
        };
        
        await updateIndex(uploadId, uploadInfo);
        
        // Cleanup chunk session
        await cleanupChunkSession(dataKey);
        
        return NextResponse.json({
          uploadId,
          dataKey: fullDataKey,
          message: 'All chunks uploaded successfully',
          complete: true
        });
      } else {
        // More chunks expected
        return NextResponse.json({
          message: `Chunk ${chunkInfo.index + 1} of ${chunkInfo.total} received`,
          receivedChunks: session.receivedChunks.length,
          totalChunks: session.totalChunks
        });
      }
    }

    // Non-chunked upload - check for duplicates
    const existingIndex = await loadIndex();
    const duplicateEntry = Object.entries(existingIndex).find(([, data]) => {
      const uploadData = data as Record<string, unknown>;
      return uploadData.dataKey === dataKey;
    });
    
    if (duplicateEntry) {
      console.log('Duplicate data found:', duplicateEntry[0]);
      return NextResponse.json({
        uploadId: duplicateEntry[0],
        dataKey: dataKey,
        message: 'Data already exists on server',
        duplicate: true
      });
    }

    // Generate unique upload ID
    const uploadId = generateUploadId();

    // Use provided parameters or error if not available
    const parametersToSave = parameters;
    
    if (!parametersToSave || parametersToSave.length === 0) {
      console.error('No parameters provided for upload:', {
        metadata,
        hasTimeSeriesData: !!timeSeriesData && timeSeriesData.length > 0
      });
      
      return NextResponse.json(
        { 
          error: 'Parameters information is required for upload',
          details: 'CSV header information (parameter names and units) must be provided'
        },
        { status: 400 }
      );
    }
    
    // Temporarily disable parameter name validation to allow debugging
    console.log('Skipping parameter name validation for debugging...')
    
    // Log parameter info for debugging
    console.log('Parameters info:', {
      total: parametersToSave.length,
      sample: parametersToSave.slice(0, 3).map((p: { parameterId: string; parameterName: string; unit: string }) => ({
        id: p.parameterId,
        name: p.parameterName,
        unit: p.unit,
        nameEqualsId: p.parameterName === p.parameterId
      }))
    })

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
    // Convert timestamp strings to Date objects before saving
    console.log('[Upload] Processing timestamps - first record:', {
      original: timeSeriesData[0]?.timestamp,
      type: typeof timeSeriesData[0]?.timestamp
    });
    
    const processedTimeSeriesData = timeSeriesData.map((item: { timestamp: string | Date; data: Record<string, number | null>; metadataId?: number }) => ({
      ...item,
      timestamp: new Date(item.timestamp),
      metadataId: item.metadataId || 0 // Use 0 as a placeholder for server-side processing
    }));
    
    console.log('[Upload] After processing - first record:', {
      timestamp: processedTimeSeriesData[0]?.timestamp,
      isDate: processedTimeSeriesData[0]?.timestamp instanceof Date,
      iso: processedTimeSeriesData[0]?.timestamp?.toISOString()
    });
    
    await saveTimeSeriesAsParquet(uploadId, processedTimeSeriesData, parameterIds);

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
      dataKey: dataKey,
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