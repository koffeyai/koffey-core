import { useEffect, useCallback } from 'react';
import { useUnifiedChatStore } from '@/stores/unifiedChatStore';
import { toast } from '@/hooks/use-toast';

export const useMessageRecovery = () => {
  const { 
    getPendingMessages, 
    updateMessageStatus, 
    saveMessage, 
    retryMessage,
    cleanup,
    setPendingMessage 
  } = useUnifiedChatStore();

  /**
   * Check for and recover pending messages on mount
   */
  useEffect(() => {
    const pendingMessages = getPendingMessages();
    
    if (pendingMessages.length > 0) {
      const mostRecent = pendingMessages[pendingMessages.length - 1];
      
      // Show recovery notification
      toast({
        title: 'Recovered pending message',
        description: `"${mostRecent.content.substring(0, 50)}${mostRecent.content.length > 50 ? '...' : ''}"`
      });
    }
    
    // Cleanup old messages
    cleanup();
  }, [getPendingMessages, cleanup]);
  
  /**
   * Recover a specific message
   */
  const recoverMessage = useCallback((messageId: string) => {
    const message = getPendingMessages().find(msg => msg.id === messageId);
    
    if (message) {
      // Update status
      updateMessageStatus(messageId, 'processing');
      
      // Set in navigation store
      setPendingMessage(
        message.content,
        { ...message.context, recovered: true },
        true
      );
      
      // Mark as completed
      updateMessageStatus(messageId, 'completed');
    }
  }, [getPendingMessages, updateMessageStatus, setPendingMessage]);
  
  /**
   * Save a message before navigation
   */
  const saveBeforeNavigate = useCallback((content: string, context?: Record<string, unknown>): string => {
    return saveMessage(content, context);
  }, [saveMessage]);
  
  return {
    recoverMessage,
    saveBeforeNavigate,
    getPendingMessages
  };
};