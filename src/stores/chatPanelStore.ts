import { create } from 'zustand';

interface ChatPanelStore {
  isPanelOpen: boolean;
  initialMessage: string | null;
  initialMessageId: string | null;
  pageContext: any | null;
  activeSessionId: string | null; // Persists session across navigation
  
  openPanel: (message?: string, context?: any) => void;
  closePanel: () => void;
  togglePanel: () => void;
  clearInitialMessage: () => void;
  setActiveSession: (sessionId: string | null) => void;
}

export const useChatPanelStore = create<ChatPanelStore>((set) => ({
  isPanelOpen: false,
  initialMessage: null,
  initialMessageId: null,
  pageContext: null,
  activeSessionId: null,
  
  openPanel: (message?: string, context?: any) => set({
    isPanelOpen: true,
    initialMessage: message || null,
    initialMessageId: message
      ? `${Date.now()}-${Math.random().toString(36).slice(2)}`
      : null,
    pageContext: context || null,
    // Clear active session when opening with a new message so useChat starts fresh
    // instead of restoring the previous conversation
    ...(message ? { activeSessionId: null } : {}),
  }),
  
  closePanel: () => set({ 
    isPanelOpen: false,
    // Don't clear message/context on close - preserves state if reopened
  }),
  
  togglePanel: () => set((state) => ({ 
    isPanelOpen: !state.isPanelOpen 
  })),
  
  clearInitialMessage: () => set({ 
    initialMessage: null,
    initialMessageId: null,
  }),
  
  setActiveSession: (sessionId: string | null) => set({
    activeSessionId: sessionId
  }),
}));
