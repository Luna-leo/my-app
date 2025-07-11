export function parseTimestamp(timestamp: string | number | null): Date | null {
  if (!timestamp) return null;
  
  const timestampStr = String(timestamp).trim();
  if (!timestampStr) return null;
  
  console.log(`[date-parser] Parsing: "${timestampStr}"`);
  
  // Try multiple date formats
  const formats = [
    // ISO formats
    (str: string) => new Date(str),
    
    // Japanese formats
    (str: string) => {
      // YYYY/MM/DD HH:mm:ss
      const match1 = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
      if (match1) {
        return new Date(
          parseInt(match1[1]), 
          parseInt(match1[2]) - 1, 
          parseInt(match1[3]),
          parseInt(match1[4]),
          parseInt(match1[5]),
          parseInt(match1[6])
        );
      }
      
      // YYYY/MM/DD HH:mm
      const match2 = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
      if (match2) {
        return new Date(
          parseInt(match2[1]), 
          parseInt(match2[2]) - 1, 
          parseInt(match2[3]),
          parseInt(match2[4]),
          parseInt(match2[5]),
          0
        );
      }
      
      // YYYY/MM/DD
      const match3 = str.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
      if (match3) {
        return new Date(
          parseInt(match3[1]), 
          parseInt(match3[2]) - 1, 
          parseInt(match3[3])
        );
      }
      
      return null;
    },
    
    // Dash separated formats
    (str: string) => {
      // YYYY-MM-DD HH:mm:ss
      const match1 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/);
      if (match1) {
        return new Date(
          parseInt(match1[1]), 
          parseInt(match1[2]) - 1, 
          parseInt(match1[3]),
          parseInt(match1[4]),
          parseInt(match1[5]),
          parseInt(match1[6])
        );
      }
      
      // YYYY-MM-DD HH:mm
      const match2 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/);
      if (match2) {
        return new Date(
          parseInt(match2[1]), 
          parseInt(match2[2]) - 1, 
          parseInt(match2[3]),
          parseInt(match2[4]),
          parseInt(match2[5]),
          0
        );
      }
      
      // YYYY-MM-DD
      const match3 = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
      if (match3) {
        return new Date(
          parseInt(match3[1]), 
          parseInt(match3[2]) - 1, 
          parseInt(match3[3])
        );
      }
      
      return null;
    },
    
    // Excel serial date (number of days since 1900-01-01)
    (str: string) => {
      const num = parseFloat(str);
      if (!isNaN(num) && num > 25569 && num < 100000) { // Excel dates after 1970
        // Excel incorrectly treats 1900 as a leap year
        const excelEpoch = new Date(1899, 11, 30);
        return new Date(excelEpoch.getTime() + num * 24 * 60 * 60 * 1000);
      }
      return null;
    }
  ];
  
  // Try each format
  for (const format of formats) {
    try {
      const date = format(timestampStr);
      if (date && !isNaN(date.getTime())) {
        return date;
      }
    } catch {
      // Continue to next format
    }
  }
  
  return null;
}