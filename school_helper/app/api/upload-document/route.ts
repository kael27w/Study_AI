import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { OpenAIEmbeddings } from "@langchain/openai";
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: Request) {
  console.log("🔍 [DEBUG API] upload-document API called");
  
  // Check if we have an OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("🔍 [DEBUG API] Missing OpenAI API key");
    return NextResponse.json({ 
      message: "OpenAI API key is missing", 
      status: "failed" 
    }, { status: 500 });
  }
  
  try {
    // Process form data
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      console.error("🔍 [DEBUG API] No file provided in request");
      return NextResponse.json({ 
        message: "No file provided", 
        status: "failed" 
      }, { status: 400 });
    }
    
    console.log("🔍 [DEBUG API] File received:", file.name, "size:", file.size);
    
    // Generate a unique document ID
    const documentId = uuidv4();
    console.log("🔍 [DEBUG API] Generated document ID:", documentId);
    
    // Initialize Supabase client
    const supabase = await createSupabaseServerClient();
    
    // Get user information if available
    let userId = "anonymous";
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        userId = user.id;
        console.log("🔍 [DEBUG API] Authenticated user:", userId);
      } else {
        console.log("🔍 [DEBUG API] No authenticated user found");
      }
    } catch (authError) {
      console.error("🔍 [DEBUG API] Auth error:", authError);
    }
    
    // Upload file to Supabase Storage
    console.log("🔍 [DEBUG API] Uploading file to storage");
    const fileBuffer = await file.arrayBuffer();
    const fileName = file.name;
    const filePath = `${userId}/${documentId}/${fileName}`;
    
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        contentType: file.type,
        upsert: true
      });
    
    if (uploadError) {
      console.error("🔍 [DEBUG API] Storage upload error:", uploadError);
      return NextResponse.json({ 
        message: "Failed to upload file to storage", 
        error: uploadError.message,
        status: "failed" 
      }, { status: 500 });
    }
    
    console.log("🔍 [DEBUG API] File uploaded successfully:", uploadData.path);
    
    // Get public URL for the file
    const { data: { publicUrl } } = supabase.storage
      .from('documents')
      .getPublicUrl(filePath);
    
    console.log("🔍 [DEBUG API] File public URL:", publicUrl);
    
    // Process the document with LangChain
    console.log("🔍 [DEBUG API] Processing document with LangChain");
    
    try {
      // Load the PDF
      const loader = new WebPDFLoader(new Blob([new Uint8Array(fileBuffer)], { type: file.type }));
      const docs = await loader.load();
      console.log("🔍 [DEBUG API] Document loaded, pages:", docs.length);
      
      // Split the document into chunks
      const textSplitter = new RecursiveCharacterTextSplitter({
        chunkSize: 1000,
        chunkOverlap: 200,
      });
      const chunks = await textSplitter.splitDocuments(docs);
      console.log("🔍 [DEBUG API] Document split into chunks:", chunks.length);
      
      // Create embeddings
      const embeddings = new OpenAIEmbeddings({
        openAIApiKey: process.env.OPENAI_API_KEY,
      });
      
      // Store document metadata in Supabase
      console.log("🔍 [DEBUG API] Storing document metadata");
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          id: documentId,
          user_id: userId,
          file_url: publicUrl,
          original_name: fileName,
          uploaded_at: new Date().toISOString(),
        })
        .select()
        .single();
      
      if (docError) {
        console.error("🔍 [DEBUG API] Error storing document metadata:", docError);
        // Continue processing even if metadata storage fails
      } else {
        console.log("🔍 [DEBUG API] Document metadata stored successfully");
      }
      
      // Store document vectors in Supabase
      console.log("🔍 [DEBUG API] Storing document vectors");
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        const embedding = await embeddings.embedQuery(chunk.pageContent);
        
        const { error: vectorError } = await supabase
          .from('document_vectors')
          .insert({
            document_id: documentId,
            content: chunk.pageContent,
            metadata: chunk.metadata,
            embedding: embedding,
          });
        
        if (vectorError) {
          console.error(`🔍 [DEBUG API] Error storing vector ${i}:`, vectorError);
        }
      }
      
      console.log("🔍 [DEBUG API] Document processing completed successfully");
      
      // Return success response with document ID
      return NextResponse.json({
        message: "Document uploaded and processed successfully",
        documentId: documentId,
        fileName: fileName,
        status: "success"
      }, { status: 200 });
      
    } catch (processingError) {
      console.error("🔍 [DEBUG API] Document processing error:", processingError);
      
      // Return partial success - file was uploaded but processing failed
      return NextResponse.json({
        message: "Document uploaded but processing failed",
        documentId: documentId,
        fileName: fileName,
        error: processingError instanceof Error ? processingError.message : String(processingError),
        status: "partial_success"
      }, { status: 207 });
    }
    
  } catch (error) {
    console.error("🔍 [DEBUG API] Unexpected error:", error);
    return NextResponse.json({ 
      message: "An unexpected error occurred", 
      error: error instanceof Error ? error.message : String(error),
      status: "failed" 
    }, { status: 500 });
  }
} 