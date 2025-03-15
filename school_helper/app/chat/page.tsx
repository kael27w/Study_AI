'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { createClient } from '@/utils/supabase/client';
import { DocumentTabContent } from '@/components/DocumentTabContent';
import { DocumentErrorModal } from '../../components/DocumentErrorModal';

// Define Message type
type Message = {
  role: 'user' | 'assistant';
  content: string;
  waitingForRetry?: boolean;
};

// Helper function to get the full URL for a file in Supabase storage
const getFileUrl = (filePath: string, setIsAudio?: (isAudio: boolean) => void): string => {
  if (!filePath) {
    console.error('💬 [CHAT] Invalid file path:', filePath);
    return '';
  }
  
  console.log('💬 [CHAT] Getting file URL for path:', filePath);
  
  // Handle complete URLs (which might be returned by the API)
  if (filePath.startsWith('http')) {
    console.log('💬 [CHAT] URL is already complete:', filePath);
    
    // Check if it's an audio file URL
    if (filePath.toLowerCase().match(/\.(mp3|wav|m4a|ogg|aac)$/)) {
      console.log('💬 [CHAT] URL is for an audio file');
      if (setIsAudio) setIsAudio(true);
    }
    
    return filePath;
  }
  
  // Clean up the file path if needed
  let cleanPath = filePath;
  
  // Remove 'public/' prefix if present
  if (cleanPath.startsWith('public/')) {
    cleanPath = cleanPath.replace('public/', '');
  }
  
  // Ensure path doesn't start with a slash
  if (cleanPath.startsWith('/')) {
    cleanPath = cleanPath.substring(1);
  }
  
  // For audio files, always use the audio_files bucket
  let bucket = 'Documents';
  
  // Simple check for audio file extensions
  const isAudioFile = cleanPath.toLowerCase().match(/\.(mp3|wav|m4a|ogg|aac)$/);
  if (isAudioFile) {
    bucket = 'audio_files';
    console.log('💬 [CHAT] File is audio, using audio_files bucket');
    if (setIsAudio) setIsAudio(true);
  } else {
    if (setIsAudio) setIsAudio(false);
  }
  
  // Encode the file path components (but not the slashes)
  const encodedPath = cleanPath.split('/').map(part => encodeURIComponent(part)).join('/');
  
  // Construct the full URL
  const fullUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${bucket}/${encodedPath}`;
  console.log('💬 [CHAT] Generated file URL:', fullUrl);
  
  return fullUrl;
};

// Add this function to verify document ID format
const isValidDocumentId = (id: string): boolean => {
  // Check if it's a valid UUID format (most database IDs are UUIDs)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(id);
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
  const [documents, setDocuments] = useState<any[]>([]);
  const [loadingDocuments, setLoadingDocuments] = useState(false);
  const [debugInfo, setDebugInfo] = useState<Record<string, any>>({
    urlParams: { documentId: urlDocId, documentName: urlDocName },
    initialized: false
  });
  
  // Audio states
  const [isAudioTranscription, setIsAudioTranscription] = useState(false);
  const [audioUrl, setAudioUrl] = useState('');
  const [isActualAudioFile, setIsActualAudioFile] = useState(false);
  
  // Ref for scrolling to bottom of messages
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Ref to track if initial summary has been requested
  const initialSummaryRequestedRef = useRef(false);
  
  // Ref to track if a summary request is in progress
  const summaryRequestInProgressRef = useRef(false);
  
  // First, add setBotTyping state
  const [botTyping, setBotTyping] = useState(false);
  
  // Add a specific state for summary
  const [summary, setSummary] = useState<string>('');
  const [summaryLoaded, setSummaryLoaded] = useState<boolean>(false);
  const [summaryError, setSummaryError] = useState<boolean>(false);
  
  // Add new states for the modal
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [suggestedDocuments, setSuggestedDocuments] = useState<any[]>([]);
  
  // Fetch documents from the database
  const fetchDocuments = async () => {
    setLoadingDocuments(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('Documents')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(10);
      
      if (error) {
        console.error('Error fetching documents:', error);
        toast.error('Failed to load documents');
      } else if (data && data.length > 0) {
        console.log('Fetched documents:', data);
        setDocuments(data);
      } else {
        console.log('No documents found');
      }
    } catch (error) {
      console.error('Error in fetchDocuments:', error);
    } finally {
      setLoadingDocuments(false);
    }
  };

  // Update the handleSelectDocument function to validate the document ID
  const handleSelectDocument = (doc: any) => {
    if (!doc || !doc.id) {
      console.error('💬 [CHAT] Invalid document selected:', doc);
      toast.error('Invalid document selected');
      return;
    }
    
    // Validate the document ID format
    if (!isValidDocumentId(doc.id)) {
      console.error('💬 [CHAT] Invalid document ID format:', doc.id);
      toast.error('Invalid document ID format');
      return;
    }
    
    console.log('💬 [CHAT] Document selected:', doc);
    
    setDocumentId(doc.id);
    setDocumentName(doc.original_name || doc.name || 'Unnamed Document');
    
    // Save to localStorage
    localStorage.setItem('documentId', doc.id);
    localStorage.setItem('documentName', doc.original_name || doc.name || 'Unnamed Document');
    
    // Check if audio transcription
    checkIfAudioTranscription(doc.id);
    
    // Reset no document state
    setNoDocument(false);
    
    // Reset messages
    setMessages([]);
    
    // Reset summary state
    setSummary('');
    setSummaryLoaded(false);
    setSummaryError(false);
    
    // Request initial summary
    if (!initialSummaryRequestedRef.current) {
      initialSummaryRequestedRef.current = true;
      setTimeout(() => {
        handleSendInitialSummary(doc.id);
      }, 1000);
    }
  };
  
  // Update the check for document ID from URL or localStorage on mount
  useEffect(() => {
    const getInitialDocumentId = async () => {
      console.log('💬 [CHAT] Checking for initial document ID');
      
      // First check URL parameters
      if (urlDocId) {
        console.log('💬 [CHAT] Found document ID in URL:', urlDocId);
        
        // Validate the document ID format
        if (!isValidDocumentId(urlDocId)) {
          console.error('💬 [CHAT] Invalid document ID format in URL:', urlDocId);
          setNoDocument(true);
          toast.error('Invalid document ID format. Please select a valid document.');
          return;
        }
        
        setDocumentId(urlDocId);
        if (urlDocName) {
          console.log('💬 [CHAT] Found document name in URL:', urlDocName);
          setDocumentName(urlDocName);
        }
        
        // Fetch documents to verify this document exists
        await fetchDocuments();
        
        // Check if audio transcription
        checkIfAudioTranscription(urlDocId);
        
        // Set no document state to false
        setNoDocument(false);
        
        return;
      }
      
      // If no URL parameters, check localStorage
      const storedDocumentId = localStorage.getItem('documentId');
      const storedDocumentName = localStorage.getItem('documentName');
      
      if (storedDocumentId) {
        console.log('💬 [CHAT] Found document ID in localStorage:', storedDocumentId);
        
        // Validate the document ID format
        if (!isValidDocumentId(storedDocumentId)) {
          console.error('💬 [CHAT] Invalid document ID format in localStorage:', storedDocumentId);
          localStorage.removeItem('documentId');
          localStorage.removeItem('documentName');
          setNoDocument(true);
          toast.error('Invalid stored document ID. Please select a document.');
          return;
        }
        
        setDocumentId(storedDocumentId);
        if (storedDocumentName) {
          console.log('💬 [CHAT] Found document name in localStorage:', storedDocumentName);
          setDocumentName(storedDocumentName);
        }
        
        // Fetch documents to verify this document exists
        await fetchDocuments();
        
        // Check if audio transcription
        checkIfAudioTranscription(storedDocumentId);
        
        // Set no document state to false
        setNoDocument(false);
        
        return;
      }
      
      // If no document ID found anywhere, set no document state
      console.log('💬 [CHAT] No document ID found');
      setNoDocument(true);
      
      // Fetch documents for the sidebar
      await fetchDocuments();
    };
    
    getInitialDocumentId();
  }, [urlDocId, urlDocName]);
  
  // Check if the document is an audio transcription
  const checkIfAudioTranscription = async (docId: string) => {
    try {
      console.log('💬 [CHAT] Checking if document is an audio transcription:', docId);
      const supabase = createClient();
      
      // Reset audio state
      setIsAudioTranscription(false);
      setAudioUrl('');
      setIsActualAudioFile(false);
      
      // Helper function to set the audio URL
      const setAudioUrlFromSource = async (url: string, source: string) => {
        if (!url) {
          console.error('💬 [CHAT] Empty URL provided from', source);
          return false;
        }
        
        try {
          const fullAudioUrl = getFileUrl(url, (isAudio) => {
            if (isAudio) {
              console.log('💬 [CHAT] This is an actual audio file that can be played');
              setIsActualAudioFile(true);
            } else {
              setIsActualAudioFile(false);
            }
          });
          console.log(`💬 [CHAT] Setting audio URL from ${source}:`, fullAudioUrl);
          
          // Just set the URL directly
          setAudioUrl(fullAudioUrl);
          setIsAudioTranscription(true);
          
          return true;
        } catch (e) {
          console.error(`💬 [CHAT] Error setting audio URL from ${source}:`, e);
          return false;
        }
      };
      
      // Logic to detect if document name or file_url indicates audio
      const isLikelyAudioFile = (name: string) => {
        if (!name) return false;
        name = name.toLowerCase();
        return name.includes('audio') || 
               name.includes('transcription') ||
               name.endsWith('.mp3') || 
               name.endsWith('.wav') || 
               name.endsWith('.m4a') ||
               name.endsWith('.ogg') ||
               name.endsWith('.aac');
      };
      
      // First check if the ID itself might be an audio_id (direct reference)
      const { data: directAudioData, error: directAudioError } = await supabase
        .from('audio_files')
        .select('id, original_name, file_url')
        .eq('id', docId)
        .single();
      
      if (!directAudioError && directAudioData) {
        console.log('💬 [CHAT] Found direct audio file entry:', directAudioData.id);
        setIsAudioTranscription(true);
        
        // Update document name if needed
        if (directAudioData.original_name && !documentName) {
          const displayName = directAudioData.original_name.startsWith('Transcription:') 
            ? directAudioData.original_name
            : `Transcription: ${directAudioData.original_name}`;
          setDocumentName(displayName);
        }
        
        // Get the audio URL
        if (directAudioData.file_url) {
          const success = await setAudioUrlFromSource(directAudioData.file_url, 'direct audio reference');
          if (success) {
            toast.success("Audio transcription loaded successfully.");
            return;
          }
        }
        
        // If we couldn't get the URL from file_url, try direct storage access
        try {
          const fileName = directAudioData.original_name || `audio_${docId}.mp3`;
          const { data: fileData } = await supabase
            .storage
            .from('audio_files')
            .getPublicUrl(fileName);
            
          if (fileData && fileData.publicUrl) {
            console.log('💬 [CHAT] Found direct audio file in storage:', fileName);
            const success = await setAudioUrlFromSource(fileData.publicUrl, 'direct storage access');
            if (success) {
              toast.success("Audio transcription loaded successfully.");
              return;
            }
          }
        } catch (storageError) {
          console.error('💬 [CHAT] Error accessing storage directly:', storageError);
        }
      }
      
      // Check if the document has an audio_id
      const { data: docData, error: docError } = await supabase
        .from('Documents')
        .select('audio_id, original_name, file_url')
        .eq('id', docId)
        .single();
      
      if (docError) {
        console.info('💬 [CHAT] Document not found in database, will try fallback methods:', docId);
        
        // If we can't find it as a document, try to find the most recent audio file
        console.log('💬 [CHAT] Trying to find recent audio files...');
        const { data: recentAudioFiles, error: recentAudioError } = await supabase
          .from('audio_files')
          .select('id, original_name, file_url, transcription_text, created_at')
          .order('created_at', { ascending: false })
          .limit(5);
          
        if (!recentAudioError && recentAudioFiles && recentAudioFiles.length > 0) {
          // Use the most recent audio file with transcription
          const audioWithTranscription = recentAudioFiles.find(audio => 
            audio && audio.transcription_text && audio.transcription_text.length > 0
          );
          
          if (audioWithTranscription) {
            console.log('💬 [CHAT] Found recent audio file with transcription:', audioWithTranscription.id);
            setIsAudioTranscription(true);
            
            // Update document name if needed
            if (audioWithTranscription.original_name && !documentName) {
              const displayName = audioWithTranscription.original_name.startsWith('Transcription:') 
                ? audioWithTranscription.original_name
                : `Transcription: ${audioWithTranscription.original_name}`;
              setDocumentName(displayName);
            }
            
            // Get the audio URL
            if (audioWithTranscription.file_url) {
              await setAudioUrlFromSource(audioWithTranscription.file_url, 'recent audio file');
              return;
            }
          }
        }
        
        // If we still couldn't find anything, try direct storage access with the document ID
        try {
          console.log('💬 [CHAT] Trying direct storage access with document ID');
          
          // Try common audio file extensions
          const extensions = ['.mp3', '.wav', '.m4a', '.ogg', '.aac'];
          for (const ext of extensions) {
            const { data: fileData } = await supabase
              .storage
              .from('audio_files')
              .getPublicUrl(`${docId}${ext}`);
              
            if (fileData && fileData.publicUrl) {
              console.log(`💬 [CHAT] Found audio file in storage with extension ${ext}`);
              setIsAudioTranscription(true);
              await setAudioUrlFromSource(fileData.publicUrl, 'direct storage with extension');
              return;
            }
          }
        } catch (storageError) {
          console.error('💬 [CHAT] Error with direct storage access:', storageError);
        }
        
        console.log('💬 [CHAT] Could not find audio file, continuing with normal document processing');
        return;
      }
      
      // Document exists, check if it has an audio_id or name/url indicates audio
      if (docData) {
        if (docData.audio_id) {
          console.log('💬 [CHAT] Document has audio_id:', docData.audio_id);
          setIsAudioTranscription(true);
          
          // If the document name doesn't already indicate it's a transcription, update it
          if (docData.original_name && !docData.original_name.startsWith('Transcription:')) {
            setDocumentName(`Transcription: ${docData.original_name}`);
          }
          
          // Fetch the audio file URL
          const { data: audioData, error: audioError } = await supabase
            .from('audio_files')
            .select('file_url, original_name')
            .eq('id', docData.audio_id)
            .single();
          
          if (!audioError && audioData) {
            // Try file_url first
            if (audioData.file_url) {
              const success = await setAudioUrlFromSource(audioData.file_url, 'audio_id reference');
              if (success) {
                toast.success("Audio transcription loaded successfully.");
                return;
              }
            }
            
            // If file_url doesn't work, try direct storage access with the original name
            if (audioData.original_name) {
              try {
                const { data: fileData } = await supabase
                  .storage
                  .from('audio_files')
                  .getPublicUrl(audioData.original_name);
                  
                if (fileData && fileData.publicUrl) {
                  console.log('💬 [CHAT] Found audio file in storage by original name');
                  await setAudioUrlFromSource(fileData.publicUrl, 'storage by original name');
                  return;
                }
              } catch (storageError) {
                console.error('💬 [CHAT] Error accessing storage by original name:', storageError);
              }
            }
            
            // Try with the audio_id directly
            try {
              const { data: fileData } = await supabase
                .storage
                .from('audio_files')
                .getPublicUrl(docData.audio_id);
                
              if (fileData && fileData.publicUrl) {
                console.log('💬 [CHAT] Found audio file in storage by audio_id');
                await setAudioUrlFromSource(fileData.publicUrl, 'storage by audio_id');
                return;
              }
            } catch (storageError) {
              console.error('💬 [CHAT] Error accessing storage by audio_id:', storageError);
            }
          } else {
            console.log('💬 [CHAT] Failed to get audio file data:', audioError);
          }
        } 
        
        // Check if document name or file_url indicates audio
        if (docData.original_name && isLikelyAudioFile(docData.original_name)) {
          // No audio_id but name suggests it's an audio file
          console.log('💬 [CHAT] Document name indicates audio content:', docData.original_name);
          setIsAudioTranscription(true);
          
          if (docData.file_url) {
            const success = await setAudioUrlFromSource(docData.file_url, 'document file_url (name match)');
            if (success) return;
          }
          
          // Try direct storage access with the original name
          try {
            const cleanName = docData.original_name.replace(/^Transcription: /, '');
            const { data: fileData } = await supabase
              .storage
              .from('audio_files')
              .getPublicUrl(cleanName);
              
            if (fileData && fileData.publicUrl) {
              console.log('💬 [CHAT] Found audio file in storage by document name');
              await setAudioUrlFromSource(fileData.publicUrl, 'storage by document name');
              return;
            }
          } catch (storageError) {
            console.error('💬 [CHAT] Error accessing storage by document name:', storageError);
          }
        } else if (docData.file_url && isLikelyAudioFile(docData.file_url)) {
          // File URL suggests it's an audio file
          console.log('💬 [CHAT] Document file_url indicates audio content:', docData.file_url);
          setIsAudioTranscription(true);
          
          const success = await setAudioUrlFromSource(docData.file_url, 'document file_url (URL match)');
          if (success) return;
        }
        
        // Last resort: try direct lookup of the audio file in the storage bucket
        try {
          console.log('💬 [CHAT] Trying direct storage lookup for audio file');
          
          // Try to get a list of audio files from storage with the same name pattern
          const docName = docData.original_name?.replace(/^Transcription: /, '').replace(/\.[^/.]+$/, '') || docId;
          
          // Look up possible audio file names
          const possibleAudioFiles = [
            `${docName}.mp3`,
            `${docName}.wav`,
            `${docName}.m4a`,
            `audio/${docName}.mp3`,
            `audio/${docName}.wav`, 
            `audio/${docName}.m4a`,
            `${docId}.mp3`,
            `${docId}.wav`,
            `${docId}.m4a`
          ];
          
          for (const fileName of possibleAudioFiles) {
            try {
              const { data: fileData } = await supabase
                .storage
                .from('audio_files')
                .getPublicUrl(fileName);
                
              if (fileData && fileData.publicUrl) {
                console.log('💬 [CHAT] Found direct audio file match in storage:', fileName);
                setIsAudioTranscription(true);
                await setAudioUrlFromSource(fileData.publicUrl, 'direct storage lookup');
                return;
              }
            } catch (fileError) {
              console.error(`💬 [CHAT] Error getting public URL for ${fileName}:`, fileError);
            }
          }
          
          // If we still haven't found anything, try listing files in the audio_files bucket
          console.log('💬 [CHAT] Trying to list files in audio_files bucket');
          const { data: fileList, error: listError } = await supabase
            .storage
            .from('audio_files')
            .list();
            
          if (!listError && fileList && fileList.length > 0) {
            console.log('💬 [CHAT] Found files in audio_files bucket:', fileList.map(f => f.name));
            
            // Look for files that match our document name or ID
            const matchingFile = fileList.find(file => 
              file.name.includes(docId) || 
              (docData.original_name && file.name.includes(docData.original_name.replace(/^Transcription: /, '')))
            );
            
            if (matchingFile) {
              console.log('💬 [CHAT] Found matching file in bucket:', matchingFile.name);
              const { data: fileData } = await supabase
                .storage
                .from('audio_files')
                .getPublicUrl(matchingFile.name);
                
              if (fileData && fileData.publicUrl) {
                setIsAudioTranscription(true);
                await setAudioUrlFromSource(fileData.publicUrl, 'bucket file list match');
                return;
              }
            } else {
              // If no match, just use the most recent audio file
              const mostRecentFile = fileList[0];
              console.log('💬 [CHAT] Using most recent file in bucket:', mostRecentFile.name);
              const { data: fileData } = await supabase
                .storage
                .from('audio_files')
                .getPublicUrl(mostRecentFile.name);
                
              if (fileData && fileData.publicUrl) {
                setIsAudioTranscription(true);
                await setAudioUrlFromSource(fileData.publicUrl, 'most recent bucket file');
                return;
              }
            }
          }
        } catch (storageError) {
          console.error('💬 [CHAT] Error during direct storage lookup:', storageError);
        }
      }
    } catch (error) {
      console.error('💬 [CHAT] Error checking for audio transcription:', error);
    }
  };
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);
  
  // Handle sending initial summary request
  const handleSendInitialSummary = useCallback(async (docId: string) => {
    try {
      setIsLoading(true);
      setBotTyping(true);
      
      // Add a message indicating we're generating a summary
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: `<div class="text-black">
            <p>Generating summary... Please wait a moment.</p>
          </div>`,
          waitingForRetry: true
        }
      ]);
      
      // Implement multiple retries with exponential backoff for 404 errors
      // This is particularly important for audio files which might need time to process
      const maxRetries = 6;
      let currentRetry = 0;
      let backoffTime = 2000; // Start with 2 seconds
      const maxBackoffTime = 10000; // Cap at 10 seconds
      
      console.log('💬 [CHAT] Fetching initial summary for document:', docId);
      
      let lastError = null;
      let response = null;
      
      // Check if this is an audio file by the document name (if available)
      const isLikelyAudioFile = documentName && (
        documentName.toLowerCase().includes('audio') ||
        documentName.toLowerCase().includes('transcription') ||
        documentName.toLowerCase().endsWith('.mp3') ||
        documentName.toLowerCase().endsWith('.wav') ||
        documentName.toLowerCase().endsWith('.m4a')
      );
      
      // Try to fetch the summary with retries
      while (currentRetry <= maxRetries) {
        try {
          if (currentRetry > 0) {
            // Update the waiting message to show progress
            setMessages(prev => [
              ...prev.filter(m => !m.waitingForRetry),
              {
                role: 'assistant', 
                content: `<div class="text-black">
                  <p>Still processing${isLikelyAudioFile ? ' your audio file' : ''}... (Attempt ${currentRetry}/${maxRetries})</p>
                  <p class="text-xs text-gray-500 mt-1">This may take a minute or two.</p>
                </div>`, 
                waitingForRetry: true
              }
            ]);
            
            console.log(`💬 [CHAT] Retry attempt ${currentRetry}/${maxRetries} after ${backoffTime}ms`);
            await new Promise(resolve => setTimeout(resolve, backoffTime));
            
            // Increase backoff time for next retry (exponential backoff)
            backoffTime = Math.min(backoffTime * 1.5, maxBackoffTime);
          }
          
          const timestamp = Date.now(); // Add timestamp to prevent caching
          
          // Construct a clear and direct request for summarization
          let summaryRequest = isLikelyAudioFile
            ? "Please provide a summary of this audio transcription. Use proper headings (h3 tags for main sections), paragraphs, and bullet points where appropriate. Make headings bold and larger than regular text. Focus on the main topics discussed and key points made."
            : "Please summarize this document with clear structure and formatting. Use proper headings (h3 tags for main sections), paragraphs, and bullet points where appropriate. Make headings bold and larger than regular text. Highlight key points and ensure proper indentation for readability.";
          
          // Use a direct GET request with properly encoded parameters
          response = await fetch(`/api/document-chat?documentId=${encodeURIComponent(docId)}&message=${encodeURIComponent(summaryRequest)}&timestamp=${timestamp}`);
          
          if (response.ok) {
            // Success! Break out of the retry loop
            console.log('💬 [CHAT] Successfully fetched document summary');
            break;
          }
          
          // If we get a 404, it might be because the document is still processing
          if (response.status === 404) {
            console.log('💬 [CHAT] Document not found (404), might still be processing');
            lastError = new Error(`Document not found (attempt ${currentRetry + 1}/${maxRetries})`);
            currentRetry++;
            continue; // Try again
          }
          
          // For other errors, don't retry
          console.error('💬 [CHAT] Error fetching summary, not retrying:', response.status);
          lastError = new Error(`Failed to fetch summary: ${response.status}`);
          break;
        } catch (error) {
          console.error('💬 [CHAT] Network error fetching summary:', error);
          lastError = error;
          currentRetry++;
        }
      }
      
      // Remove any "still processing" messages
      setMessages(prev => prev.filter(m => !m.waitingForRetry));
      
      // If we exhausted all retries or had an error, show error message
      if (!response || !response.ok) {
        console.error('💬 [CHAT] All retries failed or error occurred:', lastError);
        
        let errorMessage = isLikelyAudioFile 
          ? "I couldn't generate a summary for your audio file. The transcription process may still be in progress or encountered an error."
          : "Failed to generate a summary. The document may still be processing or there was an error.";
        
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `<div class="text-black bg-red-50 p-4 rounded-md border border-red-200">
              <h3 class="text-lg font-medium text-red-700 mb-2">Summary Error</h3>
              <p>${errorMessage}</p>
              <p class="mt-2 text-sm">You can try:</p>
              <ul class="list-disc ml-5 text-sm">
                <li>Refreshing the page in a minute or two</li>
                <li>Asking a specific question about the content instead</li>
              </ul>
            </div>`,
          },
        ]);
        
        setIsLoading(false);
        setBotTyping(false);
        return;
      }
      
      // Process successful response
      try {
        const data = await response.json();
        console.log('💬 [CHAT] Document summary response:', data);
        
        // Handle different response statuses
        if (data.status === 'processing') {
          // The document is still processing (especially for audio files)
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `<div class="text-black bg-blue-50 p-4 rounded-md border border-blue-200">
                <h3 class="text-lg font-medium text-blue-700 mb-2">Processing Your ${isLikelyAudioFile ? 'Audio' : 'Document'}</h3>
                <p>${data.response || `Your ${isLikelyAudioFile ? 'audio file' : 'document'} is still being processed. This typically takes a minute or two.`}</p>
                <p class="mt-2 text-sm">Please check back shortly.</p>
              </div>`,
            },
          ]);
        } else if (data.status === 'failed') {
          // The processing failed for some reason
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `<div class="text-black bg-red-50 p-4 rounded-md border border-red-200">
                <h3 class="text-lg font-medium text-red-700 mb-2">Processing Error</h3>
                <p>${data.response || 'There was an error processing your document.'}</p>
              </div>`,
            },
          ]);
        } else {
          // Successful response - add the formatted summary
          setMessages(prev => [
            ...prev,
            {
              role: 'assistant',
              content: `<div class="text-black">${data.response || 'I analyzed your document but could not generate a summary.'}</div>`,
            },
          ]);
        }
      } catch (parseError) {
        console.error('💬 [CHAT] Error parsing JSON response:', parseError);
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: `<div class="text-black bg-red-50 p-4 rounded-md border border-red-200">
              <h3 class="text-lg font-medium text-red-700 mb-2">Response Error</h3>
              <p>I received a response but couldn't process it properly. Please try asking a specific question.</p>
            </div>`,
          },
        ]);
      }
    } catch (error) {
      console.error('💬 [CHAT] Error in handleSendInitialSummary:', error);
      
      setMessages(prev => [
        ...prev.filter(m => !m.waitingForRetry),
        {
          role: 'assistant',
          content: `<div class="text-black bg-red-50 p-4 rounded-md border border-red-200">
            <h3 class="text-lg font-medium text-red-700 mb-2">Unexpected Error</h3>
            <p>Something went wrong while trying to generate the summary. You can try asking a specific question instead.</p>
          </div>`,
        },
      ]);
    } finally {
      setIsLoading(false);
      setBotTyping(false);
    }
  }, [documentName, setMessages]);
  
  // Update the useEffect for loading initial summary with modal support
  useEffect(() => {
    if (documentId && !messages.length) {
      console.log('💬 [CHAT] Fetching initial summary for document:', documentId);
      
      setIsLoading(true);
      setSummaryLoaded(false);
      setSummaryError(false);
      
      // Add a timestamp to prevent caching
      const timestamp = Date.now();
      
      // Use POST instead of GET since that's what's working in the other components
      fetch('/api/document-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          documentId,
          message: 'Please summarize this document with clear structure and formatting. Use proper headings (h3 tags for main sections), paragraphs, and bullet points where appropriate. Make headings bold and larger than regular text. Highlight key points and ensure proper indentation for readability.',
          type: 'summary'
        }),
      })
        .then(response => {
          console.log('💬 [CHAT] Summary response status:', response.status);
          if (!response.ok) {
            throw new Error(`Network response was not ok: ${response.status}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('💬 [CHAT] Summary response data:', {
            status: data.status,
            hasError: !!data.error,
            responseLength: data.response ? data.response.length : 0,
            hasSuggestedDocs: data.suggestedDocuments && data.suggestedDocuments.length > 0
          });
          
          // Check if the response is an error or failed status
          if (data.status === 'failed' || data.error) {
            console.error('💬 [CHAT] API returned error status:', data);
            
            // If we have suggested documents, store them for the modal
            if (data.suggestedDocuments && data.suggestedDocuments.length > 0) {
              console.log('💬 [CHAT] Found suggested documents:', data.suggestedDocuments);
              setSuggestedDocuments(data.suggestedDocuments);
              setShowErrorModal(true);
            }
            
            throw new Error(data.error || 'Failed to generate summary');
          }
          
          // Process the response to ensure proper styling
          let processedSummary = data.response || '';
          
          // Ensure headings are properly styled
          processedSummary = processedSummary.replace(/<h1/g, '<h1 class="text-2xl font-bold mt-6 mb-4 text-white"');
          processedSummary = processedSummary.replace(/<h2/g, '<h2 class="text-xl font-bold mt-5 mb-3 text-white"');
          processedSummary = processedSummary.replace(/<h3/g, '<h3 class="text-lg font-bold mt-4 mb-2 text-white"');
          processedSummary = processedSummary.replace(/<h4/g, '<h4 class="text-base font-bold mt-3 mb-2 text-white"');
          
          // Ensure paragraphs are properly styled
          processedSummary = processedSummary.replace(/<p/g, '<p class="my-2 text-white"');
          
          // Ensure lists are properly styled
          processedSummary = processedSummary.replace(/<ul/g, '<ul class="list-disc pl-6 my-3 text-white"');
          processedSummary = processedSummary.replace(/<ol/g, '<ol class="list-decimal pl-6 my-3 text-white"');
          processedSummary = processedSummary.replace(/<li/g, '<li class="ml-2 mb-1 text-white"');
          
          // Store the processed summary
          console.log('💬 [CHAT] Setting summary with length:', processedSummary.length);
          setSummary(processedSummary);
          setSummaryLoaded(true);
          
          // Also add it to messages as we did before
          setMessages([
            { role: 'assistant', content: processedSummary || 'No summary available.' }
          ]);
        })
        .catch(error => {
          console.error('💬 [CHAT] Error fetching summary:', error);
          setSummaryError(true);
          
          const errorMessage = `
            <div class="text-black bg-red-50 p-4 rounded-md border border-red-200">
              <h3 class="text-lg font-medium text-red-700 mb-2">Summary Error</h3>
              <p>Failed to generate a summary. The document may still be processing or there was an error.</p>
              <p class="mt-2 text-sm">You can try:</p>
              <ul class="list-disc ml-5 text-sm">
                <li>Refreshing the page in a minute or two</li>
                <li>Asking a specific question about the content instead</li>
              </ul>
            </div>
          `;
          
          setSummary(errorMessage);
          
          // Set only one copy of the error message
          setMessages([
            { role: 'assistant', content: errorMessage }
          ]);
        })
        .finally(() => {
          setIsLoading(false);
          console.log('💬 [CHAT] Summary fetch completed, isLoading set to false');
        });
    }
  }, [documentId]);
  
  // Add handler for selecting a document from the modal
  const handleSelectFromModal = (docId: string, docName: string) => {
    setShowErrorModal(false);
    setDocumentId(docId);
    setDocumentName(docName);
    localStorage.setItem('documentId', docId);
    localStorage.setItem('documentName', docName);
    
    // Reset messages and states
    setMessages([]);
    setSummary('');
    setSummaryLoaded(false);
    setSummaryError(false);
    
    // Check if audio transcription
    checkIfAudioTranscription(docId);
    
    // Reset no document state
    setNoDocument(false);
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
        // Process the response to ensure proper styling
        let processedResponse = data.response;
        
        // Ensure headings are properly styled
        processedResponse = processedResponse.replace(/<h1/g, '<h1 class="text-2xl font-bold mt-6 mb-4 text-white"');
        processedResponse = processedResponse.replace(/<h2/g, '<h2 class="text-xl font-bold mt-5 mb-3 text-white"');
        processedResponse = processedResponse.replace(/<h3/g, '<h3 class="text-lg font-bold mt-4 mb-2 text-white"');
        processedResponse = processedResponse.replace(/<h4/g, '<h4 class="text-base font-bold mt-3 mb-2 text-white"');
        
        // Ensure paragraphs are properly styled
        processedResponse = processedResponse.replace(/<p/g, '<p class="my-2 text-white"');
        
        // Ensure lists are properly styled
        processedResponse = processedResponse.replace(/<ul/g, '<ul class="list-disc pl-6 my-3 text-white"');
        processedResponse = processedResponse.replace(/<ol/g, '<ol class="list-decimal pl-6 my-3 text-white"');
        processedResponse = processedResponse.replace(/<li/g, '<li class="ml-2 mb-1 text-white"');
        
        // Add assistant response to chat with proper formatting
        const assistantMessage: Message = { 
          role: 'assistant', 
          content: `<div class="text-black">${processedResponse}</div>`
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
  
  // Render the component
  return (
    <>
      <div className="flex flex-col min-h-screen">
        <div className="flex flex-1 overflow-hidden">
          {/* Left sidebar with document context */}
          <div className="hidden md:flex flex-col w-64 p-4 border-r overflow-y-auto space-y-4">
            <div className="font-semibold text-lg flex justify-between items-center">
              <span>Document Context</span>
              <Link href="/dashboard">
                <Button variant="ghost" size="sm">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                  Back
                </Button>
              </Link>
            </div>
            
            {documentName && (
              <div className="text-sm">
                <span className="font-medium">Current document:</span>
                <p className="mt-1 truncate">{documentName}</p>
              </div>
            )}
            
            {/* Audio player removed completely */}
            
            {/* Recent documents section */}
            <div className="mt-4">
              <h3 className="text-sm font-medium mb-2">Recent Documents</h3>
              {loadingDocuments ? (
                <p className="text-sm text-gray-500">Loading...</p>
              ) : documents.length > 0 ? (
                <ul className="space-y-1">
                  {documents.map((doc) => (
                    <li key={doc.id}>
                      <button
                        onClick={() => handleSelectDocument(doc)}
                        className={`text-sm text-left w-full px-2 py-1 rounded truncate hover:bg-gray-100 dark:hover:bg-gray-800 ${
                          documentId === doc.id ? 'bg-gray-100 dark:bg-gray-800 font-medium' : ''
                        }`}
                        title={doc.name}
                      >
                        {doc.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-gray-500">No recent documents</p>
              )}
            </div>
          </div>
          
          {/* Main chat area */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Main content area */}
            <div className="flex-1 overflow-y-auto p-4">
              {/* Welcome message or no document selected message */}
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center px-4">
                  {noDocument ? (
                    <>
                      <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 rounded-lg">
                        <p>No document selected. Please select a document to chat with or upload a new one.</p>
                      </div>
                      <Link href="/dashboard">
                        <Button className="mt-2">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                          </svg>
                          Upload or Select Document
                        </Button>
                      </Link>
                    </>
                  ) : (
                    <>
                      <h2 className="text-xl font-bold mb-2">Welcome to Document Chat</h2>
                      <p className="text-gray-600 dark:text-gray-400 mb-4">Loading your document...</p>
                    </>
                  )}
                </div>
              )}
              
              {/* Display tabbed interface when we have messages */}
              {messages.length > 0 && (
                <div className="space-y-4">
                  {/* Display tabbed interface with summary, notes, and quizzes */}
                  <DocumentTabContent
                    documentId={documentId}
                    documentName={documentName}
                    isLoading={isLoading}
                    summaryContent={
                      <div className="p-4 prose max-w-none">
                        <h2 className="text-xl font-bold mb-4 text-white">AI Summary for {documentName}</h2>
                        {summaryError ? (
                          <div className="bg-red-50 border border-red-200 text-red-700 p-4 rounded-md">
                            <h3 className="text-lg font-medium mb-2">Summary Error</h3>
                            <p>Failed to generate a summary. The document may still be processing or there was an error.</p>
                            <p className="mt-2 text-sm">You can try:</p>
                            <ul className="list-disc ml-5 text-sm">
                              <li>Refreshing the page in a minute or two</li>
                              <li>Asking a specific question about the content instead</li>
                            </ul>
                          </div>
                        ) : isLoading ? (
                          <div className="animate-pulse space-y-2">
                            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                            <div className="h-4 bg-gray-200 rounded"></div>
                            <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                          </div>
                        ) : (
                          <div 
                            className="whitespace-pre-line text-base leading-relaxed text-white prose-headings:text-white prose-p:text-white prose-li:text-white prose-strong:text-white"
                            dangerouslySetInnerHTML={{ 
                              __html: summary || 
                                (messages[0]?.content?.includes('<div') ? 
                                  messages[0]?.content : 
                                  `<p class="text-white">${messages[0]?.content || 'No summary available.'}</p>`) 
                            }}
                          />
                        )}
                      </div>
                    }
                  />
                  
                  {/* Display conversation after the first message, but only if there are actual conversation messages */}
                  {messages.length > 1 && (
                    <div className="mt-8 border-t pt-6">
                      <h3 className="text-lg font-medium mb-4">Conversation</h3>
                      {messages.slice(1).map((message, i) => (
                        <div
                          key={i}
                          className={`flex mb-4 ${
                            message.role === 'user' ? 'justify-end' : 'justify-start'
                          }`}
                        >
                          <div
                            className={`max-w-[80%] rounded-lg px-4 py-2 ${
                              message.role === 'user'
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted'
                            }`}
                          >
                            <div 
                              className="whitespace-pre-line"
                              dangerouslySetInnerHTML={{ __html: message.content }}
                            />
                            {message.waitingForRetry && (
                              <div className="text-xs opacity-70 mt-1">
                                <span className="animate-pulse">●</span> Retrying...
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>
              )}
            </div>
            
            {/* Input area */}
            <div className="border-t p-4">
              <form onSubmit={handleSendMessage} className="flex space-x-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your document..."
                  className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isLoading || !documentId}
                />
                <Button type="submit" disabled={isLoading || !input.trim() || !documentId}>
                  {isLoading ? (
                    <span className="flex items-center">
                      <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Processing
                    </span>
                  ) : (
                    <span className="flex items-center">
                      Send
                      <svg className="ml-1 h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                      </svg>
                    </span>
                  )}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
      
      {/* Document error modal */}
      {showErrorModal && (
        <DocumentErrorModal
          documentId={documentId}
          documentName={documentName}
          suggestedDocuments={suggestedDocuments}
          onClose={() => setShowErrorModal(false)}
          onSelectDocument={handleSelectFromModal}
        />
      )}
    </>
  );
} 