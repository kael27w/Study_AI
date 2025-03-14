'use client';

import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';

// Define Message type
type Message = {
  role: 'user' | 'assistant';
  content: string;
};

// Define AudioPlayer component
const AudioPlayer = ({ audioUrl }: { audioUrl: string }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
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
  
  // Format time in MM:SS format
  const formatTime = (time: number) => {
    const minutes = Math.floor(time / 60);
    const seconds = Math.floor(time % 60);
    return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
  };
  
  return (
    <div className="w-full p-4 bg-gray-100 rounded-lg">
      <div className="flex items-center gap-4 mb-2">
        <button
          onClick={togglePlayPause}
          className="w-8 h-8 flex items-center justify-center bg-blue-600 text-white rounded-full hover:bg-blue-700"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? (
            <span>⏸</span>
          ) : (
            <span>▶</span>
          )}
        </button>
        
        <div className="text-sm font-mono text-black">
          {formatTime(currentTime)} / {formatTime(duration || 0)}
        </div>
      </div>
      
      <div className="w-full bg-gray-300 h-2 rounded-full overflow-hidden">
        <div 
          className="bg-blue-600 h-full" 
          style={{ width: `${duration ? (currentTime / duration) * 100 : 0}%` }}
        ></div>
      </div>
    </div>
  );
};

