import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/utils/supabase/server';
import { WebPDFLoader } from "@langchain/community/document_loaders/web/pdf";
import Anthropic from '@anthropic-ai/sdk';

// Function to break up long transcriptions into manageable chunks
async function processContentInChunks(content: string, message: string, documentName: string) {
  console.log("🔍 [DEBUG API] Processing long content in chunks");
  
  // If content is under 8000 chars, just process it directly
  if (content.length < 8000) {
    return processWithClaude(content, message, documentName);
  }
  
  // Split content into chunks of approximately 8K characters
  // Try to split at paragraph boundaries when possible
  const chunkSize = 8000;
  const chunks = [];
  let startIndex = 0;
  
  while (startIndex < content.length) {
    let endIndex = Math.min(startIndex + chunkSize, content.length);
    
    // If we're not at the end, try to find a paragraph break
    if (endIndex < content.length) {
      // Look for double newline (paragraph break)
      const paragraphBreak = content.lastIndexOf('\n\n', endIndex);
      if (paragraphBreak > startIndex && paragraphBreak > endIndex - 500) {
        endIndex = paragraphBreak;
      } else {
        // If no paragraph break, look for single newline
        const lineBreak = content.lastIndexOf('\n', endIndex);
        if (lineBreak > startIndex && lineBreak > endIndex - 200) {
          endIndex = lineBreak;
        } else {
          // If no good breakpoint, look for a sentence end
          const sentenceBreak = content.lastIndexOf('. ', endIndex);
          if (sentenceBreak > startIndex && sentenceBreak > endIndex - 100) {
            endIndex = sentenceBreak + 1; // Include the period
          }
        }
      }
    }
    
    chunks.push(content.substring(startIndex, endIndex));
    startIndex = endIndex;
  }
  
  console.log(`🔍 [DEBUG API] Split content into ${chunks.length} chunks`);
  
  // Process each chunk separately
  const isInitialSummary = message.toLowerCase().includes('summarize');
  const chunkResults = [];
  
  for (let i = 0; i < chunks.length; i++) {
    console.log(`🔍 [DEBUG API] Processing chunk ${i+1} of ${chunks.length}`);
    
    let chunkPrompt = message;
    if (isInitialSummary) {
      chunkPrompt = `Please summarize this PART ${i+1} of ${chunks.length} of the transcription. Focus on key points only:`;
    } else {
      chunkPrompt = `This is PART ${i+1} of ${chunks.length} of the transcription. Based on this part only, please answer the following question: ${message}`;
    }
    
    try {
      const chunkResult = await processWithClaude(chunks[i], chunkPrompt, documentName);
      chunkResults.push(chunkResult);
    } catch (error) {
      console.error(`🔍 [DEBUG API] Error processing chunk ${i+1}:`, error);
      // If any chunk fails, include an error message in the results
      chunkResults.push(`[Error processing part ${i+1}]`);
    }
  }
  
  // If this is a summarization request, we need to combine the summaries
  if (isInitialSummary) {
    console.log("🔍 [DEBUG API] Combining chunk summaries");
    
    const combineSummariesPrompt = `You received the following ${chunks.length} summaries of different parts of a transcription. 
    Please combine them into one coherent, well-organized summary. Remove redundancy but preserve all key information:
    
    ${chunkResults.map((result, i) => `PART ${i+1} SUMMARY:\n${result}`).join('\n\n')}`;
    
    try {
      return await processWithClaude("", combineSummariesPrompt, documentName, true);
    } catch (error) {
      console.error("🔍 [DEBUG API] Error combining summaries:", error);
      // If combining fails, return the individual summaries
      return `COMBINED SUMMARY (automatically assembled, not unified due to error):\n\n${chunkResults.join('\n\n---\n\n')}`;
    }
  } else {
    // For questions, combine the answers with section headings
    console.log("🔍 [DEBUG API] Combining chunk answers to question");
    
    const combineAnswersPrompt = `You received the following ${chunks.length} answers to the question "${message}" from different parts of a transcription. 
    Please combine them into one coherent, non-redundant answer that addresses the question fully:
    
    ${chunkResults.map((result, i) => `ANSWER FROM PART ${i+1}:\n${result}`).join('\n\n')}`;
    
    try {
      return await processWithClaude("", combineAnswersPrompt, documentName, true);
    } catch (error) {
      console.error("🔍 [DEBUG API] Error combining answers:", error);
      // If combining fails, return the individual answers
      return `COMBINED ANSWER (automatically assembled, not unified due to error):\n\n${chunkResults.join('\n\n---\n\n')}`;
    }
  }
}

