-- Create document_vectors table if it doesn't exist
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