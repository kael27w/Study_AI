# Document Vector Processing Implementation

## Overview

This document details the implementation of document vector processing in the School Helper application. The system processes PDF documents, generates vector embeddings using OpenAI's embedding model, and stores both the documents and their vector representations in a Supabase database for semantic search capabilities.

## System Architecture

### Components

1. **Document Storage**: PDF documents are stored in Supabase Storage buckets
2. **Document Processing**: Server-side processing using Next.js API routes
3. **Vector Generation**: OpenAI API for generating embeddings
4. **Database**: Supabase PostgreSQL database with two main tables:
   - `Documents` (uppercase): Stores document metadata
   - `document_vectors` (lowercase): Stores vector embeddings with references to documents

### Database Schema

#### Documents Table
- `id` (UUID, Primary Key): Unique identifier for the document
- `user_id` (UUID, Foreign Key): References the user who owns the document
- `file_url` (Text): URL to the stored PDF file
- `original_name` (Text): Original filename of the document

#### document_vectors Table
- `id` (UUID, Primary Key): Unique identifier for the vector
- `document_id` (UUID, Foreign Key): References the document this vector belongs to
- `vector` (float8[]): The actual vector embedding (typically 1536 dimensions)
- `created_at` (timestamptz): When the vector was created

## Implementation Process

### 1. Initial Setup

We started with a basic Next.js application with Supabase integration. The application had existing functionality for user authentication and document storage.

### 2. Document Processing Pipeline

We implemented a document processing pipeline with the following steps:

1. **Fetch Documents**: Retrieve PDF documents from the Supabase storage bucket
2. **Download PDFs**: Download the PDFs for processing
3. **Load Documents**: Parse the PDFs into text
4. **Split Documents**: Split the text into manageable chunks
5. **Generate Vectors**: Create vector embeddings for each chunk using OpenAI
6. **Store Results**: Save documents and vectors to the database

This pipeline was implemented in the `processDocumentsFromBucket` function in the `documentProcessor.ts` service.

### 3. API Endpoints

We created several API endpoints to handle different aspects of the document processing:

1. `/api/process-documents`: Main endpoint for processing documents and storing vectors
2. `/api/test-vector-insert`: Test endpoint for debugging vector insertion
3. `/api/check-env`: Utility endpoint for verifying environment variables

## Challenges and Solutions

### Challenge 1: Database Table Case Sensitivity

**Problem**: We encountered confusion between `Documents` (uppercase) and `documents` (lowercase) tables in the database.

**Solution**: We standardized on using:
- `Documents` (uppercase) for the documents table
- `document_vectors` (lowercase) for the vectors table

We updated all code to consistently use these case-sensitive table names.

### Challenge 2: Row Level Security (RLS) Policies

**Problem**: Supabase RLS policies were preventing insertion of documents and vectors from server-side code.

**Solution**: We implemented two approaches:
1. Created a service role policy to bypass RLS:
   ```sql
   CREATE POLICY "Allow service role full access" 
   ON public."Documents"
   FOR ALL 
   TO service_role 
   USING (true);
   
   CREATE POLICY "Allow service role full access" 
   ON public.document_vectors
   FOR ALL 
   TO service_role 
   USING (true);
   ```

2. Updated the server-side code to use the service role key:
   ```typescript
   // In utils/supabase/server.ts
   export const createSupabaseServerClient = async () => {
     // Check if we have the service role key
     if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
       console.warn('SUPABASE_SERVICE_ROLE_KEY is not set! Falling back to anon key.');
     }
     
     // Use service role key if available, otherwise fall back to anon key
     const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
     
     return createClient(
       process.env.NEXT_PUBLIC_SUPABASE_URL!,
       supabaseKey,
       {
         auth: {
           persistSession: false,
         }
       }
     );
   };
   ```

### Challenge 3: Foreign Key Constraint

**Problem**: We encountered a foreign key constraint error when trying to insert documents:
```
"Error inserting test document: {"code":"23503","details":"Key (user_id)=(00000000-0000-0000-0000-000000000000) is not present in table \"users\".","hint":null,"message":"insert or update on table \"Documents\" violates foreign key constraint \"Documents_user_id_fkey\""}"
```

**Solution**: We created a system user in the `users` table with the ID we were using:
```sql
INSERT INTO auth.users (id, email)
VALUES ('00000000-0000-0000-0000-000000000000', 'system@example.com');
```

### Challenge 4: Environment Variables

**Problem**: The service role key wasn't being properly loaded from environment variables.

**Solution**: 
1. We fixed the formatting in the `.env.local` file by removing extra spaces:
   ```
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
   ```

2. We created a check endpoint to verify the environment variables were loaded:
   ```typescript
   export async function GET() {
     return NextResponse.json({
       hasServiceRoleKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
       serviceRoleKeyLength: process.env.SUPABASE_SERVICE_ROLE_KEY ? 
         process.env.SUPABASE_SERVICE_ROLE_KEY.length : 0,
     });
   }
   ```

## Final Implementation

The final implementation successfully:
1. Processes PDF documents from the storage bucket
2. Generates vector embeddings for the document content
3. Stores documents in the `Documents` table
4. Stores vector embeddings in the `document_vectors` table

### Key Code Snippets

#### Document Processing Endpoint

```typescript
export async function GET() {
  try {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is not set in environment variables');
    }

    const supabase = await createSupabaseServerClient();
    
    // Process documents from bucket
    const result = await processDocumentsFromBucket();

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
        
        // Add vectors with reference to the document
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
    
    // Insert documents and keep track of their IDs
    const documentIdMap = new Map();
    
    for (let i = 0; i < documentsToInsert.length; i++) {
      const doc = documentsToInsert[i];
      try {
        const { data: docData, error: docError } = await supabase
          .from('Documents')
          .insert(doc)
          .select();
          
        if (docError) {
          errorCount++;
          continue;
        }
          
        const documentId = docData[0].id;
        documentIdMap.set(doc.file_url, documentId);
      } catch (e) {
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
          errorCount++;
          continue;
        }
        
        // Insert vector
        const { data: vectorData, error: vectorError } = await supabase
          .from('document_vectors')
          .insert({
            document_id: documentId,
            vector: vecData.vector
          })
          .select();
        
        if (vectorError) {
          errorCount++;
        } else {
          insertCount++;
        }
      } catch (vectorExc) {
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
```

## Testing

We verified the implementation with the following tests:

1. **Test Vector Insertion**: Successfully inserted test vectors using the `/api/test-vector-insert` endpoint
2. **Document Processing**: Successfully processed documents and stored vectors using the `/api/process-documents` endpoint

## Next Steps

1. **Implement Semantic Search**: Use the stored vectors for semantic search functionality
2. **Optimize Vector Storage**: Consider using pgvector extension for more efficient vector operations
3. **Add User Interface**: Create a UI for users to view and search their documents
4. **Implement Batch Processing**: Add support for processing multiple documents in batches

## Conclusion

We have successfully implemented a document processing system that:
1. Extracts text from PDF documents
2. Generates vector embeddings using OpenAI
3. Stores documents and vectors in a Supabase database
4. Handles various edge cases and error conditions

This system provides the foundation for semantic search and AI-powered document analysis in the School Helper application. 