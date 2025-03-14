-- Create the document_vectors table if it doesn't exist
CREATE TABLE IF NOT EXISTS document_vectors (
  id BIGSERIAL PRIMARY KEY,
  document_id UUID NOT NULL,
  content TEXT NOT NULL,
  embedding VECTOR(1536), -- OpenAI's ada-002 embedding size is 1536
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create an index for faster searches
CREATE INDEX IF NOT EXISTS document_vectors_document_id_idx ON document_vectors (document_id);

-- Add RLS policies
ALTER TABLE document_vectors ENABLE ROW LEVEL SECURITY;

-- Policy to allow users to see their own document vectors
CREATE POLICY "Users can view their document vectors" 
ON document_vectors 
FOR SELECT 
USING (
  document_id IN (
    SELECT id FROM public.documents WHERE user_id = auth.uid()
  )
);

-- Policy to allow users to insert their own document vectors
CREATE POLICY "Users can insert their document vectors" 
ON document_vectors 
FOR INSERT 
WITH CHECK (
  document_id IN (
    SELECT id FROM public.documents WHERE user_id = auth.uid()
  )
);

-- Policy to allow service role to access all document vectors (for background processing)
CREATE POLICY "Service role can manage all document vectors" 
ON document_vectors 
USING (auth.role() = 'service_role');

-- Grant permissions to authenticated users
GRANT SELECT, INSERT ON document_vectors TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE document_vectors_id_seq TO authenticated; 