import React, { useEffect, useRef, useState, lazy, Suspense } from 'react';
import { X, MessageSquare, Maximize2, Minimize2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useChatPanelStore } from '@/stores/chatPanelStore';

const UnifiedChatInterface = lazy(() => import('./UnifiedChatInterface'));

interface ChatSlidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  pageContext?: any;
}

export const ChatSlidePanel: React.FC<ChatSlidePanelProps> = ({
  isOpen,
  onClose,
  pageContext,
}) => {
  const panelRef = useRef<HTMLDivElement>(null);
  const { initialMessage, initialMessageId } = useChatPanelStore();
  const [isExpanded, setIsExpanded] = useState(false);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (isExpanded) {
          setIsExpanded(false);
        } else {
          onClose();
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isExpanded, isOpen, onClose]);

  // Focus trap: keep focus inside the panel when open
  useEffect(() => {
    if (!isOpen || !panelRef.current) return;
    const panel = panelRef.current;
    const focusableSelector = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    const focusableElements = () => panel.querySelectorAll<HTMLElement>(focusableSelector);

    // Focus the first panel control on open.
    focusableElements()[0]?.focus();

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const elements = focusableElements();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleTab);
    return () => window.removeEventListener('keydown', handleTab);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      setIsExpanded(false);
    }
  }, [isOpen]);

  // Prevent body scroll when panel is open on mobile only (desktop stays scrollable)
  useEffect(() => {
    const mobileQuery = window.matchMedia('(max-width: 767px)');
    if (isOpen && mobileQuery.matches) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  return (
    <>
      {/* Backdrop - subtle dim, click to close on mobile, pass-through on desktop */}
      <div
        className={cn(
          "fixed inset-0 bg-black/10 z-40 transition-opacity duration-300",
          isOpen ? "opacity-100" : "opacity-0 pointer-events-none",
          // Full-screen mode should behave like a modal; normal desktop panel keeps the page usable.
          isOpen && !isExpanded && "md:pointer-events-none"
        )}
        onClick={() => {
          if (isExpanded) {
            setIsExpanded(false);
          } else {
            onClose();
          }
        }}
        aria-hidden="true"
      />

      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "fixed top-0 h-full z-50 bg-background shadow-2xl",
          "flex flex-col",
          "transition-[transform,width] duration-300 ease-out",
          isExpanded
            ? "left-0 right-0 w-full border-l-0"
            : "right-0 w-full border-l md:w-[450px] lg:w-[500px]",
          isOpen ? "translate-x-0" : "translate-x-full"
        )}
        role="dialog"
        aria-modal="true"
        aria-label="Chat panel"
      >
        {/* Header */}
        <header className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-5 w-5 text-primary" />
            <h2 className="font-semibold text-foreground">AI Assistant</h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded((value) => !value)}
              className="h-8 gap-1.5 px-2 hover:bg-muted"
              aria-label={isExpanded ? 'Minimize chat panel' : 'Expand chat panel'}
              aria-pressed={isExpanded}
              title={isExpanded ? 'Minimize' : 'Expand'}
            >
              {isExpanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
              <span className="hidden sm:inline">{isExpanded ? 'Minimize' : 'Expand'}</span>
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 hover:bg-muted"
              aria-label="Close chat panel"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Chat Interface */}
        <div className="flex-1 overflow-hidden">
          {isOpen && (
            <Suspense fallback={<div className="animate-pulse h-64 bg-muted rounded-lg m-6" />}>
              <UnifiedChatInterface
                contextInfo={pageContext}
                initialMessage={initialMessage ? {
                  id: initialMessageId,
                  message: initialMessage,
                  autoSend: true
                } : undefined}
                onBackToPrevious={onClose}
              />
            </Suspense>
          )}
        </div>
      </div>
    </>
  );
};
