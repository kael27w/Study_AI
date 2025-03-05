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
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      toast.error('No file selected');
      return;
    }

    // Validate file type
    const fileExtension = file.name.split('.').pop()?.toLowerCase();
    const isValidType = acceptedFileTypes.some(type => 
      type.replace('.', '').toLowerCase() === fileExtension
    );

    if (!isValidType) {
      toast.error(`Invalid file type. Accepted types: ${acceptedFileTypes.join(', ')}`);
      return;
    }

    // Validate file size
    if (file.size > maxFileSize * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${maxFileSize}MB`);
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
      
      // Call upload success handler
      onUploadSuccess?.(urlData.publicUrl);
      
      setUploadProgress(100); // Complete
      
    } catch (error) {
      console.error('Upload failed:', error);
      toast.error(`${error instanceof Error ? error.message : 'Unknown upload error'}`);
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
            ${isUploading 
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
            disabled={isUploading}
            className="hidden"
          />
        </div>
      </div>
    </div>
  );
};