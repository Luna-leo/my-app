export interface UploadState {
  stage: 'preparing' | 'processing' | 'uploading' | 'complete' | 'error'
  progress: number
  message: string
  processedRecords?: number
  totalRecords?: number
  estimatedTime?: number
  startTime?: number
}

export interface UploadChunk {
  chunkIndex: number
  totalChunks: number
  data: unknown[]
  metadata: Record<string, unknown>
  parameters: Array<{
    parameterId: string
    parameterName: string
    unit: string
  }>
}

export const CHUNK_SIZE = 5000 // Records per chunk for large datasets

export function createInitialUploadState(): UploadState {
  return {
    stage: 'preparing',
    progress: 0,
    message: 'アップロードを準備中...',
    startTime: Date.now()
  }
}

export function updateUploadState(
  currentState: UploadState,
  updates: Partial<UploadState>
): UploadState {
  const newState = { ...currentState, ...updates }
  
  // Calculate estimated time if we have processed records
  if (newState.processedRecords && newState.totalRecords && newState.startTime) {
    const elapsed = Date.now() - newState.startTime
    const recordsPerMs = newState.processedRecords / elapsed
    const remainingRecords = newState.totalRecords - newState.processedRecords
    newState.estimatedTime = Math.ceil(remainingRecords / recordsPerMs / 1000) // seconds
  }
  
  return newState
}

export function shouldUseChunkedUpload(recordCount: number): boolean {
  return recordCount > CHUNK_SIZE
}

export function createChunks<T>(data: T[], chunkSize: number = CHUNK_SIZE): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < data.length; i += chunkSize) {
    chunks.push(data.slice(i, i + chunkSize))
  }
  return chunks
}

export function calculateProgressForStage(
  stage: UploadState['stage'],
  stageProgress: number
): number {
  // Define progress ranges for each stage
  const stageRanges = {
    preparing: { start: 0, end: 10 },
    processing: { start: 10, end: 40 },
    uploading: { start: 40, end: 100 },
    complete: { start: 100, end: 100 },
    error: { start: 0, end: 0 }
  }
  
  const range = stageRanges[stage]
  const stageRange = range.end - range.start
  return Math.round(range.start + (stageProgress / 100) * stageRange)
}

export function formatTimeRemaining(seconds: number): string {
  if (seconds < 60) {
    return `約${seconds}秒`
  } else if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60)
    return `約${minutes}分`
  } else {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    return `約${hours}時間${minutes}分`
  }
}

// Create a debounced progress update function to avoid too many UI updates
export function createProgressUpdater(
  onUpdate: (state: UploadState) => void,
  minInterval: number = 100 // milliseconds
) {
  let lastUpdate = 0
  let pendingUpdate: UploadState | null = null
  let timeoutId: NodeJS.Timeout | null = null
  
  return (state: UploadState) => {
    const now = Date.now()
    
    if (now - lastUpdate >= minInterval) {
      // Enough time has passed, update immediately
      onUpdate(state)
      lastUpdate = now
      pendingUpdate = null
      
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
    } else {
      // Too soon, schedule update
      pendingUpdate = state
      
      if (!timeoutId) {
        const delay = minInterval - (now - lastUpdate)
        timeoutId = setTimeout(() => {
          if (pendingUpdate) {
            onUpdate(pendingUpdate)
            lastUpdate = Date.now()
            pendingUpdate = null
          }
          timeoutId = null
        }, delay)
      }
    }
  }
}