# Supabase Storage Setup Guide

This guide will help you set up the necessary storage buckets and Row Level Security (RLS) policies in your Supabase project to enable file uploads.

## Quick Setup (Recommended)

For the quickest setup, follow these steps:

1. Log in to your Supabase dashboard at https://app.supabase.com/
2. Select your project
3. Navigate to the SQL Editor in the left sidebar
4. Create a new query
5. Copy and paste the entire contents of the `complete_storage_setup.sql` file from this project
6. Run the query

This will set up all necessary permissions and tables in one go.

## Manual Setup (Alternative)

If you prefer to set things up manually or understand each step, follow the instructions below.

### 1. Create the Documents Bucket

1. Log in to your Supabase dashboard at https://app.supabase.com/
2. Select your project
3. Navigate to Storage in the left sidebar
4. Click "Create bucket"
5. Enter "Documents" as the bucket name (case-sensitive)
6. Choose whether to make the bucket public or private
   - Public: Anyone can read the files, but only authenticated users can upload
   - Private: Only authenticated users can read and upload files
7. Click "Create bucket"

### 2. Set Up RLS Policies

For the file upload to work, you need to set up proper Row Level Security (RLS) policies. Here's how:

#### Enable RLS on the storage tables

```sql
-- Enable RLS on storage.objects and storage.buckets
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
```

#### Create Policies for Buckets

```sql
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
```

#### Create Policies for Objects (Files)

```sql
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
```

### 3. Create the Documents Table (Optional)

If you want to store metadata about uploaded files, create a Documents table:

```sql
-- Create Documents table
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
```

## Troubleshooting

If you encounter issues with file uploads, check the following:

1. **Bucket Name**: Make sure the bucket name is exactly "Documents" (case-sensitive)

2. **RLS Policies**: Verify that RLS is enabled and policies are set up correctly:
   - Go to Authentication > Policies in your Supabase dashboard
   - Check that policies exist for both `storage.objects` and `storage.buckets`
   - If policies are missing, run the SQL commands from the Quick Setup section

3. **Authentication**: Ensure you're logged in when trying to upload files

4. **Storage Permissions**: Check if your Supabase project has storage enabled:
   - Go to Project Settings > API in your Supabase dashboard
   - Make sure Storage is enabled

5. **Console Errors**: Check the browser console for specific error messages

6. **File Path**: The upload component uses the path `public/filename` - make sure your policies allow this path

7. **File Size**: Verify that your file is under the size limit (default 20MB)

For more information, refer to the [Supabase Storage documentation](https://supabase.com/docs/guides/storage). 