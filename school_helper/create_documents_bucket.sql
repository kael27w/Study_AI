-- Create Documents bucket if it doesn't exist
DO $$
DECLARE
  bucket_exists BOOLEAN;
BEGIN
  -- Check if the bucket already exists
  SELECT EXISTS (
    SELECT 1 FROM storage.buckets WHERE name = 'Documents'
  ) INTO bucket_exists;
  
  -- Create the bucket if it doesn't exist
  IF NOT bucket_exists THEN
    INSERT INTO storage.buckets (id, name, public)
    VALUES ('Documents', 'Documents', TRUE);
    
    -- Create policy to allow authenticated users to upload files
    INSERT INTO storage.policies (name, definition, bucket_id)
    VALUES (
      'Allow authenticated users to upload',
      '(auth.role() = ''authenticated'')',
      'Documents'
    );
    
    -- Create policy to allow authenticated users to download their own files
    INSERT INTO storage.policies (name, definition, bucket_id)
    VALUES (
      'Allow authenticated users to download',
      '(auth.role() = ''authenticated'')',
      'Documents'
    );
    
    -- Create policy to allow service role to access all files
    INSERT INTO storage.policies (name, definition, bucket_id)
    VALUES (
      'Allow service role full access',
      '(auth.role() = ''service_role'')',
      'Documents'
    );
    
    RAISE NOTICE 'Documents bucket created successfully';
  ELSE
    RAISE NOTICE 'Documents bucket already exists';
  END IF;
END
$$; 