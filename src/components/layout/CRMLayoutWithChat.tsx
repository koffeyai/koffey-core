import React, { createContext, useContext, useState } from 'react';
import { cn } from '@/lib/utils';
import { BottomChatBar } from '@/components/chat/BottomChatBar';
import { AdminStatusBar } from '@/components/admin/AdminStatusBar';
import { useChatPanelStore } from '@/stores/chatPanelStore';

// Page context data for AI awareness
export interface PageContextData {
  entityType: string;
  entities: Array<{ id: string; name: string }>;
  totalCount: number;
  searchTerm?: string;
}

interface ChatContextType {
  currentTab: string;
  tabData?: PageContextData;
  setTabData: (data: PageContextData | null) => void;
}

const ChatContext = createContext<ChatContextType>({
  currentTab: '',
  setTabData: () => {}
});

export const useChatContext = () => useContext(ChatContext);

interface CRMLayoutWithChatProps {
  children: React.ReactNode;
  currentTab: string;
  chatComponent?: React.ReactNode; // Optional since we're using bottom chat now
}

export const CRMLayoutWithChat: React.FC<CRMLayoutWithChatProps> = ({
  children,
  currentTab,
  chatComponent // Not used anymore, kept for compatibility
}) => {
  const [tabData, setTabData] = useState<any>(null);
  const { isPanelOpen, openPanel } = useChatPanelStore();

  // Don't show chat on prompt-manager page
  const showChat = currentTab !== 'prompt-manager';

  const handleOpenChatPanel = (message?: string, context?: any) => {
    openPanel(message, {
      ...context,
      currentPage: currentTab,
      pageData: tabData || undefined,
    });
  };

  return (
    <ChatContext.Provider value={{ 
      currentTab, 
      tabData, 
      setTabData
    }}>
      <div className="h-full bg-background relative">
        {/* Admin Status Bar */}
        <AdminStatusBar />
        
        {/* Main Content */}
        <div className={cn(
          "h-full overflow-auto transition-all duration-300",
          // Optionally shrink content when panel is open on desktop
          isPanelOpen && "md:mr-[450px] lg:mr-[500px]"
        )}>
          <div className="p-6 pb-24">
            {children}
          </div>
        </div>

        {/* Bottom Chat Bar - opens panel instead of navigating */}
        <BottomChatBar 
          onNavigateToChat={handleOpenChatPanel}
          showOnPage={showChat}
          placeholder="Create contacts, log activities, or ask about your sales data..."
          pageContext={{
            currentPage: currentTab,
            pageData: tabData || undefined,
          }}
        />

      </div>
    </ChatContext.Provider>
  );
};
