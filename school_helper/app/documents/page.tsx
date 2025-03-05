'use client';

import { FileUpload } from '@/components/FileUpload';
import { createClient } from '@/utils/supabase/client';
import { useState } from 'react';
import { toast } from 'sonner';

export default function DocumentUploadPage() {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  
  const handleUploadSuccess = async (fileUrl: string) => {
    const supabase = createClient();
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
  
      if (!user) {
        toast.error('User not found');
        return;
      }
      
      // Extract filename from URL
      const fileName = fileUrl.split('/').pop() || 'unknown';
  
      try {
        const { data, error } = await supabase
          .from('Documents')
          .insert({
            user_id: user.id,
            file_url: fileUrl,
            original_name: fileName,
            uploaded_at: new Date().toISOString(),
            course_id: 9 // Add this if required by your table structure
          });
    
        if (error) {
          console.error('Detailed Metadata Save Error:', error);
          
          // If the table doesn't exist, just log it but don't show error to user
          if (error.message.includes('relation "Documents" does not exist')) {
            console.log('Documents table does not exist. Skipping metadata save.');
            toast.success('Document uploaded successfully (metadata not saved)');
          } else {
            toast.error(`Failed to save document details: ${error.message}`);
          }
        } else {
          console.log('Document metadata saved:', data);
          toast.success('Document uploaded and metadata saved');
        }
      } catch (dbError) {
        // If there's an error with the database, we still consider the upload successful
        console.error('Database error:', dbError);
        toast.success('Document uploaded successfully (metadata not saved)');
      }
    } catch (err) {
      console.error('Unexpected Error:', err);
      toast.error('An unexpected error occurred');
    }
  };
  
  const toggleTroubleshooting = () => {
    setShowTroubleshooting(!showTroubleshooting);
  };

  return (
    <div className="container mx-auto p-4">
      <div className="flex items-center mb-4">
        <h1 className="text-2xl font-bold">Upload Document</h1>
        <button 
          onClick={toggleTroubleshooting}
          className="ml-2 w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center hover:bg-gray-300 focus:outline-none"
          title="Troubleshooting tips"
        >
          <span className="text-sm font-bold">?</span>
        </button>
      </div>
      
      {showTroubleshooting && (
        <div className="mb-4 p-3 bg-gray-100 rounded-md text-sm border border-gray-200 animate-fadeIn">
          <h3 className="font-semibold mb-1 text-black">Troubleshooting Tips</h3>
          <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
            <li>Make sure you're logged in</li>
            <li>Check that your file is under the size limit (20MB)</li>
            <li>Ensure your file type is supported (.pdf, .txt, .doc, .docx)</li>
            <li>If you're an administrator, check the Supabase storage bucket permissions</li>
          </ul>
        </div>
      )}
      
      {uploadError && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          <p className="font-bold">Error</p>
          <p>{uploadError}</p>
          <p className="text-sm mt-2">
            Note: You may need to configure Row Level Security (RLS) policies in your Supabase project
            to allow file uploads. Please check the Supabase documentation for more information.
          </p>
        </div>
      )}
      
      <FileUpload 
        onUploadSuccess={handleUploadSuccess} 
        acceptedFileTypes={['.pdf', '.txt', '.doc', '.docx']}
        maxFileSize={20}
      />
      
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }
      `}</style>
    </div>
  );
}