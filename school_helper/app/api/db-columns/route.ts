import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
    // Try to get table structure directly using SQL
    const { data: columns, error: columnsError } = await supabase.rpc(
      'get_table_columns',
      { table_name: 'documents' }
    );
    
    if (columnsError) {
      // If RPC fails, try an alternative approach
      // Check if we can access documents table
      const { data: docs, error: docsError } = await supabase
        .from('documents')
        .select('*')
        .limit(1);
      
      return NextResponse.json({
        error: columnsError,
        alternativeCheck: {
          error: docsError,
          data: docs
        }
      });
    }
    
    return NextResponse.json({
      message: 'Table columns',
      columns
    });
  } catch (error) {
    console.error('Database columns error:', error);
    return NextResponse.json({
      message: 'Failed to retrieve columns',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 