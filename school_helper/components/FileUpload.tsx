'use client';

import React, { useState, useRef } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';

interface FileUploadProps {
  onUploadSuccess?: (fileUrl: string) => void;
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
        processingToastId = toast({
          title: `Processing audio file`,
          description: `Your audio is being transcribed and processed. This may take several minutes for longer recordings. Please be patient.`,
          duration: 100000, // Long duration as processing might take time
        });
      }
      
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ filePath, fileName }),
      });
      
      console.log("🔍 [DEBUG] API response status:", response.status);
      
      // Try to get the raw text first for debugging
      let responseText;
      try {
        responseText = await response.text();
        console.log("🔍 [DEBUG] Raw API response text:", responseText);
      } catch (textError) {
        console.error("🔍 [DEBUG] Error getting response text:", textError);
        throw new Error("Failed to read API response");
      }
      
      // Parse the response
      let result;
      try {
        result = JSON.parse(responseText);
        console.log("🔍 [DEBUG] Parsed API response:", result);
      } catch (parseError) {
        console.error("🔍 [DEBUG] Error parsing API response:", parseError);
        
        // If we can't parse the response, create a fallback result object
        result = {
          status: 'failed',
          error: `Failed to parse API response: ${responseText.substring(0, 100)}...`,
          details: responseText
        };
      }
      
      setIsProcessing(false);
      
      if (response.ok && (result.status === 'completed' || result.success)) {
        console.log("🔍 [DEBUG] File processed successfully:", result);
        
        // Show toast with message from API or default
        toast.success(result.message || `${isAudioFile ? 'Audio' : 'Document'} processed successfully`);
        
        // Show info if present
        if (result.info) {
          toast({
            title: 'Note',
            description: result.info,
            duration: 8000,
          });
        }
        
        // For audio files, only redirect after successful processing
        if (isAudioFile) {
          // Now that processing is complete, trigger the onUploadSuccess callback
          if (onUploadSuccess) {
            console.log("🔍 [DEBUG] Audio processing complete, calling onUploadSuccess");
            onUploadSuccess(filePath);
          }
        }
      } else {
        console.error("🔍 [DEBUG] Processing failed:", result);
        
        // Handle specific error cases
        if (response.status === 413) {
          toast({
            title: 'File too large',
            description: result.message || 'The audio file is too large for processing. Please upload a smaller file or compress it before uploading.',
            variant: 'destructive',
            duration: 10000,
          });
        } else {
          toast({
            title: 'Processing failed',
            description: result.error || `Failed to process ${isAudioFile ? 'audio' : 'document'}.`,
            variant: 'destructive',
            duration: 10000,
          });
        }
        
        // For audio files, we won't redirect on failure
        if (!isAudioFile && onUploadSuccess) {
          console.log("🔍 [DEBUG] Calling onUploadSuccess despite processing failure (not an audio file)");
          onUploadSuccess(filePath);
        }
      }
    } catch (error) {
      console.error("🔍 [DEBUG] Error calling processing API:", error);
      setIsProcessing(false);
      
      // Determine if it's an audio file from the fileType parameter
      const fileExtension = fileInputRef.current?.files?.[0]?.name.split('.').pop()?.toLowerCase() || '';
      const isAudioFile = ['mp3', 'wav', 'm4a'].includes(fileExtension);
      
      toast({
        title: 'Processing error',
        description: 'An error occurred while processing your file. Please try again or contact support if the issue persists.',
        variant: 'destructive',
        duration: 8000,
      });
      
      // For audio files, we won't redirect on error
      if (!isAudioFile && onUploadSuccess) {
        console.log("🔍 [DEBUG] Calling onUploadSuccess despite error (not an audio file)");
        onUploadSuccess(filePath);
      }
    } finally {
      // Dismiss the processing toast
      if (processingToastId) {
        toast.dismiss(processingToastId);
      }
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
      
      console.log('File uploaded successfully:', urlData.publicUrl);
      toast.success('File uploaded successfully');
      
      // Process the file automatically
      setUploadProgress(95);
      
      // Clear progress after a short delay
      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
        
        // Show processing toast
        processingToastId = toast({
          title: `Processing ${isAudioFile ? 'audio' : 'document'}`,
          description: `Your ${isAudioFile ? 'audio file' : 'document'} is being processed...${isAudioFile ? ' This may take a few minutes for longer recordings.' : ''}`,
          duration: 100000, // Long duration as processing might take time
        });
        
        console.log(`Starting ${isAudioFile ? 'audio' : 'document'} processing with filePath:`, filePath, 'and fileName:', file.name);
        
        // For regular documents, trigger onUploadSuccess immediately
        // For audio files, onUploadSuccess will be called after processing completes
        if (!isAudioFile && onUploadSuccess) {
          onUploadSuccess(urlData.publicUrl);
        }
        
        processDocument(filePath, file.name, fileExtension);
      }, 1000);
      
      setUploadProgress(100); // Complete
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(`${error instanceof Error ? error.message : 'Unknown upload error'}`);
      
      // Add this line to fix the linter error - define isAudioFile in this catch block
      const fileExtension = fileInputRef.current?.files?.[0]?.name.split('.').pop()?.toLowerCase() || '';
      const isAudioFile = ['mp3', 'wav', 'm4a'].includes(fileExtension);
      
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
      // Reset the input field
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Function to trigger file input click
  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-white shadow-md rounded-lg">
      <div className="flex flex-col items-center justify-center space-y-4">
        <div 
          onClick={triggerFileInput}
          className={`
            w-full p-6 border-2 border-dashed rounded-lg text-center cursor-pointer
            ${isUploading || isProcessing
              ? 'border-blue-300 bg-blue-50 text-blue-500' 
              : 'border-gray-300 hover:border-blue-500 hover:bg-blue-50'
            }
          `}
        >
          {isUploading ? (
            <div>
              <p>Uploading... {uploadProgress}%</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div 
                  className="bg-blue-600 h-2.5 rounded-full transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            </div>
          ) : isProcessing ? (
            <div>
              <p>Processing audio file... This may take a few minutes.</p>
              <div className="w-full bg-gray-200 rounded-full h-2.5 mt-2">
                <div 
                  className="bg-green-600 h-2.5 rounded-full transition-all duration-300 animate-pulse" 
                  style={{ width: '100%' }}
                ></div>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-gray-600">
                Drag and drop or click to upload
              </p>
              <p className="text-xs text-gray-500 mt-1">
                Accepted: {acceptedFileTypes.join(', ')} (Max {maxFileSize}MB)
              </p>
            </div>
          )}
          <input
            ref={fileInputRef}
            id="file-upload"
            type="file"
            accept={acceptedFileTypes.join(',')}
            onChange={handleFileUpload}
            disabled={isUploading || isProcessing}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};