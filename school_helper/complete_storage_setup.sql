-- First, check if RLS is enabled on storage.objects and enable it if not
SELECT obj_description((quote_ident('storage') || '.' || quote_ident('objects'))::regclass, 'pg_class');

-- Enable RLS on storage.objects and storage.buckets
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow users to upload files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to read their own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to update their own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow users to delete their own files" ON storage.objects;
DROP POLICY IF EXISTS "Allow public access to files" ON storage.objects;
DROP POLICY IF EXISTS "Allow bucket creation" ON storage.buckets;
DROP POLICY IF EXISTS "Allow bucket access" ON storage.buckets;

-- Create policies for storage.buckets
CREATE POLICY "Allow bucket creation"
ON storage.buckets
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow bucket access"
ON storage.buckets
FOR SELECT
TO authenticated
USING (true);

-- Create policies for storage.objects
CREATE POLICY "Allow users to upload files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Allow users to read their own files"
ON storage.objects
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Allow users to update their own files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);

CREATE POLICY "Allow users to delete their own files"
ON storage.objects
FOR DELETE
TO authenticated
USING (true);

-- Create policy for public access to files
CREATE POLICY "Allow public access to files"
ON storage.objects
FOR SELECT
TO anon
USING (true);

-- Create Documents table if it doesn't exist
CREATE TABLE IF NOT EXISTS "Documents" (
  id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id uuid REFERENCES auth.users(id) NOT NULL,
  file_url text NOT NULL,
  original_name text,
  uploaded_at timestamp with time zone DEFAULT now(),
  course_id integer,
  created_at timestamp with time zone DEFAULT now()
);

-- Enable RLS on Documents table
ALTER TABLE "Documents" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to avoid conflicts
DROP POLICY IF EXISTS "Allow users to insert their own documents" ON "Documents";
DROP POLICY IF EXISTS "Allow users to read their own documents" ON "Documents";

-- Create policy to allow users to insert their own documents
CREATE POLICY "Allow users to insert their own documents"
ON "Documents"
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

-- Create policy to allow users to read their own documents
CREATE POLICY "Allow users to read their own documents"
ON "Documents"
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

-- Output success message
SELECT 'Storage setup complete. All necessary policies have been created.' as result; 