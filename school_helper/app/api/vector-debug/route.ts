import { NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    // Create a direct client with service role if available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' }
    });
    
    // Generate test IDs
    const testDocId = uuidv4();
    const testVectorId = uuidv4();
    
    // Create a simple test vector
    const testVector = Array(1536).fill(0).map((_, i) => i / 1536); // Creates a valid-sized vector
    
    // Get the database schema information first
    let schemaInfo: Record<string, any> = {};
    try {
      // Raw SQL query to see table information
      const { data: tableInfo, error: tableError } = await supabase
        .rpc('debug_get_tables');
      
      if (tableError) {
        schemaInfo = { error: tableError };
      } else {
        schemaInfo = { tables: tableInfo };
      }
    } catch (schemaError) {
      schemaInfo = { error: `Schema query failed: ${schemaError}` };
    }
    
    // Test document creation
    const documentResult = await testDocumentInsertion(supabase, testDocId);
    
    // Test vector insertion with different methods
    const vectorResults = await testVectorInsertionMethods(supabase, testDocId, testVector);
    
    return NextResponse.json({
      message: 'Vector debug results',
      supabaseUrl,
      documentResult,
      vectorResults,
      schemaInfo
    });
  } catch (error) {
    console.error('Vector debug error:', error);
    return NextResponse.json({
      message: 'Vector debug failed',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
}

async function testDocumentInsertion(supabase: SupabaseClient, docId: string) {
  const results: {
    docId: string;
    methods: Record<string, any>;
  } = {
    docId,
    methods: {}
  };
  
  // Method 1: Direct insert
  try {
    const { data, error } = await supabase
      .from('documents')
      .insert({
        id: docId,
        user_id: '00000000-0000-0000-0000-000000000000',
        file_url: 'test-file.pdf'
      })
      .select();
    
    results.methods.directInsert = {
      success: !error,
      data,
      error
    };
  } catch (e) {
    results.methods.directInsert = {
      success: false,
      error: String(e)
    };
  }
  
  // Method 2: Raw SQL insert
  try {
    const { data, error } = await supabase.rpc('insert_test_document', {
      doc_id: docId
    });
    
    results.methods.rpcInsert = {
      success: !error,
      data,
      error
    };
  } catch (e) {
    results.methods.rpcInsert = {
      success: false,
      error: String(e)
    };
  }
  
  return results;
}

async function testVectorInsertionMethods(supabase: SupabaseClient, docId: string, vector: number[]) {
  const results: {
    docId: string;
    vectorSize: number;
    methods: Record<string, any>;
  } = {
    docId,
    vectorSize: vector.length,
    methods: {}
  };
  
  // Method 1: Direct insert
  try {
    const { data, error } = await supabase
      .from('document_vectors')
      .insert({
        document_id: docId,
        vector: vector
      })
      .select();
    
    results.methods.directInsert = {
      success: !error,
      data,
      error
    };
  } catch (e) {
    results.methods.directInsert = {
      success: false,
      error: String(e)
    };
  }
  
  // Method 2: RPC
  try {
    const { data, error } = await supabase.rpc('insert_test_vector', {
      doc_id: docId,
      vec_data: vector
    });
    
    results.methods.rpcInsert = {
      success: !error,
      data,
      error
    };
  } catch (e) {
    results.methods.rpcInsert = {
      success: false,
      error: String(e)
    };
  }
  
  // Method 3: REST API
  try {
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/document_vectors`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        document_id: docId,
        vector: vector
      })
    });
    
    const responseText = await response.text();
    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      responseData = responseText;
    }
    
    results.methods.restApi = {
      success: response.ok,
      status: response.status,
      headers: Object.fromEntries(response.headers.entries()),
      data: responseData
    };
  } catch (e) {
    results.methods.restApi = {
      success: false,
      error: String(e)
    };
  }
  
  return results;
} 