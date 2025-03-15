'use client';

import React, { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

interface FileUploadProps {
  onUploadSuccess?: (fileUrl: string, documentId: string) => void;
  acceptedFileTypes?: string[];
  maxFileSize?: number;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  acceptedFileTypes = ['.pdf', '.txt', '.doc', '.docx'],
  maxFileSize = 20
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  let processingToastId: string | number | undefined = undefined;
  const router = useRouter();

  // Function to process the document after upload
  const processDocument = async (filePath: string, fileName: string, fileType: string) => {
    console.log("🔍 [DEBUG] processDocument called with:", { filePath, fileName, fileType });
    
    try {
      // Determine the appropriate API endpoint based on file type
      const isAudioFile = ['mp3', 'wav', 'm4a'].includes(fileType.toLowerCase());
      const apiEndpoint = isAudioFile ? '/api/process-audio-file' : '/api/process-single-document';
      
      console.log(`🔍 [DEBUG] Calling ${isAudioFile ? 'audio' : 'document'} processing API with data:`, 
        JSON.stringify({ filePath, fileName }));
      
      setIsProcessing(true);
      
      // Show more detailed processing toast for audio files
      if (isAudioFile) {
        processingToastId = toast("Processing audio file", {
          description: `Your audio is being transcribed and processed. This may take several minutes for longer recordings. Please be patient.`,
          duration: 100000, // Long duration as processing might take time
        });
      }
      
      // Add a timestamp parameter to ensure fresh requests
      const timestamp = Date.now();
      
      const response = await fetch(`${apiEndpoint}?t=${timestamp}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify({ 
          filePath, 
          fileName,
          timestamp // Include timestamp in the body as well
        }),
      });
      
      console.log("🔍 [DEBUG] API response status:", response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error("🔍 [DEBUG] API error:", response.status, errorText);
        throw new Error(`Failed to process file: ${response.status} ${errorText.substring(0, 100)}`);
      }
      
      // Parse the response
      const result = await response.json();
      console.log("🔍 [DEBUG] Parsed API response:", result);
      
      // Dismiss the processing toast if it exists
      if (processingToastId) {
        toast.dismiss(processingToastId);
        processingToastId = undefined;
      }
      
      setIsProcessing(false);
      
      if (result.success || result.status === 'completed') {
        toast.success(isAudioFile ? "Audio processed successfully!" : "Document processed successfully!", {
          description: isAudioFile ? "Your audio has been transcribed." : "Your document is ready for chat.",
          duration: 3000,
        });
        
        if (isAudioFile && result.documentId) {
          console.log("🔍 [DEBUG] Got document ID for audio:", result.documentId);
          
          // Store the document ID from the API for chat redirection
          localStorage.setItem('audioDocumentId', result.documentId);
          
          // Return the document ID for the callback
          return result.documentId;
        }
        
        return null;
      } else {
        console.error("🔍 [DEBUG] Processing failed:", result.error || "Unknown error");
        toast.error(isAudioFile ? "Audio processing failed" : "Document processing failed", {
          description: result.error || "An error occurred during processing.",
          duration: 8000,
        });
        
        return null;
      }
    } catch (error) {
      console.error("🔍 [DEBUG] Error in processDocument:", error);
      
      // Dismiss the processing toast if it exists
      if (processingToastId) {
        toast.dismiss(processingToastId);
        processingToastId = undefined;
      }
      
      setIsProcessing(false);
      
      toast.error("Processing error", {
        description: error instanceof Error ? error.message : "An unknown error occurred",
        duration: 8000,
      });
      
      return null;
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      toast.error('No file selected');
      return;
    }

    // Validate file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase() || '';
    const isValidType = acceptedFileTypes.some(type => 
      type.replace('.', '').toLowerCase() === fileExtension
    );

    if (!isValidType) {
      toast.error(`Invalid file type. Accepted types: ${acceptedFileTypes.join(', ')}`);
      return;
    }

    // Check if it's an audio file
    const isAudioFile = ['mp3', 'wav', 'm4a'].includes(fileExtension.toLowerCase());
    
    // Validate file size - different limits for audio vs documents
    const fileSizeLimit = isAudioFile ? 50 : maxFileSize; // 50MB for audio, configured limit for docs
    if (file.size > fileSizeLimit * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${fileSizeLimit}MB for ${isAudioFile ? 'audio files' : 'documents'}`);
      return;
    }

    setIsUploading(true);
    setUploadProgress(10); // Show initial progress

    // Simulate progress
    const simulateProgress = () => {
      let progress = 10;
      const interval = setInterval(() => {
        progress += Math.floor(Math.random() * 10);
        if (progress >= 90) {
          clearInterval(interval);
          setUploadProgress(90);
        } else {
          setUploadProgress(progress);
        }
      }, 300);
      
      return () => clearInterval(interval);
    };
    
    const cleanup = simulateProgress();

    try {
      const supabase = createClient();
      
      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        cleanup();
        toast.error('You must be logged in to upload files');
        setIsUploading(false);
        return;
      }
      
      // Generate unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
      const filePath = `public/${fileName}`; // Use public folder
      
      console.log('Attempting to upload file:', filePath);
      
      // Upload file using Supabase Storage API
      const { data, error } = await supabase.storage
        .from('Documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        });
      
      if (error) {
        cleanup();
        console.error('Upload error details:', error);
        
        if (error.message) {
          throw new Error(`Upload failed: ${error.message}`);
        } else {
          throw new Error('Permission denied: You do not have permission to upload files. Please check your Supabase storage permissions.');
        }
      }
      
      if (!data) {
        cleanup();
        throw new Error('No data returned from upload');
      }
      
      setUploadProgress(95); // Almost done
      
      // Get public URL
      const { data: urlData } = supabase.storage
        .from('Documents')
        .getPublicUrl(filePath);
      
      if (!urlData) {
        cleanup();
        throw new Error('Failed to get public URL');
      }
      
      console.log('File uploaded successfully:', urlData.publicUrl);
      
      // Insert document record
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          user_id: user.id,
          original_name: file.name,
          file_url: filePath
        })
        .select();
      
      if (docError) {
        cleanup();
        console.error('Error inserting document record:', docError);
        throw new Error(`Failed to save document record: ${docError.message}`);
      }
      
      if (!docData || docData.length === 0) {
        cleanup();
        throw new Error('No document record returned');
      }
      
      const documentId = docData[0].id;
      
      setUploadProgress(100); // Done
      
      // For audio files, we need to process them first
      if (isAudioFile) {
        toast.success('Audio file uploaded!', {
          description: 'Now processing your audio file. This may take a few minutes...',
          duration: 5000,
        });
        
        // Process the audio file
        const processedId = await processDocument(filePath, file.name, fileExt || '');
        if (processedId) {
          if (onUploadSuccess) {
            onUploadSuccess(file.name, processedId);
          }
        }
      } else {
        // For regular documents, call the success callback immediately
        if (onUploadSuccess) {
          onUploadSuccess(file.name, documentId);
        }
      }
    } catch (error: any) {
      cleanup();
      console.error('File upload error:', error);
      toast.error(error.message || 'Failed to upload file');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  const handleAudioProcess = async (file: File) => {
    try {
      const supabase = createClient()
      
      // Check authentication
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (authError || !user) {
        toast.error('You must be logged in to upload audio')
        return
      }
      
      // Generate a unique name for this audio file
      const documentName = `Audio File ${file.name}`
      const fileName = `${Date.now()}_${file.name.replace(/\s+/g, '_')}`
      const filePath = `public/${fileName}`
      
      // Upload the audio file
      const { data, error } = await supabase.storage
        .from('Documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: true
        })
      
      if (error) {
        console.error('Audio upload error:', error)
        throw new Error(`Upload failed: ${error.message}`)
      }
      
      // Insert document record (we'll still create this as a backup)
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .insert({
          user_id: user.id,
          original_name: documentName,
          file_url: filePath
        })
        .select()
      
      if (docError) {
        console.error('Error inserting audio document:', docError)
        throw new Error(`Failed to save audio document: ${docError.message}`)
      }
      
      const initialDocumentId = docData[0].id
      
      // Clear any previous document IDs from localStorage
      localStorage.removeItem('documentId')
      localStorage.removeItem('documentName')
      localStorage.removeItem('lastUploadTime')
      localStorage.removeItem('audioDocumentId')
      
      // Save document info to localStorage with current timestamp to ensure freshness
      const timestamp = Date.now()
      localStorage.setItem('documentId', initialDocumentId)
      localStorage.setItem('documentName', documentName)
      localStorage.setItem('lastUploadTime', timestamp.toString())
      
      toast.success("Audio file uploaded!", {
        description: "Processing your audio file...",
        duration: 3000,
      })
      
      // Process the audio file with our improved function that includes timestamp
      const fileExt = file.name.split('.').pop() || 'mp3'
      const processedId = await processDocument(filePath, file.name, fileExt)
      
      // If we got a processed ID back, use it
      if (processedId) {
        console.log("🔍 [DEBUG] Using processed document ID:", processedId)
        
        // Update localStorage with the processed ID
        localStorage.setItem('documentId', processedId)
        
        // Redirect to chat page with the processed ID
        if (onUploadSuccess) {
          onUploadSuccess(file.name, processedId)
        } else {
          // Fallback if no callback provided
          router.push(`/chat?documentId=${processedId}&documentName=${encodeURIComponent(documentName)}&timestamp=${timestamp}`)
        }
      } else {
        // Fallback to the initial document ID if processing failed
        console.log("🔍 [DEBUG] Falling back to initial document ID:", initialDocumentId)
        
        if (onUploadSuccess) {
          onUploadSuccess(file.name, initialDocumentId)
        } else {
          // Fallback if no callback provided
          router.push(`/chat?documentId=${initialDocumentId}&documentName=${encodeURIComponent(documentName)}&timestamp=${timestamp}`)
        }
      }
    } catch (error) {
      console.error("Error processing audio file:", error)
      toast.error(error instanceof Error ? error.message : "Error processing audio file. Please try again.")
    }
  }

  return (
    <div className="flex flex-col items-center justify-center w-full">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        accept={acceptedFileTypes.join(',')}
      />
      
      <div 
        onClick={triggerFileInput}
        className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50 transition-colors"
      >
        <div className="flex flex-col items-center justify-center pt-5 pb-6">
          <svg className="w-8 h-8 mb-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path>
          </svg>
          <p className="mb-2 text-sm text-gray-500">
            <span className="font-semibold">Click to upload</span> or drag and drop
          </p>
          <p className="text-xs text-gray-500">
            {acceptedFileTypes.join(', ')} (Max: {maxFileSize}MB)
          </p>
        </div>
      </div>
      
      {isUploading && (
        <div className="w-full mt-4">
          <div className="w-full bg-gray-200 rounded-full h-2.5">
            <div 
              className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
              style={{ width: `${uploadProgress}%` }}
            ></div>
          </div>
          <p className="text-sm text-center mt-2">
            {uploadProgress < 100 ? 'Uploading...' : 'Processing...'}
          </p>
        </div>
      )}
    </div>
  );
};