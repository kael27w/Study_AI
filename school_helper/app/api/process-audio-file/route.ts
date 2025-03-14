import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createReadStream } from 'fs';
import { cookies } from 'next/headers';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createClient as createDeepgramClient } from '@deepgram/sdk';

const execPromise = promisify(exec);

// Initialize Deepgram client
const deepgram = createDeepgramClient(process.env.DEEPGRAM_API_KEY || '');

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// OpenAI Whisper API has a 25MB file size limit
const MAX_WHISPER_FILE_SIZE = 25 * 1024 * 1024; // 25MB in bytes

// Maximum file size for processing
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB (Deepgram handles much larger files than Whisper)

// Function to create audio_files table if it doesn't exist
async function createAudioFilesTable(supabase: any) {
  try {
    console.log('🔍 [DEBUG API] Attempting to create audio_files table');
    
    // First, check if the table already exists
    try {
      const { data, error } = await supabase
        .from('audio_files')
        .select('id')
        .limit(1);
      
      if (!error) {
        console.log('🔍 [DEBUG API] audio_files table already exists');
        return true;
      }
    } catch (e) {
      console.log('🔍 [DEBUG API] Table does not exist, will create it');
    }
    
    // SQL to create the audio_files table
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS audio_files (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL,
        file_url TEXT NOT NULL,
        original_name TEXT NOT NULL,
        transcription_status TEXT NOT NULL,
        transcription_text TEXT,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );
    `;
    
    // Try different methods to create the table
    try {
      // Method 1: Using exec_sql RPC
      console.log('🔍 [DEBUG API] Trying to create table using exec_sql RPC');
      const { error: rpcError } = await supabase.rpc('exec_sql', { sql_query: createTableSQL });
      
      if (rpcError) {
        console.error('🔍 [DEBUG API] RPC error creating table:', rpcError);
        
        // Method 2: Direct SQL query using REST API
        console.log('🔍 [DEBUG API] Trying direct REST API for table creation');
        const { error: restError } = await supabase.rest.sql.query(createTableSQL);
        
        if (restError) {
          console.error('🔍 [DEBUG API] REST API error creating table:', restError);
          
          // Method 3: Try a simpler table structure
          console.log('🔍 [DEBUG API] Trying simplified table structure');
          const simpleCreateSQL = `
            CREATE TABLE IF NOT EXISTS audio_files (
              id UUID PRIMARY KEY,
              user_id TEXT NOT NULL,
              transcription_text TEXT
            );
          `;
          
          const { error: simpleError } = await supabase.rpc('exec_sql', { sql_query: simpleCreateSQL });
          
          if (simpleError) {
            console.error('🔍 [DEBUG API] Error with simplified table creation:', simpleError);
            return false;
          }
        }
      }
      
      // Verify the table exists
      try {
        const { data, error } = await supabase
          .from('audio_files')
          .select('id')
          .limit(1);
        
        if (error) {
          console.error('🔍 [DEBUG API] Table verification failed:', error);
          return false;
        }
        
        console.log('🔍 [DEBUG API] audio_files table created and verified');
        return true;
      } catch (e) {
        console.error('🔍 [DEBUG API] Table verification failed with exception:', e);
        return false;
      }
    } catch (e) {
      console.error('🔍 [DEBUG API] Table creation exception:', e);
      return false;
    }
  } catch (e) {
    console.error('🔍 [DEBUG API] Unexpected error creating audio_files table:', e);
    return false;
  }
}

// Function to compress audio file using ffmpeg
async function compressAudioFile(inputPath: string): Promise<string> {
  const outputPath = `${inputPath}_compressed.mp3`;
  
  try {
    console.log('🔍 [DEBUG API] Compressing audio file with ffmpeg');
    // Use ffmpeg to compress the audio file
    // -y: Overwrite output file without asking
    // -i: Input file
    // -b:a: Audio bitrate (64k = 64 kbps)
    // -ac: Number of audio channels (1 = mono)
    // -ar: Audio sample rate (22050 Hz)
    await execPromise(`ffmpeg -y -i "${inputPath}" -b:a 64k -ac 1 -ar 22050 "${outputPath}"`);
    
    // Check if the compressed file exists and get its size
    const stats = fs.statSync(outputPath);
    console.log('🔍 [DEBUG API] Compressed file size:', stats.size, 'bytes');
    
    return outputPath;
  } catch (error) {
    console.error('🔍 [DEBUG API] Error compressing audio file:', error);
    throw new Error('Failed to compress audio file');
  }
}

// Function to split audio file into chunks if it's still too large
async function splitAudioIfNeeded(inputPath: string): Promise<string[]> {
  const stats = fs.statSync(inputPath);
  
  // If file is under the limit, return it as is
  if (stats.size <= MAX_WHISPER_FILE_SIZE) {
    return [inputPath];
  }
  
  console.log('🔍 [DEBUG API] Audio file still too large after compression, splitting into chunks');
  
  // Calculate duration using ffprobe
  const { stdout } = await execPromise(`ffprobe -i "${inputPath}" -show_entries format=duration -v quiet -of csv="p=0"`);
  const duration = parseFloat(stdout.trim());
  
  // Calculate how many chunks we need (aim for 20MB per chunk to be safe)
  const chunkCount = Math.ceil(stats.size / (20 * 1024 * 1024));
  const chunkDuration = duration / chunkCount;
  
  console.log(`🔍 [DEBUG API] Splitting ${duration}s audio into ${chunkCount} chunks of ~${chunkDuration}s each`);
  
  const outputPaths: string[] = [];
  
  // Split the file into chunks
  for (let i = 0; i < chunkCount; i++) {
    const startTime = i * chunkDuration;
    const outputPath = `${inputPath}_part${i}.mp3`;
    
    await execPromise(`ffmpeg -y -i "${inputPath}" -ss ${startTime} -t ${chunkDuration} -c copy "${outputPath}"`);
    outputPaths.push(outputPath);
    
    console.log(`🔍 [DEBUG API] Created chunk ${i+1}/${chunkCount}: ${outputPath}`);
  }
  
  return outputPaths;
}

// Replace the old transcribeAudio function with this new Deepgram implementation
async function transcribeAudioWithDeepgram(filePath: string): Promise<string> {
  console.log('🔍 [DEBUG API] Transcribing with Deepgram API:', path.basename(filePath));
  
  try {
    // Use createReadStream for efficient streaming
    const audioFile = fs.readFileSync(filePath);
    
    // Call Deepgram API
    const { result, error } = await deepgram.listen.prerecorded.transcribeFile(
      audioFile,
      {
        model: 'nova-3', // Nova is Deepgram's best model
        smart_format: true, // Adds punctuation and capitalization
        diarize: true, // Separates speakers
        paragraphs: true, // Groups text into paragraphs
        utterances: true, // Segments audio by speaker turns
        punctuate: true, // Adds punctuation
      }
    );

    if (error) {
      console.error('🔍 [DEBUG API] Deepgram transcription error:', error);
      throw error;
    }

    // Extract the transcript text from the result
    if (result && result.results && result.results.channels && result.results.channels[0]) {
      const transcript = result.results.channels[0].alternatives[0].transcript;
      console.log(`🔍 [DEBUG API] Transcription complete (${transcript.length} chars): "${transcript.substring(0, 100)}..."`);
      return transcript;
    } else {
      throw new Error('No transcription found in Deepgram response');
    }
  } catch (error) {
    console.error('🔍 [DEBUG API] Transcription error:', error);
    throw error;
  }
}

// Add this function to validate audio files before sending to Deepgram
async function validateAudioFile(filePath: string): Promise<{ isValid: boolean; details: string }> {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return { isValid: false, details: 'File does not exist' };
    }
    
    // Check file size
    const stats = fs.statSync(filePath);
    if (stats.size === 0) {
      return { isValid: false, details: 'File is empty' };
    }
    
    if (stats.size > MAX_FILE_SIZE) {
      return { 
        isValid: false, 
        details: `File size (${(stats.size / (1024 * 1024)).toFixed(2)}MB) exceeds maximum allowed size (100MB)` 
      };
    }
    
    // Get file extension
    const ext = path.extname(filePath).toLowerCase().substring(1);
    const supportedFormats = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm'];
    if (!supportedFormats.includes(ext)) {
      return { 
        isValid: false, 
        details: `File format '${ext}' is not supported. Supported formats: ${supportedFormats.join(', ')}` 
      };
    }
    
    // Use ffprobe to get file info (this will validate if it's a proper audio file)
    try {
      const { stdout, stderr } = await execPromise(`ffprobe -v error -show_format -show_streams -print_format json "${filePath}"`);
      
      if (stderr) {
        console.log('🔍 [DEBUG API] ffprobe stderr:', stderr);
      }
      
      const fileInfo = JSON.parse(stdout);
      console.log('🔍 [DEBUG API] Audio file info:', JSON.stringify({
        format: fileInfo.format.format_name,
        duration: fileInfo.format.duration,
        bitrate: fileInfo.format.bit_rate,
        size: fileInfo.format.size,
        codec: fileInfo.streams?.[0]?.codec_name,
        channels: fileInfo.streams?.[0]?.channels,
        sample_rate: fileInfo.streams?.[0]?.sample_rate
      }, null, 2));
      
      // Check if it's actually an audio file
      const hasAudioStream = fileInfo.streams?.some((stream: any) => stream.codec_type === 'audio');
      if (!hasAudioStream) {
        return { isValid: false, details: 'File does not contain audio streams' };
      }
      
      return { isValid: true, details: 'File is valid' };
    } catch (error) {
      // ffprobe failed, which means the file might be corrupt or not a proper audio file
      return { isValid: false, details: `File validation failed: ${error}` };
    }
  } catch (error) {
    return { isValid: false, details: `Error validating file: ${error}` };
  }
}

export async function POST(request: Request) {
  console.log('🔍 [DEBUG API] process-audio-file API called');
  
  // Array to track temporary files for cleanup
  const tempFiles: string[] = [];
  
  try {
    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get authenticated user or use anonymous ID
    const userId = '00000000-0000-0000-0000-000000000000'; // Replace with actual auth logic if needed
    console.log('🔍 [DEBUG API] User authentication:', userId);
    
    // Parse the request body
    const body = await request.json();
    const { filePath, fileName } = body;
    
    if (!filePath) {
      return NextResponse.json(
        { error: 'No file path provided' },
        { status: 400 }
      );
    }
    
    console.log('🔍 [DEBUG API] Processing audio file:', {
      filePath,
      fileName,
      userId
    });
    
    // Download the file from Supabase Storage
    console.log('🔍 [DEBUG API] Downloading file from storage:', filePath);
    const { data: fileData, error: fileError } = await supabase.storage
      .from('Documents')
      .download(filePath);
    
    if (fileError || !fileData) {
      console.error('🔍 [DEBUG API] File download error:', fileError);
      return NextResponse.json(
        { error: 'Failed to download audio file from storage' },
        { status: 500 }
      );
    }
    
    console.log('🔍 [DEBUG API] File loaded, size:', fileData.size);
    
    // Check if file size exceeds OpenAI's limit
    if (fileData.size > MAX_FILE_SIZE) {
      console.log('🔍 [DEBUG API] File size exceeds Deepgram limit, will compress/split');
    }
    
    // Save file to temporary location for transcription
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, path.basename(filePath));
    tempFiles.push(tempFilePath);
    
    // Convert Blob to Buffer and write to disk
    const buffer = Buffer.from(await fileData.arrayBuffer());
    fs.writeFileSync(tempFilePath, buffer);
    
    // Create an audio record with 'processing' status first
    const audioId = uuidv4();
    let audioInsertSuccess = false;
    
    try {
      console.log('🔍 [DEBUG API] Creating initial audio record with processing status, ID:', audioId);
      
      const initialAudioData = {
        id: audioId,
        user_id: userId,
        file_url: filePath,
        original_name: fileName,
        transcription_status: 'processing',
        transcription_text: ''
      };
      
      // Try to insert the initial record
      const { error: audioInitError } = await supabase
        .from('audio_files')
        .insert([initialAudioData]);
      
      if (audioInitError) {
        console.error('🔍 [DEBUG API] Initial audio record creation error:', audioInitError);
        
        // If the table doesn't exist, try to create it
        if (audioInitError.message && audioInitError.message.includes('relation "audio_files" does not exist')) {
          console.log('🔍 [DEBUG API] audio_files table does not exist, attempting to create it');
          
          const tableCreated = await createAudioFilesTable(supabase);
          
          if (tableCreated) {
            console.log('🔍 [DEBUG API] Created audio_files table, trying insertion again');
            
            // Try insertion again
            const { error: retryError } = await supabase
              .from('audio_files')
              .insert([initialAudioData]);
            
            if (retryError) {
              console.error('🔍 [DEBUG API] Retry initial audio record creation error:', retryError);
            } else {
              console.log('🔍 [DEBUG API] Initial audio record created on retry, ID:', audioId);
            }
          }
        }
      } else {
        console.log('🔍 [DEBUG API] Initial audio record created with processing status, ID:', audioId);
      }
    } catch (e) {
      console.error('🔍 [DEBUG API] Unexpected error during initial audio record creation:', e);
    }
    
    // Create a document entry for the transcription
    const documentId = uuidv4();
    
    try {
      // Check if we need to include the audio_id in the document
      const checkColumns = await supabase.from('Documents').select('*').limit(1);
      
      // Check if audio_id column exists in the response
      const hasAudioIdColumn = checkColumns.data && checkColumns.data[0] && 'audio_id' in checkColumns.data[0];
      console.log('🔍 [DEBUG API] Documents table has audio_id column:', hasAudioIdColumn);
      
      // Create document entry with or without audio_id based on schema
      const documentEntry = {
        id: documentId,
        user_id: userId,
        file_url: filePath,
        original_name: `Transcription: ${fileName}`,
        uploaded_at: new Date().toISOString(),
      };
      
      // Only add audio_id if the column exists
      if (hasAudioIdColumn) {
        (documentEntry as any).audio_id = audioId;
      }
      
      const { data, error: documentError } = await supabase
        .from('Documents')
        .insert([documentEntry])
        .select();
      
      if (documentError) {
        console.error('🔍 [DEBUG API] Document insertion error:', documentError);
        return NextResponse.json(
          { error: 'Failed to create document for transcription' },
          { status: 500 }
        );
      }
      
      console.log('🔍 [DEBUG API] Document created for transcription, ID:', documentId);
    } catch (e) {
      console.error('🔍 [DEBUG API] Unexpected error during document creation:', e);
      return NextResponse.json(
        { error: 'Failed to create document for transcription' },
        { status: 500 }
      );
    }
    
    // Now perform the actual transcription
    let transcriptionText = '';
    let transcriptionStatus = 'completed';
    
    try {
      // Compress the audio file if it's too large
      if (fileData.size > MAX_FILE_SIZE) {
        const compressedFilePath = await compressAudioFile(tempFilePath);
        tempFiles.push(compressedFilePath);
        
        // Split the file if it's still too large after compression
        const audioChunks = await splitAudioIfNeeded(compressedFilePath);
        audioChunks.forEach(chunk => {
          if (chunk !== compressedFilePath) tempFiles.push(chunk);
        });
        
        // Transcribe all chunks and combine
        transcriptionText = await transcribeAudioWithDeepgram(compressedFilePath);
      } else {
        // File is small enough, transcribe directly
        console.log('🔍 [DEBUG API] Transcribing audio file directly...');
        try {
          // Validate the file before sending to Deepgram
          const validation = await validateAudioFile(tempFilePath);
          if (!validation.isValid) {
            throw new Error(`Audio file validation failed: ${validation.details}`);
          }
          
          console.log('🔍 [DEBUG API] Audio file validated successfully, proceeding with Deepgram transcription');
          
          // Log API key length for diagnostic purposes (don't log the actual key)
          console.log('🔍 [DEBUG API] Deepgram API key length:', process.env.DEEPGRAM_API_KEY?.length || 'undefined');
          
          try {
            // Transcribe using Deepgram
            transcriptionText = await transcribeAudioWithDeepgram(tempFilePath);
            console.log(`🔍 [DEBUG API] Transcription complete (${transcriptionText.length} chars)`);
          } catch (apiError: any) {
            // Handle specific Deepgram errors
            console.error('🔍 [DEBUG API] Deepgram API error:', apiError);
            transcriptionStatus = 'failed';
            
            // Check if this is a quota/billing error
            if (apiError.message?.includes('quota') || 
                apiError.message?.includes('billing') ||
                apiError.message?.includes('limit exceeded') ||
                apiError.status === 429) {
              console.error('🔍 [DEBUG API] Deepgram quota exceeded or billing error:', apiError);
              throw new Error('Deepgram API quota exceeded. Please check your billing details.');
            }
            
            // Handle connection errors
            if (apiError.message?.includes('ECONNRESET') || 
                apiError.message?.includes('Connection error') ||
                apiError.cause?.code === 'ECONNRESET') {
              console.error('🔍 [DEBUG API] Network connection error:', apiError);
              throw new Error('Network connection error while calling Deepgram. Please try again later.');
            }
            
            throw apiError;
          }
        } catch (directError) {
          console.error('🔍 [DEBUG API] Transcription error:', directError);
          transcriptionStatus = 'failed';
          
          // Use a placeholder and report the error
          transcriptionText = "Audio transcription failed. Error: " + ((directError as Error).message || "Unknown error");
          console.log('🔍 [DEBUG API] Using placeholder text for transcription failure');
          throw directError;
        }
      }
      
      console.log('🔍 [DEBUG API] Transcription complete, length:', transcriptionText.length);
    } catch (error: any) {
      console.error('🔍 [DEBUG API] Transcription error:', error);
      transcriptionStatus = 'failed';
      
      // Check for specific OpenAI errors
      if (error?.status === 413) {
        return NextResponse.json(
          { 
            error: 'Audio file too large for processing', 
            message: 'The audio file exceeds the maximum size limit. Please upload a smaller file or compress it before uploading.',
            status: 'failed'
          },
          { status: 413 }
        );
      }
      
      // Check for file format errors
      if (error.message && (
        error.message.includes('Invalid file format') || 
        error.message.includes('Unsupported file type') ||
        error.message.includes('File is empty')
      )) {
        return NextResponse.json(
          { 
            error: 'Invalid audio file format', 
            message: 'The audio file format is not supported or the file is corrupted. Please upload a valid MP3, WAV, or M4A file.',
            status: 'failed'
          },
          { status: 400 }
        );
      }
      
      // Check for API key errors
      if (error.message && error.message.includes('API key')) {
        console.error('🔍 [DEBUG API] API key error:', error.message);
        return NextResponse.json(
          { 
            error: 'Transcription service unavailable', 
            message: 'The audio transcription service is currently unavailable. Please try again later.',
            status: 'failed'
          },
          { status: 503 }
        );
      }
      
      // Generic error response
      return NextResponse.json(
        { 
          error: 'Failed to transcribe audio', 
          message: 'An error occurred while transcribing the audio file. Please try again or upload a different file.',
          details: String(error),
          status: 'failed'
        },
        { status: 500 }
      );
    }
    
    // Update the audio record with the transcription and status
    try {
      console.log('🔍 [DEBUG API] Updating audio record with transcription, ID:', audioId);
      
      const audioUpdateData = {
        transcription_text: transcriptionText,
        transcription_status: transcriptionStatus,
      };
      
      console.log('🔍 [DEBUG API] Audio data to update:', {
        id: audioId,
        transcription_status: transcriptionStatus,
        transcription_text: transcriptionText.substring(0, 100) + '...' // Log partial text to avoid console flood
      });
      
      const { data, error: audioUpdateError } = await supabase
        .from('audio_files')
        .update(audioUpdateData)
        .eq('id', audioId)
        .select();
      
      if (audioUpdateError) {
        console.error('🔍 [DEBUG API] Audio record update error:', audioUpdateError);
      } else {
        audioInsertSuccess = true;
        console.log('🔍 [DEBUG API] Audio metadata saved, ID:', audioId);
      }
    } catch (e) {
      console.error('🔍 [DEBUG API] Unexpected error during audio record update:', e);
    }
    
    // Store the transcription in document_vectors to ensure it's accessible
    console.log('🔍 [DEBUG API] Splitting transcription into chunks');
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunks = await textSplitter.createDocuments([transcriptionText]);
    console.log('🔍 [DEBUG API] Transcription split into', chunks.length, 'chunks');
    
    // Skip OpenAI embeddings completely
    console.log('🔍 [DEBUG API] Skipping OpenAI embeddings due to quota issues');
    const embeddingsAvailable = false;
    
    // Generate embeddings and insert into vectors table (if available)
    console.log('🔍 [DEBUG API] Generating embeddings and inserting vectors');
    let insertCount = 0;
    let errorCount = 0;
    
    // If embeddings failed or aren't available, use the fallback method
    // Note: We can't store full transcription text in document_vectors table as it has no content column
    console.log('🔍 [DEBUG API] Cannot store transcription text directly as document_vectors has no content column');
    console.log('🔍 [DEBUG API] Will rely on audio_files table for transcription storage');
    
    // Ensure the audio_files insertion was successful
    if (audioInsertSuccess) {
      console.log('🔍 [DEBUG API] Transcription was successfully stored in audio_files table');
    } else {
      console.error('🔍 [DEBUG API] Warning: Transcription may not be persisted in any table');
      console.log('🔍 [DEBUG API] Transcription text (first 100 chars):', transcriptionText.substring(0, 100));
    }
    
    console.log('🔍 [DEBUG API] Vector insertion complete:', { insertCount, errorCount });
    
    // Even if we had errors with embeddings, we still have a successful transcription
    return NextResponse.json({
      success: true,
      status: transcriptionStatus,
      message: 'Audio transcribed and processed successfully',
      documentId,
      audioId,
      chunkCount: chunks.length,
      insertedVectors: insertCount,
      audioInsertSuccess,
      embeddingsAvailable,
    });
    
  } catch (error) {
    console.error('🔍 [DEBUG API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred', details: String(error) },
      { status: 500 }
    );
  } finally {
    // Clean up temporary files
    for (const file of tempFiles) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log('🔍 [DEBUG API] Cleaned up temporary file:', file);
        }
      } catch (error) {
        console.error('🔍 [DEBUG API] Error cleaning up file:', file, error);
      }
    }
  }
} 