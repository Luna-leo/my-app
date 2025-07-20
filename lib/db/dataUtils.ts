import { db } from './index';

/**
 * Calculate the actual data period from persisted data chunks
 * @param metadataId - The metadata ID to calculate data period for
 * @returns Object with dataStartTime and dataEndTime, or null if no data exists
 */
export async function calculateDataPeriodFromTimeSeries(metadataId: number): Promise<{
  dataStartTime: Date;
  dataEndTime: Date;
} | null> {
  try {
    // Get all data chunks for this metadata ID
    const chunks = await db.dataChunks
      .where('metadataId')
      .equals(metadataId)
      .toArray();

    if (!chunks || chunks.length === 0) {
      return null;
    }

    // Find the earliest start timestamp and latest end timestamp
    let dataStartTime: Date | null = null;
    let dataEndTime: Date | null = null;

    for (const chunk of chunks) {
      if (chunk.startTimestamp) {
        if (!dataStartTime || chunk.startTimestamp < dataStartTime) {
          dataStartTime = chunk.startTimestamp;
        }
      }
      if (chunk.endTimestamp) {
        if (!dataEndTime || chunk.endTimestamp > dataEndTime) {
          dataEndTime = chunk.endTimestamp;
        }
      }
    }

    if (!dataStartTime || !dataEndTime) {
      return null;
    }

    return {
      dataStartTime,
      dataEndTime
    };
  } catch (error) {
    console.error('Error calculating data period:', error);
    return null;
  }
}

/**
 * Update metadata with calculated data period if not already set
 * @param metadataId - The metadata ID to update
 * @returns true if updated, false otherwise
 */
export async function updateMetadataDataPeriod(metadataId: number): Promise<boolean> {
  try {
    const metadata = await db.metadata.get(metadataId);
    if (!metadata) {
      return false;
    }

    // Only update if data period is not already set
    if (metadata.dataStartTime && metadata.dataEndTime) {
      return false;
    }

    const dataPeriod = await calculateDataPeriodFromTimeSeries(metadataId);
    if (!dataPeriod) {
      return false;
    }

    await db.metadata.update(metadataId, {
      dataStartTime: dataPeriod.dataStartTime,
      dataEndTime: dataPeriod.dataEndTime
    });

    return true;
  } catch (error) {
    console.error('Error updating metadata data period:', error);
    return false;
  }
}

/**
 * Update all metadata records with missing data periods
 * @returns Number of records updated
 */
export async function updateAllMissingDataPeriods(): Promise<number> {
  try {
    const allMetadata = await db.metadata.toArray();
    let updatedCount = 0;

    for (const metadata of allMetadata) {
      if (!metadata.id) continue;
      
      // Skip if data period is already set
      if (metadata.dataStartTime && metadata.dataEndTime) {
        continue;
      }

      const updated = await updateMetadataDataPeriod(metadata.id);
      if (updated) {
        updatedCount++;
      }
    }

    return updatedCount;
  } catch (error) {
    console.error('Error updating all missing data periods:', error);
    return 0;
  }
}