export default function ChatPage() {
  const searchParams = useSearchParams();
  
  // Get document ID from URL if present
  const urlDocId = searchParams?.get('documentId');
  const urlDocName = searchParams?.get('documentName');
  
  // Log URL parameters immediately on component mount
  console.log('Chat page mounted with URL params:', {
    documentId: urlDocId,
    documentName: urlDocName,
    fullUrl: typeof window !== 'undefined' ? window.location.href : 'SSR',
    searchParams: searchParams?.toString()
  });
  
  // Chat states
  const [documentId, setDocumentId] = useState<string>('');
  const [documentName, setDocumentName] = useState<string>('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [noDocument, setNoDocument] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, any>>({
    urlParams: { documentId: urlDocId, documentName: urlDocName },
    initialized: false
  });
  
  // Audio states
  const [isAudioTranscription, setIsAudioTranscription] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  
  // Ref for scrolling to bottom of messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Ref to track if initial summary has been requested
  const initialSummaryRequestedRef = useRef(false);
  
  // Ref to track if a summary request is in progress
  const summaryRequestInProgressRef = useRef(false);
  
  // Check for document ID from URL or localStorage on mount
  useEffect(() => {
    console.log('Initializing chat page with document info');
    setIsLoading(true);
    
    // First check URL parameters
    if (urlDocId) {
      console.log('Found document ID in URL:', urlDocId);
      setDebugInfo(prev => ({ 
        ...prev, 
        source: 'url', 
        documentId: urlDocId,
        documentName: urlDocName
      }));
      
      // Set document info from URL
      setDocumentId(urlDocId);
      if (urlDocName) {
        try {
          const decodedName = decodeURIComponent(urlDocName);
          setDocumentName(decodedName);
        } catch (error) {
          console.error('Error decoding document name:', error);
          setDocumentName(urlDocName);
        }
      }
      
      // Save to localStorage for persistence
      localStorage.setItem('documentId', urlDocId);
      if (urlDocName) {
        localStorage.setItem('documentName', urlDocName);
      }
      
      // Check if this is an audio transcription
      checkIfAudioTranscription(urlDocId);
      
      // Only request initial summary if it hasn't been requested yet
      if (!initialSummaryRequestedRef.current) {
        initialSummaryRequestedRef.current = true;
        // Generate initial summary after a short delay to ensure state is updated
        setTimeout(() => {
          console.log('Sending initial summary request with docId:', urlDocId);
          handleSendInitialSummary(urlDocId);
        }, 1000);
      }
      
      setIsLoading(false);
      return;
    }
    
    // If no URL parameters, check localStorage
    console.log('No document ID in URL, checking localStorage');
    const savedDocId = localStorage.getItem('documentId');
    const savedDocName = localStorage.getItem('documentName');
    
    setDebugInfo(prev => ({ 
      ...prev, 
      localStorage: { documentId: savedDocId, documentName: savedDocName } 
    }));
    
    if (savedDocId) {
      console.log('Found document ID in localStorage:', savedDocId);
      setDocumentId(savedDocId);
      if (savedDocName) {
        setDocumentName(savedDocName);
      }
      
      // Check if this is an audio transcription
      checkIfAudioTranscription(savedDocId);
      
      // Only request initial summary if it hasn't been requested yet
      if (!initialSummaryRequestedRef.current) {
        initialSummaryRequestedRef.current = true;
        // Generate initial summary after a short delay to ensure state is updated
        setTimeout(() => {
          console.log('Sending initial summary request with docId:', savedDocId);
          handleSendInitialSummary(savedDocId);
        }, 1000);
      }
      
      setIsLoading(false);
    } else {
      console.log('No document ID found in localStorage either');
      setNoDocument(true);
      setDebugInfo(prev => ({ ...prev, noDocument: true }));
      setIsLoading(false);
    }
    
    setDebugInfo(prev => ({ ...prev, initialized: true }));
  }, [urlDocId, urlDocName]);
  
  // Check if the document is an audio transcription
  const checkIfAudioTranscription = async (docId: string) => {
    try {
      const supabase = createClient();
      
      // First check if the document has an audio_id
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .select('audio_id, original_name')
        .eq('id', docId)
        .single();
      
      if (docError || !docData || !docData.audio_id) {
        console.log('Not an audio transcription or error:', docError);
        return;
      }
      
      console.log('Document has audio_id:', docData.audio_id);
      setIsAudioTranscription(true);
      
      // If the document name doesn't already indicate it's a transcription, update it
      if (!documentName.startsWith('Transcription:') && docData.original_name.startsWith('Transcription:')) {
        setDocumentName(docData.original_name);
      }
      
      // Fetch the audio file URL
      const { data: audioData, error: audioError } = await supabase
        .from('audio_files')
        .select('file_url')
        .eq('id', docData.audio_id)
        .single();
      
      if (audioError || !audioData) {
        console.error('Error fetching audio file:', audioError);
        return;
      }
      
      // Construct the full URL to the audio file
      const fullAudioUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/Documents/${audioData.file_url}`;
      console.log('Audio URL:', fullAudioUrl);
      setAudioUrl(fullAudioUrl);
      
    } catch (error) {
      console.error('Error checking for audio transcription:', error);
    }
  };
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Handle sending initial summary request
  const handleSendInitialSummary = async (docId: string) => {
    console.log('Requesting initial summary for document:', docId);
    
    // Prevent duplicate requests
    if (summaryRequestInProgressRef.current) {
      console.log('Summary request already in progress, skipping duplicate request');
      return;
    }
    
    if (!docId) {
      console.error('Cannot request summary: No document ID provided');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: `<div class="text-black">
          <h2 class="text-xl font-semibold mb-2">Missing Document ID</h2>
          <p>Unable to load document information. Please try refreshing the page or uploading the document again.</p>
        </div>`
      }]);
      return;
    }
    
    // Check if we already have messages - if so, don't request a new summary
    if (messages.length > 0) {
      console.log('Chat already has messages, skipping initial summary');
      return;
    }
    
    summaryRequestInProgressRef.current = true;
    setIsLoading(true);
    
    try {
      const response = await fetch('/api/document-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId: docId,
          message: `
      Summarize the document in a concise manner with clear formatting. 
      Please provide a comprehensive, well-formatted summary of this document. 
      Format your response with clear headings, bullet points, and short paragraphs for readability. 
      Include: 
      1) A brief overview (2-3 sentences), 
      2) Key topics or sections with bullet points, 
      3) Any important details worth highlighting.
      `,
        }),
      });
      
      if (!response.ok) {
        console.error(`Error response from API: ${response.status}`);
        
        // Handle specific error codes
        if (response.status === 400) {
          throw new Error('Bad request: Document ID may be missing or invalid');
        } else {
          throw new Error(`Error: ${response.status}`);
        }
      }
      
      const data = await response.json();
      
      // Process the summary text to enhance formatting
      if (data.status === 'quota_exceeded') {
        // Add special formatting for quota exceeded messages
        let formattedText = data.response;
        
        // Convert markdown-style headers to HTML
        formattedText = formattedText.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');
        formattedText = formattedText.replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-3 mb-2">$1</h2>');
        formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium mt-3 mb-1">$1</h3>');
        
        // Wrap paragraphs in <p> tags (if they're not already wrapped in HTML)
        formattedText = formattedText.replace(/^(?!<[h|p|l|u])(.*$)/gm, '<p class="my-2">$1</p>');
        
        // Create the assistant message with the formatted quota message
        const quotaMessage: Message = {
          role: 'assistant',
          content: `<div class="text-black">
            <h2 class="text-xl font-semibold mb-2 text-amber-600">OpenAI API Quota Exceeded</h2>
            ${formattedText}
          </div>`
        };
        
        setMessages(prev => [...prev, quotaMessage]);
      } else if (!data.response || data.response.trim() === '' || 
          data.response.includes('no content available') || 
          data.response.includes('The document does not contain any text content')) {
        
        // Handle empty or no content case - likely an audio file still being processed
        const isAudioFile = documentName && 
          (documentName.toLowerCase().endsWith('.mp3') || 
           documentName.toLowerCase().endsWith('.wav') || 
           documentName.toLowerCase().endsWith('.m4a'));
        
        if (isAudioFile) {
          // Add a message explaining that the audio is still being processed
          const processingMessage: Message = {
            role: 'assistant',
            content: `<div class="text-black">
              <h2 class="text-xl font-semibold mb-2">Audio Processing</h2>
              <p>Your audio file "${documentName}" is still being processed. Transcription may take several minutes depending on the length of the recording.</p>
              <p class="mt-2">Please wait a few minutes and then try asking a question about the content. You can refresh the page to check if processing is complete.</p>
              <p class="mt-2 text-blue-600">If this message persists after 10 minutes, the file may be too large or in an unsupported format.</p>
            </div>`
          };
          setMessages(prev => [...prev, processingMessage]);
        } else {
          // Generic empty content message
          const emptyContentMessage: Message = {
            role: 'assistant',
            content: `<div class="text-black">
              <h2 class="text-xl font-semibold mb-2">No Content Available</h2>
              <p>The document "${documentName}" doesn't appear to have any readable content or is still being processed.</p>
              <p class="mt-2">If this is unexpected, please check that the document contains text content and try again.</p>
            </div>`
          };
          setMessages(prev => [...prev, emptyContentMessage]);
        }
      } else {
        // Process the summary text to enhance formatting
        let formattedText = data.response;
        
        // Convert markdown-style headers to HTML
        formattedText = formattedText.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');
        formattedText = formattedText.replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-3 mb-2">$1</h2>');
        formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium mt-3 mb-1">$1</h3>');
        
        // Convert bullet points
        formattedText = formattedText.replace(/^\* (.*$)/gm, '<li class="ml-4 list-disc">$1</li>');
        formattedText = formattedText.replace(/^- (.*$)/gm, '<li class="ml-4 list-disc">$1</li>');
        
        // Wrap paragraphs in <p> tags (if they're not already wrapped in HTML)
        formattedText = formattedText.replace(/^(?!<[h|p|l|u])(.*$)/gm, '<p class="my-2">$1</p>');
        
        // Add spacing between sections
        formattedText = formattedText.replace(/<\/h[1-3]>/g, '</h$&><div class="mb-2"></div>');
        
        // Create the assistant message with the formatted summary
        const assistantMessage: Message = {
          role: 'assistant',
          content: `<div class="text-black">${formattedText}</div>`
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      }
    } catch (error) {
      console.error('Error fetching summary:', error);
      const errorMessage: Message = {
        role: 'assistant',
        content: `<div class="text-black font-medium">Error: Failed to generate summary. Please try again.</div>`
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      summaryRequestInProgressRef.current = false;
    }
  };
  
  // Handle sending a message
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!input.trim() || !documentId) {
      return;
    }
    
    // Add user message to chat
    const userMessage: Message = { 
      role: 'user', 
      content: `<div class="text-black">${input}</div>` 
    };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);
    
    try {
      // Send message to API
      const response = await fetch('/api/document-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          documentId,
          message: input // Send the plain text input, not the HTML-wrapped content
        })
      });
      
      if (!response.ok) {
        console.error(`Error response from API: ${response.status}`);
        throw new Error(`Server error: ${response.status}`);
      }
      
      const data = await response.json();
      
      // Check if there's actual content in the response
      if (data.status === 'quota_exceeded') {
        // Add special formatting for quota exceeded messages
        let formattedText = data.response;
        
        // Convert markdown-style headers to HTML
        formattedText = formattedText.replace(/^# (.*$)/gm, '<h1 class="text-2xl font-bold mt-4 mb-2">$1</h1>');
        formattedText = formattedText.replace(/^## (.*$)/gm, '<h2 class="text-xl font-semibold mt-3 mb-2">$1</h2>');
        formattedText = formattedText.replace(/^### (.*$)/gm, '<h3 class="text-lg font-medium mt-3 mb-1">$1</h3>');
        
        // Wrap paragraphs in <p> tags (if they're not already wrapped in HTML)
        formattedText = formattedText.replace(/^(?!<[h|p|l|u])(.*$)/gm, '<p class="my-2">$1</p>');
        
        // Create the assistant message with the formatted quota message
        const quotaMessage: Message = {
          role: 'assistant',
          content: `<div class="text-black">
            <h2 class="text-xl font-semibold mb-2 text-amber-600">OpenAI API Quota Exceeded</h2>
            ${formattedText}
          </div>`
        };
        
        setMessages(prev => [...prev, quotaMessage]);
      } else if (!data.response || data.response.trim() === '' || 
          data.response.includes('no content available') || 
          data.response.includes('The document does not contain any text content')) {
        
        // Handle empty or no content case - likely an audio file still being processed
        const isAudioFile = documentName && 
          (documentName.toLowerCase().endsWith('.mp3') || 
           documentName.toLowerCase().endsWith('.wav') || 
           documentName.toLowerCase().endsWith('.m4a'));
        
        if (isAudioFile) {
          // Add a message explaining that the audio is still being processed
          const processingMessage: Message = {
            role: 'assistant',
            content: `<div class="text-black">
              <h2 class="text-xl font-semibold mb-2">Audio Processing</h2>
              <p>Your audio file "${documentName}" is still being processed. Transcription may take several minutes depending on the length of the recording.</p>
              <p class="mt-2">Please wait a few minutes and then try asking a question about the content. You can refresh the page to check if processing is complete.</p>
              <p class="mt-2 text-blue-600">If this message persists after 10 minutes, the file may be too large or in an unsupported format.</p>
            </div>`
          };
          setMessages(prev => [...prev, processingMessage]);
        } else {
          // Generic empty content message
          const emptyContentMessage: Message = {
            role: 'assistant',
            content: `<div class="text-black">
              <h2 class="text-xl font-semibold mb-2">No Content Available</h2>
              <p>I couldn't find any content to answer your question. The document may still be processing or doesn't contain relevant information.</p>
            </div>`
          };
          setMessages(prev => [...prev, emptyContentMessage]);
        }
      } else {
        // Add assistant response to chat with proper formatting
        const assistantMessage: Message = { 
          role: 'assistant', 
          content: `<div class="text-black">${data.response}</div>`
        };
        
        setMessages(prev => [...prev, assistantMessage]);
      }
      
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Failed to send message');
      
      // Add error message to chat
      setMessages(prev => [
        ...prev, 
        { 
          role: 'assistant', 
          content: `<div class="text-black font-medium">
            Sorry, I encountered an error processing your request. Please try again later.
          </div>` 
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Reset everything and go back to documents view
  const handleNewDocument = () => {
    // Clear localStorage
    localStorage.removeItem('documentId');
    localStorage.removeItem('documentName');
    console.log('Cleared localStorage, navigating to documents page');
    
    // Navigate to documents page
    window.location.href = '/documents';
  };
  
  // If no document is found, show upload prompt
  if (noDocument) {
    return (
      <div className="container mx-auto p-4 max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">Document Chat</h1>
        
        <div className="bg-white rounded-lg shadow-lg p-6 flex flex-col items-center justify-center min-h-[60vh]">
          <h2 className="text-xl font-semibold mb-4">No Document Found</h2>
          <p className="text-gray-600 mb-6">Please upload a document to start chatting.</p>
          
          <Link 
            href="/upload" 
            className="bg-blue-600 text-white py-2 px-4 rounded-lg font-medium hover:bg-blue-700 transition-colors"
          >
            Upload a Document
          </Link>
        </div>
      </div>
    );
  }
  
  return (
    <div className="container mx-auto p-4 max-w-4xl">
      <h1 className="text-2xl font-bold mb-6">Document Chat</h1>
      
      {/* Debug info */}
      <div className="mb-4 p-3 bg-gray-100 rounded text-xs font-mono text-black">
        <div>Document ID: {documentId || 'none'}</div>
        <div>Document Name: {documentName || 'none'}</div>
        <div>URL Params: {urlDocId ? `ID=${urlDocId}, Name=${urlDocName}` : 'none'}</div>
        <div>Messages: {messages.length}</div>
        {isAudioTranscription && <div>Audio Transcription: Yes</div>}
      </div>
      
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
            <h3 className="text-sm font-medium mb-2 text-black">Original Audio Recording</h3>
            <AudioPlayer audioUrl={audioUrl} />
          </div>
        )}
        
        {/* Messages */}
        <div className="flex-1 overflow-y-auto mb-4 border rounded-lg p-4">
          {messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-500">
              {isLoading ? (
                <p className="mb-2">Generating document summary...</p>
              ) : (
                <>
                  <p className="mb-2">No messages yet</p>
                  <p className="text-sm">Ask a question about your document</p>
                </>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {messages.map((message, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg ${
                    message.role === 'user' 
                      ? 'bg-blue-100 ml-12' 
                      : 'bg-gray-100 mr-12'
                  }`}
                >
                  <p className="text-sm font-medium mb-1 text-black">
                    {message.role === 'user' ? 'You' : 'AI Assistant'}
                  </p>
                  <div className="text-black" dangerouslySetInnerHTML={{ __html: message.content }} />
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        
        {/* Message input */}
        <form onSubmit={handleSendMessage} className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question about your document..."
            className="flex-1 p-2 border rounded-lg"
            disabled={isLoading}
          />
          <Button 
            type="submit" 
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? 'Sending...' : 'Send'}
          </Button>
        </form>
      </div>
    </div>
  );
} 