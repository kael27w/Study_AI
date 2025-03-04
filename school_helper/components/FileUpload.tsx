'use client';

import React, { useState } from 'react';
import { createClient } from '@/utils/supabase/client';
import { toast } from 'sonner';

interface FileUploadProps {
  onUploadSuccess?: (fileUrl: string) => void;
  acceptedFileTypes?: string[];
  maxFileSize?: number; // in MB
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onUploadSuccess,
  acceptedFileTypes = ['.pdf', '.txt'],
  maxFileSize = 10 // 10 MB default
}) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const supabase = createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error('You must be logged in to upload files');
      return;
    }

    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!acceptedFileTypes.some(type => file.name.toLowerCase().endsWith(type.replace('*', '')))) {
      toast.error(`Invalid file type. Accepted types: ${acceptedFileTypes.join(', ')}`);
      return;
    }

    // Validate file size
    if (file.size > maxFileSize * 1024 * 1024) {
      toast.error(`File too large. Maximum size is ${maxFileSize}MB`);
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);

    try {
      // Generate a unique filename to prevent overwriting
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;

      // Upload the file
      const { data, error } = await supabase.storage
        .from('documents')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath);

      toast.success('File uploaded successfully');
      
      // Optional callback for further processing
      onUploadSuccess?.(urlData.publicUrl);

    } catch (error) {
      console.error('Upload error:', error);
      toast.error('File upload failed');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4 bg-white shadow-md rounded-lg">
      <div className="flex flex-col items-center justify-center space-y-4">
        <label 
          htmlFor="file-upload" 
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
                  className="bg-blue-600 h-2.5 rounded-full" 
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
            id="file-upload"
            type="file"
            accept={acceptedFileTypes.join(',')}
            onChange={handleFileUpload}
            disabled={isUploading}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
};