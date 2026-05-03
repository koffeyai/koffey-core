/**
 * Chat with Suggestions - Combines enhanced chat with smart suggestions
 */

import React, { useState } from 'react';
import UnifiedChatInterface from './UnifiedChatInterface';
import { SmartSuggestions } from './SmartSuggestions';
import { useChat } from '@/hooks/useChat';

interface Suggestion {
  id: string;
  type: 'action' | 'question' | 'insight' | 'followup';
  text: string;
  description?: string;
  confidence: number;
  icon?: React.ReactNode;
  category: string;
}

interface ChatWithSuggestionsProps {
  className?: string;
  showSuggestions?: boolean;
}

export const ChatWithSuggestions: React.FC<ChatWithSuggestionsProps> = ({
  className,
  showSuggestions = true
}) => {
  const { currentSession } = useChat();
  const [pendingSuggestion, setPendingSuggestion] = useState<string>('');

  const handleSuggestionClick = (suggestion: Suggestion) => {
    setPendingSuggestion(suggestion.text);
  };

  return (
    <div className={`flex gap-6 h-full ${className || ''}`}>
      {/* Main Chat Interface */}
      <div className="flex-1 min-w-0">
        <UnifiedChatInterface />
      </div>

      {/* Smart Suggestions Sidebar */}
      {showSuggestions && (
        <div className="w-80 flex-shrink-0">
          <SmartSuggestions
            sessionId={currentSession?.id}
            onSuggestionClick={handleSuggestionClick}
            className="sticky top-4"
        />
        </div>
      )}
    </div>
  );
};