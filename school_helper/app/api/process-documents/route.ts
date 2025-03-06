// school_helper/app/api/process-documents/route.ts
import { NextResponse } from 'next/server';
import { processDocumentsFromBucket } from '../../services/documentProcessor';

export async function GET() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }
    
    const result = await processDocumentsFromBucket();
    return NextResponse.json({ 
      message: 'Documents processed',
      status: 'completed',
      details: result
    });
  } catch (error) {
    console.error('Document processing error:', error);
    return NextResponse.json({ 
      message: 'Document processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'failed'
    }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}