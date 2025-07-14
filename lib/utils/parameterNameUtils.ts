/**
 * Convert parameter ID to a human-readable parameter name
 * @param parameterId - The parameter ID to convert
 * @returns A human-readable parameter name
 */
export function generateParameterName(parameterId: string): string {
  // If the parameterId is already a readable name, return it as is
  if (isReadableName(parameterId)) {
    return formatReadableName(parameterId);
  }

  // If it's purely numeric, convert to "Parameter {number}" format
  if (/^\d+$/.test(parameterId)) {
    return `Parameter ${parameterId}`;
  }

  // If it contains numbers and letters, try to make it more readable
  // Handle common patterns like "param1", "sensor_1", "1_temp", etc.
  
  // Pattern: number_text (e.g., "1_temperature" -> "Temperature 1")
  const numberTextMatch = parameterId.match(/^(\d+)[_-](.+)$/);
  if (numberTextMatch) {
    const [, number, text] = numberTextMatch;
    return `${formatReadableName(text)} ${number}`;
  }

  // Pattern: text_number (e.g., "temperature_1" -> "Temperature 1")
  const textNumberMatch = parameterId.match(/^(.+?)[_-](\d+)$/);
  if (textNumberMatch) {
    const [, text, number] = textNumberMatch;
    return `${formatReadableName(text)} ${number}`;
  }

  // Pattern: mixed alphanumeric (e.g., "temp1" -> "Temp 1")
  const mixedMatch = parameterId.match(/^([a-zA-Z]+)(\d+)$/);
  if (mixedMatch) {
    const [, text, number] = mixedMatch;
    return `${formatReadableName(text)} ${number}`;
  }

  // For any other pattern, try to make it readable
  return formatReadableName(parameterId);
}

/**
 * Check if a parameter ID is already a readable name
 */
function isReadableName(parameterId: string): boolean {
  // Check if it contains spaces or is in a readable format
  if (parameterId.includes(' ')) return true;
  
  // Check if it's a known readable pattern (camelCase or PascalCase with multiple words)
  if (/^[a-z]+[A-Z]/.test(parameterId) || /^[A-Z][a-z]+[A-Z]/.test(parameterId)) {
    return true;
  }

  // Check if it contains only letters (no numbers or special chars except underscore/dash)
  if (/^[a-zA-Z_-]+$/.test(parameterId) && parameterId.length > 2) {
    // But not if it's all uppercase (likely an abbreviation)
    return !/^[A-Z_]+$/.test(parameterId);
  }

  return false;
}

/**
 * Format a string to be more readable
 */
function formatReadableName(text: string): string {
  // Replace underscores and dashes with spaces
  let formatted = text.replace(/[_-]/g, ' ');

  // Handle camelCase and PascalCase
  formatted = formatted.replace(/([a-z])([A-Z])/g, '$1 $2');
  formatted = formatted.replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');

  // Capitalize first letter of each word
  formatted = formatted
    .split(' ')
    .map(word => {
      if (word.length === 0) return word;
      // Don't capitalize common abbreviations that should stay lowercase
      if (['of', 'in', 'to', 'for', 'and', 'or', 'the'].includes(word.toLowerCase())) {
        return word.toLowerCase();
      }
      // Keep all-caps abbreviations as is
      if (word.length > 1 && /^[A-Z]+$/.test(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    })
    .join(' ');

  // Always capitalize the first word
  if (formatted.length > 0) {
    const words = formatted.split(' ');
    words[0] = words[0].charAt(0).toUpperCase() + words[0].slice(1);
    formatted = words.join(' ');
  }

  // Remove extra spaces
  return formatted.replace(/\s+/g, ' ').trim();
}

/**
 * Validate if a parameter name is appropriate
 * @param parameterName - The parameter name to validate
 * @returns An object with validation result and optional warning message
 */
export function validateParameterName(parameterName: string): {
  isValid: boolean;
  warning?: string;
} {
  // Check if it's just a number
  if (/^\d+$/.test(parameterName)) {
    return {
      isValid: false,
      warning: 'Parameter name should not be just a number'
    };
  }

  // Check if it's the same as a typical ID pattern
  if (/^[A-Z0-9_]+$/.test(parameterName) && !parameterName.includes(' ')) {
    return {
      isValid: true,
      warning: 'Parameter name appears to be an ID. Consider using a more descriptive name.'
    };
  }

  // Check minimum length
  if (parameterName.length < 2) {
    return {
      isValid: false,
      warning: 'Parameter name is too short'
    };
  }

  return { isValid: true };
}