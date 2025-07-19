/**
 * DuckDB timestamp utility functions
 * 
 * DuckDB stores timestamps without timezone information.
 * When retrieved, they may be in ISO format which JavaScript
 * interprets as UTC. This utility ensures timestamps are
 * interpreted as local time.
 */

/**
 * Parse DuckDB timestamp as local time
 * 
 * @param timestamp - Timestamp string from DuckDB
 * @returns Date object representing local time
 */
export function parseDuckDBTimestamp(timestamp: string | number): Date {
  if (typeof timestamp === 'number') {
    console.log('[DuckDB Timestamp Debug] Numeric timestamp (epoch ms):', timestamp);
    
    // DuckDB returns timestamp as epoch milliseconds in UTC
    // We need to convert it to local time (JST)
    const utcDate = new Date(timestamp);
    console.log('[DuckDB Timestamp Debug] UTC interpretation:', utcDate.toISOString());
    
    // Extract UTC components
    const year = utcDate.getUTCFullYear();
    const month = utcDate.getUTCMonth();
    const day = utcDate.getUTCDate();
    const hour = utcDate.getUTCHours();
    const minute = utcDate.getUTCMinutes();
    const second = utcDate.getUTCSeconds();
    const ms = utcDate.getUTCMilliseconds();
    
    // Create a new date with these components as local time
    const localDate = new Date(year, month, day, hour, minute, second, ms);
    console.log('[DuckDB Timestamp Debug] Converted to local (JST):', localDate.toLocaleString('ja-JP'));
    
    return localDate;
  }
  
  // Debug: Log the raw timestamp from DuckDB
  console.log('[DuckDB Timestamp Debug] Raw timestamp:', timestamp);
  
  // Try different parsing strategies
  
  // Strategy 1: If timestamp has 'Z' or timezone info, it's being interpreted as UTC
  // We need to convert it to local time
  if (timestamp.endsWith('Z') || timestamp.includes('+00:00') || timestamp.includes('-00:00')) {
    console.log('[DuckDB Timestamp Debug] Detected UTC timestamp, converting to local time');
    
    // Parse as UTC first
    const utcDate = new Date(timestamp);
    console.log('[DuckDB Timestamp Debug] UTC Date:', utcDate.toISOString());
    console.log('[DuckDB Timestamp Debug] UTC Date local string:', utcDate.toLocaleString('ja-JP'));
    
    // Extract the UTC components
    const year = utcDate.getUTCFullYear();
    const month = utcDate.getUTCMonth();
    const day = utcDate.getUTCDate();
    const hour = utcDate.getUTCHours();
    const minute = utcDate.getUTCMinutes();
    const second = utcDate.getUTCSeconds();
    
    // Create a new date with these components as local time
    const localDate = new Date(year, month, day, hour, minute, second);
    console.log('[DuckDB Timestamp Debug] Converted to local:', localDate.toLocaleString('ja-JP'));
    
    return localDate;
  }
  
  // Strategy 2: For timestamps without timezone info, parse components directly
  const match = timestamp.match(/^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2}):(\d{2})/);
  
  if (match) {
    const [, year, month, day, hour, minute, second] = match;
    // Create Date using local timezone
    const result = new Date(
      parseInt(year),
      parseInt(month) - 1, // Month is 0-indexed
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );
    
    console.log('[DuckDB Timestamp Debug] Parsed as local time:', result.toLocaleString('ja-JP'));
    return result;
  }
  
  // Fallback to default parsing
  console.warn('[DuckDB Timestamp Debug] Failed to parse timestamp, using fallback:', timestamp);
  const fallbackDate = new Date(timestamp);
  console.log('[DuckDB Timestamp Debug] Fallback result:', fallbackDate.toLocaleString('ja-JP'));
  return fallbackDate;
}