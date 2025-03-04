'use client';

import { FileUpload } from '@/components/FileUpload';
import { createClient } from '@/utils/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';

export default function DocumentUploadPage() {
  const handleUploadSuccess = async (fileUrl: string) => {
    const supabase = createClient();
    
    // Get the current user
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      toast.error('User not found');
      return;
    }

    // Insert document metadata into your documents table
    const { data, error } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        file_url: fileUrl,
        original_name: fileUrl.split('/').pop(), // Extract filename
        uploaded_at: new Date().toISOString()
      });

    if (error) {
      console.error('Error saving document metadata:', error);
      toast.error('Failed to save document details');
    } else {
      toast.success('Document uploaded and metadata saved');
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-2xl font-bold mb-4">Upload Document</h1>
      <FileUpload onUploadSuccess={handleUploadSuccess} />
    </div>
  );
}