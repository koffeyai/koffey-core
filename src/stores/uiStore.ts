import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'destructive';
  duration?: number;
}

interface Modal {
  id: string;
  component: React.ComponentType<any>;
  props?: any;
  onClose?: () => void;
}

interface UIState {
  // Loading states
  globalLoading: boolean;
  loadingMessage: string;
  
  // Navigation
  sidebarOpen: boolean;
  currentView: string;
  
  // Modals & Dialogs
  modals: Modal[];
  
  // Toasts
  toasts: Toast[];
  
  // Theme
  theme: 'light' | 'dark' | 'system';
  
  // Layout
  layout: {
    showAnalytics: boolean;
    showCollaboration: boolean;
    compactMode: boolean;
  };
  
  // Actions
  actions: {
    setGlobalLoading: (loading: boolean, message?: string) => void;
    setSidebarOpen: (open: boolean) => void;
    setCurrentView: (view: string) => void;
    openModal: (modal: Omit<Modal, 'id'>) => string;
    closeModal: (id: string) => void;
    closeAllModals: () => void;
    addToast: (toast: Omit<Toast, 'id'>) => string;
    removeToast: (id: string) => void;
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    updateLayout: (updates: Partial<UIState['layout']>) => void;
  };
}

export const useUIStore = create<UIState>()(
  devtools(
    (set, get) => ({
      // Initial state
      globalLoading: false,
      loadingMessage: '',
      sidebarOpen: false,
      currentView: 'contacts',
      modals: [],
      toasts: [],
      theme: 'system',
      
      layout: {
        showAnalytics: false,
        showCollaboration: true,
        compactMode: false
      },

      actions: {
        setGlobalLoading: (loading, message = '') => {
          set({ 
            globalLoading: loading, 
            loadingMessage: message 
          }, false, 'ui/setGlobalLoading');
        },

        setSidebarOpen: (open) => {
          set({ sidebarOpen: open }, false, 'ui/setSidebarOpen');
        },

        setCurrentView: (view) => {
          set({ currentView: view }, false, 'ui/setCurrentView');
        },

        openModal: (modal) => {
          const id = Math.random().toString(36).substr(2, 9);
          const newModal = { ...modal, id };
          
          set(state => ({
            modals: [...state.modals, newModal]
          }), false, 'ui/openModal');
          
          return id;
        },

        closeModal: (id) => {
          const modal = get().modals.find(m => m.id === id);
          if (modal?.onClose) {
            modal.onClose();
          }
          
          set(state => ({
            modals: state.modals.filter(m => m.id !== id)
          }), false, 'ui/closeModal');
        },

        closeAllModals: () => {
          const { modals } = get();
          modals.forEach(modal => {
            if (modal.onClose) {
              modal.onClose();
            }
          });
          
          set({ modals: [] }, false, 'ui/closeAllModals');
        },

        addToast: (toast) => {
          const id = Math.random().toString(36).substr(2, 9);
          const newToast = { 
            ...toast, 
            id,
            duration: toast.duration || 5000 
          };
          
          set(state => ({
            toasts: [...state.toasts, newToast]
          }), false, 'ui/addToast');
          
          // Auto-remove toast after duration
          setTimeout(() => {
            get().actions.removeToast(id);
          }, newToast.duration);
          
          return id;
        },

        removeToast: (id) => {
          set(state => ({
            toasts: state.toasts.filter(t => t.id !== id)
          }), false, 'ui/removeToast');
        },

        setTheme: (theme) => {
          set({ theme }, false, 'ui/setTheme');
          
          // Apply theme to document
          const root = document.documentElement;
          if (theme === 'dark') {
            root.classList.add('dark');
          } else if (theme === 'light') {
            root.classList.remove('dark');
          } else {
            // System theme
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (prefersDark) {
              root.classList.add('dark');
            } else {
              root.classList.remove('dark');
            }
          }
        },

        updateLayout: (updates) => {
          set(state => ({
            layout: { ...state.layout, ...updates }
          }), false, 'ui/updateLayout');
        }
      }
    }),
    { name: 'UIStore' }
  )
);

// Convenience hooks
export const useGlobalLoading = () => useUIStore(state => ({
  loading: state.globalLoading,
  message: state.loadingMessage,
  setLoading: state.actions.setGlobalLoading
}));

export const useSidebar = () => useUIStore(state => ({
  open: state.sidebarOpen,
  setOpen: state.actions.setSidebarOpen
}));

export const useToasts = () => useUIStore(state => ({
  toasts: state.toasts,
  addToast: state.actions.addToast,
  removeToast: state.actions.removeToast
}));

export const useModals = () => useUIStore(state => ({
  modals: state.modals,
  openModal: state.actions.openModal,
  closeModal: state.actions.closeModal,
  closeAllModals: state.actions.closeAllModals
}));

export const useTheme = () => useUIStore(state => ({
  theme: state.theme,
  setTheme: state.actions.setTheme
}));

export const useLayout = () => useUIStore(state => ({
  layout: state.layout,
  updateLayout: state.actions.updateLayout
}));