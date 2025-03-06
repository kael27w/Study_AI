import { createClient } from '@/utils/supabase/client';
import { PDFLoader } from "@langchain/community/document_loaders/fs/pdf";
import { OpenAIEmbeddings } from "@langchain/openai";
import { MemoryVectorStore } from "langchain/vectorstores/memory";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";

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
      results.push({ stage: 'processing', file: file.name });

      // Download file
      const { data: downloadData, error: downloadError } = await supabase.storage
        .from('Documents')
        .download(`public/${file.name}`);

      if (downloadError) {
        console.error(`Error downloading ${file.name}:`, downloadError);
        results.push({ stage: 'error', file: file.name, error: downloadError });
        continue;
      }

      results.push({ stage: 'downloaded', file: file.name });

      // Convert to blob for PDF processing
      const blob = new Blob([downloadData], { type: 'application/pdf' });

      // Load PDF
      const loader = new PDFLoader(blob);
      const docs = await loader.load();
      results.push({ stage: 'loaded', file: file.name, pages: docs.length });

      // Split documents into chunks
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });

      const splitDocs = await textSplitter.splitDocuments(docs);
      results.push({ stage: 'split', file: file.name, chunks: splitDocs.length });

      // Create embeddings
      if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY is not set');
      }
      
      const embeddings = new OpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY,
        modelName: 'text-embedding-ada-002'
      });

      // Create vector store
      const vectorStore = await MemoryVectorStore.fromDocuments(
        splitDocs, 
        embeddings
      );

      results.push({ 
        stage: 'completed', 
        file: file.name, 
        chunks: splitDocs.length,
        sample: splitDocs[0]?.pageContent.substring(0, 100) + '...'
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
// npm install langchain @langchain/openai pdf-parse
