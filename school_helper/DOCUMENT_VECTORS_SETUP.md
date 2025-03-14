# Document Vectors Setup Guide

This guide explains how to set up the `document_vectors` table in your Supabase database for storing vector embeddings.

## Quick Setup

1. Log in to your Supabase dashboard at https://app.supabase.com/
2. Select your project
3. Navigate to the SQL Editor in the left sidebar
4. Create a new query
5. Copy and paste the contents of the `create_document_vectors_table.sql` file from this project
6. Run the query

## Table Structure

The `document_vectors` table has the following structure:

- `id` (UUID, Primary Key): Unique identifier for the vector
- `document_id` (UUID, Foreign Key): References the document this vector belongs to
- `vector` (float8[]): The actual vector embedding (typically 1536 dimensions)
- `created_at` (timestamptz): When the vector was created

## Row Level Security (RLS) Policies

The SQL script sets up the following RLS policies:

1. **Service Role Access**: Allows the service role to have full access to the table
2. **User Read Access**: Allows authenticated users to read vectors for documents they own

## Troubleshooting

If you encounter issues with vector insertion:

1. **Check Table Existence**: Make sure the `document_vectors` table exists in your database
2. **Check RLS Policies**: Verify that the RLS policies are set up correctly
3. **Check Service Role Key**: Ensure your SUPABASE_SERVICE_ROLE_KEY is set in your environment variables
4. **Check Foreign Key Constraint**: Make sure the document_id you're using exists in the Documents table

## Manual Setup

If you prefer to set up the table manually, run the following SQL commands:

```sql
-- Create document_vectors table
CREATE TABLE IF NOT EXISTS "document_vectors" (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id uuid REFERENCES "Documents"(id) NOT NULL,
  vector float8[] NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on document_vectors table
ALTER TABLE "document_vectors" ENABLE ROW LEVEL SECURITY;

-- Create policy to allow service role full access
CREATE POLICY "Allow service role full access" 
ON public."document_vectors"
FOR ALL 
TO service_role 
USING (true);

-- Create policy to allow users to read their own vectors
CREATE POLICY "Allow users to read their own vectors"
ON public."document_vectors"
FOR SELECT
TO authenticated
USING (
  document_id IN (
    SELECT id FROM "Documents" WHERE user_id = auth.uid()
  )
);
``` 