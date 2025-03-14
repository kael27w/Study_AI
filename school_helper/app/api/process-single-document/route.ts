import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { OpenAIEmbeddings } from "@langchain/openai";
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { v4 as uuidv4 } from 'uuid';

// Function to process form data and handle file upload
async function processFormData(request: Request) {
  const formData = await request.formData();
  const file = formData.get('file') as File;
  
  if (!file) {
    throw new Error('No file provided');
  }
  
  console.log("🔍 [DEBUG API] File received:", file.name, "size:", file.size);
  return { file, fileName: file.name };
}

export async function POST(request: Request) {
  console.log("🔍 [DEBUG API] process-single-document API called");
  
  // Check if we have an OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("🔍 [DEBUG API] Missing OpenAI API key");
    return NextResponse.json({ 
      message: "OpenAI API key is missing", 
      status: "failed" 
    }, { status: 500 });
  }
  
  try {
    // Check content type to determine if this is form data or JSON
    const contentType = request.headers.get('content-type') || '';
    
    let file: File | null = null;
    let fileName = '';
    let fileData: ArrayBuffer | null = null;
    let filePath = '';
    
    if (contentType.includes('multipart/form-data')) {
      console.log("🔍 [DEBUG API] Processing form data upload");
      try {
        const result = await processFormData(request);
        file = result.file;
        fileName = result.fileName;
        fileData = await file.arrayBuffer();
      } catch (error) {
        console.error("🔍 [DEBUG API] Error processing form data:", error);
        return NextResponse.json({
          message: "Failed to process file upload",
          error: error instanceof Error ? error.message : "Unknown error",
          status: "failed"
        }, { status: 400 });
      }
    } else {
      // Parse the JSON body for the older filePath method
      const body = await request.json();
      console.log("🔍 [DEBUG API] Request body (JSON):", body);
      
      filePath = body.filePath;
      fileName = body.fileName;
      
      if (!filePath || !fileName) {
        console.error("🔍 [DEBUG API] Missing required parameters:", { filePath, fileName });
        return NextResponse.json({
          message: "Missing required parameters",
          error: "Both filePath and fileName are required",
          status: "failed"
        }, { status: 400 });
      }
    }

    // Initialize Supabase client - make sure to await it
    const supabase = await createSupabaseServerClient();
    
    // Get user information (if authenticated)
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    // Use a default UUID for anonymous users
    const userId = user?.id || '00000000-0000-0000-0000-000000000000';
    console.log("🔍 [DEBUG API] User authentication:", userId);
    
    // Process document
    console.log("🔍 [DEBUG API] Processing document for user:", userId);
    
    // Load file content
    let pdfBytes: Uint8Array;
    
    if (fileData) {
      // Use the uploaded file data directly
      pdfBytes = new Uint8Array(fileData);
      console.log("🔍 [DEBUG API] Using uploaded file data directly");
    } else {
      // Download from storage if using filePath method
      console.log("🔍 [DEBUG API] Downloading file from storage:", filePath);
      const { data: fileData, error: downloadError } = await supabase.storage
        .from('Documents')
        .download(filePath);
      
      if (downloadError || !fileData) {
        console.error("🔍 [DEBUG API] Error downloading file:", downloadError);
        return NextResponse.json({
          message: "Failed to download file",
          error: downloadError?.message || "File not found",
          status: "failed"
        }, { status: 404 });
      }
      
      pdfBytes = new Uint8Array(await fileData.arrayBuffer());
    }
    
    console.log("🔍 [DEBUG API] File loaded, size:", pdfBytes.length);

    // Load the document
    try {
      // Create a blob from the downloaded file
      const blob = new Blob([pdfBytes], { type: 'application/pdf' });
      
      // Load the PDF using the PDFLoader
      console.log("🔍 [DEBUG API] Loading PDF content");
      const loader = new WebPDFLoader(blob);
      const docs = await loader.load();
      console.log("🔍 [DEBUG API] PDF loaded, pages:", docs.length);
      
      // Split the document into smaller chunks
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      
      console.log("🔍 [DEBUG API] Splitting document into chunks");
      const splitDocs = await textSplitter.splitDocuments(docs);
      console.log("🔍 [DEBUG API] Document split into", splitDocs.length, "chunks");
      
      // Initialize the OpenAI embeddings
      console.log("🔍 [DEBUG API] Initializing OpenAI embeddings");
      const embeddings = new OpenAIEmbeddings({
        apiKey: process.env.OPENAI_API_KEY,
        modelName: "text-embedding-ada-002"
      });
      
      // Insert the document into the Documents table
      console.log("🔍 [DEBUG API] Inserting document metadata into Documents table");
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          user_id: userId,
          original_name: fileName,
          file_url: filePath
        })
        .select();
      
      if (docError) {
        console.error("🔍 [DEBUG API] Error inserting document:", docError);
        return NextResponse.json({
          message: "Failed to insert document",
          error: docError.message,
          status: "failed"
        }, { status: 500 });
      }
      
      console.log("🔍 [DEBUG API] Document inserted, data:", docData);
      
      // Get the document ID
      const documentId = docData[0].id;
      console.log("🔍 [DEBUG API] Document ID:", documentId);
      
      // Insert the vectors into the document_vectors table
      console.log("🔍 [DEBUG API] Generating embeddings and inserting vectors");
      let insertCount = 0;
      let errorCount = 0;
      
      try {
        // First check if the document_vectors table exists
        const { error: tableCheckError } = await supabase
          .from('document_vectors')
          .select('id')
          .limit(1);
        
        if (tableCheckError) {
          // Table likely doesn't exist - log the error but continue
          console.error("🔍 [DEBUG API] document_vectors table error:", tableCheckError.message);
          
          if (tableCheckError.message.includes("relation") && tableCheckError.message.includes("does not exist")) {
            console.log("🔍 [DEBUG API] document_vectors table doesn't exist, skipping vector insertion");
            return NextResponse.json({
              message: "Document processed without vector embeddings (table missing)",
              documentId,
              info: "The document_vectors table doesn't exist. You need to run the create_document_vectors.sql script in Supabase.",
              status: "completed"
            });
          }
        }
        
        // Table exists, proceed with vector insertion
        for (const doc of splitDocs) {
          try {
            // Generate the embedding for this chunk
            const embedding = await embeddings.embedQuery(doc.pageContent);
            
            // Insert the vector with the known working format
            const { error: vectorError } = await supabase
              .from('document_vectors')
              .insert({
                document_id: documentId,
                vector: embedding
              });
            
            if (vectorError) {
              console.error("🔍 [DEBUG API] Error inserting vector:", vectorError);
              errorCount++;
            } else {
              insertCount++;
            }
          } catch (vectorError) {
            console.error("🔍 [DEBUG API] Error generating embedding:", vectorError);
            errorCount++;
          }
        }
        
        console.log("🔍 [DEBUG API] Vector insertion complete:", { insertCount, errorCount });
      } catch (vectorsError) {
        console.error("🔍 [DEBUG API] Error during vector processing:", vectorsError);
        // Still return success even if vector insertion fails
        return NextResponse.json({
          message: "Document processed but vector embedding failed",
          documentId,
          error: vectorsError instanceof Error ? vectorsError.message : "Unknown vector error",
          status: "completed"
        });
      }
      
      return NextResponse.json({
        message: "Document processed successfully",
        documentId,
        insertCount,
        errorCount,
        vectorCount: splitDocs.length,
        status: "completed"
      });
      
    } catch (error) {
      console.error("🔍 [DEBUG API] Error processing document:", error);
      return NextResponse.json({
        message: "Failed to process document",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "failed"
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error("🔍 [DEBUG API] Unexpected error:", error);
    return NextResponse.json({
      message: "Unexpected error",
      error: error instanceof Error ? error.message : "Unknown error",
      status: "failed"
    }, { status: 500 });
  }
} 