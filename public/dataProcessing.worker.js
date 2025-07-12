// Simple Web Worker for data processing
// This file is placed in public folder to be served directly

self.addEventListener('message', async (event) => {
  const { type, data } = event.data;
  
  try {
    switch (type) {
      case 'SAMPLE_DATA':
        // Simple nth-point sampling for now
        const { id, rawData, targetPoints } = data;
        const step = Math.max(1, Math.floor(rawData.length / targetPoints));
        const sampled = [];
        
        for (let i = 0; i < rawData.length; i += step) {
          sampled.push(rawData[i]);
        }
        
        self.postMessage({
          type: 'DATA_PROCESSED',
          data: sampled,
          id
        });
        break;
        
      default:
        throw new Error(`Unknown message type: ${type}`);
    }
  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      error: error.message,
      id: data.id
    });
  }
});