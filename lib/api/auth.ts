import { NextRequest } from 'next/server';

const API_KEY = process.env.API_KEY || 'demo-api-key-12345';
const REQUIRE_AUTH = process.env.REQUIRE_AUTH === 'true';

export function validateApiKey(request: NextRequest): boolean {
  // If authentication is not required, always return true
  if (!REQUIRE_AUTH) {
    return true;
  }
  
  const apiKey = request.headers.get('x-api-key');
  return apiKey === API_KEY;
}