// Function to process content with Claude API
async function processWithClaude(content: string, message: string, documentName: string, isMetaProcessing = false) {
  console.log(`🔍 [DEBUG API] Processing with Claude API, content length: ${content.length}`);
  
  try {
    // Initialize Anthropic client
    const anthropic = new Anthropic({
      apiKey: process.env.CLAUDE_API_KEY || '',
    });
    
    // Construct the system prompt
    let systemPrompt = '';
    if (!isMetaProcessing && content) {
      systemPrompt = `You are a helpful AI assistant that answers questions about documents. 
      The following is the content of a document titled "${documentName}":
      
      ${content}
      
      Answer questions based solely on the content of this document. If the answer cannot be found in the document, 
      clearly state that the information is not present in the document. Do not make up or infer information 
      that is not explicitly stated.`;
    } else {
      systemPrompt = "You are a helpful AI assistant that organizes information clearly and concisely.";
    }
    
    console.log("🔍 [DEBUG API] Sending request to Claude API");
    
    // Make the API call
    const result = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 1000,
      temperature: 0.5,
      system: systemPrompt,
      messages: [
        { role: "user", content: message }
      ]
    });
    
    console.log("🔍 [DEBUG API] Claude API response received");
    if (result.content && result.content.length > 0) {
      // Handle the content based on its type (text or tool_use)
      const content = result.content[0];
      let responseText = '';
      
      if ('text' in content) {
        responseText = content.text;
      } else {
        // Fallback in case the response is not in the expected format
        responseText = JSON.stringify(content);
      }
      
      console.log("🔍 [DEBUG API] Claude response:", responseText.substring(0, 100) + "...");
      return responseText;
    } else {
      throw new Error("Empty response from Claude API");
    }
    
  } catch (error) {
    console.error("🔍 [DEBUG API] Claude API error:", error);
    
    // Check if it's a quota/rate limit error
    const errorStr = String(error);
    if (errorStr.includes('rate') || errorStr.includes('limit') || errorStr.includes('quota')) {
      throw new Error("QUOTA_ERROR");
    }
    
    throw error;
  }
}

