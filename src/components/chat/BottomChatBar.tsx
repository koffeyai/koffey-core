import React, { useEffect, useState } from 'react';
import { User, BarChart2, DollarSign } from 'lucide-react';
import { GlobalChatInput, QuickAction } from './GlobalChatInput';
import { SourceDocumentUploadDialog } from './SourceDocumentUploadDialog';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { useDialogStore } from '@/stores/dialogStore';
import { useActiveViewRoleStore } from '@/stores/activeViewRoleStore';
import { findSlashCommand } from '@/config/slashCommands';
import { canSwitchToRole } from '@/config/roleConfig';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { extractTextFromFile } from '@/utils/documentTextExtractor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const BOTTOM_CHAT_DRAFT_KEY = 'crm_bottom_chat_draft_v1';

// Page context for AI awareness
interface PageContext {
  currentPage: string;
  pageData?: {
    entityType: string;
    entities: Array<{ id: string; name: string }>;
    totalCount: number;
    searchTerm?: string;
  };
}

interface BottomChatBarProps {
  onNavigateToChat: (message?: string, context?: any) => void;
  placeholder?: string;
  showOnPage?: boolean;
  pageContext?: PageContext;
}

export const BottomChatBar: React.FC<BottomChatBarProps> = ({
  onNavigateToChat,
  placeholder = "Create contacts, log activities, or ask about your sales data...",
  showOnPage = true,
  pageContext
}) => {
  const [message, setMessage] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(BOTTOM_CHAT_DRAFT_KEY) || '';
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const { openPanel } = useChatPanelStore();
  const { openContactDialog, openDealDialog } = useDialogStore();
  const { currentOrganization } = useOrganizationAccess();

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const trimmed = message.trim();
    if (!trimmed) {
      sessionStorage.removeItem(BOTTOM_CHAT_DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(BOTTOM_CHAT_DRAFT_KEY, message);
  }, [message]);

  if (!showOnPage) return null;

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(10);

    try {
      // Try client-side extraction first
      const clientText = await extractTextFromFile(file);
      setUploadProgress(40);

      if (clientText) {
        // Client-side extraction succeeded
        setUploadDialogOpen(false);
        openPanel(`Please analyze this document:\n\n${clientText}`, {
          source: 'file_upload',
          fileName: file.name,
          timestamp: new Date().toISOString(),
        });
      } else {
        // Need server-side processing for PDFs/images
        setUploadProgress(50);
        const { data, error } = await supabase.functions.invoke('process-document', {
          body: { 
            fileName: file.name,
            fileType: file.type,
            fileData: await fileToBase64(file)
          }
        });

        setUploadProgress(90);

        if (error) throw error;
        if (!data?.text) throw new Error('No text extracted from document');

        setUploadDialogOpen(false);
        openPanel(`Please analyze this document:\n\n${data.text}`, {
          source: 'file_upload',
          fileName: file.name,
          extractionMethod: data.method,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('File processing error:', error);
      toast.error('Failed to process document. Try exporting as text or PDF.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePasteSubmit = (text: string) => {
    setUploadDialogOpen(false);
    openPanel(`Please analyze this document:\n\n${text}`, {
      source: 'paste_upload',
      timestamp: new Date().toISOString(),
    });
  };

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
    });
  };

  const handleSend = async (messageToSend: string) => {
    if (!messageToSend.trim() || isProcessing) return;

    // Intercept slash commands
    const matched = findSlashCommand(messageToSend);
    if (matched) {
      // Palette commands — open page navigator
      if (matched.action === 'open-palette') {
        setMessage('');
        sessionStorage.removeItem(BOTTOM_CHAT_DRAFT_KEY);
        window.dispatchEvent(new Event('open-command-palette'));
        return;
      }
      // Page navigation commands
      if (matched.targetView) {
        setMessage('');
        sessionStorage.removeItem(BOTTOM_CHAT_DRAFT_KEY);
        window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: matched.targetView } }));
        return;
      }
      // Role switching commands — enforce hierarchy
      if (matched.targetRole) {
        const assignedRole = (currentOrganization?.sales_role || 'ae') as import('@/stores/activeViewRoleStore').SalesRole;
        if (!canSwitchToRole(assignedRole, matched.targetRole, currentOrganization?.role)) {
          setMessage('');
          sessionStorage.removeItem(BOTTOM_CHAT_DRAFT_KEY);
          toast.error(`You don't have permission to switch to the ${matched.targetRole} view.`);
          return;
        }
        useActiveViewRoleStore.getState().setActiveViewRole(matched.targetRole);
      } else {
        useActiveViewRoleStore.getState().resetToAssigned();
      }
      setMessage('');
      sessionStorage.removeItem(BOTTOM_CHAT_DRAFT_KEY);
      if (matched.confirmation) {
        toast.success(matched.confirmation);
      }
      return;
    }
    
    setIsProcessing(true);
    
    // Open the slide panel with the message instead of navigating
    openPanel(messageToSend, {
      source: 'bottom_bar',
      timestamp: new Date().toISOString(),
      ...(pageContext && { pageContext }),
    });
    
    // Clear the input
    setMessage('');
    sessionStorage.removeItem(BOTTOM_CHAT_DRAFT_KEY);
    setIsProcessing(false);
  };

  const handleQuickAction = (actionMessage: string) => {
    openPanel(actionMessage, {
      source: 'bottom_bar',
      timestamp: new Date().toISOString(),
      ...(pageContext && { pageContext }),
    });
  };

  const quickActions: QuickAction[] = [
    { icon: User, label: 'Add Contact', action: () => openContactDialog() },
    { icon: BarChart2, label: 'Reports', action: () => handleQuickAction('Give me a pipeline summary with deal counts by stage and total value') },
    { icon: DollarSign, label: 'Add Deal', action: () => openDealDialog() }
  ];

  return (
    <>
      {/* Fixed Bottom Chat Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t p-4">
        <div className="max-w-6xl mx-auto">
          <GlobalChatInput
            value={message}
            onChange={setMessage}
            onSend={handleSend}
            isProcessing={isProcessing}
            placeholder={placeholder}
            showQuickActions
            quickActions={quickActions}
            onFileUpload={() => setUploadDialogOpen(true)}
            onFileDrop={handleFileSelect}
          />
        </div>
      </div>

      {/* Bottom Padding for Fixed Bar */}
      <div className="h-20" />

      {/* Upload Dialog */}
      <SourceDocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onFileSelect={handleFileSelect}
        onPasteSubmit={handlePasteSubmit}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
      />
    </>
  );
};
