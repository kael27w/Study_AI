'use client';

import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

// Define Message type
type Message = {
  role: 'user' | 'assistant' | 'system';
  content: string;
};

export function DocumentUploadAndChat() {
  console.log("🔍 [DEBUG] DocumentUploadAndChat component initialized");
  
  // Force update helper
  const [, forceUpdate] = useState({});
  const triggerRerender = () => forceUpdate({});
  
  // States for file upload
  const [isUploading, setIsUploading] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  
  // States for chat
  const [showChat, setShowChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  // Document info
  const [documentId, setDocumentId] = useState<string>("");
  const [documentName, setDocumentName] = useState<string>("");
  
  // Ref for messages container
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Load saved documentId and showChat state on mount
  useEffect(() => {
    const savedDocumentId = localStorage.getItem('documentId');
    const savedDocumentName = localStorage.getItem('documentName');
    
    console.log("🔍 [DEBUG] Checking for saved document state:", { savedDocumentId, savedDocumentName });
    
    if (savedDocumentId && savedDocumentName) {
      console.log("🔍 [DEBUG] Restoring saved document state");
      setDocumentId(savedDocumentId);
      setDocumentName(savedDocumentName);
      setShowChat(true);
    }
  }, []);
  
  // Save documentId and name when they change
  useEffect(() => {
    console.log("🔍 [DEBUG] Document state changed:", { documentId, documentName, showChat });
    
    if (documentId && documentName) {
      console.log("🔍 [DEBUG] Saving document state to localStorage");
      localStorage.setItem('documentId', documentId);
      localStorage.setItem('documentName', documentName);
    } else if (!documentId && !documentName) {
      console.log("🔍 [DEBUG] Clearing document state from localStorage");
      localStorage.removeItem('documentId');
      localStorage.removeItem('documentName');
    }
  }, [documentId, documentName]);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Process document when file is uploaded
  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!file) {
      toast.error("Please select a file first");
      return;
    }
    
    setIsUploading(true);
    toast.info("Uploading and processing document...");
    
    try {
      // Create FormData
      const formData = new FormData();
      formData.append("file", file);
      
      console.log("🔍 [DEBUG] Uploading file:", file.name);
      
      // Process document with API
      const response = await fetch("/api/process-single-document", {
        method: "POST",
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      // Log raw response for debugging
      const responseText = await response.text();
      console.log("🔍 [DEBUG] Raw API response:", responseText);
      
      // Parse JSON response
      const result = JSON.parse(responseText);
      console.log("🔍 [DEBUG] Parsed API response:", result);
      
      // Check for documentId in the expected location
      let docId = null;
      if (result.documentId) {
        docId = result.documentId;
      } else if (result.data && result.data.id) {
        docId = result.data.id;
      } else if (result.data && result.data[0] && result.data[0].id) {
        docId = result.data[0].id;
      }
      
      if (docId) {
        console.log("🔍 [DEBUG] Found document ID:", docId);
        setDocumentId(docId);
        
        console.log("🔍 [DEBUG] Setting documentName:", file.name);
        setDocumentName(file.name);
        
        console.log("🔍 [DEBUG] Setting showChat to true");
        setShowChat(true);
        
        // Save state to localStorage
        localStorage.setItem('documentId', docId);
        localStorage.setItem('documentName', file.name);
        
        toast.success("Document processed successfully!");
        
        // Force re-render and check state after a delay
        triggerRerender();
        setTimeout(() => {
          console.log("🔍 [DEBUG] State check after delay:", {
            showChat: showChat,
            documentId: documentId,
            localStorageDocId: localStorage.getItem('documentId')
          });
          if (!showChat) {
            console.log("🔍 [DEBUG] showChat still false, forcing it true again");
            setShowChat(true);
            triggerRerender();
          }
        }, 1000);
      } else {
        console.error("🔍 [DEBUG] No document ID found in response:", result);
        throw new Error("No document ID found in the response");
      }
    } catch (error) {
      console.error("Processing error:", error);
      toast.error("Failed to process document");
    } finally {
      setIsUploading(false);
    }
  };
  
  // Handle file selection
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
    }
  };
  
  // Function to reset all states
  const handleNewDocument = () => {
    console.log("🔍 [DEBUG] Resetting all states for new document upload");
    setShowChat(false);
    setDocumentId("");
    setDocumentName("");
    setMessages([]);
    setFile(null);
    localStorage.removeItem('documentId');
    localStorage.removeItem('documentName');
  };
  
  // Send message to chat API
  const handleSendMessage = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    
    if (!input.trim() || !documentId) return;
    
    const userMessage = { role: 'user' as const, content: input };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    
    try {
      const response = await fetch("/api/document-chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          documentId,
          message: input,
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }
      
      const data = await response.json();
      const assistantMessage = { role: 'assistant' as const, content: data.text };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Failed to send message");
    } finally {
      setIsLoading(false);
    }
  };
  
  // Render the component
  console.log("🔍 [DEBUG] Rendering with states:", {
    showChat,
    documentId,
    isUploading, 
    messagesLength: messages.length,
    documentNameSet: !!documentName
  });
  
  return (
    <div className="w-full mx-auto max-w-4xl flex flex-col">
      <div className="relative w-full h-full min-h-[70vh] p-4 bg-white rounded-lg shadow-lg overflow-hidden">
        {/* Debug Panel - Only visible in development */}
        {process.env.NODE_ENV === 'development' && (
          <div className="absolute top-0 right-0 z-50 bg-black/80 text-white p-2 text-xs rounded-bl-lg max-w-xs">
            <div>showChat: {String(showChat)}</div>
            <div>documentId: {documentId || 'null'}</div>
            <div>documentName: {documentName || 'null'}</div>
            <div>isUploading: {String(isUploading)}</div>
            <div>messages: {messages.length}</div>
            <div className="flex space-x-2 mt-2">
              <button 
                onClick={() => {
                  setShowChat(true);
                  triggerRerender();
                }} 
                className="bg-green-600 px-2 py-1 rounded text-xs"
              >
                Force Chat
              </button>
              <button 
                onClick={() => {
                  setShowChat(false);
                  triggerRerender();
                }} 
                className="bg-blue-600 px-2 py-1 rounded text-xs"
              >
                Force Upload
              </button>
              <button 
                onClick={handleNewDocument} 
                className="bg-red-600 px-2 py-1 rounded text-xs"
              >
                Reset
              </button>
            </div>
            <div onClick={() => triggerRerender()} className="cursor-pointer text-yellow-300 mt-1">
              Force Update
            </div>
          </div>
        )}
        
        {/* UPLOAD INTERFACE */}
        {!showChat && (
          <div className="w-full min-h-[70vh] flex flex-col space-y-8">
            <h2 className="text-xl font-semibold text-center">Upload a PDF Document</h2>
            
            {/* File uploader */}
            <form onSubmit={handleSubmit} className="w-full">
              <div className="flex flex-col items-center justify-center space-y-4">
                <div 
                  className={cn(
                    "border-2 border-dashed rounded-lg p-8 w-full max-w-md mx-auto text-center cursor-pointer",
                    "hover:bg-gray-50 transition-colors duration-200",
                    file ? "border-green-500 bg-green-50" : "border-gray-300"
                  )}
                  onClick={() => document.getElementById('file-upload')?.click()}
                >
                  <input
                    id="file-upload"
                    type="file"
                    accept=".pdf"
                    onChange={handleFileChange}
                    className="hidden"
                    disabled={isUploading}
                  />
                  
                  {file ? (
                    <div>
                      <p className="font-medium text-green-600">{file.name}</p>
                      <p className="text-sm text-gray-500 mt-1">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  ) : (
                    <div>
                      <p className="font-medium">Drop your PDF here or click to browse</p>
                      <p className="text-sm text-gray-500 mt-1">PDF files only, max 10MB</p>
                    </div>
                  )}
                </div>
                
                <Button 
                  type="submit" 
                  disabled={!file || isUploading}
                  className="px-6 py-2"
                >
                  {isUploading ? "Processing..." : "Upload and Process"}
                </Button>
              </div>
            </form>
          </div>
        )}
        
        {/* CHAT INTERFACE */}
        {showChat && documentId && (
          <div className="flex flex-col h-full">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Chat with {documentName}</h2>
              <button
                onClick={handleNewDocument}
                className="bg-gray-200 px-3 py-1 rounded text-sm"
              >
                New Document
              </button>
            </div>
            
            {/* Messages container */}
            <div className="flex-1 overflow-y-auto mb-4 p-4 bg-gray-50 rounded-lg">
              {messages.length === 0 ? (
                <div className="text-gray-500 text-center my-8">
                  Ask a question about your document
                </div>
              ) : (
                <div className="space-y-4">
                  {messages.map((message, idx) => (
                    <div
                      key={idx}
                      className={cn(
                        "max-w-[80%] rounded-lg p-3",
                        message.role === "user"
                          ? "bg-blue-500 text-white ml-auto rounded-br-none"
                          : "bg-gray-200 text-gray-800 rounded-bl-none"
                      )}
                    >
                      {message.content}
                    </div>
                  ))}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>
            
            {/* Input for sending messages */}
            <form onSubmit={handleSendMessage} className="flex space-x-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question about your document..."
                className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                disabled={isLoading}
              />
              <Button type="submit" disabled={isLoading || !input.trim()}>
                {isLoading ? "Sending..." : "Send"}
              </Button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
} 