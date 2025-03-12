import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const logs = [];
    
    // Step 1: Check if Documents table exists and is accessible
    logs.push('Checking Documents table accessibility...');
    try {
      const { data: checkData, error: checkError } = await supabase
        .from('Documents')
        .select('id, file_url, original_name')
        .limit(1);
        
      if (checkError) {
        logs.push(`Error accessing Documents table: ${JSON.stringify(checkError)}`);
      } else {
        logs.push(`Successfully accessed Documents table. Found ${checkData.length} records`);
        if (checkData.length > 0) {
          logs.push(`Sample document: ${JSON.stringify(checkData[0])}`);
        }
      }
    } catch (e) {
      logs.push(`Exception accessing Documents table: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Step 2: Check if document_vectors table exists and is accessible
    logs.push('Checking document_vectors table accessibility...');
    try {
      const { data: checkVecData, error: checkVecError } = await supabase
        .from('document_vectors')
        .select('id, document_id')
        .limit(1);
        
      if (checkVecError) {
        logs.push(`Error accessing document_vectors table: ${JSON.stringify(checkVecError)}`);
      } else {
        logs.push(`Successfully accessed document_vectors table. Found ${checkVecData.length} records`);
        if (checkVecData.length > 0) {
          logs.push(`Sample vector: ${JSON.stringify(checkVecData[0])}`);
        }
      }
    } catch (e) {
      logs.push(`Exception accessing document_vectors table: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // Step 3: Insert a test document
    logs.push('Inserting a test document...');
    let documentId = null;
    
    try {
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          user_id: '00000000-0000-0000-0000-000000000000',
          file_url: 'test-vector-file.pdf',
          original_name: 'test-vector-file.pdf'
        })
        .select();
        
      if (docError) {
        logs.push(`Error inserting test document: ${JSON.stringify(docError)}`);
      } else if (!docData || docData.length === 0) {
        logs.push('Document was inserted but no data was returned');
      } else {
        documentId = docData[0].id;
        logs.push(`Successfully inserted test document with ID: ${documentId}`);
      }
    } catch (e) {
      logs.push(`Exception inserting test document: ${e instanceof Error ? e.message : String(e)}`);
    }
    
    // If we couldn't insert a document, try to get an existing one
    if (!documentId) {
      logs.push('Trying to get an existing document...');
      try {
        const { data: existingDoc, error: existingDocError } = await supabase
          .from('Documents')
          .select('id')
          .limit(1);
          
        if (existingDocError) {
          logs.push(`Error getting existing document: ${JSON.stringify(existingDocError)}`);
        } else if (!existingDoc || existingDoc.length === 0) {
          logs.push('No existing documents found');
        } else {
          documentId = existingDoc[0].id;
          logs.push(`Using existing document with ID: ${documentId}`);
        }
      } catch (e) {
        logs.push(`Exception getting existing document: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    
    // Step 4: Insert a test vector if we have a document ID
    let vectorResult = null;
    
    if (documentId) {
      logs.push(`Attempting to insert a test vector for document ID: ${documentId}`);
      
      // Create a very small test vector (10 values) for simplicity
      const testVector = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0];
      
      try {
        // First try with the Supabase client
        logs.push('Inserting vector using Supabase client...');
        const { data: vectorData, error: vectorError } = await supabase
          .from('document_vectors')
          .insert({
            document_id: documentId,
            vector: testVector
          })
          .select();
          
        if (vectorError) {
          logs.push(`Error inserting vector with Supabase client: ${JSON.stringify(vectorError)}`);
          vectorResult = { success: false, method: 'supabase_client', error: vectorError };
          
          // Try with direct REST API as an alternative
          logs.push('Trying with direct REST API...');
          const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
          const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
          
          if (!supabaseUrl || !supabaseKey) {
            logs.push('Missing Supabase URL or key for direct API call');
          } else {
            try {
              const response = await fetch(`${supabaseUrl}/rest/v1/document_vectors`, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Prefer': 'return=representation'
                },
                body: JSON.stringify({
                  document_id: documentId,
                  vector: testVector
                })
              });
              
              const responseText = await response.text();
              logs.push(`Direct REST API response (${response.status}): ${responseText}`);
              
              if (!response.ok) {
                logs.push(`Direct REST API call failed with status: ${response.status}`);
                vectorResult = { 
                  success: false, 
                  method: 'direct_rest', 
                  status: response.status,
                  response: responseText
                };
              } else {
                logs.push('Direct REST API call succeeded!');
                vectorResult = { 
                  success: true, 
                  method: 'direct_rest', 
                  status: response.status,
                  response: responseText
                };
              }
            } catch (restError) {
              logs.push(`Error with direct REST API call: ${restError instanceof Error ? restError.message : String(restError)}`);
              vectorResult = { 
                success: false, 
                method: 'direct_rest', 
                error: restError instanceof Error ? restError.message : String(restError)
              };
            }
          }
        } else {
          logs.push(`Vector inserted successfully: ${JSON.stringify(vectorData)}`);
          vectorResult = { success: true, method: 'supabase_client', data: vectorData };
        }
      } catch (e) {
        logs.push(`Exception during vector insertion: ${e instanceof Error ? e.message : String(e)}`);
        vectorResult = { success: false, method: 'supabase_client', error: e instanceof Error ? e.message : String(e) };
      }
    } else {
      logs.push('No document ID available, skipping vector insertion');
    }
    
    // Return all information
    return NextResponse.json({
      message: 'Test vector insertion process completed',
      logs: logs,
      documentId: documentId,
      vectorResult: vectorResult
    });
  } catch (error) {
    console.error('Error in test endpoint:', error);
    return NextResponse.json({
      message: 'Test failed',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 