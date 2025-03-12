import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';

export async function GET() {
  try {
    const supabase = await createSupabaseServerClient();
    const results = [];
    
    // Step 1: Check Documents table (uppercase)
    try {
      const { data: documentsSchema, error: documentsError } = await supabase
        .rpc('exec_sql', { 
          sql_query: `
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'Documents'
            ORDER BY ordinal_position;
          `
        });
        
      if (documentsError) {
        results.push({ 
          step: 'check_documents_schema', 
          status: 'error', 
          error: documentsError 
        });
      } else {
        results.push({ 
          step: 'check_documents_schema', 
          status: 'success', 
          data: documentsSchema 
        });
      }
    } catch (e) {
      results.push({ 
        step: 'check_documents_schema', 
        status: 'exception', 
        error: e instanceof Error ? e.message : String(e) 
      });
    }
    
    // Step 2: Check document_vectors table
    try {
      const { data: vectorsSchema, error: vectorsError } = await supabase
        .rpc('exec_sql', { 
          sql_query: `
            SELECT column_name, data_type, is_nullable 
            FROM information_schema.columns 
            WHERE table_name = 'document_vectors'
            ORDER BY ordinal_position;
          `
        });
        
      if (vectorsError) {
        results.push({ 
          step: 'check_vectors_schema', 
          status: 'error', 
          error: vectorsError 
        });
      } else {
        results.push({ 
          step: 'check_vectors_schema', 
          status: 'success', 
          data: vectorsSchema 
        });
      }
    } catch (e) {
      results.push({ 
        step: 'check_vectors_schema', 
        status: 'exception', 
        error: e instanceof Error ? e.message : String(e) 
      });
    }
    
    // Step 3: Check foreign key constraints
    try {
      const { data: foreignKeys, error: foreignKeysError } = await supabase
        .rpc('exec_sql', { 
          sql_query: `
            SELECT
              tc.table_name AS table_with_foreign_key,
              kcu.column_name AS column_with_foreign_key,
              ccu.table_name AS referenced_table,
              ccu.column_name AS referenced_column
            FROM
              information_schema.table_constraints AS tc
              JOIN information_schema.key_column_usage AS kcu
                ON tc.constraint_name = kcu.constraint_name
              JOIN information_schema.constraint_column_usage AS ccu
                ON ccu.constraint_name = tc.constraint_name
            WHERE tc.constraint_type = 'FOREIGN KEY'
              AND (tc.table_name = 'document_vectors' OR ccu.table_name = 'document_vectors'
                   OR tc.table_name = 'Documents' OR ccu.table_name = 'Documents');
          `
        });
        
      if (foreignKeysError) {
        results.push({ 
          step: 'check_foreign_keys', 
          status: 'error', 
          error: foreignKeysError 
        });
      } else {
        results.push({ 
          step: 'check_foreign_keys', 
          status: 'success', 
          data: foreignKeys 
        });
      }
    } catch (e) {
      results.push({ 
        step: 'check_foreign_keys', 
        status: 'exception', 
        error: e instanceof Error ? e.message : String(e) 
      });
    }
    
    // Step 4: Try to insert a test document with direct SQL
    try {
      const { data: insertDoc, error: insertDocError } = await supabase
        .rpc('exec_sql', { 
          sql_query: `
            INSERT INTO "Documents" (file_url, original_name, user_id)
            VALUES ('test-file.pdf', 'test-file.pdf', '00000000-0000-0000-0000-000000000000')
            RETURNING id;
          `
        });
        
      if (insertDocError) {
        results.push({ 
          step: 'insert_test_document', 
          status: 'error', 
          error: insertDocError 
        });
      } else {
        // Document inserted successfully, get the ID
        let documentId = null;
        if (insertDoc && insertDoc.length > 0 && insertDoc[0].length > 0) {
          documentId = insertDoc[0][0].id;
          results.push({ 
            step: 'insert_test_document', 
            status: 'success', 
            documentId: documentId
          });
          
          // Step 5: Try to insert a test vector
          try {
            // Create a small test vector
            const testVector = Array(1536).fill(0.1);
            
            const { data: insertVector, error: insertVectorError } = await supabase
              .rpc('exec_sql', { 
                sql_query: `
                  INSERT INTO document_vectors (document_id, vector)
                  VALUES ('${documentId}', '{${testVector.join(',')}}')
                  RETURNING id;
                `
              });
              
            if (insertVectorError) {
              results.push({ 
                step: 'insert_test_vector', 
                status: 'error', 
                error: insertVectorError,
                documentId: documentId
              });
            } else {
              results.push({ 
                step: 'insert_test_vector', 
                status: 'success', 
                data: insertVector,
                documentId: documentId
              });
            }
          } catch (e) {
            results.push({ 
              step: 'insert_test_vector', 
              status: 'exception', 
              error: e instanceof Error ? e.message : String(e),
              documentId: documentId
            });
          }
        } else {
          results.push({ 
            step: 'insert_test_document', 
            status: 'error', 
            error: 'Document was inserted but no ID was returned'
          });
        }
      }
    } catch (e) {
      results.push({ 
        step: 'insert_test_document', 
        status: 'exception', 
        error: e instanceof Error ? e.message : String(e) 
      });
    }
    
    return NextResponse.json({
      message: 'Database schema and test operations completed',
      results: results
    });
  } catch (error) {
    console.error('Error checking schema:', error);
    return NextResponse.json({
      message: 'Error checking schema',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
} 