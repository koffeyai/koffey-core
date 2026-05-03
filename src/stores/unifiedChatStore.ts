import { create } from 'zustand';
import { useChatPanelStore } from './chatPanelStore';

interface ChatMessage {
  id: string;
  content: string;
  context?: Record<string, unknown>;
  timestamp: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  retryCount: number;
}

interface ChatNavigationState {
  pendingMessage: string | null;
  pendingContext: Record<string, unknown> | null;
  autoSend: boolean;
  prefilledMessage: string | null;
  context: Record<string, unknown> | null;
  recoveryMessages: ChatMessage[];
}

interface ChatNavigationActions {
  setPendingMessage: (message: string | null, context?: Record<string, unknown>, autoSend?: boolean) => void;
  consumePendingMessage: () => { message: string | null; context: Record<string, unknown> | null; autoSend: boolean };
  setPrefill: (message: string, context?: Record<string, unknown>) => void;
  consumePrefill: () => void;
  saveMessage: (content: string, context?: Record<string, unknown>) => string;
  updateMessageStatus: (id: string, status: ChatMessage['status']) => void;
  retryMessage: (id: string) => boolean;
  getPendingMessages: () => ChatMessage[];
  cleanup: () => void;
}

type UnifiedChatStore = ChatNavigationState & ChatNavigationActions;

export const useUnifiedChatStore = create<UnifiedChatStore>((set, get) => ({
  // State
  pendingMessage: null,
  pendingContext: null,
  autoSend: false,
  prefilledMessage: null,
  context: null,
  recoveryMessages: [],

  // Navigation actions
  setPendingMessage: (message, context = null, autoSend = true) => {
    set({ 
      pendingMessage: message, 
      pendingContext: context,
      autoSend 
    });
  },

  consumePendingMessage: () => {
    const state = get();
    const result = {
      message: state.pendingMessage,
      context: state.pendingContext,
      autoSend: state.autoSend
    };
    set({ pendingMessage: null, pendingContext: null, autoSend: false });
    return result;
  },

  // Prefill actions
  setPrefill: (message, context = null) => set({ 
    prefilledMessage: message, 
    context: context 
  }),

  consumePrefill: () => set({ 
    prefilledMessage: null, 
    context: null 
  }),

  // Recovery actions
  saveMessage: (content, context = null) => {
    const id = crypto.randomUUID();
    const message: ChatMessage = {
      id,
      content,
      context: context || {},
      timestamp: Date.now(),
      status: 'pending',
      retryCount: 0
    };

    set(state => ({
      recoveryMessages: [...state.recoveryMessages, message]
    }));

    return id;
  },

  updateMessageStatus: (id, status) => {
    set(state => ({
      recoveryMessages: state.recoveryMessages.map(msg =>
        msg.id === id ? { ...msg, status } : msg
      )
    }));
  },

  retryMessage: (id) => {
    const state = get();
    const message = state.recoveryMessages.find(msg => msg.id === id);
    
    if (!message || message.retryCount >= 3) {
      return false;
    }

    set(state => ({
      recoveryMessages: state.recoveryMessages.map(msg =>
        msg.id === id 
          ? { ...msg, retryCount: msg.retryCount + 1, status: 'pending' as const }
          : msg
      )
    }));

    return true;
  },

  getPendingMessages: () => {
    const state = get();
    const expiry = 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = Date.now() - expiry;
    
    return state.recoveryMessages.filter(msg => 
      msg.status === 'pending' && msg.timestamp > cutoff
    );
  },

  cleanup: () => {
    const expiry = 24 * 60 * 60 * 1000; // 24 hours
    const cutoff = Date.now() - expiry;
    
    set(state => ({
      recoveryMessages: state.recoveryMessages.filter(msg =>
        msg.status === 'pending' || msg.timestamp > cutoff
      )
    }));
  }
}));

// Enhanced chat launcher with validation and recovery
// Prefers slide panel when available, falls back to navigation
export const launchChatWith = (message: string, context?: Record<string, unknown>) => {
  // First, try to use the slide panel (preferred for CRM pages)
  try {
    const { openPanel } = useChatPanelStore.getState();
    openPanel(message, context);
    // Panel opened successfully - don't dispatch legacy navigation event
    return;
  } catch (error) {
    // Panel not available, fall through to legacy behavior
  }
  
  // Legacy fallback - store message for navigation
  try {
    useUnifiedChatStore.getState().setPendingMessage(message, context);
  } catch (error) {
    // Store for recovery if navigation fails
    useUnifiedChatStore.getState().saveMessage(message, context);
  }
  
  // Dispatch event for immediate listeners
  window.dispatchEvent(new CustomEvent('launch-chat', { 
    detail: { message, context } 
  }));
};

// Form recovery launcher
export const launchChatWithValidation = (
  errors: Record<string, string>[],
  formData: Record<string, unknown>,
  entityType: string,
  recoveryStrategy: 'guided' | 'bulk' | 'quick' | 'predictive' = 'guided'
) => {
  const context = {
    type: 'form_recovery',
    entityType,
    formData,
    errors,
    recoveryStrategy,
    timestamp: Date.now()
  };
  
  const strategyMessages = {
    quick: 'I need a few quick details to complete this form.',
    bulk: 'Let me help you fill in multiple fields efficiently.',
    predictive: 'I can make some smart suggestions based on your data.',
    guided: 'Let me guide you through completing this form step by step.'
  };
  
  launchChatWith(strategyMessages[recoveryStrategy], context);
};

// Bulk operations launcher
export const launchChatWithBulkContext = (
  patterns: Array<{ type: string; field: string; affectedCount: number; suggestedFix?: string }>,
  suggestions: Array<{ requiresConfirmation: boolean }>,
  entityType: string,
  csvResults?: Record<string, unknown>
) => {
  const criticalIssues = patterns.filter(p => 
    p.type === 'missing_field' && p.affectedCount > 1
  );

  let prompt = `I've analyzed your ${entityType} import and found some patterns that need attention:\n\n`;

  criticalIssues.slice(0, 3).forEach(pattern => {
    prompt += `• ${pattern.affectedCount} records missing ${pattern.field}`;
    if (pattern.suggestedFix) {
      prompt += ` → I can help: ${pattern.suggestedFix}`;
    }
    prompt += `\n`;
  });

  const autoFixable = suggestions.filter(s => !s.requiresConfirmation);
  if (autoFixable.length > 0) {
    prompt += `\n✨ I can automatically fix ${autoFixable.length} issues right now!\n`;
  }

  const needsConfirmation = suggestions.filter(s => s.requiresConfirmation);
  if (needsConfirmation.length > 0) {
    prompt += `\n🤔 ${needsConfirmation.length} suggestions need your confirmation first.\n`;
  }

  prompt += `\nShould I start with the automatic fixes, or would you like to review everything first?`;

  launchChatWith(prompt, {
    type: 'bulk_import',
    entityType,
    csvResults,
    patterns: criticalIssues,
    suggestions
  });
};