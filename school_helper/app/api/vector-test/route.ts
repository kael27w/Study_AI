import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    // Create an admin client
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );
    
    // First, check if the document_vectors table exists
    const { data: tableCheck, error: tableError } = await admin
      .from('document_vectors')
      .select('*')
      .limit(1);
    
    if (tableError) {
      return NextResponse.json({
        success: false,
        error: 'Table check failed',
        details: tableError
      }, { status: 500 });
    }
    
    // Create a simple test vector
    const testVector = [0.1, 0.2, 0.3];
    
    // Try direct insert 
    const { data, error } = await admin
      .from('document_vectors')
      .insert({
        vector: testVector
      });
    
    if (error) {
      // If direct insert fails, return the error
      return NextResponse.json({
        success: false,
        message: 'Vector insertion failed',
        error: error
      });
    }
    
    return NextResponse.json({
      success: true,
      message: 'Vector inserted successfully',
      data: data
    });
  } catch (error) {
    console.error('Vector test error:', error);
    return NextResponse.json({
      success: false,
      message: 'Vector test failed with exception',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 