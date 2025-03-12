import { NextResponse } from 'next/server';

export async function GET() {
  return NextResponse.json({
    hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY ? 
      process.env.SUPABASE_SERVICE_ROLE_KEY.length : 0,
    // Don't log the actual key for security reasons
  });
}
