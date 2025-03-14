# Audio Support Implementation Guide

This guide provides code snippets and implementation details for the first phase of adding audio file support to our document chat feature.

## 1. Backend API Implementation

### Audio Processing API Route

Create a new API route at `app/api/process-audio-file/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createReadStream } from 'fs';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  console.log('🔍 [DEBUG API] process-audio-file API called');
  
  try {
    // Parse the request as FormData
    const formData = await request.formData();
    const audioFile = formData.get('file') as File;
    
    if (!audioFile) {
      return NextResponse.json(
        { error: 'No audio file provided' },
        { status: 400 }
      );
    }
    
    // Validate file type
    const validAudioTypes = ['audio/mp3', 'audio/wav', 'audio/mpeg', 'audio/m4a'];
    if (!validAudioTypes.includes(audioFile.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Please upload an MP3, WAV, or M4A file.' },
        { status: 400 }
      );
    }
    
    // Get user ID (use anonymous ID if not authenticated)
    const userId = '00000000-0000-0000-0000-000000000000'; // Replace with actual auth logic
    
    // Generate a unique filename with timestamp
    const timestamp = Date.now();
    const originalName = audioFile.name;
    const fileExtension = path.extname(originalName);
    const fileName = `${timestamp}_${originalName}`;
    const filePath = `public/${fileName}`;
    
    console.log('🔍 [DEBUG API] Processing audio file:', {
      name: originalName,
      type: audioFile.type,
      size: audioFile.size,
      userId
    });
    
    // Upload file to Supabase Storage
    const audioBytes = await audioFile.arrayBuffer();
    const { data: storageData, error: storageError } = await supabase
      .storage
      .from('Documents')
      .upload(filePath, audioBytes, {
        contentType: audioFile.type,
        upsert: true
      });
    
    if (storageError) {
      console.error('🔍 [DEBUG API] Storage error:', storageError);
      return NextResponse.json(
        { error: 'Failed to upload audio file' },
        { status: 500 }
      );
    }
    
    console.log('🔍 [DEBUG API] Audio file uploaded to storage:', filePath);
    
    // Save file to temporary location for transcription
    const tempDir = os.tmpdir();
    const tempFilePath = path.join(tempDir, fileName);
    
    // Write the file to disk
    fs.writeFileSync(tempFilePath, Buffer.from(audioBytes));
    
    // Transcribe the audio file using OpenAI Whisper
    console.log('🔍 [DEBUG API] Transcribing audio file...');
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tempFilePath),
      model: 'whisper-1',
    });
    
    // Clean up the temporary file
    fs.unlinkSync(tempFilePath);
    
    console.log('🔍 [DEBUG API] Transcription complete, length:', transcription.text.length);
    
    // Insert audio file metadata into database
    const { data: audioData, error: audioError } = await supabase
      .from('audio_files')
      .insert([
        {
          id: uuidv4(),
          user_id: userId,
          file_url: filePath,
          original_name: originalName,
          transcription_status: 'completed',
          transcription_text: transcription.text,
        }
      ])
      .select();
    
    if (audioError) {
      console.error('🔍 [DEBUG API] Database error:', audioError);
      return NextResponse.json(
        { error: 'Failed to save audio metadata' },
        { status: 500 }
      );
    }
    
    const audioId = audioData[0].id;
    console.log('🔍 [DEBUG API] Audio file metadata saved, ID:', audioId);
    
    // Process the transcription like a document
    // This will reuse our existing document processing logic
    const response = await fetch(new URL('/api/process-transcription', request.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        audioId,
        transcriptionText: transcription.text,
        fileName: originalName,
      }),
    });
    
    if (!response.ok) {
      console.error('🔍 [DEBUG API] Transcription processing error:', await response.text());
      return NextResponse.json(
        { error: 'Failed to process transcription' },
        { status: 500 }
      );
    }
    
    const processingResult = await response.json();
    
    return NextResponse.json({
      success: true,
      audioId,
      documentId: processingResult.documentId,
      fileName: originalName,
    });
    
  } catch (error) {
    console.error('🔍 [DEBUG API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
```

### Transcription Processing API Route

