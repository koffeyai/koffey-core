/**
 * Conversation Memory Hook - Manages context and memory across chat sessions
 */

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from './useOrganizationAccess';

export interface ConversationContext {
  entityMentions: Array<{
    entityType: string;
    entityId: string;
    entityName: string;
    relevance: number;
  }>;
  topicFlow: string[];
  userIntent: string;
  conversationStage: 'greeting' | 'discovery' | 'action' | 'followup';
  lastUpdate: string;
}

export interface MemoryFragment {
  id: string;
  sessionId: string;
  content: string;
  contextType: string;
  relevanceScore: number;
  timestamp: string;
  metadata?: any;
}

export const useConversationMemory = (sessionId?: string) => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  
  const [context, setContext] = useState<ConversationContext>({
    entityMentions: [],
    topicFlow: [],
    userIntent: 'general',
    conversationStage: 'greeting',
    lastUpdate: new Date().toISOString()
  });
  
  const [memoryFragments, setMemoryFragments] = useState<MemoryFragment[]>([]);
  const [loading, setLoading] = useState(false);

  // Load conversation memory when session changes
  useEffect(() => {
    if (sessionId) {
      loadConversationMemory(sessionId);
    } else {
      resetContext();
    }
  }, [sessionId]);

  const loadConversationMemory = async (currentSessionId: string) => {
    setLoading(true);
    try {
      const { data: memories, error } = await supabase
        .from('chat_context_memory')
        .select('*')
        .eq('session_id', currentSessionId)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.error('Error loading conversation memory:', error);
        return;
      }

      if (memories && memories.length > 0) {
        // Convert database records to memory fragments
        const fragments: MemoryFragment[] = memories.map(mem => ({
          id: mem.id,
          sessionId: mem.session_id || '',
          content: typeof mem.context_data === 'string' 
            ? mem.context_data 
            : JSON.stringify(mem.context_data),
          contextType: mem.context_type,
          relevanceScore: mem.relevance_score || 1.0,
          timestamp: mem.created_at,
          metadata: mem.context_data
        }));

        setMemoryFragments(fragments);

        // Rebuild context from memory fragments
        rebuildContextFromMemory(fragments);
      }
    } catch (error) {
      console.error('Failed to load conversation memory:', error);
    } finally {
      setLoading(false);
    }
  };

  const rebuildContextFromMemory = (fragments: MemoryFragment[]) => {
    const entityMentions: ConversationContext['entityMentions'] = [];
    const topicFlow: string[] = [];
    let latestIntent = 'general';
    let conversationStage: ConversationContext['conversationStage'] = 'greeting';

    fragments.forEach(fragment => {
      // Extract entity mentions
      if (fragment.contextType === 'entity_mention' && fragment.metadata) {
        entityMentions.push({
          entityType: fragment.metadata.entityType || 'unknown',
          entityId: fragment.metadata.entityId || '',
          entityName: fragment.metadata.entityName || '',
          relevance: fragment.relevanceScore
        });
      }

      // Track topic flow
      if (fragment.contextType === 'topic' && fragment.metadata?.topic) {
        topicFlow.push(fragment.metadata.topic);
      }

      // Get latest intent
      if (fragment.contextType === 'intent' && fragment.metadata?.intent) {
        latestIntent = fragment.metadata.intent;
      }

      // Determine conversation stage
      if (fragment.contextType === 'stage' && fragment.metadata?.stage) {
        conversationStage = fragment.metadata.stage;
      }
    });

    setContext({
      entityMentions: entityMentions.slice(0, 20), // Keep most relevant
      topicFlow: topicFlow.slice(-10), // Keep recent topics
      userIntent: latestIntent,
      conversationStage,
      lastUpdate: new Date().toISOString()
    });
  };

  const storeMemoryFragment = useCallback(async (
    type: string,
    content: string,
    metadata: any = {},
    relevance: number = 1.0
  ) => {
    if (!sessionId || !user?.id || !currentOrganization?.organization_id) return;

    try {
      const { error } = await supabase
        .from('chat_context_memory')
        .insert({
          session_id: sessionId,
          user_id: user.id,
          organization_id: currentOrganization.organization_id,
          context_type: type,
          context_data: {
            content,
            ...metadata
          },
          relevance_score: relevance,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // 24 hours
        });

      if (error) {
        console.error('Error storing memory fragment:', error);
      }
    } catch (error) {
      console.error('Failed to store memory fragment:', error);
    }
  }, [sessionId, user, currentOrganization]);

  const updateContext = useCallback((updates: Partial<ConversationContext>) => {
    setContext(prev => ({
      ...prev,
      ...updates,
      lastUpdate: new Date().toISOString()
    }));
  }, []);

  const addEntityMention = useCallback((
    entityType: string,
    entityId: string,
    entityName: string,
    relevance: number = 1.0
  ) => {
    // Check if entity already mentioned
    const existingIndex = context.entityMentions.findIndex(
      mention => mention.entityId === entityId
    );

    if (existingIndex >= 0) {
      // Update existing mention relevance
      const updated = [...context.entityMentions];
      updated[existingIndex].relevance = Math.max(updated[existingIndex].relevance, relevance);
      updateContext({ entityMentions: updated });
    } else {
      // Add new entity mention
      const newMention = { entityType, entityId, entityName, relevance };
      updateContext({
        entityMentions: [...context.entityMentions, newMention].slice(-20)
      });
    }

    // Store in memory
    storeMemoryFragment('entity_mention', entityName, {
      entityType,
      entityId,
      entityName
    }, relevance);
  }, [context.entityMentions, updateContext, storeMemoryFragment]);

  const addTopic = useCallback((topic: string) => {
    if (!context.topicFlow.includes(topic)) {
      updateContext({
        topicFlow: [...context.topicFlow, topic].slice(-10)
      });

      storeMemoryFragment('topic', topic, { topic }, 0.8);
    }
  }, [context.topicFlow, updateContext, storeMemoryFragment]);

  const setIntent = useCallback((intent: string) => {
    updateContext({ userIntent: intent });
    storeMemoryFragment('intent', intent, { intent }, 0.9);
  }, [updateContext, storeMemoryFragment]);

  const setStage = useCallback((stage: ConversationContext['conversationStage']) => {
    updateContext({ conversationStage: stage });
    storeMemoryFragment('stage', stage, { stage }, 0.7);
  }, [updateContext, storeMemoryFragment]);

  const getRelevantEntities = useCallback((limit: number = 5) => {
    return context.entityMentions
      .sort((a, b) => b.relevance - a.relevance)
      .slice(0, limit);
  }, [context.entityMentions]);

  const getConversationSummary = useCallback(() => {
    const recentTopics = context.topicFlow.slice(-3).join(', ');
    const entityCount = context.entityMentions.length;
    const stage = context.conversationStage;

    return {
      recentTopics: recentTopics || 'No specific topics discussed',
      entityCount,
      currentStage: stage,
      intent: context.userIntent,
      hasContext: entityCount > 0 || context.topicFlow.length > 0
    };
  }, [context]);

  const resetContext = useCallback(() => {
    setContext({
      entityMentions: [],
      topicFlow: [],
      userIntent: 'general',
      conversationStage: 'greeting',
      lastUpdate: new Date().toISOString()
    });
    setMemoryFragments([]);
  }, []);

  const clearExpiredMemory = useCallback(async () => {
    if (!user?.id) return;
    
    try {
      const { error } = await supabase
        .from('chat_context_memory')
        .delete()
        .eq('user_id', user.id)
        .lt('expires_at', new Date().toISOString());

      if (error) {
        console.error('Error clearing expired memory:', error);
      }
    } catch (error) {
      console.error('Failed to clear expired memory:', error);
    }
  }, [user]);

  return {
    context,
    memoryFragments,
    loading,
    
    // Actions
    addEntityMention,
    addTopic,
    setIntent,
    setStage,
    updateContext,
    resetContext,
    clearExpiredMemory,
    
    // Getters
    getRelevantEntities,
    getConversationSummary,
    
    // Direct access for manual updates
    storeMemoryFragment
  };
};