'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function TestPage() {
  const router = useRouter();
  const [message, setMessage] = useState('');
  
  useEffect(() => {
    console.log('🔍 [DEBUG CLIENT] Test page mounted');
    setMessage('Page loaded at ' + new Date().toLocaleTimeString());
  }, []);
  
  const handleRouterPush = () => {
    console.log('🔍 [DEBUG CLIENT] Testing router.push to /');
    router.push('/');
  };
  
  const handleWindowLocation = () => {
    console.log('🔍 [DEBUG CLIENT] Testing window.location to /');
    window.location.href = '/';
  };
  
  const handleDirectLink = () => {
    console.log('🔍 [DEBUG CLIENT] Testing direct a href');
    const link = document.createElement('a');
    link.href = '/';
    link.click();
  };
  
  const handleWithParams = () => {
    console.log('🔍 [DEBUG CLIENT] Testing navigation with params');
    const testId = 'test-' + Date.now();
    const testName = 'Test Document';
    window.location.href = `/chat?documentId=${testId}&documentName=${encodeURIComponent(testName)}`;
  };
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Navigation Test Page</h1>
      
      <div className="bg-white rounded-lg shadow-lg p-6">
        <p className="mb-4">{message}</p>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-2">Client Navigation</h2>
            <div className="space-y-2">
              <button 
                onClick={handleRouterPush}
                className="w-full p-2 bg-blue-500 text-white rounded"
              >
                Test router.push
              </button>
              <button 
                onClick={handleWindowLocation}
                className="w-full p-2 bg-green-500 text-white rounded"
              >
                Test window.location
              </button>
              <button 
                onClick={handleDirectLink}
                className="w-full p-2 bg-purple-500 text-white rounded"
              >
                Test direct link
              </button>
              <button 
                onClick={handleWithParams}
                className="w-full p-2 bg-orange-500 text-white rounded"
              >
                Test with URL params
              </button>
            </div>
          </div>
          
          <div className="border rounded-lg p-4">
            <h2 className="text-lg font-medium mb-2">Link Component</h2>
            <div className="space-y-2">
              <Link 
                href="/"
                className="block w-full p-2 bg-blue-500 text-white rounded text-center"
              >
                Link to Home
              </Link>
              <Link 
                href="/upload"
                className="block w-full p-2 bg-green-500 text-white rounded text-center"
              >
                Link to Upload
              </Link>
              <Link 
                href="/chat"
                className="block w-full p-2 bg-purple-500 text-white rounded text-center"
              >
                Link to Chat
              </Link>
              <Link 
                href="/chat?documentId=test-123&documentName=Test%20Document"
                className="block w-full p-2 bg-orange-500 text-white rounded text-center"
              >
                Link with params
              </Link>
            </div>
          </div>
        </div>
        
        <div className="bg-gray-100 p-4 rounded-lg">
          <h2 className="text-lg font-medium mb-2">Debug Info</h2>
          <div className="text-sm font-mono">
            <div>Current URL: {typeof window !== 'undefined' ? window.location.href : 'SSR'}</div>
            <div>User Agent: {typeof window !== 'undefined' ? window.navigator.userAgent : 'SSR'}</div>
            <div>Next.js Router Available: {router ? 'Yes' : 'No'}</div>
          </div>
        </div>
      </div>
    </div>
  );
} 