Create a new API route at `app/api/process-transcription/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import { OpenAIEmbeddings } from 'langchain/embeddings/openai';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(request: Request) {
  console.log('🔍 [DEBUG API] process-transcription API called');
  
  try {
    // Parse the request body
    const { audioId, transcriptionText, fileName } = await request.json();
    
    if (!audioId || !transcriptionText) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }
    
    // Get user ID (use anonymous ID if not authenticated)
    const userId = '00000000-0000-0000-0000-000000000000'; // Replace with actual auth logic
    
    console.log('🔍 [DEBUG API] Processing transcription for audio:', audioId);
    console.log('🔍 [DEBUG API] Transcription length:', transcriptionText.length);
    
    // Create a document entry for the transcription
    const documentId = uuidv4();
    const { data: documentData, error: documentError } = await supabase
      .from('Documents')
      .insert([
        {
          id: documentId,
          user_id: userId,
          file_url: `transcription/${audioId}`,
          original_name: `Transcription: ${fileName}`,
          audio_id: audioId,
        }
      ])
      .select();
    
    if (documentError) {
      console.error('🔍 [DEBUG API] Document insertion error:', documentError);
      return NextResponse.json(
        { error: 'Failed to create document for transcription' },
        { status: 500 }
      );
    }
    
    console.log('🔍 [DEBUG API] Document created for transcription, ID:', documentId);
    
    // Split the transcription into chunks
    console.log('🔍 [DEBUG API] Splitting transcription into chunks');
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200,
    });
    
    const chunks = await textSplitter.createDocuments([transcriptionText]);
    console.log('🔍 [DEBUG API] Transcription split into', chunks.length, 'chunks');
    
    // Initialize OpenAI embeddings
    console.log('🔍 [DEBUG API] Initializing OpenAI embeddings');
    const embeddings = new OpenAIEmbeddings({
      openAIApiKey: process.env.OPENAI_API_KEY,
    });
    
    // Generate embeddings and insert into vectors table
    console.log('🔍 [DEBUG API] Generating embeddings and inserting vectors');
    let insertCount = 0;
    let errorCount = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      
      try {
        // Generate embedding for chunk
        const embedding = await embeddings.embedQuery(chunk.pageContent);
        
        // Insert into vectors table
        const { error: vectorError } = await supabase
          .from('document_vectors')
          .insert([
            {
              document_id: documentId,
              content: chunk.pageContent,
              embedding,
              metadata: { ...chunk.metadata, chunk_index: i },
            }
          ]);
        
        if (vectorError) {
          console.error('🔍 [DEBUG API] Vector insertion error:', vectorError);
          errorCount++;
        } else {
          insertCount++;
        }
      } catch (error) {
        console.error('🔍 [DEBUG API] Embedding generation error:', error);
        errorCount++;
      }
    }
    
    console.log('🔍 [DEBUG API] Vector insertion complete:', { insertCount, errorCount });
    
    return NextResponse.json({
      success: true,
      documentId,
      audioId,
      chunkCount: chunks.length,
      insertedVectors: insertCount,
    });
    
  } catch (error) {
    console.error('🔍 [DEBUG API] Unexpected error:', error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
```

## 2. Frontend Implementation

### Update Upload Component

Modify the existing upload component at `app/components/FileUpload.tsx` to support audio files:

```tsx
// Add audio file types to the accepted file types
const acceptedFileTypes = {
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt'],
  // Add audio file types
  'audio/mp3': ['.mp3'],
  'audio/wav': ['.wav'],
  'audio/mpeg': ['.mp3', '.mpeg'],
  'audio/m4a': ['.m4a'],
};

// Update the file validation function
const validateFile = (file: File) => {
  // Check if file type is accepted
  const isAcceptedType = Object.keys(acceptedFileTypes).includes(file.type);
  
  // Different size limits for different file types
  let maxSize = 10 * 1024 * 1024; // 10MB default
  
  // Increase size limit for audio files
  if (file.type.startsWith('audio/')) {
    maxSize = 50 * 1024 * 1024; // 50MB for audio files
  }
  
  const isValidSize = file.size <= maxSize;
  
  return {
    isValid: isAcceptedType && isValidSize,
    errorMessage: !isAcceptedType
      ? 'File type not supported. Please upload a PDF, TXT, MP3, WAV, or M4A file.'
      : !isValidSize
      ? `File too large. Maximum size is ${maxSize / (1024 * 1024)}MB.`
      : '',
  };
};

// Update the upload function to handle different file types
const uploadFile = async (file: File) => {
  setIsUploading(true);
  setUploadProgress(0);
  
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    // Determine the API endpoint based on file type
    let apiEndpoint = '/api/process-single-document';
    if (file.type.startsWith('audio/')) {
      apiEndpoint = '/api/process-audio-file';
    }
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      body: formData,
    });
    
    // Handle response...
  } catch (error) {
    // Handle error...
  }
};
```

### Create Audio Player Component

Create a new component at `app/components/AudioPlayer.tsx`:

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';

interface AudioPlayerProps {
  audioUrl: string;
  startTime?: number;
}

