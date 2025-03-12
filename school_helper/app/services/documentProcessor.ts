import { createClient } from '@/utils/supabase/client';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { v4 as uuidv4 } from 'uuid';

export async function processDocumentsFromBucket() {
  console.log('API Key available:', !!process.env.OPENAI_API_KEY);
  const supabase = createClient();
  const results = [];

  // List files in the Documents bucket
  const { data: files, error } = await supabase.storage
    .from('Documents')
    .list('public/', {
      limit: 100,
      offset: 0,
      sortBy: { column: 'created_at', order: 'desc' }
    });

  if (error) {
    console.error('Error listing files:', error);
    return { error: 'Failed to list files', details: error };
  }

  results.push({ stage: 'files_found', count: files.length, files });

  // Process each PDF file
  const pdfFiles = files.filter(f => f.name.endsWith('.pdf'));
  results.push({ stage: 'pdf_files', count: pdfFiles.length, files: pdfFiles });

  for (const file of pdfFiles) {
    try {
      console.log(`Starting to process: ${file.name}`);
      const documentId = uuidv4(); // Generate a UUID for this document
      results.push({ stage: 'processing', file: file.name, documentId });

      // Download file
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('Documents')
        .download(`public/${file.name}`);

      if (downloadError) {
        console.error(`Error downloading ${file.name}:`, downloadError);
        results.push({ stage: 'error', file: file.name, error: downloadError });
        continue;
      }

      results.push({ stage: 'downloaded', file: file.name, documentId });

      // Convert to blob for PDF processing
      const blob = new Blob([downloadData], { type: 'application/pdf' });

      // Load PDF
      const loader = new PDFLoader(blob);
      const docs = await loader.load();
      results.push({ stage: 'loaded', file: file.name, documentId, pages: docs.length });

      // Split documents into chunks
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(docs);
      results.push({ stage: 'split', file: file.name, documentId, chunks: splitDocs.length });

      // Create embeddings
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }
      
      const embeddings = new OpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY,
        modelName: 'text-embedding-ada-002'
      });

      // Generate vector embeddings for each chunk
      console.log(`Generating embeddings for ${splitDocs.length} chunks...`);
      const vectors = [];
      for (const doc of splitDocs) {
        try {
          const vector = await embeddings.embedQuery(doc.pageContent);
          vectors.push(vector);
        } catch (error) {
          console.error('Error generating embedding:', error);
        }
      }

      // Skip if no vectors were generated
      if (vectors.length === 0) {
        console.error('No vectors generated for document. Skipping.');
        results.push({ 
          stage: 'error', 
          file: file.name, 
          error: 'No vectors could be generated'
        });
        continue;
      }

      results.push({ 
        stage: 'completed', 
        file: file.name, 
        documentId,
        chunks: splitDocs.length,
        vectors,
        sampleText: splitDocs[0]?.pageContent.substring(0, 100) + '...'
      });

    } catch (error) {
      console.error(`Error processing ${file.name}:`, error);
      results.push({ 
        stage: 'error', 
        file: file.name, 
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  return results;
}

// Bash command to install dependencies
// npm install langchain @langchain/openai pdf-parse uuid
