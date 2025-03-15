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
  console.log("🔍 [DEBUG API] Processing with Claude, content length:", content.length);
  
  // Check if this is likely an audio transcription
  const isAudioTranscription = 
    documentName.toLowerCase().includes('transcription') ||
    documentName.toLowerCase().includes('audio') ||
    documentName.toLowerCase().endsWith('.mp3') ||
    documentName.toLowerCase().endsWith('.wav') ||
    documentName.toLowerCase().endsWith('.m4a');
  
  // Prepare the system prompt
  let systemPrompt = '';
  
  if (isAudioTranscription) {
    console.log("🔍 [DEBUG API] Using specialized audio transcription prompt");
    systemPrompt = `You are a helpful AI assistant answering questions about a transcribed audio file or recording.
    
The transcription is provided below. Answer the user's question based ONLY on information explicitly mentioned in the transcription.
Do not infer information that isn't directly stated.

Format your answers in clear, readable HTML:
- Use <h3> tags for headings (not ## markdown style)
- Use <p> tags for paragraphs
- Use <ul> and <li> tags for lists
- Use <b> or <strong> tags for emphasis

Always be concise and focused on answering the question directly.`;

    // Check if this is a summarization request
    if (message.toLowerCase().includes('summarize') || 
        message.toLowerCase().includes('summary') || 
        message.toLowerCase().includes('key points')) {
      
      systemPrompt += `

This is a summarization request, so format your response as follows:
1. A brief overview paragraph (2-3 sentences)
2. Key points from the transcription, organized as a list using <ul> and <li> tags
3. If relevant, include a brief conclusion`;
    }
  } else {
    // Standard document prompt
    systemPrompt = `You are a helpful AI assistant answering questions about a document.
    
The document content is provided below. Answer the user's question based ONLY on information mentioned in the document.
Do not infer information that isn't directly stated.

Format your answers in clear, readable HTML:
- Use <h3> tags for headings (not ## markdown style)
- Use <p> tags for paragraphs
- Use <ul> and <li> tags for lists
- Use <b> or <strong> tags for emphasis

Always be concise and focused on answering the question directly.`;
  }
  
  try {
    // Get API key from environment variable
    const apiKey = process.env.CLAUDE_API_KEY || '';
    if (!apiKey) {
      console.error("🔍 [DEBUG API] Missing Claude API key");
      throw new Error("API key not configured");
    }
    
    // Call the Claude API
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-3-haiku-20240307",
        max_tokens: 1500, // Increased from 1000 for more detailed responses
        temperature: 0.2,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: isAudioTranscription && message.toLowerCase().includes('summarize')
              ? `Here is the audio transcription:\n\n${content}\n\nPlease summarize the key points from this audio recording.`
              : `Here is the document content:\n\n${content}\n\n${message}`
          }
        ]
      })
    });
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error("🔍 [DEBUG API] Claude API error:", data);
      
      if (data.error && data.error.type === 'rate_limit_error') {
        console.error("🔍 [DEBUG API] Claude rate limit exceeded");
        return `<h3>API Rate Limit Exceeded</h3>
                <p>We've hit our AI service rate limit. Please try again in a few minutes.</p>`;
      }
      
      throw new Error(data.error?.message || "Error calling Claude API");
    }
    
    let responseContent = data.content && data.content[0] && data.content[0].text
      ? data.content[0].text
      : "No response from Claude";
    
    // Convert markdown-style formatting to HTML if needed
    responseContent = responseContent.replace(/^# (.*$)/gm, '<h2>$1</h2>');
    responseContent = responseContent.replace(/^## (.*$)/gm, '<h3>$1</h3>');
    responseContent = responseContent.replace(/^### (.*$)/gm, '<h4>$1</h4>');
    
    // Convert markdown bullet points to HTML lists if not already in HTML
    if (!responseContent.includes('<ul>') && responseContent.includes('- ')) {
      const bulletRegex = /^- (.*)$/gm;
      const bulletPoints = [...responseContent.matchAll(bulletRegex)].map(m => m[1]);
      
      if (bulletPoints.length > 0) {
        let htmlList = '<ul>\n';
        bulletPoints.forEach(point => {
          htmlList += `  <li>${point}</li>\n`;
        });
        htmlList += '</ul>';
        
        // Replace all bullet points with the HTML list
        responseContent = responseContent.replace(/^- .*$(\n^- .*$)*/gm, htmlList);
      }
    }
    
    return responseContent;
  } catch (error) {
    console.error("🔍 [DEBUG API] Error in processWithClaude:", error);
    throw error;
  }
}

export async function POST(request: Request) {
  console.log("🔍 [DEBUG API] document-chat API called");
  
  try {
    // Parse the request body
    const body = await request.json();
    const { documentId, message, chatHistory = [], context = '', type = 'chat' } = body;
    
    console.log("🔍 [DEBUG API] Request body:", { 
      documentId, 
      message: message?.substring(0, 50) + (message?.length > 50 ? '...' : ''),
      chatHistoryLength: chatHistory?.length,
      type
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
    
    // Fetch document data
    console.log('🔍 [DEBUG API] Fetching document:', documentId);
    const { data: documentData, error: documentError } = await supabase
      .from('Documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (documentError) {
      console.error('🔍 [DEBUG API] Error fetching document:', documentError);
      
      // Try to fetch recent documents to see if there are any available at all
      const { data: recentDocs, error: recentError } = await supabase
        .from('Documents')
        .select('id, original_name, created_at')
        .order('created_at', { ascending: false })
        .limit(5);
        
      if (!recentError && recentDocs && recentDocs.length > 0) {
        console.log('🔍 [DEBUG API] Found recent documents:', recentDocs.map(d => ({id: d.id, name: d.original_name})));
        
        return NextResponse.json(
          { 
            error: `Document not found. The document ID (${documentId}) may be invalid or the document has been deleted.`,
            suggestedDocuments: recentDocs,
            status: "failed" 
          },
          { status: 404 }
        );
      }
      
      return NextResponse.json(
        { error: `Error fetching document: ${documentError.message}. Please check the document ID or upload a new document.` },
        { status: 404 }
      );
    }

    if (!documentData) {
      console.error('🔍 [DEBUG API] Document not found:', documentId);
      return NextResponse.json(
        { error: 'Document not found. The document ID may be invalid or the document has been deleted.' },
        { status: 404 }
      );
    }

    console.log('🔍 [DEBUG API] Document found:', {
      id: documentData.id,
      name: documentData.original_name,
      hasAudioId: !!documentData.audio_id
    });

    // Check if this is an audio file
    let isAudioTranscription = false;
    let hasAudioReference = false;
    let transcriptionText = '';
    let transcriptionStatus = '';

    // If document has an audio_id, use that to fetch the transcription
    if (documentData.audio_id) {
      console.log('🔍 [DEBUG API] Document has audio_id, fetching audio data:', documentData.audio_id);
      
      hasAudioReference = true;
      
      const { data: audioData, error: audioError } = await supabase
        .from('audio_files')
        .select('*')
        .eq('id', documentData.audio_id)
        .single();

      if (audioError) {
        console.error('🔍 [DEBUG API] Error fetching audio data:', audioError);
      } else if (audioData) {
        console.log('🔍 [DEBUG API] Audio data found:', {
          id: audioData.id,
          status: audioData.transcription_status,
          hasTranscription: !!audioData.transcription_text,
          transcriptionLength: audioData.transcription_text ? audioData.transcription_text.length : 0
        });
        
        // Use the transcription text if available
        if (audioData.transcription_text) {
          isAudioTranscription = true;
          transcriptionText = audioData.transcription_text;
          transcriptionStatus = audioData.transcription_status;
          
          // Set document data for processing
          documentData.content = transcriptionText;
          
          console.log('🔍 [DEBUG API] Using audio transcription as document content');
        } else {
          console.error('🔍 [DEBUG API] Audio record exists but has no transcription text');
        }
      } else {
        console.error('🔍 [DEBUG API] Audio record not found for ID:', documentData.audio_id);
      }
    } else {
      console.log('🔍 [DEBUG API] Document does not have audio_id');
    }

    // If we have a document but it doesn't have an explicit audio reference
    // Check if it might be an audio file based on the filename
    if (documentData && !hasAudioReference && !isAudioTranscription) {
      const fileName = documentData.original_name?.toLowerCase() || '';
      const filePath = documentData.file_url?.toLowerCase() || '';
      
      const isLikelyAudioFile = 
        fileName.endsWith('.mp3') || 
        fileName.endsWith('.wav') || 
        fileName.endsWith('.m4a') ||
        filePath.endsWith('.mp3') || 
        filePath.endsWith('.wav') || 
        filePath.endsWith('.m4a') ||
        fileName.includes('audio') ||
        fileName.includes('transcription');
      
      if (isLikelyAudioFile) {
        console.log("🔍 [DEBUG API] Document appears to be an audio file based on filename/path");
        
        // Try to find an audio file with a similar name or path
        try {
          // Extract just the base filename without extension
          const baseFileName = fileName.split('.').slice(0, -1).join('.');
          
          // Look in the audio_files table for anything with a similar name
          const { data: relatedAudioData, error: relatedAudioError } = await supabase
            .from('audio_files')
            .select('*')
            .or(`file_url.ilike.%${baseFileName}%,original_name.ilike.%${baseFileName}%`)
            .order('created_at', { ascending: false })
            .limit(1);
          
          if (!relatedAudioError && relatedAudioData && relatedAudioData.length > 0) {
            console.log("🔍 [DEBUG API] Found related audio file by name similarity:", relatedAudioData[0].id);
            
            // Check if this audio file has transcription
            if (relatedAudioData[0].transcription_text) {
              console.log("🔍 [DEBUG API] Found transcription in related audio file");
              
              // Update document info to include audio reference
              documentData.audio_id = relatedAudioData[0].id;
              isAudioTranscription = true;
              hasAudioReference = true;
              transcriptionText = relatedAudioData[0].transcription_text;
              transcriptionStatus = relatedAudioData[0].transcription_status;
              documentData.content = transcriptionText;
              
              console.log("🔍 [DEBUG API] Updated document data with audio transcription info");
            }
          }
        } catch (e) {
          console.error("🔍 [DEBUG API] Error checking related audio files:", e);
        }
      }
    }
    
    // Modified part to handle different request types
    let modifiedMessage = message;
    
    // Handle different types of requests
    if (type === 'notes') {
      console.log("🔍 [DEBUG API] Generating detailed notes for document");
      modifiedMessage = `
        Generate comprehensive notes for this ${documentData.original_name || 'document'}.
        Identify all important topics, concepts, and details.
        Format your response with clear headings, subheadings, and bullet points.
        Focus on capturing the key information in a structured way that makes learning and review easy.
      `;
    } else if (type === 'quizzes') {
      console.log("🔍 [DEBUG API] Generating quiz questions for document");
      modifiedMessage = `
        Create 5 multiple choice quiz questions based on this ${documentData.original_name || 'document'}.
        Each question should test understanding of important concepts from the material.
        For each question:
        1. Write a clear question
        2. Provide 4 possible answers labeled A, B, C, D
        3. Indicate which answer is correct
        4. Provide a brief explanation of why that answer is correct
        
        Format your response as valid JSON that can be parsed by JavaScript. Use this exact structure:
        [
          {
            "question": "Question text here?",
            "options": ["Option A", "Option B", "Option C", "Option D"],
            "answer": "The correct option text",
            "explanation": "Why this is the correct answer"
          },
          ...more questions...
        ]
        
        Make sure your JSON is properly formatted with no trailing commas, all property names in quotes, and all string values in quotes.
      `;
    } else if (type === 'summary') {
      console.log("🔍 [DEBUG API] Generating summary for document");
      modifiedMessage = `
        Please provide a comprehensive summary of this ${documentData.original_name || 'document'}.
        Highlight the key points, main arguments, and important conclusions.
        Format your response with clear headings and paragraphs.
        Focus on capturing the essence of the document in a way that someone could understand the main content without reading the full text.
      `;
    }
    
    // Download document content from Supabase storage
    // If this is not an audio transcription
    if (!isAudioTranscription) {
      console.log('🔍 [DEBUG API] Not an audio transcription, getting document content from file');
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
          
          // For audio transcriptions, use the transcription text directly
          if (isAudioTranscription && transcriptionText) {
            console.log("🔍 [DEBUG API] Using audio transcription text directly");
            
            // Check if the transcription is still processing
            if (transcriptionStatus === 'processing') {
              return NextResponse.json({
                response: "Your audio file is still being transcribed. This process can take several minutes depending on the length of the recording. Please check back in a few moments.",
                documentName: documentData.original_name,
                status: "processing"
              });
            }
            
            // Use the transcription text
            content = transcriptionText;
            
            // If it's empty or just whitespace, return an error
            if (!content || content.trim().length === 0) {
              return NextResponse.json({
                response: "The transcription for this audio file is empty. There might have been an issue during transcription.",
                documentName: documentData.original_name,
                status: "failed"
              });
            }
            
            console.log(`🔍 [DEBUG API] Loaded text content from transcription, length: ${content.length}`);
          } 
          // Check if we have a document with an audio_id reference that needs to fetch the audio
          else if (hasAudioReference || documentData.audio_id) {
            console.log("🔍 [DEBUG API] Document has audio_id reference, fetching transcription");
            
            try {
              // Try to get the transcription from audio_files table using audio_id
              const { data: audioData, error: audioError } = await supabase
                .from('audio_files')
                .select('transcription_text, transcription_status')
                .eq('id', documentData.audio_id)
                .single();
              
              if (audioError) {
                console.error("🔍 [DEBUG API] Error fetching transcription by audio_id:", audioError);
              } else if (audioData?.transcription_text) {
                console.log("🔍 [DEBUG API] Found transcription in audio_files table by audio_id");
                content = audioData.transcription_text;
                
                console.log(`🔍 [DEBUG API] Loaded text content from transcription reference, length: ${content.length}`);
              } else if (audioData?.transcription_status === 'processing') {
                console.log("🔍 [DEBUG API] Transcription is still being processed");
                return NextResponse.json({
                  response: "Your audio file is still being transcribed. This process can take several minutes depending on the length of the recording. Please check back in a few moments.",
                  documentName: documentData.original_name,
                  status: "processing"
                });
              } else {
                console.log("🔍 [DEBUG API] No transcription found for audio_id:", documentData.audio_id);
                return NextResponse.json({
                  response: "Audio transcription data could not be found. The transcription may have failed or been deleted.",
                  documentName: documentData.original_name,
                  status: "failed"
                });
              }
            } catch (e) {
              console.error("🔍 [DEBUG API] Error fetching transcription by audio_id:", e);
              return NextResponse.json({
                response: "An error occurred while retrieving the audio transcription. Please try again later.",
                documentName: documentData.original_name,
                error: String(e),
                status: "error"
              });
            }
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
          const responseText = await processContentInChunks(content, modifiedMessage, documentData.original_name);
          
          // Post-process the response for quizzes to ensure valid JSON
          let finalResponse = responseText;
          if (type === 'quizzes') {
            console.log("🔍 [DEBUG API] Post-processing quiz response to ensure valid JSON");
            
            try {
              // First try to parse the response directly
              try {
                JSON.parse(responseText);
                console.log("🔍 [DEBUG API] Quiz response is already valid JSON");
              } catch (directParseError) {
                console.log("🔍 [DEBUG API] Quiz response is not valid JSON, attempting to fix");
                
                // Try to extract a JSON array
                const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);
                if (jsonMatch) {
                  console.log("🔍 [DEBUG API] Found JSON array in response");
                  
                  // Clean up any potential JSON issues
                  let cleanedJson = jsonMatch[0]
                    // Fix trailing commas
                    .replace(/,\s*}/g, '}')
                    .replace(/,\s*\]/g, ']')
                    // Fix escaped quotes
                    .replace(/\\'/g, "'")
                    .replace(/\\"/g, '"')
                    // Fix spacing around colons
                    .replace(/(['"])\s*:\s*(['"])/g, '$1: $2');
                  
                  // Fix missing quotes around property names
                  cleanedJson = cleanedJson.replace(/(\{|\,)\s*([a-zA-Z0-9_]+)\s*:/g, '$1"$2":');
                  
                  // Fix unquoted property values that aren't numbers
                  cleanedJson = cleanedJson.replace(/:\s*([a-zA-Z][a-zA-Z0-9_]*)\s*(,|\})/g, ':"$1"$2');
                  
                  // Fix arrays with unquoted strings
                  cleanedJson = cleanedJson.replace(/\[\s*([a-zA-Z][a-zA-Z0-9_\s]*)(,|\])/g, '["$1"$2');
                  cleanedJson = cleanedJson.replace(/,\s*([a-zA-Z][a-zA-Z0-9_\s]*)(,|\])/g, ',"$1"$2');
                  
                  // Validate the cleaned JSON
                  try {
                    const parsed = JSON.parse(cleanedJson);
                    if (Array.isArray(parsed) && parsed.length > 0) {
                      console.log("🔍 [DEBUG API] Successfully cleaned and validated JSON");
                      finalResponse = cleanedJson;
                    }
                  } catch (cleanedError) {
                    console.error("🔍 [DEBUG API] Failed to clean JSON:", cleanedError);
                  }
                } else {
                  console.log("🔍 [DEBUG API] No JSON array found in response");
                  
                  // If no JSON array found, try to create one from the text
                  try {
                    console.log("🔍 [DEBUG API] Attempting to create JSON from text response");
                    
                    // Try to extract questions and options
                    const questions = [];
                    const questionBlocks = responseText.split(/Question \d+:|^\d+\./m).filter(Boolean);
                    
                    for (const block of questionBlocks) {
                      try {
                        // Extract question
                        const lines = block.split('\n').filter((line: string) => line.trim().length > 0);
                        if (lines.length === 0) continue;
                        
                        const question = lines[0].trim();
                        const options = [];
                        let answer = '';
                        let explanation = '';
                        
                        // Extract options (A, B, C, D)
                        for (let i = 1; i < lines.length; i++) {
                          const line = lines[i].trim();
                          const optionMatch = line.match(/^([A-D])[\.|\)|\:]\s*(.+)$/);
                          if (optionMatch) {
                            options.push(optionMatch[2].trim());
                          }
                          
                          // Look for answer
                          const answerMatch = line.match(/^(Answer|Correct Answer):\s*([A-D])/i);
                          if (answerMatch) {
                            const answerIndex = answerMatch[2].toUpperCase().charCodeAt(0) - 'A'.charCodeAt(0);
                            if (options.length > answerIndex) {
                              answer = options[answerIndex];
                            }
                          }
                          
                          // Look for explanation
                          if (line.startsWith('Explanation:')) {
                            explanation = line.substring('Explanation:'.length).trim();
                            // Collect additional explanation lines
                            for (let j = i + 1; j < lines.length; j++) {
                              const nextLine = lines[j].trim();
                              if (nextLine.match(/^([A-D])[\.|\)|\:]\s*(.+)$/) || 
                                  nextLine.match(/^(Answer|Correct Answer):/i)) {
                                break;
                              }
                              explanation += ' ' + nextLine;
                            }
                          }
                        }
                        
                        // Ensure we have 4 options
                        while (options.length < 4) {
                          options.push(`Option ${options.length + 1}`);
                        }
                        
                        // If no answer found, use the first option
                        if (!answer && options.length > 0) {
                          answer = options[0];
                        }
                        
                        // Add the question
                        if (question && options.length > 0) {
                          questions.push({
                            question,
                            options,
                            answer,
                            explanation
                          });
                        }
                      } catch (blockError) {
                        console.error("🔍 [DEBUG API] Error processing question block:", blockError);
                      }
                    }
                    
                    if (questions.length > 0) {
                      console.log("🔍 [DEBUG API] Created JSON from text response with", questions.length, "questions");
                      finalResponse = JSON.stringify(questions);
                    }
                  } catch (createError) {
                    console.error("🔍 [DEBUG API] Failed to create JSON from text:", createError);
                  }
                }
              }
            } catch (postProcessError) {
              console.error("🔍 [DEBUG API] Error in quiz post-processing:", postProcessError);
            }
          }
          
          // Return successful response
          return NextResponse.json({
            response: finalResponse,
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

// Add this GET endpoint handler which is being called by the chat page

export async function GET(request: Request) {
  console.log("🔍 [DEBUG API] document-chat GET API called");
  
  try {
    const { searchParams } = new URL(request.url);
    const documentId = searchParams.get('documentId');
    const message = searchParams.get('message') || 'Summarize the document';
    const timestamp = searchParams.get('timestamp'); // Might help with cache issues
    
    console.log("🔍 [DEBUG API] GET Request params:", { 
      documentId,
      message: message?.substring(0, 50) + (message?.length > 50 ? '...' : ''),
      timestamp
    });
    
    if (!documentId) {
      console.error("🔍 [DEBUG API] Missing documentId in request");
      return NextResponse.json({
        message: "Missing document ID",
        error: "Document ID is required",
        status: "failed"
      }, { status: 400 });
    }
    
    // Initialize the Supabase client
    const supabase = await createSupabaseServerClient();
    
    // First, let's get the document data
    console.log("🔍 [DEBUG API] Fetching document:", documentId);
    const { data: documentData, error: documentError } = await supabase
      .from('Documents')
      .select('*')
      .eq('id', documentId)
      .single();
    
    if (documentError) {
      console.error("🔍 [DEBUG API] Error fetching document:", documentError);
      
      // If we can't find the document, check if the ID might be an audio_id directly
      console.log("🔍 [DEBUG API] Document not found, checking if it's an audio_id...");
      const { data: audioData, error: audioError } = await supabase
        .from('audio_files')
        .select('*')
        .eq('id', documentId)
        .single();
        
      if (audioError || !audioData) {
        console.error("🔍 [DEBUG API] Not an audio file either:", audioError);
        
        // One last attempt - check if there's an audio file with this document_id
        console.log("🔍 [DEBUG API] Checking if there's an audio file with this document_id...");
        try {
          const { data: audioByDocData, error: audioByDocError } = await supabase
            .from('audio_files')
            .select('*')
            .eq('document_id', documentId)
            .single();
            
          if (audioByDocError || !audioByDocData) {
            console.error("🔍 [DEBUG API] No audio file found with document_id either:", audioByDocError);
            
            // Check if the error is because the column doesn't exist
            if (audioByDocError && audioByDocError.message && 
                (audioByDocError.message.includes("column") && audioByDocError.message.includes("does not exist"))) {
              console.error("🔍 [DEBUG API] document_id column might not exist in audio_files table");
              
              // Try to find an audio file with a similar name or path
              try {
                // Get the document name if available
                const docName = documentId || '';
                
                if (docName) {
                  console.log("🔍 [DEBUG API] Trying to find audio file by ID match:", docName);
                  
                  // Look for audio files with similar names
                  const { data: similarAudioData, error: similarAudioError } = await supabase
                    .from('audio_files')
                    .select('*')
                    .order('created_at', { ascending: false })
                    .limit(5);
                    
                  if (!similarAudioError && similarAudioData && similarAudioData.length > 0) {
                    console.log("🔍 [DEBUG API] Found recent audio files, checking for matches");
                    
                    // Use the most recent audio file with transcription
                    const audioWithTranscription = similarAudioData.find(audio => 
                      audio && audio.transcription_text && audio.transcription_text.length > 0
                    );
                    
                    if (audioWithTranscription) {
                      console.log("🔍 [DEBUG API] Found audio file with transcription:", audioWithTranscription.id);
                      
                      // Process the transcription with Claude
                      try {
                        console.log("🔍 [DEBUG API] Processing found audio transcription with Claude");
                        const responseText = await processWithClaude(
                          audioWithTranscription.transcription_text,
                          message,
                          audioWithTranscription.original_name || "Audio Transcription"
                        );
                        
                        console.log("🔍 [DEBUG API] Successfully processed found audio transcription");
                        return NextResponse.json({
                          response: responseText,
                          documentName: audioWithTranscription.original_name || "Audio Transcription",
                          status: "completed"
                        });
                      } catch (error) {
                        console.error("🔍 [DEBUG API] Error processing found transcription with Claude:", error);
                      }
                    }
                  }
                }
              } catch (e) {
                console.error("🔍 [DEBUG API] Error during audio file search:", e);
              }
            }
            
            return NextResponse.json({
              message: "Document not found",
              error: "No document or audio file found with the provided ID",
              status: "failed"
            }, { status: 404 });
          }
          
          // We found an audio file by document_id
          console.log("🔍 [DEBUG API] Found audio file by document_id:", audioByDocData.id);
          
          if (audioByDocData.transcription_status === 'processing') {
            console.log("🔍 [DEBUG API] Audio file is still processing");
            return NextResponse.json({
              response: "Your audio file is still being transcribed. This process typically takes a minute or two. Please check back in a moment.",
              documentName: audioByDocData.original_name || "Audio File",
              status: "processing"
            });
          }
          
          if (!audioByDocData.transcription_text) {
            console.log("🔍 [DEBUG API] Audio file has no transcription");
            return NextResponse.json({
              response: "No transcription is available for this audio file. The transcription process may have failed.",
              documentName: audioByDocData.original_name || "Audio File",
              status: "failed"
            });
          }
          
          // Process the transcription with Claude
          try {
            console.log("🔍 [DEBUG API] Processing audio transcription with Claude");
            const responseText = await processWithClaude(
              audioByDocData.transcription_text,
              message,
              audioByDocData.original_name || "Audio Transcription"
            );
            
            console.log("🔍 [DEBUG API] Successfully processed audio transcription");
            return NextResponse.json({
              response: responseText,
              documentName: audioByDocData.original_name || "Audio Transcription",
              status: "completed"
            });
          } catch (error) {
            console.error("🔍 [DEBUG API] Error processing transcription with Claude:", error);
            return NextResponse.json({
              response: "There was an error generating a response from the transcription.",
              documentName: audioByDocData.original_name || "Audio Transcription",
              error: error instanceof Error ? error.message : "Unknown error",
              status: "failed"
            }, { status: 500 });
          }
        } catch (error) {
          console.error("🔍 [DEBUG API] Error checking for audio file by document_id:", error);
          return NextResponse.json({
            message: "An error occurred while checking for audio files",
            error: error instanceof Error ? error.message : "Unknown error",
            status: "failed"
          }, { status: 500 });
        }
      }
    }
    
    // We found a document, now let's check if it's an audio file document
    console.log("🔍 [DEBUG API] Document found:", {
      id: documentData.id,
      name: documentData.original_name,
      hasAudioId: !!documentData.audio_id
    });
    
    // DIRECT APPROACH FOR AUDIO FILES:
    // If the document has an audio_id, fetch the audio data directly
    if (documentData.audio_id) {
      console.log("🔍 [DEBUG API] Document has audio_id, fetching transcription:", documentData.audio_id);
      
      const { data: audioData, error: audioError } = await supabase
        .from('audio_files')
        .select('*')
        .eq('id', documentData.audio_id)
        .single();
      
      if (audioError) {
        console.error("🔍 [DEBUG API] Error fetching audio data:", audioError);
      } else if (audioData && audioData.transcription_text) {
        console.log("🔍 [DEBUG API] Found audio transcription, length:", audioData.transcription_text.length);
        
        if (audioData.transcription_status === 'processing') {
          console.log("🔍 [DEBUG API] Audio file is still processing");
          return NextResponse.json({
            response: "Your audio file is still being transcribed. This process typically takes a minute or two. Please check back in a moment.",
            documentName: documentData.original_name,
            status: "processing"
          });
        }
        
        // Process the transcription with Claude
        try {
          console.log("🔍 [DEBUG API] Processing audio transcription with Claude");
          const responseText = await processWithClaude(
            audioData.transcription_text,
            message,
            documentData.original_name
          );
          
          // Also update the document with the transcription if it doesn't have content
          if (!documentData.content) {
            console.log("🔍 [DEBUG API] Updating document with transcription content");
            const { error: updateError } = await supabase
              .from('Documents')
              .update({ 
                content: audioData.transcription_text,
                status: 'PROCESSED'
              })
              .eq('id', documentId);
              
            if (updateError) {
              console.error("🔍 [DEBUG API] Failed to update document with transcription:", updateError);
              // Continue anyway since we already have the content
            }
          }
          
          console.log("🔍 [DEBUG API] Successfully processed audio transcription");
          return NextResponse.json({
            response: responseText,
            documentName: documentData.original_name,
            status: "completed"
          });
        } catch (error) {
          console.error("🔍 [DEBUG API] Error processing transcription with Claude:", error);
          return NextResponse.json({
            response: "There was an error generating a response from the transcription.",
            documentName: documentData.original_name,
            error: error instanceof Error ? error.message : "Unknown error",
            status: "failed"
          }, { status: 500 });
        }
      }
    }
    
    // If the document has content (either natively or from previous audio processing)
    if (documentData.content) {
      console.log("🔍 [DEBUG API] Document has content, length:", documentData.content.length);
      
      try {
        console.log("🔍 [DEBUG API] Processing document content with Claude");
        const responseText = await processWithClaude(
          documentData.content,
          message,
          documentData.original_name
        );
        
        console.log("🔍 [DEBUG API] Successfully processed document content");
        return NextResponse.json({
          response: responseText,
          documentName: documentData.original_name,
          status: "completed"
        });
      } catch (error) {
        console.error("🔍 [DEBUG API] Error processing content with Claude:", error);
        return NextResponse.json({
          response: "There was an error generating a response from the document.",
          documentName: documentData.original_name,
          error: error instanceof Error ? error.message : "Unknown error",
          status: "failed"
        }, { status: 500 });
      }
    }
    
    // For non-audio documents without content, return an appropriate message
    return NextResponse.json({
      response: "This document doesn't have any content that can be processed.",
      documentName: documentData.original_name || "Document",
      status: "failed"
    }, { status: 400 });
    
  } catch (error) {
    console.error("🔍 [DEBUG API] Unexpected error in GET endpoint:", error);
    return NextResponse.json({
      message: "An unexpected error occurred",
      error: error instanceof Error ? error.message : "Unknown error",
      status: "failed"
    }, { status: 500 });
  }
} 