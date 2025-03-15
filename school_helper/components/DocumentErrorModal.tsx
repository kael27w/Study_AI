'use client';

import { useState } from 'react';

interface DocumentErrorModalProps {
  documentId?: string;
  documentName?: string;
  suggestedDocuments: any[];
  onClose: () => void;
  onSelectDocument: (docId: string, docName: string) => void;
}

export function DocumentErrorModal({
  documentId,
  documentName,
  suggestedDocuments,
  onClose,
  onSelectDocument
}: DocumentErrorModalProps) {
  const [showDetails, setShowDetails] = useState(false);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg max-w-lg w-full p-6">
        <h2 className="text-xl font-semibold mb-4">Document Error</h2>
        <p className="text-red-600 dark:text-red-400 mb-4">
          There was an error loading the document{documentName ? `: ${documentName}` : ''}
        </p>
        
        <button 
          onClick={() => setShowDetails(!showDetails)}
          className="text-sm text-gray-500 hover:text-gray-700 mb-4"
        >
          {showDetails ? 'Hide' : 'Show'} technical details
        </button>
        
        {showDetails && (
          <div className="bg-gray-100 dark:bg-gray-700 p-3 rounded text-xs font-mono mb-4 overflow-auto">
            <p>Document ID: {documentId || 'Not available'}</p>
            <p>Document Name: {documentName || 'Not available'}</p>
          </div>
        )}
        
        {suggestedDocuments.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium mb-2">Suggested Documents:</h3>
            <ul className="space-y-2">
              {suggestedDocuments.map((doc) => (
                <li key={doc.id}>
                  <button
                    onClick={() => onSelectDocument(doc.id, doc.original_name)}
                    className="text-blue-600 dark:text-blue-400 hover:underline text-left"
                  >
                    {doc.original_name}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        
        <div className="mt-6 flex justify-end gap-4">
          <button
            onClick={() => window.location.href = '/dashboard'}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
          >
            Go to Dashboard
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 dark:bg-gray-700 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}