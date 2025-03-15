'use client';

import { useState } from 'react';
import { DocumentTabs } from './DocumentTabs';
import { AINotes } from './AINotes';
import { AIQuizzes } from './AIQuizzes';

type Tab = 'summary' | 'notes' | 'quizzes';

interface DocumentTabContentProps {
  documentId: string;
  documentName: string;
  summaryContent: React.ReactNode;
  isLoading?: boolean;
}

export function DocumentTabContent({ 
  documentId, 
  documentName, 
  summaryContent,
  isLoading = false
}: DocumentTabContentProps) {
  const [activeTab, setActiveTab] = useState<Tab>('summary');

  return (
    <div className="w-full">
      <DocumentTabs activeTab={activeTab} onTabChange={setActiveTab} />
      
      <div className="tab-content mt-4">
        {isLoading ? (
          <div className="p-4 text-gray-500">
            <div className="animate-pulse flex space-x-4">
              <div className="flex-1 space-y-4 py-1">
                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                <div className="space-y-2">
                  <div className="h-4 bg-gray-200 rounded"></div>
                  <div className="h-4 bg-gray-200 rounded w-5/6"></div>
                </div>
              </div>
            </div>
            <p className="mt-4 text-center">Loading document content...</p>
          </div>
        ) : (
          <>
            {activeTab === 'summary' && summaryContent}
            {activeTab === 'notes' && (
              <AINotes documentId={documentId} documentName={documentName} />
            )}
            {activeTab === 'quizzes' && (
              <AIQuizzes documentId={documentId} documentName={documentName} />
            )}
          </>
        )}
      </div>
    </div>
  );
} 