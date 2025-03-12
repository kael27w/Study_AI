import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    
    // First insert into the documents table with no fields - let DB generate ID
    console.log('Inserting empty record into documents table');
    const { data: docData, error: docError } = await supabase
      .from('documents')
      .insert({})
      .select();
    
    if (docError) {
      return NextResponse.json({
        error: docError,
        message: 'Error inserting empty record into documents table'
      }, { status: 500 });
    }
    
    // Get the auto-generated document ID
    const documentId = docData[0].id;
    console.log('Auto-generated document ID:', documentId);
    
    // Create a simple test vector (3 numbers)
    const testVector = [0.1, 0.2, 0.3];
    
    // Now try to insert into document_vectors
    const { data, error } = await supabase
      .from('document_vectors')
      .insert({
        document_id: documentId,
        vector: testVector
      });
    
    if (error) {
      return NextResponse.json({
        error,
        message: 'Error inserting test vector after document creation'
      }, { status: 500 });
    }
    
    return NextResponse.json({
      message: 'Test vector inserted successfully',
      documentId,
      data
    });
  } catch (error) {
    console.error('Database test error:', error);
    return NextResponse.json({
      message: 'Database test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 