export default function AudioPlayer({ audioUrl, startTime = 0 }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(startTime);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  
  useEffect(() => {
    // Initialize audio element
    const audio = new Audio(audioUrl);
    audioRef.current = audio;
    
    // Set up event listeners
    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
    });
    
    audio.addEventListener('timeupdate', () => {
      setCurrentTime(audio.currentTime);
    });
    
    audio.addEventListener('ended', () => {
      setIsPlaying(false);
      setCurrentTime(0);
    });
    
    // Clean up event listeners
    return () => {
      audio.pause();
      audio.removeEventListener('loadedmetadata', () => {});
      audio.removeEventListener('timeupdate', () => {});
      audio.removeEventListener('ended', () => {});
    };
  }, [audioUrl]);
  
  useEffect(() => {
    // Jump to start time when component mounts
    if (audioRef.current && startTime > 0) {
      audioRef.current.currentTime = startTime;
    }
  }, [startTime]);
  
  const togglePlayPause = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };
  
  const handleSliderChange = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };
  
  // Format time in MM:SS format
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  return (
    <div className="w-full p-4 bg-gray-100 rounded-lg">
      <div className="flex items-center gap-4 mb-2">
        <Button
          variant="outline"
          size="icon"
          onClick={togglePlayPause}
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <span className="h-4 w-4">⏸️</span>
          ) : (
            <span className="h-4 w-4">▶️</span>
          )}
        </Button>
        
        <div className="text-sm font-mono">
          {formatTime(currentTime)} / {formatTime(duration)}
        </div>
      </div>
      
      <Slider
        value={[currentTime]}
        min={0}
        max={duration || 100}
        step={0.1}
        onValueChange={handleSliderChange}
        className="w-full"
      />
    </div>
  );
}
```

### Update Chat Interface

Modify the chat interface to display an audio player when the document is an audio transcription:

```tsx
// Add to the chat page component
const [isAudioTranscription, setIsAudioTranscription] = useState(false);
const [audioUrl, setAudioUrl] = useState('');

// Update the useEffect that fetches document info
useEffect(() => {
  // Existing code...
  
  // Check if the document is an audio transcription
  if (documentData && documentData.audio_id) {
    setIsAudioTranscription(true);
    
    // Fetch the audio file URL
    const fetchAudioUrl = async () => {
      const { data, error } = await supabase
        .from('audio_files')
        .select('file_url')
        .eq('id', documentData.audio_id)
        .single();
      
      if (data && !error) {
        // Construct the full URL to the audio file
        const audioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Documents/${data.file_url}`;
        setAudioUrl(audioUrl);
      }
    };
    
    fetchAudioUrl();
  }
}, [documentId]);

// Add the audio player to the chat interface
return (
  <div className="container mx-auto p-4 max-w-4xl">
    <h1 className="text-2xl font-bold mb-6">Document Chat</h1>
    
    {/* Debug info */}
    {/* ... */}
    
    <div className="bg-white rounded-lg shadow-lg p-6 min-h-[70vh] flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-semibold text-black">
          {documentName ? `Chat with ${documentName}` : 'Loading document...'}
        </h2>
        <Button 
          variant="outline" 
          onClick={handleNewDocument}
        >
          New Document
        </Button>
      </div>
      
      {/* Audio player for transcriptions */}
      {isAudioTranscription && audioUrl && (
        <div className="mb-4">
          <h3 className="text-sm font-medium mb-2">Original Audio Recording</h3>
          <AudioPlayer audioUrl={audioUrl} />
        </div>
      )}
      
      {/* Messages */}
      {/* ... */}
    </div>
  </div>
);
```

## 3. Database Schema Updates

Execute the following SQL to add the necessary tables for audio support:

```sql
-- Create audio_files table
CREATE TABLE IF NOT EXISTS audio_files (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  file_url TEXT NOT NULL,
  original_name TEXT NOT NULL,
  duration INTEGER,
  transcription_status TEXT NOT NULL,
  transcription_text TEXT,
  uploaded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add audio_id column to Documents table
ALTER TABLE "Documents" 
ADD COLUMN IF NOT EXISTS audio_id UUID REFERENCES audio_files(id);
```

## 4. Testing the Implementation

1. Start the development server:
   ```bash
   npm run dev
   ```

2. Navigate to the upload page and test uploading an audio file.

3. Monitor the server logs for transcription progress.

4. After processing, you should be redirected to the chat page where you can:
   - See the transcription summary
   - Ask questions about the audio content
   - Play the original audio recording

## Next Steps

After implementing this basic audio support, the next phases would include:

1. Adding timestamp linking between chat responses and audio segments
2. Implementing speaker diarization
3. Enhancing the audio player with waveform visualization
4. Adding support for longer audio files with progress tracking 