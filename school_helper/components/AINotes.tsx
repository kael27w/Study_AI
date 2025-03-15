'use client';

import { useState, useEffect } from 'react';
import { Skeleton } from './ui/skeleton';

interface AINotesProps {
  documentId: string;
  documentName: string;
}

export function AINotes({ documentId, documentName }: AINotesProps) {
  const [notes, setNotes] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!documentId) {
      setIsLoading(false);
      setError('No document selected');
      return;
    }

    const fetchNotes = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        console.log('🔍 [AI NOTES] Fetching notes for document:', documentId);
        
        const response = await fetch('/api/document-chat', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            documentId,
            message: 'Generate detailed notes for this document. Identify and explain the main topics, key concepts, and important details. Format with clear headings (use h3 tags for main topics), proper indentation, and bullet points organized by topic. Make headings bold and larger than regular text. Use proper HTML formatting for readability.',
            context: documentName,
            type: 'notes'
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          console.error('🔍 [AI NOTES] API error response:', data);
          throw new Error(data.error || `Failed to fetch notes (Status ${response.status})`);
        }

        console.log('🔍 [AI NOTES] Notes fetched successfully');
        
        if (data.status === 'failed' || data.error) {
          console.error('🔍 [AI NOTES] API returned error status:', data);
          throw new Error(data.error || 'Failed to generate notes');
        }
        
        if (!data.response || data.response.trim() === '') {
          throw new Error('No notes content received from API');
        }
        
        // Process the response to ensure proper styling
        let processedNotes = data.response;
        
        // Ensure headings are properly styled
        processedNotes = processedNotes.replace(/<h1/g, '<h1 class="text-2xl font-bold mt-6 mb-4 text-white"');
        processedNotes = processedNotes.replace(/<h2/g, '<h2 class="text-xl font-bold mt-5 mb-3 text-white"');
        processedNotes = processedNotes.replace(/<h3/g, '<h3 class="text-lg font-bold mt-4 mb-2 text-white"');
        processedNotes = processedNotes.replace(/<h4/g, '<h4 class="text-base font-bold mt-3 mb-2 text-white"');
        
        // Ensure paragraphs are properly styled
        processedNotes = processedNotes.replace(/<p/g, '<p class="my-2 text-white"');
        
        // Ensure lists are properly styled
        processedNotes = processedNotes.replace(/<ul/g, '<ul class="list-disc pl-6 my-3 text-white"');
        processedNotes = processedNotes.replace(/<ol/g, '<ol class="list-decimal pl-6 my-3 text-white"');
        processedNotes = processedNotes.replace(/<li/g, '<li class="ml-2 mb-1 text-white"');
        
        setNotes(processedNotes);
      } catch (err) {
        console.error('🔍 [AI NOTES] Error fetching notes:', err);
        setError(err instanceof Error ? err.message : 'Failed to load notes. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchNotes();
  }, [documentId, documentName]);

  if (isLoading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-5/6" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-md">
        <h3 className="text-lg font-medium text-red-700 mb-2">Error Loading Notes</h3>
        <p className="text-red-600">{error}</p>
        <p className="mt-2 text-sm text-red-500">
          Try refreshing the page or selecting a different document.
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 prose max-w-none">
      <h2 className="text-xl font-bold mb-4 text-white">AI Notes for {documentName}</h2>
      <div 
        className="whitespace-pre-line text-base leading-relaxed text-white"
        dangerouslySetInnerHTML={{ __html: notes }}
      />
    </div>
  );
} 