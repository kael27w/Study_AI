# Document Processing Setup Guide

This guide will help you set up the necessary components for document processing in your Supabase project.

## Prerequisites

- A Supabase project
- Admin access to your Supabase project
- OpenAI API key set in your environment variables

## Setup Steps

### 1. Create the Documents Storage Bucket

1. Log in to your Supabase dashboard at [https://app.supabase.com](https://app.supabase.com)
2. Select your project
3. Navigate to the SQL Editor
4. Create a new query
5. Copy and paste the contents of `create_documents_bucket.sql` into the query editor
6. Run the query

This will create a storage bucket called "Documents" with the necessary permissions for authenticated users to upload and download files.

### 2. Create the document_vectors Table

1. While still in the SQL Editor, create a new query
2. Copy and paste the contents of `create_document_vectors_table.sql` into the query editor
3. Run the query

This will create the `document_vectors` table with the necessary columns and Row Level Security (RLS) policies.

## Table Structures

### Documents Table (Already exists in the schema)

The Documents table stores metadata about uploaded files:

- `id`: UUID primary key
- `user_id`: UUID of the user who uploaded the document
- `file_url`: URL or path to the file in storage
- `original_name`: Original filename
- `created_at`: Timestamp of when the record was created

### document_vectors Table

The document_vectors table stores vector embeddings for document chunks:

- `id`: UUID primary key
- `document_id`: Foreign key reference to the Documents table
- `vector`: Vector embedding of a document chunk
- `created_at`: Timestamp of when the record was created

## Row Level Security (RLS) Policies

The following RLS policies are set up:

### For the Documents Bucket:
- Authenticated users can upload files
- Authenticated users can download files
- Service role has full access

### For the document_vectors Table:
- Service role has full access
- Authenticated users can read vectors associated with their documents

## Troubleshooting

### Vector Insertion Issues

If you encounter issues with vector insertion:

1. **Check if the document_vectors table exists**: Run `SELECT * FROM information_schema.tables WHERE table_name = 'document_vectors';` in the SQL Editor.
2. **Check RLS policies**: Make sure the RLS policies are correctly set up.
3. **Check service role key**: Ensure your service role key has the necessary permissions.
4. **Check foreign key constraints**: Make sure the document_id exists in the Documents table.

### File Upload Issues

If you encounter issues with file uploads:

1. **Check if the Documents bucket exists**: Run `SELECT * FROM storage.buckets WHERE name = 'Documents';` in the SQL Editor.
2. **Check storage policies**: Make sure the storage policies allow uploads.
3. **Check file size**: Ensure the file size is within the limits set by Supabase.
4. **Check file path**: Make sure the file path is correct (should be in the format `public/filename.pdf`).

## Testing the Setup

After completing the setup, you can test it by:

1. Uploading a PDF file through the application
2. Check the server logs for processing status
3. Verify that the document was added to the Documents table
4. Verify that vectors were added to the document_vectors table

## Manual Setup Commands

If you prefer to set up the tables manually, you can use the following SQL commands:

### Create Documents Bucket

```sql
INSERT INTO storage.buckets (id, name, public)
VALUES ('Documents', 'Documents', TRUE);

-- Create policies
INSERT INTO storage.policies (name, definition, bucket_id)
VALUES 
  ('Allow authenticated users to upload', '(auth.role() = ''authenticated'')', 'Documents'),
  ('Allow authenticated users to download', '(auth.role() = ''authenticated'')', 'Documents'),
  ('Allow service role full access', '(auth.role() = ''service_role'')', 'Documents');
```

### Create document_vectors Table

```sql
-- Create the document_vectors table
CREATE TABLE IF NOT EXISTS document_vectors (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id UUID REFERENCES Documents(id) ON DELETE CASCADE,
  vector VECTOR,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable row level security
ALTER TABLE document_vectors ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Service role can do anything" 
  ON document_vectors 
  FOR ALL 
  TO service_role 
  USING (true);

CREATE POLICY "Users can read their own vectors" 
  ON document_vectors 
  FOR SELECT 
  TO authenticated 
  USING (
    document_id IN (
      SELECT id FROM "Documents" WHERE user_id = auth.uid()
    )
  );
``` 