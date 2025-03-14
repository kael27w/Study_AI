'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

// Define a type for the debug info
interface DebugInfo {
  responseStatus?: number;
  responseText?: string;
  parsedData?: any;
  parseError?: string;
  documentId?: string;
  documentName?: string;
  error?: string;
  navigationAttempted?: boolean;
  [key: string]: any;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadComplete, setUploadComplete] = useState(false);
  const [documentId, setDocumentId] = useState<string | null>(null);
  const [documentName, setDocumentName] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<DebugInfo>({});
  
  const router = useRouter();
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      console.log('File selected:', selectedFile.name);
    }
  };
  
  // Handle document upload
  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!file) {
      toast.error('Please select a file to upload');
      return;
    }
    
    setIsUploading(true);
    setUploadComplete(false);
    setDebugInfo({});
    
    try {
      console.log('Starting document upload:', file.name);
      
      // Create form data
      const formData = new FormData();
      formData.append('file', file);
      
      // Send to API
      const response = await fetch('/api/process-single-document', {
        method: 'POST',
        body: formData,
      });
      
      // Log response status
      console.log('Upload response status:', response.status);
      setDebugInfo((prev: DebugInfo) => ({ ...prev, responseStatus: response.status }));
      
      // Get response text for debugging
      const responseText = await response.text();
      console.log('Raw response text:', responseText);
      setDebugInfo((prev: DebugInfo) => ({ ...prev, responseText }));
      
      // Parse the response
      let data: any;
      try {
        data = JSON.parse(responseText);
        console.log('Parsed response data:', data);
        setDebugInfo((prev: DebugInfo) => ({ ...prev, parsedData: data }));
      } catch (parseError) {
        console.error('Error parsing response:', parseError);
        setDebugInfo((prev: DebugInfo) => ({ ...prev, parseError: String(parseError) }));
        throw new Error('Failed to parse server response');
      }
      
      if (!response.ok) {
        throw new Error(`Upload failed with status: ${response.status}`);
      }
      
      // Check if we have a document ID
      if (!data.documentId) {
        throw new Error('No document ID returned from server');
      }
      
      // Store document info
      const docId = data.documentId;
      const docName = file.name;
      
      console.log('Document processed successfully:', { docId, docName });
      setDebugInfo((prev: DebugInfo) => ({ ...prev, documentId: docId, documentName: docName }));
      
      // Save to localStorage
      localStorage.setItem('documentId', docId);
      localStorage.setItem('documentName', docName);
      console.log('Document info saved to localStorage');
      
      // Update state
      setDocumentId(docId);
      setDocumentName(docName);
      setUploadComplete(true);
      toast.success('Document uploaded successfully!');
      
      // Navigate directly to chat page after a short delay
      setTimeout(() => {
        const chatUrl = `/chat?documentId=${docId}&documentName=${encodeURIComponent(docName)}`;
        console.log('Navigating to chat page:', chatUrl);
        window.location.href = chatUrl;
      }, 1500); // 1.5 second delay to show the success message
      
    } catch (error) {
      console.error('Upload error:', error);
      setDebugInfo((prev: DebugInfo) => ({ ...prev, error: String(error) }));
      toast.error(`Upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsUploading(false);
    }
  };
  
  // Robust navigation function with fallbacks
  const navigateToChat = () => {
    if (!documentId) {
      toast.error('No document ID available');
      return;
    }
    
    const chatUrl = `/chat?documentId=${documentId}&documentName=${encodeURIComponent(documentName || 'document')}`;
    console.log('Attempting navigation to chat:', chatUrl);
    setDebugInfo((prev: DebugInfo) => ({ ...prev, navigationAttempted: true }));
    
    try {
      // First attempt: router.replace()
      console.log('Trying router.replace()');
      router.replace(chatUrl);
      
      // Set a fallback with direct navigation after a short delay
      setTimeout(() => {
        // Check if we're still on the upload page
        if (window.location.pathname.includes('/upload')) {
          console.log('router.replace() may have failed, trying window.location.href');
          window.location.href = chatUrl;
        }
      }, 500);
    } catch (navError) {
      console.error('Navigation error:', navError);
      
      // Fallback to direct navigation
      console.log('Navigation error, using window.location.href');
      window.location.href = chatUrl;
    }
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6 text-blue-600">Upload Your Document</h1>
      
      <div className="bg-white rounded-lg shadow-lg p-6">
        <form onSubmit={handleUpload} className="space-y-6">
          <div className="space-y-2">
            <label htmlFor="file" className="block text-sm font-medium">
              Select a PDF document
            </label>
            <input
              id="file"
              type="file"
              accept=".pdf"
              onChange={handleFileChange}
              className="block w-full text-sm border border-gray-300 rounded-lg cursor-pointer bg-gray-50 focus:outline-none"
              disabled={isUploading}
            />
            <p className="text-xs text-gray-500">
              Upload a PDF document to chat with its contents
            </p>
          </div>
          
          <Button
            type="submit"
            className="w-full"
            disabled={!file || isUploading}
          >
            {isUploading ? 'Uploading...' : 'Upload Document'}
          </Button>
        </form>
        
        {uploadComplete && documentId && (
          <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
            <h3 className="text-lg font-medium text-green-800 mb-2">
              Document Uploaded Successfully!
            </h3>
            <p className="text-sm text-green-700 mb-4">
              Your document "{documentName}" is ready for chat.
            </p>
            
            <div className="flex items-center justify-center space-x-2 text-blue-600">
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span>Redirecting to chat page...</span>
            </div>
          </div>
        )}
        
        {/* Debug Information */}
        {Object.keys(debugInfo).length > 0 && (
          <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
            <h3 className="text-sm font-medium text-gray-800 mb-2">Debug Information</h3>
            <pre className="text-xs overflow-auto max-h-40 p-2 bg-gray-100 rounded">
              {JSON.stringify(debugInfo, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
} 