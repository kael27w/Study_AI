import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Get a sample record to see the columns
    const { data: docSample, error: docError } = await supabase
      .from('Documents')
      .select('*')
      .limit(1);
    
    if (docError) {
      return NextResponse.json({
        error: docError,
        message: 'Error querying Documents table'
      }, { status: 500 });
    }
    
    // Also try to describe the exact table schema
    const { data: docVecSample, error: docVecError } = await supabase
      .from('document_vectors')
      .select('*')
      .limit(1);
    
    return NextResponse.json({
      message: 'Database tables schema',
      documents: {
        sample: docSample,
        columns: docSample && docSample.length > 0 ? Object.keys(docSample[0]) : [],
      },
      document_vectors: {
        sample: docVecSample,
        columns: docVecSample && docVecSample.length > 0 ? Object.keys(docVecSample[0]) : [],
      }
    });
  } catch (error) {
    console.error('Database schema error:', error);
    return NextResponse.json({
      message: 'Database schema query failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 