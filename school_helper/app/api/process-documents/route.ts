import { NextResponse } from 'next/server';
import { processDocumentsFromBucket } from '../../services/documentProcessor';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { v4 as uuidv4 } from 'uuid';

export async function GET() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }

    const supabase = await createSupabaseServerClient();
    console.log('Server client created');
    
    // Log Supabase URL being used
    console.log('Using Supabase URL:', process.env.NEXT_PUBLIC_SUPABASE_URL);
    
    // Check Documents table access (uppercase)
    try {
      const { data: checkData, error: checkError } = await supabase
        .from('Documents')
        .select('id, file_url, original_name')
        .limit(1);
        
      if (checkError) {
        console.error('Error accessing Documents table:', checkError);
        console.error('Error details:', JSON.stringify(checkError, null, 2));
      } else {
        console.log('Successfully accessed Documents table:', checkData);
      }
    } catch (checkError) {
      console.error('Exception accessing Documents table:', checkError);
    }
    
    // Check document_vectors table access (lowercase)
    try {
      const { data: checkVecData, error: checkVecError } = await supabase
        .from('document_vectors')
        .select('id, document_id')
        .limit(1);
        
      if (checkVecError) {
        console.error('Error accessing document_vectors table:', checkVecError);
        console.error('Error details:', JSON.stringify(checkVecError, null, 2));
      } else {
        console.log('Successfully accessed document_vectors table:', checkVecData);
      }
    } catch (checkVecError) {
      console.error('Exception accessing document_vectors table:', checkVecError);
    }
    
    // Process documents from bucket
    const result = await processDocumentsFromBucket();
    console.log('Processing result:', result);

    if ('error' in result) {
      throw new Error(result.error);
    }

    // Process each document result
    let insertCount = 0;
    let errorCount = 0;
    
    // Simplified approach: Store document IDs and vectors to insert
    const documentsToInsert = [];
    const vectorsToInsert = [];

    // First, collect all documents and vectors to insert
    for (const stage of result) {
      if (
        stage.stage === 'completed' && 
        'vectors' in stage && 
        Array.isArray(stage.vectors) &&
        stage.vectors.length > 0
      ) {
        // Add document
        documentsToInsert.push({
          user_id: '00000000-0000-0000-0000-000000000000',
          file_url: stage.file || 'unknown-file.pdf', 
          original_name: stage.file || 'unknown-file.pdf'
        });
        
        // Add vectors with reference to the document (will be updated later)
        for (const vector of stage.vectors) {
          if (Array.isArray(vector) && vector.length > 0) {
            vectorsToInsert.push({
              document: stage.file || 'unknown-file.pdf',
              vector: vector
            });
          }
        }
      }
    }
    
    console.log(`Found ${documentsToInsert.length} documents and ${vectorsToInsert.length} vectors to insert`);
    
    // Insert documents and keep track of their IDs
    const documentIdMap = new Map();
    
    for (let i = 0; i < documentsToInsert.length; i++) {
      const doc = documentsToInsert[i];
      try {
        console.log(`Inserting document ${i+1}/${documentsToInsert.length}: ${doc.file_url}`);
        
        const { data: docData, error: docError } = await supabase
          .from('Documents')
          .insert(doc)
          .select();
          
        if (docError) {
          console.error(`Error inserting document ${i+1}:`, docError);
          console.error('Error details:', JSON.stringify(docError, null, 2));
          errorCount++;
          continue;
        }
          
        if (!docData || docData.length === 0) {
          console.error(`Document ${i+1} was inserted but no data was returned`);
          errorCount++;
          continue;
        }
          
        const documentId = docData[0].id;
        console.log(`Document ${i+1} inserted successfully with ID: ${documentId}`);
        
        // Store the document ID with its file name as the key
        documentIdMap.set(doc.file_url, documentId);
      } catch (e) {
        console.error(`Exception inserting document ${i+1}:`, e);
        errorCount++;
      }
    }
    
    // Now insert vectors using the document IDs we got
    for (let i = 0; i < vectorsToInsert.length; i++) {
      const vecData = vectorsToInsert[i];
      try {
        // Get the document ID for this vector
        const documentId = documentIdMap.get(vecData.document);
        
        if (!documentId) {
          console.error(`Could not find document ID for vector ${i+1}, document: ${vecData.document}`);
          errorCount++;
          continue;
        }
        
        console.log(`Inserting vector ${i+1}/${vectorsToInsert.length} for document ID: ${documentId}`);
        console.log(`Vector length: ${vecData.vector.length}`);
        console.log(`Vector preview: [${vecData.vector.slice(0, 5).join(', ')}...]`);
        
        // Insert vector
        const insertStart = Date.now();
        const { data: vectorData, error: vectorError } = await supabase
          .from('document_vectors')
          .insert({
            document_id: documentId,
            vector: vecData.vector
          })
          .select();
        const insertEnd = Date.now();
        
        if (vectorError) {
          console.error(`Error inserting vector ${i+1}:`, vectorError);
          console.error('Error details:', JSON.stringify(vectorError, null, 2));
          errorCount++;
          
          // Additional debug info
          console.log('Checking if document ID exists...');
          const { data: docCheck, error: docCheckError } = await supabase
            .from('Documents')
            .select('id')
            .eq('id', documentId)
            .single();
            
          if (docCheckError) {
            console.error('Error checking document:', docCheckError);
          } else {
            console.log('Document exists:', docCheck);
          }
          
          // Try a direct Supabase REST API call
          try {
            console.log('Attempting direct REST API call for vector insertion...');
            
            const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
            const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
            
            if (!supabaseUrl || !supabaseKey) {
              console.error('Missing Supabase URL or key for direct API call');
              continue;
            }
            
            // Create a simple test vector (smaller than the real one)
            const testVector = Array(10).fill(0.1);
            
            const response = await fetch(`${supabaseUrl}/rest/v1/document_vectors`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`
              },
              body: JSON.stringify({
                document_id: documentId,
                vector: testVector
              })
            });
            
            const responseText = await response.text();
            console.log(`Direct REST API response (${response.status}):`, responseText);
            
            if (!response.ok) {
              console.error('Direct REST API call failed with status:', response.status);
            } else {
              console.log('Direct REST API call succeeded!');
              insertCount++;
            }
          } catch (directApiError) {
            console.error('Error with direct REST API call:', directApiError);
          }
        } else {
          console.log(`Vector inserted successfully in ${insertEnd - insertStart}ms:`, vectorData);
          insertCount++;
        }
      } catch (vectorExc) {
        console.error(`Exception during vector ${i+1} insertion:`, vectorExc);
        errorCount++;
      }
    }

    return NextResponse.json({
      message: 'Documents processed',
      status: 'completed',
      insertCount,
      errorCount,
      documentCount: documentsToInsert.length,
      vectorCount: vectorsToInsert.length,
      details: result,
    });
  } catch (error) {
    console.error('Document processing error:', error);
    return NextResponse.json({
      message: 'Document processing failed',
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 'failed',
    }, { status: 500 });
  }
}

export async function POST() {
  return GET();
}
