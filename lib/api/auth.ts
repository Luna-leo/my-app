import { NextRequest } from 'next/server';

const API_KEY = process.env.API_KEY || 'demo-api-key-12345';

export function validateApiKey(request: NextRequest): boolean {
  const apiKey = request.headers.get('x-api-key');
  return apiKey === API_KEY;
}

