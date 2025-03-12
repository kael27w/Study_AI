import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
    // Create a direct client with service role if available
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    
    const supabase = createClient(supabaseUrl, supabaseKey, {
      db: { schema: 'public' }
    });
    
    // Create SQL functions to help with vector operations
    const results = [];
    
    // 1. Create a function to get table schema
    try {
      const { data: schemaFnResult, error: schemaFnError } = await supabase.rpc(
        'exec_sql',
        {
          sql_query: `
            CREATE OR REPLACE FUNCTION get_vector_table_schema()
            RETURNS json AS $$
            DECLARE
              result json;
            BEGIN
              SELECT json_build_object(
                'document_vectors', (
                  SELECT json_build_object(
                    'columns', (
                      SELECT json_agg(json_build_object(
                        'column_name', column_name,
                        'data_type', data_type,
                        'is_nullable', is_nullable
                      ))
                      FROM information_schema.columns
                      WHERE table_name = 'document_vectors'
                    ),
                    'constraints', (
                      SELECT json_agg(json_build_object(
                        'constraint_name', tc.constraint_name,
                        'constraint_type', tc.constraint_type,
                        'table_name', tc.table_name,
                        'referenced_table', ccu.table_name
                      ))
                      FROM information_schema.table_constraints tc
                      LEFT JOIN information_schema.constraint_column_usage ccu
                        ON tc.constraint_name = ccu.constraint_name
                      WHERE tc.table_name = 'document_vectors'
                    )
                  )
                ),
                'documents', (
                  SELECT json_build_object(
                    'columns', (
                      SELECT json_agg(json_build_object(
                        'column_name', column_name,
                        'data_type', data_type,
                        'is_nullable', is_nullable
                      ))
                      FROM information_schema.columns
                      WHERE table_name = 'documents'
                    )
                  )
                )
              ) INTO result;
              
              RETURN result;
            END;
            $$ LANGUAGE plpgsql;
          `
        }
      );
      
      results.push({
        function: 'get_vector_table_schema',
        success: !schemaFnError,
        error: schemaFnError
      });
    } catch (e) {
      results.push({
        function: 'get_vector_table_schema',
        success: false,
        error: String(e)
      });
    }
    
    // 2. Create a function to insert a document and return its ID
    try {
      const { data: docFnResult, error: docFnError } = await supabase.rpc(
        'exec_sql',
        {
          sql_query: `
            CREATE OR REPLACE FUNCTION insert_document(
              p_file_url text,
              p_original_name text
            )
            RETURNS uuid AS $$
            DECLARE
              doc_id uuid;
            BEGIN
              INSERT INTO "documents" (
                user_id,
                file_url,
                original_name
              ) VALUES (
                '00000000-0000-0000-0000-000000000000',
                p_file_url,
                p_original_name
              )
              RETURNING id INTO doc_id;
              
              RETURN doc_id;
            END;
            $$ LANGUAGE plpgsql;
          `
        }
      );
      
      results.push({
        function: 'insert_document',
        success: !docFnError,
        error: docFnError
      });
    } catch (e) {
      results.push({
        function: 'insert_document',
        success: false,
        error: String(e)
      });
    }
    
    // 3. Create a function to insert a vector
    try {
      const { data: vectorFnResult, error: vectorFnError } = await supabase.rpc(
        'exec_sql',
        {
          sql_query: `
            CREATE OR REPLACE FUNCTION insert_vector(
              p_document_id uuid,
              p_vector float8[]
            )
            RETURNS uuid AS $$
            DECLARE
              vector_id uuid;
            BEGIN
              INSERT INTO "document_vectors" (
                document_id,
                vector
              ) VALUES (
                p_document_id,
                p_vector
              )
              RETURNING id INTO vector_id;
              
              RETURN vector_id;
            END;
            $$ LANGUAGE plpgsql;
          `
        }
      );
      
      results.push({
        function: 'insert_vector',
        success: !vectorFnError,
        error: vectorFnError
      });
    } catch (e) {
      results.push({
        function: 'insert_vector',
        success: false,
        error: String(e)
      });
    }
    
    // 4. Create a helper function to execute SQL
    try {
      const { data: execSqlResult, error: execSqlError } = await supabase.rpc(
        'exec_sql',
        {
          sql_query: `
            CREATE OR REPLACE FUNCTION exec_sql(sql_query text)
            RETURNS json AS $$
            BEGIN
              EXECUTE sql_query;
              RETURN json_build_object('success', true);
            EXCEPTION WHEN OTHERS THEN
              RETURN json_build_object(
                'success', false,
                'error', SQLERRM,
                'detail', SQLSTATE
              );
            END;
            $$ LANGUAGE plpgsql SECURITY DEFINER;
          `
        }
      );
      
      results.push({
        function: 'exec_sql',
        success: !execSqlError,
        error: execSqlError
      });
    } catch (e) {
      results.push({
        function: 'exec_sql',
        success: false,
        error: String(e)
      });
    }
    
    return NextResponse.json({
      message: 'SQL functions created',
      results
    });
  } catch (error) {
    console.error('Error creating SQL functions:', error);
    return NextResponse.json({
      message: 'Failed to create SQL functions',
      error: error instanceof Error ? error.message : String(error)
    }, { status: 500 });
  }
} 