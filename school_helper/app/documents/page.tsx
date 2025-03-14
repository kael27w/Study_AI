'use client';

import { FileUpload } from '@/components/FileUpload';
import { createClient } from '@/utils/supabase/client';
import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { useRouter } from 'next/navigation';

// Define interface for document data
interface DocumentData {
  id: string;
  user_id: string;
  file_url: string;
  original_name: string;
  uploaded_at: string;
  course_id?: number;
}

export default function DocumentUploadPage() {
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showTroubleshooting, setShowTroubleshooting] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null);
  const router = useRouter();
  
  // Effect to handle redirection after state update
  useEffect(() => {
    if (pendingRedirect) {
      const timer = setTimeout(() => {
        console.log('Navigating to:', pendingRedirect);
        router.push(pendingRedirect);
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [pendingRedirect, router]);
  
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
      console.log('File uploaded successfully:', fileName, fileUrl);
  
      try {
        const { data, error } = await supabase
          .from('Documents')
          .insert({
            user_id: user.id,
            file_url: fileUrl,
            original_name: fileName,
            uploaded_at: new Date().toISOString(),
            course_id: 9 // Add this if required by your table structure
          })
          .select();
    
        if (error) {
          console.error('Detailed Metadata Save Error:', error);
          
          // If the table doesn't exist, just log it but don't show error to user
          if (error.message.includes('relation "Documents" does not exist')) {
            console.log('Documents table does not exist. Skipping metadata save.');
            toast.success('Document uploaded successfully! Redirecting to chat...');
            
            // Store document info in localStorage with a generic ID
            localStorage.setItem('documentId', 'latest');
            localStorage.setItem('documentName', fileName);
            
            // Set redirecting state
            setIsRedirecting(true);
            
            // Set up redirection
            const chatUrl = `/chat?documentId=latest&documentName=${encodeURIComponent(fileName)}`;
            setPendingRedirect(chatUrl);
          } else {
            toast.error(`Failed to save document details: ${error.message}`);
          }
        } else {
          console.log('Document metadata saved:', data);
          toast.success('Document uploaded successfully! Redirecting to chat...');
          
          // Store document info in localStorage
          const documentId = data && data[0] ? (data[0] as DocumentData).id : 'latest';
          localStorage.setItem('documentId', documentId);
          localStorage.setItem('documentName', fileName);
          
          // Set redirecting state
          setIsRedirecting(true);
          
          // Set up redirection
          const chatUrl = `/chat?documentId=${documentId}&documentName=${encodeURIComponent(fileName)}`;
          setPendingRedirect(chatUrl);
        }
      } catch (dbError) {
        // If there's an error with the database, we still consider the upload successful
        console.error('Database error:', dbError);
        toast.success('Document uploaded successfully! Redirecting to chat...');
        
        // Store document info in localStorage with a generic ID
        localStorage.setItem('documentId', 'latest');
        localStorage.setItem('documentName', fileName);
        
        // Set redirecting state
        setIsRedirecting(true);
        
        // Set up redirection
        const chatUrl = `/chat?documentId=latest&documentName=${encodeURIComponent(fileName)}`;
        setPendingRedirect(chatUrl);
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
        <h1 className="text-2xl font-bold text-blue-600">Upload Document or Audio</h1>
        <button 
          onClick={toggleTroubleshooting}
          className="ml-2 w-6 h-6 rounded-full bg-gray-200 text-gray-700 flex items-center justify-center hover:bg-gray-300 focus:outline-none"
          title="Troubleshooting tips"
        >
          <span className="text-sm font-bold">?</span>
        </button>
      </div>
      
      <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-md text-sm">
        <h3 className="font-semibold mb-2 text-black">Supported File Types</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="font-medium text-blue-700">Documents</h4>
            <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
              <li>PDF files (.pdf)</li>
              <li>Text files (.txt)</li>
              <li>Word documents (.doc, .docx)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-blue-700">Audio</h4>
            <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
              <li>MP3 files (.mp3)</li>
              <li>WAV files (.wav)</li>
              <li>M4A files (.m4a)</li>
            </ul>
          </div>
        </div>
      </div>
      
      {showTroubleshooting && (
        <div className="mb-4 p-3 bg-gray-100 rounded-md text-sm border border-gray-200 animate-fadeIn">
          <h3 className="font-semibold mb-1 text-black">Troubleshooting Tips</h3>
          <ul className="list-disc pl-5 space-y-0.5 text-gray-700">
            <li>Make sure you're logged in</li>
            <li>Check that your document is under the size limit (20MB)</li>
            <li>Check that your audio file is under the size limit (50MB)</li>
            <li>Ensure your file type is supported (PDF, TXT, DOC, DOCX, MP3, WAV, M4A)</li>
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
      
      {isRedirecting ? (
        <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center justify-center space-x-2 text-blue-600">
            <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <span>Redirecting to chat page...</span>
          </div>
        </div>
      ) : (
        <FileUpload 
          onUploadSuccess={handleUploadSuccess} 
          acceptedFileTypes={['.pdf', '.txt', '.doc', '.docx', '.mp3', '.wav', '.m4a']}
          maxFileSize={50}
        />
      )}
      
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