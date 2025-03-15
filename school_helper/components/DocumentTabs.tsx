'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

type Tab = 'summary' | 'notes' | 'quizzes';

interface DocumentTabsProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

export function DocumentTabs({ activeTab, onTabChange }: DocumentTabsProps) {
  const tabs = [
    { id: 'summary' as Tab, label: 'AI Summary' },
    { id: 'notes' as Tab, label: 'AI Notes' },
    { id: 'quizzes' as Tab, label: 'AI Quizzes' },
  ];

  return (
    <div className="border-b mb-4">
      <div className="flex space-x-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-t-lg transition-colors',
              activeTab === tab.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary hover:bg-secondary/80 text-secondary-foreground'
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
} 