export async function POST(request: Request) {
  console.log("🔍 [DEBUG API] document-chat API called");
  
  try {
    // Parse the request body
    const body = await request.json();
    const { documentId, message, chatHistory = [] } = body;
    
    console.log("🔍 [DEBUG API] Request body:", { 
      documentId, 
      message: message?.substring(0, 50) + (message?.length > 50 ? '...' : ''),
      chatHistoryLength: chatHistory?.length 
    });
    
    if (!documentId) {
      console.error("🔍 [DEBUG API] Missing documentId in request");
      return NextResponse.json({
        message: "Missing document ID",
        error: "Document ID is required",
        status: "failed"
      }, { status: 400 });
    }
    
    console.log("🔍 [DEBUG API] Processing chat request for document:", documentId);
    
    // Initialize the Supabase client
    const supabase = await createSupabaseServerClient();
    
    // Check if user is authenticated (for logging purposes)
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const userId = user?.id || "00000000-0000-0000-0000-000000000000";
      console.log("🔍 [DEBUG API] User authentication:", userId);
    } catch (authError) {
      console.error("🔍 [DEBUG API] Authentication error:", authError);
    }
    
    // Get document information from Supabase
    console.log("🔍 [DEBUG API] Fetching document from database");
    const { data: documentData, error: documentError } = await supabase
      .from('Documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (documentError) {
      console.error("🔍 [DEBUG API] Error fetching document:", documentError);
      return NextResponse.json({
        message: "Failed to fetch document",
        error: documentError.message,
        status: "failed"
      }, { status: 500 });
    }
    
    if (!documentData) {
      console.error("🔍 [DEBUG API] Document not found with ID:", documentId);
      return NextResponse.json({
        message: "Document not found",
        error: "No document found with the provided ID",
        status: "failed"
      }, { status: 404 });
    }
    
    console.log("🔍 [DEBUG API] Document found:", { 
      name: documentData.original_name, 
      filePath: documentData.file_url
    });
    
    // Download document content from Supabase storage
    try {
      console.log("🔍 [DEBUG API] Downloading document from storage:", documentData.file_url);
      
      // Extract the path from the file_url (remove any URL prefix if present)
      let storagePath = documentData.file_url;
      let originalPath = storagePath;
      
      console.log("🔍 [DEBUG API] Original storage path:", storagePath);
      
      // Handle different path formats
      // 1. If it's a complete URL
      if (storagePath.startsWith('http')) {
        try {
          // Extract just the filename as a fallback
          const filename = storagePath.split('/').pop() || '';
          console.log("🔍 [DEBUG API] Extracted filename:", filename);
          
          // Try to get the path after /public/ or after the bucket name
          const url = new URL(storagePath);
          console.log("🔍 [DEBUG API] URL pathname:", url.pathname);
          
          // Try different path extraction patterns
          let pathMatch = url.pathname.match(/\/object\/public\/(.+)$/);
          if (pathMatch && pathMatch[1]) {
            storagePath = pathMatch[1];
            console.log("🔍 [DEBUG API] Extracted path from /public/:", storagePath);
          } 
          // Try Documents bucket pattern
          else if (url.pathname.includes('/Documents/')) {
            pathMatch = url.pathname.match(/\/Documents\/(.+)$/);
            if (pathMatch && pathMatch[1]) {
              storagePath = pathMatch[1];
              console.log("🔍 [DEBUG API] Extracted path from /Documents/:", storagePath);
            }
          } 
          // Fallback to just the filename
          else {
            storagePath = filename;
            console.log("🔍 [DEBUG API] Using filename as fallback:", storagePath);
          }
        } catch (e) {
          console.error("🔍 [DEBUG API] Failed to parse URL:", e);
          // Keep using the original path
        }
      }
      
      // 2. If path starts with 'public/' or other common prefixes, clean it up
      if (storagePath.startsWith('public/')) {
        storagePath = storagePath.replace('public/', '');
        console.log("🔍 [DEBUG API] Removed 'public/' prefix:", storagePath);
      }
      
      // 3. Special case for temporary uploaded files (they often have timestamps)
      const timestampMatch = storagePath.match(/(\d{13}_[^\/]+)$/);
      if (timestampMatch && timestampMatch[1]) {
        console.log("🔍 [DEBUG API] Found timestamp-based filename:", timestampMatch[1]);
        try {
          // Try a direct timestamp-based path first
          storagePath = timestampMatch[1];
        } catch (err) {
          console.log("🔍 [DEBUG API] Using original timestamped path");
          // Continue with the path we have
        }
      }
      
      console.log("🔍 [DEBUG API] Final storage path to try:", storagePath);
      
      // Attempt to download using cleaned path
      let fileData;
      let downloadError;
      
      // The actual bucket name to use
      const bucketName = 'Documents';
      
      try {
        console.log("🔍 [DEBUG API] Attempting download from bucket:", bucketName);
        
        // Try first with the full path
        let result = await supabase.storage
          .from(bucketName)
          .download(storagePath);
        
        fileData = result.data;
        downloadError = result.error;
        
        if (downloadError) {
          console.log("🔍 [DEBUG API] First attempt failed, trying with public/ prefix");
          // Try with public/ prefix
          result = await supabase.storage
            .from(bucketName)
            .download(`public/${storagePath}`);
          
          fileData = result.data;
          downloadError = result.error;
        }
        
        if (downloadError) {
          // If that failed, try just the filename
          const filename = storagePath.split('/').pop() || '';
          console.log("🔍 [DEBUG API] Second attempt failed, trying with just filename:", filename);
          
          result = await supabase.storage
            .from(bucketName)
            .download(filename);
          
          fileData = result.data;
          downloadError = result.error;
        }
        
        if (downloadError) {
          // One last attempt - try with public/filename
          const filename = storagePath.split('/').pop() || '';
          console.log("🔍 [DEBUG API] Third attempt failed, trying with public/ + filename:", `public/${filename}`);
          
          result = await supabase.storage
            .from(bucketName)
            .download(`public/${filename}`);
          
          fileData = result.data;
          downloadError = result.error;
          
          if (!downloadError && result.data) {
            console.log("🔍 [DEBUG API] Final attempt succeeded with public/ + filename");
          }
        }
        
      } catch (e) {
        console.error("🔍 [DEBUG API] All download attempts failed with exception:", e);
        downloadError = e;
      }
      
      if (downloadError || !fileData) {
        // Detailed error reporting
        console.error("🔍 [DEBUG API] Could not download document after multiple attempts");
        console.log("🔍 [DEBUG API] Original URL:", documentData.file_url);
        console.log("🔍 [DEBUG API] Bucket tried:", bucketName);
        console.log("🔍 [DEBUG API] Paths tried:", [
          storagePath,
          `public/${storagePath}`,
          storagePath.split('/').pop(),
          `public/${storagePath.split('/').pop()}`
        ]);
        
        return NextResponse.json({
          message: "Failed to download document content",
          error: downloadError && typeof downloadError === 'object' && 'message' in downloadError 
            ? downloadError.message 
            : "Unknown download error",
          details: {
            originalPath,
            triedPaths: [
              storagePath,
              `public/${storagePath}`,
              storagePath.split('/').pop(),
              `public/${storagePath.split('/').pop()}`
            ],
            bucket: bucketName,
            documentId,
            fileName: documentData.original_name
          },
          status: "failed"
        }, { status: 500 });
      }
      
      console.log("🔍 [DEBUG API] Document downloaded successfully, size:", fileData.size, "bytes");
      
      // Check file type based on extension
      const fileName = documentData.original_name.toLowerCase();
      const isAudioFile = fileName.endsWith('.mp3') || fileName.endsWith('.wav') || fileName.endsWith('.m4a');
      const isPdfFile = fileName.endsWith('.pdf');
      
      let content = '';
      
      if (isAudioFile) {
        console.log("🔍 [DEBUG API] Detected audio file, checking for transcription");
        
        // For audio files, we should check if there's a transcription in the database
        try {
          // First try to find by audio_id if it exists
          if (documentData.audio_id) {
            console.log("🔍 [DEBUG API] Audio file has associated audio_id:", documentData.audio_id);
            
            // Try to get the transcription from audio_files table using audio_id
            const { data: audioData, error: audioError } = await supabase
              .from('audio_files')
              .select('transcription_text, transcription_status')
              .eq('id', documentData.audio_id)
              .single();
            
            if (audioError || !audioData) {
              console.log("🔍 [DEBUG API] Error fetching transcription by audio_id:", audioError);
            } else if (audioData.transcription_text) {
              console.log("🔍 [DEBUG API] Found transcription in audio_files table by audio_id");
              content = audioData.transcription_text;
            } else if (audioData.transcription_status === 'processing') {
              console.log("🔍 [DEBUG API] Transcription is still being processed");
              return NextResponse.json({
                response: "Your audio file is still being transcribed. This process can take several minutes depending on the length of the recording. Please check back in a few moments.",
                documentName: documentData.original_name,
                status: "processing"
              });
            }
          }
          
          // If we couldn't find by audio_id, try by file path
          if (!content) {
            console.log("🔍 [DEBUG API] Trying to find transcription by file path");
            
            // Extract only the filename part from filePath
            const fileName = documentData.file_url.split('/').pop() || '';
            console.log("🔍 [DEBUG API] Looking for transcription with file path containing:", fileName);
            
            const { data: audioByPathData, error: audioByPathError } = await supabase
              .from('audio_files')
              .select('transcription_text, transcription_status')
              .like('file_url', `%${fileName}%`)
              .order('created_at', { ascending: false })
              .limit(1);
            
            if (audioByPathError) {
              console.log("🔍 [DEBUG API] Error fetching transcription by path:", audioByPathError);
            } else if (audioByPathData && audioByPathData.length > 0) {
              if (audioByPathData[0].transcription_text) {
                console.log("🔍 [DEBUG API] Found transcription in audio_files table by file path");
                content = audioByPathData[0].transcription_text;
              } else if (audioByPathData[0].transcription_status === 'processing') {
                console.log("🔍 [DEBUG API] Transcription is still being processed");
                return NextResponse.json({
                  response: "Your audio file is still being transcribed. This process can take several minutes depending on the length of the recording. Please check back in a few moments.",
                  documentName: documentData.original_name,
                  status: "processing"
                });
              }
            }
          }
        } catch (e) {
          console.error("🔍 [DEBUG API] Error querying audio_files table:", e);
          // Continue with empty content
        }
        
        // We can't get transcription from vectors table as it doesn't have a content field
        
        // If we still don't have content, return a specific message
        if (!content) {
          console.log("🔍 [DEBUG API] No transcription found anywhere");
          return NextResponse.json({
            response: "No transcription is available for this audio file. This could be because the transcription process failed, or the audio file is still being processed. If you just uploaded this file, please wait a few minutes and refresh the page. If the issue persists, try uploading the file again.",
            documentName: documentData.original_name,
            status: "failed"
          });
        }
      } else if (isPdfFile) {
        // Process the PDF
        try {
          const blob = new Blob([fileData], { type: 'application/pdf' });
          const loader = new WebPDFLoader(blob);
          
          console.log("🔍 [DEBUG API] Loading PDF content");
          const docs = await loader.load();
          console.log("🔍 [DEBUG API] PDF loaded, pages:", docs.length);
          
          // Extract text content from PDF pages
          content = docs.map(doc => doc.pageContent).join('\n\n');
        } catch (error) {
          console.error("🔍 [DEBUG API] Error processing PDF:", error);
          return NextResponse.json({
            message: "Failed to process document chat",
            error: "Invalid PDF structure",
            status: "failed"
          }, { status: 500 });
        }
      } else {
        // For other file types (like .txt), try to read as text
        try {
          const text = await fileData.text();
          content = text;
          console.log("🔍 [DEBUG API] Loaded text content, length:", content.length);
        } catch (error) {
          console.error("🔍 [DEBUG API] Error reading file as text:", error);
          return NextResponse.json({
            message: "Failed to process document chat",
            error: "Unsupported file format",
            status: "failed"
          }, { status: 500 });
        }
      }
      
      console.log("🔍 [DEBUG API] Total content length:", content.length);
      
      // Process the content using chunking if it's long, or direct if it's shorter
      try {
        // Use the chunking processor which will handle both small and large content
        const responseText = await processContentInChunks(content, message, documentData.original_name);
        
        // Return successful response
        return NextResponse.json({
          response: responseText,
          documentName: documentData.original_name,
          status: "completed"
        });
      } catch (error) {
        console.error("🔍 [DEBUG API] Claude API processing error:", error);
        
        // Check if it's a quota error
        if (error instanceof Error && error.message === "QUOTA_ERROR") {
          console.log("🔍 [DEBUG API] Claude quota or rate limit exceeded. Returning user-friendly message.");
          
          return NextResponse.json({
            response: `The transcription is available, but I can't generate a summary right now due to API usage limits. 
            
The transcription contains ${content.length} characters. Here's the beginning:

"${content.substring(0, 300)}..."

You can still ask questions about the content, but they may not be answered until the API quota resets.`,
            documentName: documentData.original_name,
            status: "quota_exceeded"
          });
        }
        
        // For other errors, return a generic message
        return NextResponse.json({
          response: "Sorry, I'm having trouble processing your request due to a technical issue. Please try again later.",
          documentName: documentData.original_name,
          error: error instanceof Error ? error.message : "Unknown error",
          status: "failed"
        }, { status: 500 });
      }
      
    } catch (error) {
      console.error("🔍 [DEBUG API] Error in document chat processing:", error);
      return NextResponse.json({
        message: "Failed to process document chat",
        error: error instanceof Error ? error.message : "Unknown error",
        status: "failed"
      }, { status: 500 });
    }
    
  } catch (error) {
    console.error("🔍 [DEBUG API] Unexpected error in document-chat API:", error);
    return NextResponse.json({
      message: "Unexpected error",
      error: error instanceof Error ? error.message : "Unknown error",
      status: "failed"
    }, { status: 500 });
  }
} 