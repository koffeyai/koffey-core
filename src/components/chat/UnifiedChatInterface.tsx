import React, { useState, useRef, useEffect, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { User, Bot, Loader2, Plus, History, Trash2, CheckCircle, AlertTriangle, HelpCircle, MessageCircle, BarChart2, BarChart3, DollarSign, Shield, ClipboardList, Check, Calendar, Clock, ExternalLink, RefreshCw, ThumbsUp, ThumbsDown, MessageSquarePlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useChat } from '@/hooks/useChat';
import { useUnifiedChatStore } from '@/stores/unifiedChatStore';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { useDialogStore } from '@/stores/dialogStore';
import { GlobalChatInput, QuickAction } from './GlobalChatInput';
import { ArtifactCard } from './ArtifactCard';
import { ZoomDecisionCard } from './ZoomDecisionCard';
import { EntitySelectionCard, SelectableEntity } from './EntitySelectionCard';
import { EmailDraftCard } from './EmailDraftCard';
import { ScheduleMeetingCard } from './ScheduleMeetingCard';
import { SourceDocumentUploadDialog } from './SourceDocumentUploadDialog';
import { ChatFileDropZone } from './ChatFileDropZone';
import { ProvenanceBadge } from './ProvenanceBadge';
import { useArtifactGeneration } from '@/hooks/useArtifactGeneration';
import { useSourceDocuments } from '@/hooks/useSourceDocuments';
import { useAuth } from '@/components/auth/AuthProvider';
import { connectGoogleScope } from '@/components/auth/GoogleAuth';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useActiveViewRoleStore } from '@/stores/activeViewRoleStore';
import { findSlashCommand } from '@/config/slashCommands';
import { canSwitchToRole } from '@/config/roleConfig';
import { extractTextFromFile, requiresServerProcessing, validateFile } from '@/utils/documentTextExtractor';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { queryClient } from '@/lib/cache';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface UnifiedChatInterfaceProps {
  onShowAnalytics?: (show: boolean, query?: string) => void;
  onShowPromptManager?: () => void;
  onBackToPrevious?: () => void;
  contextInfo?: any;
  initialMessage?: any;
}

const UNIFIED_CHAT_DRAFT_KEY = 'crm_unified_chat_draft_v1';

const ThinkingStatus: React.FC<{ message?: string; startedAt: Date }> = ({ message, startedAt }) => {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    const updateElapsed = () => {
      const now = Date.now();
      const startedMs = startedAt instanceof Date ? startedAt.getTime() : new Date(startedAt).getTime();
      const seconds = Math.max(0, Math.floor((now - startedMs) / 1000));
      setElapsedSeconds(seconds);
    };

    updateElapsed();
    const interval = setInterval(updateElapsed, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const detail =
    elapsedSeconds >= 15
      ? 'Still working on this. Thanks for your patience.'
      : elapsedSeconds >= 8
        ? 'Processing is taking a bit longer than usual.'
        : null;

  return (
    <div className="flex items-start gap-2">
      <Loader2 className="h-4 w-4 animate-spin mt-0.5" />
      <div className="space-y-1">
        <p className="text-sm">{message || 'Request received. Thinking...'}</p>
        <p className="text-xs text-muted-foreground">
          {elapsedSeconds < 2 ? 'Just now' : `${elapsedSeconds}s elapsed`}
        </p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
    </div>
  );
};

export const UnifiedChatInterface: React.FC<UnifiedChatInterfaceProps> = ({
  onShowAnalytics,
  onShowPromptManager,
  onBackToPrevious,
  contextInfo,
  initialMessage
}) => {
  const { 
    messages, 
    isProcessing,
    isReady,
    orgLoading,
    openSelector,
    sendMessage,
    sendEmailDraft,
    submitMessageFeedback,
    retryMessage,
    stopGeneration,
    currentSession,
    sessions,
    switchToSession,
    startNewConversation,
    deleteSession
  } = useChat();
  const { consumePendingMessage } = useUnifiedChatStore();
  const { clearInitialMessage } = useChatPanelStore();
  const { openContactDialog, openDealDialog, openAccountDialog } = useDialogStore();
  const { saveArtifact, exportArtifact } = useArtifactGeneration();
  const { uploadFileDocument, createTextDocument, uploading } = useSourceDocuments();
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;
  const [inputValue, setInputValue] = useState(() => {
    if (typeof window === 'undefined') return '';
    return sessionStorage.getItem(UNIFIED_CHAT_DRAFT_KEY) || '';
  });
  const [lastInputMode, setLastInputMode] = useState<'text' | 'voice'>('text');
  const [showLoadingState, setShowLoadingState] = useState(false);
  const [loadingTooLong, setLoadingTooLong] = useState(false);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [addedTasks, setAddedTasks] = useState<Set<string>>(new Set());
  const [addingTask, setAddingTask] = useState<string | null>(null);
  const [feedbackDialogOpen, setFeedbackDialogOpen] = useState(false);
  const [feedbackTargetId, setFeedbackTargetId] = useState<string | null>(null);
  const [feedbackRatingDraft, setFeedbackRatingDraft] = useState<'up' | 'down' | null>(null);
  const [feedbackCommentDraft, setFeedbackCommentDraft] = useState('');
  const [feedbackSubmittingId, setFeedbackSubmittingId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const processedInitialMessageId = useRef<string | null>(null);
  const initialMessagePayload = typeof initialMessage === 'string'
    ? { id: `legacy:${initialMessage}`, message: initialMessage, autoSend: true }
    : initialMessage;

  const feedbackTargetMessage = useMemo(
    () => messages.find((msg) => msg.id === feedbackTargetId) || null,
    [messages, feedbackTargetId]
  );

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const trimmed = inputValue.trim();
    if (!trimmed) {
      sessionStorage.removeItem(UNIFIED_CHAT_DRAFT_KEY);
      return;
    }
    sessionStorage.setItem(UNIFIED_CHAT_DRAFT_KEY, inputValue);
  }, [inputValue]);

  // Handler to add a coaching-recommended task to the deal's Next Steps
  const handleAddSuggestedTask = async (task: { action: string; priority: string; timeframe: string }, dealId: string | null) => {
    if (!dealId || !user?.id || !organizationId || addedTasks.has(task.action)) return;

    setAddingTask(task.action);
    try {
      const { error: insertError } = await supabase
        .from('tasks')
        .insert({
          title: task.action,
          deal_id: dealId,
          user_id: user.id,
          organization_id: organizationId,
          status: 'pending',
          completed: false,
          priority: task.priority === 'critical' ? 'high' : task.priority || 'medium',
        });

      if (insertError) {
        console.error('Failed to add task:', insertError);
        toast({ title: 'Failed to add task', description: insertError.message, variant: 'destructive' });
      } else {
        setAddedTasks(prev => new Set(prev).add(task.action));
        toast({ title: 'Task added', description: `"${task.action}" added to Next Steps` });
        // Invalidate tasks cache
        queryClient.invalidateQueries({ queryKey: ['crm', 'tasks', organizationId], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['deal-tasks', dealId], refetchType: 'all' });
      }
    } catch (err) {
      console.error('Error adding task:', err);
    } finally {
      setAddingTask(null);
    }
  };

  const openDealById = async (deal: { id: string; name: string }) => {
    if (!deal?.id && !deal?.name) return;

    if (deal?.id) {
      const { data, error } = await supabase
        .from('deals')
        .select('*, accounts(id, name, domain)')
        .eq('id', deal.id)
        .maybeSingle();

      if (!error && data) {
        openDealDialog({
          ...data,
          close_date: data.close_date || data.expected_close_date || '',
          account_name: data.account_name || data.accounts?.name || '',
        });
        return;
      }
    }

    window.dispatchEvent(
      new CustomEvent('open-deal-dialog', {
        detail: { dealId: deal.id, dealName: deal.name },
      })
    );
  };

  const openAccountById = async (account: { id: string; name: string }) => {
    if (!account?.id) return;

    const { data, error } = await supabase
      .from('accounts')
      .select('id, name, industry, website, phone, address, description')
      .eq('id', account.id)
      .maybeSingle();

    if (!error && data) {
      openAccountDialog(data);
      return;
    }

    window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: 'accounts' } }));
    toast({
      title: 'Opened Accounts',
      description: account?.name ? `Could not open "${account.name}" directly, but the Accounts view is now open.` : 'Accounts view opened.',
    });
  };

  const openContactById = async (contact: { id: string; name: string }) => {
    if (!contact?.id) return;

    const { data, error } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, phone, company, title, notes, status')
      .eq('id', contact.id)
      .maybeSingle();

    if (!error && data) {
      openContactDialog(data);
      return;
    }

    window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: 'contacts' } }));
    toast({
      title: 'Opened Contacts',
      description: contact?.name ? `Could not open "${contact.name}" directly, but the Contacts view is now open.` : 'Contacts view opened.',
    });
  };

  const openRecordAction = async (action: any) => {
    const entityType = String(action?.entityType || '');
    const id = String(action?.id || '');
    const name = String(action?.name || 'Record');

    if (entityType === 'deal') {
      await openDealById({ id, name });
      return;
    }
    if (entityType === 'account') {
      await openAccountById({ id, name });
      return;
    }
    if (entityType === 'contact') {
      await openContactById({ id, name });
      return;
    }

    const viewByEntity: Record<string, string> = {
      task: 'tasks',
      activity: 'activities',
      audit: 'audit-log',
    };
    const view = viewByEntity[entityType] || String(action?.route || '');
    if (view) {
      window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view } }));
      toast({
        title: entityType === 'audit' ? 'Opened Change Log' : 'Opened related view',
        description: name,
      });
    }
  };

  const formatCitationLabel = (citation: any, index: number) => {
    const table = String(citation?.table || 'unknown');
    const rowId = citation?.rowId ? String(citation.rowId) : 'derived';
    const tool = citation?.sourceTool ? String(citation.sourceTool) : 'unknown_tool';
    const snapshot = citation?.valueSnapshot && typeof citation.valueSnapshot === 'object'
      ? citation.valueSnapshot
      : null;
    const preferredName = snapshot?.name || snapshot?.full_name || snapshot?.title || snapshot?.account_name || snapshot?.contact_name || null;
    const label = preferredName
      ? `${table.slice(0, -1) || table} "${String(preferredName)}"`
      : `${table}:${rowId}`;
    return `${index + 1}. ${label} (${tool})`;
  };

  const getVerificationPresentation = (verification: any) => {
    const policy = verification?.policy || 'none';
    const sourceStatus = verification?.source_status || 'not_applicable';

    if (policy === 'none' || sourceStatus === 'not_applicable') {
      return null;
    }

    if (verification?.is_true) {
      return {
        label: 'VERIFIED ✅',
        detail: typeof verification?.citation_count === 'number'
          ? `${verification.citation_count} citation${verification.citation_count === 1 ? '' : 's'}`
          : null,
        className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      };
    }

    if (verification?.blocking_failure) {
      return {
        label: 'UNVERIFIED ❌',
        detail: typeof verification?.citation_count === 'number'
          ? `${verification.citation_count} citation${verification.citation_count === 1 ? '' : 's'}`
          : null,
        className: 'bg-red-500/10 text-red-700 dark:text-red-300',
      };
    }

    if (policy === 'advisory' && sourceStatus === 'source_backed') {
      return {
        label: 'SOURCE-BACKED ✅',
        detail: typeof verification?.citation_count === 'number'
          ? `${verification.citation_count} citation${verification.citation_count === 1 ? '' : 's'}`
          : null,
        className: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
      };
    }

    if (policy === 'advisory' && sourceStatus === 'source_gap') {
      return {
        label: 'SOURCE GAP ⚠️',
        detail: typeof verification?.citation_count === 'number'
          ? `${verification.citation_count} citation${verification.citation_count === 1 ? '' : 's'}`
          : null,
        className: 'bg-amber-500/10 text-amber-700 dark:text-amber-300',
      };
    }

    return {
      label: 'VERIFICATION INFO',
      detail: null,
      className: 'bg-muted text-muted-foreground',
    };
  };

  const openCitationLocation = async (citation: any) => {
    const table = String(citation?.table || '').toLowerCase();
    const rowId = citation?.rowId ? String(citation.rowId) : null;

    if (!table) return;

    if (table === 'deals' && rowId) {
      const fallbackName = citation?.valueSnapshot?.name ? String(citation.valueSnapshot.name) : 'Deal';
      await openDealById({ id: rowId, name: fallbackName });
      return;
    }

    if (table === 'contacts' && rowId) {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, phone, company, title, notes, status')
        .eq('id', rowId)
        .maybeSingle();

      if (!error && data) {
        openContactDialog(data);
        return;
      }
    }

    if (table === 'accounts' && rowId) {
      const { data, error } = await supabase
        .from('accounts')
        .select('id, name, industry, website, phone, address, description')
        .eq('id', rowId)
        .maybeSingle();

      if (!error && data) {
        openAccountDialog(data);
        return;
      }
    }

    const viewFromTable: Record<string, string> = {
      contacts: 'contacts',
      accounts: 'accounts',
      deals: 'deals',
      activities: 'activities',
      tasks: 'tasks',
    };
    const targetView = viewFromTable[table];
    if (targetView) {
      window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: targetView } }));
      toast({
        title: 'Opened related view',
        description: rowId
          ? `Record ID: ${rowId}`
          : 'This citation is derived from a query, not a single row.',
      });
      return;
    }

    toast({
      title: 'Citation available',
      description: 'No direct view mapping exists for this citation yet.',
    });
  };

  const applyFeedback = async (
    messageId: string,
    payload: { rating?: 'up' | 'down' | null; comment?: string }
  ) => {
    setFeedbackSubmittingId(messageId);
    try {
      await submitMessageFeedback(messageId, payload);
      toast({ title: 'Feedback saved', description: 'Thanks. I will use this to improve future responses.' });
      return true;
    } catch (err: any) {
      console.error('Failed to save feedback:', err);
      toast({
        title: 'Could not save feedback',
        description: err?.message || 'Please try again.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setFeedbackSubmittingId((current) => (current === messageId ? null : current));
    }
  };

  const openFeedbackDialog = (messageId: string) => {
    const message = messages.find((msg) => msg.id === messageId);
    setFeedbackTargetId(messageId);
    setFeedbackRatingDraft(message?.feedback?.rating || null);
    setFeedbackCommentDraft(message?.feedback?.comment || '');
    setFeedbackDialogOpen(true);
  };

  const handleFeedbackDialogSubmit = async () => {
    if (!feedbackTargetId) return;
    const saved = await applyFeedback(feedbackTargetId, {
      rating: feedbackRatingDraft,
      comment: feedbackCommentDraft,
    });
    if (saved) setFeedbackDialogOpen(false);
  };

  const resolveDealNavigationCommand = (input: string): string | null => {
    const cleaned = input.trim();
    if (!cleaned) return null;

    const match =
      cleaned.match(/^(?:take\s+me\s+to|go\s+to)\s+(.+)$/i) ||
      cleaned.match(/^open\s+(?:the\s+)?(?:deal|opportunity)\s+(.+)$/i);
    if (!match) return null;

    const rawTarget = match[1]
      .trim()
      .replace(/^the\s+/i, '')
      .replace(/^(?:deal|opportunity)\s+/i, '')
      .trim();

    return rawTarget.length >= 2 ? rawTarget : null;
  };

  const findDealsByName = async (query: string) => {
    if (!organizationId) return [];
    const { data, error } = await supabase
      .from('deals')
      .select('id, name, stage, amount')
      .eq('organization_id', organizationId)
      .ilike('name', `%${query}%`)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error) throw error;
    return data || [];
  };

  // Debounced loading state - only show spinner if loading takes > 300ms
  // This prevents flickering during fast hydration
  useEffect(() => {
    let showTimer: NodeJS.Timeout;
    let longTimer: NodeJS.Timeout;
    
    if (!isReady && initialMessagePayload?.message) {
      // Wait 300ms before showing loading spinner (prevents flicker)
      showTimer = setTimeout(() => {
        setShowLoadingState(true);
      }, 300);
      
      // After 5 seconds, show "taking longer" message
      longTimer = setTimeout(() => {
        setLoadingTooLong(true);
      }, 5000);
    } else {
      // Reset when ready
      setShowLoadingState(false);
      setLoadingTooLong(false);
    }
    
    return () => {
      clearTimeout(showTimer);
      clearTimeout(longTimer);
    };
  }, [isReady, initialMessagePayload?.message]);

  // Handle initial message from slide panel (priority) or navigation store (fallback).
  // Each launch carries an id so repeated panel opens can submit new messages without
  // being blocked by a stale "already processed" flag.
  useEffect(() => {
    // Prop-based initial message from slide panel — process immediately
    // sendMessage will defer internally if org is still loading
    if (initialMessagePayload?.message) {
      const messageKey = String(initialMessagePayload.id || initialMessagePayload.message);
      if (processedInitialMessageId.current === messageKey) return;
      processedInitialMessageId.current = messageKey;
      // Bridge pageContext from chatPanelStore → unifiedChatStore so useChat.sendMessage can forward it to the backend
      const panelPageContext = useChatPanelStore.getState().pageContext;
      if (panelPageContext) {
        useUnifiedChatStore.getState().setPendingMessage(null, { pageContext: panelPageContext }, false);
      }

      // Clear from store BEFORE sending to avoid any store race on re-render
      clearInitialMessage();

      if (initialMessagePayload.autoSend !== false) {
        sendMessage(initialMessagePayload.message);
      } else {
        setInputValue(initialMessagePayload.message);
      }
      return;
    }
    
    // Fallback: store-based pending message (from navigation) — only when fully ready
    // This path is used by full-page chat from dashboard, not the slide panel
    if (!isReady) return;
    
    const pending = consumePendingMessage();
    if (pending.message) {
      const messageKey = `pending:${pending.message}`;
      if (processedInitialMessageId.current === messageKey) return;
      processedInitialMessageId.current = messageKey;
      if (pending.autoSend) {
        sendMessage(pending.message);
      } else {
        setInputValue(pending.message);
      }
    }
  }, [isReady, initialMessagePayload?.id, initialMessagePayload?.message, clearInitialMessage, consumePendingMessage, sendMessage]);

  // Auto-scroll: show the start of the latest AI response, not the bottom
  useEffect(() => {
    if (lastAssistantRef.current) {
      // Scroll so the AI answer starts at the top of the visible area
      lastAssistantRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else {
      // Fallback for user messages / loading states
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  // Mode-aware focus: only auto-focus if last input was text-based
  useEffect(() => {
    if (!isProcessing && lastInputMode === 'text' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isProcessing, lastInputMode]);

  const handleSend = async (messageOverride?: string) => {
    const message = messageOverride?.trim() || inputValue.trim();
    if (!message) return;

    // Fast-path navigation command: "take me to <deal name>"
    const targetDealName = resolveDealNavigationCommand(message);
    if (targetDealName) {
      try {
        const matches = await findDealsByName(targetDealName);

        if (matches.length === 1) {
          setInputValue('');
          await openDealById({ id: matches[0].id, name: matches[0].name });
          toast({ title: 'Opening deal', description: matches[0].name });
          return;
        }

        if (matches.length > 1) {
          setInputValue('');
          await sendMessage(`Show me the deals matching "${targetDealName}" so I can pick one.`);
          return;
        }

        // Fall back to AI search if no immediate match found
        setInputValue('');
        await sendMessage(`Find deals similar to "${targetDealName}" and show me the closest matches.`);
        return;
      } catch (err: any) {
        console.error('Deal navigation lookup failed:', err);
        toast({
          title: 'Could not open deal',
          description: err?.message || 'Please try again.',
          variant: 'destructive'
        });
        return;
      }
    }

    // Intercept slash commands
    const matched = findSlashCommand(message);
    if (matched) {
      // Palette commands — open page navigator
      if (matched.action === 'open-palette') {
        setInputValue('');
        window.dispatchEvent(new Event('open-command-palette'));
        return;
      }
      // Page navigation commands
      if (matched.targetView) {
        setInputValue('');
        window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: matched.targetView } }));
        return;
      }
      // Role switching commands — enforce hierarchy
      if (matched.targetRole) {
        const assignedRole = (currentOrganization?.sales_role || 'ae') as import('@/stores/activeViewRoleStore').SalesRole;
        if (!canSwitchToRole(assignedRole, matched.targetRole, currentOrganization?.role)) {
          setInputValue('');
          toast({ title: 'Access denied', description: `You don't have permission to switch to the ${matched.targetRole} view.`, variant: 'destructive' });
          return;
        }
        useActiveViewRoleStore.getState().setActiveViewRole(matched.targetRole);
      } else {
        useActiveViewRoleStore.getState().resetToAssigned();
      }
      setInputValue('');
      toast({ title: 'View switched', description: matched.confirmation });
      return;
    }

    setInputValue('');
    
    try {
      if (contextInfo) {
        useUnifiedChatStore.getState().setPendingMessage(null, { pageContext: contextInfo }, false);
      }
      await sendMessage(message);
    } catch (err) {
      console.error('❌ [UI] sendMessage threw:', err);
      toast({
        title: "Message Failed",
        description: "Could not send your message. Please try again.",
        variant: "destructive"
      });
    }
    
    // Re-focus input after sending (only for text mode)
    if (lastInputMode === 'text') {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  // Handle file upload from dialog
  const handleFileUpload = async (file: File) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to upload documents.",
        variant: "destructive"
      });
      return;
    }

    try {
      setUploadProgress(10);
      
      // Step 1: Check if we can extract client-side
      const clientExtraction = await extractTextFromFile(file);
      
      if (clientExtraction) {
        // Text-based file - extracted client-side
        setUploadProgress(50);
        
        // Create source document record with extracted text
        const doc = await createTextDocument({
          rawContent: clientExtraction.text,
          title: file.name,
          sourceType: 'document',
        });
        
        setUploadProgress(80);
        
        if (doc) {
          // Send the extracted text to the chat for processing
          setUploadDialogOpen(false);
          setUploadProgress(100);
          
          const messagePrefix = `[Imported from ${file.name}]\n\n`;
          await sendMessage(messagePrefix + clientExtraction.text);
        }
      } else if (requiresServerProcessing(file)) {
        // Binary file - needs server processing
        setUploadProgress(20);
        
        // Upload to storage
        const doc = await uploadFileDocument({
          file,
          title: file.name,
        });
        
        if (!doc || !doc.storage_path) {
          throw new Error("Failed to upload document");
        }
        
        setUploadProgress(40);
        
        // Call edge function for text extraction
        const { data: session } = await supabase.auth.getSession();
        
        const response = await supabase.functions.invoke('process-document', {
          body: {
            storagePath: doc.storage_path,
            fileName: file.name,
            mimeType: file.type,
          },
        });
        
        setUploadProgress(80);
        
        if (response.error) {
          const { extractEdgeFunctionError } = await import('@/lib/edgeFunctionErrors');
          throw new Error(extractEdgeFunctionError(response));
        }
        
        const result = response.data;
        
        if (!result.success) {
          throw new Error(result.error || "Failed to extract text from document");
        }
        
        setUploadDialogOpen(false);
        setUploadProgress(100);
        
        // Send extracted text to chat
        const messagePrefix = result.isScanned 
          ? `[OCR extracted from ${file.name}]\n\n`
          : `[Imported from ${file.name}]\n\n`;
        
        await sendMessage(messagePrefix + result.text);
        
        toast({
          title: "Document Processed",
          description: result.isScanned 
            ? "Text extracted via OCR. Analyzing content..."
            : "Text extracted. Analyzing content...",
        });
      } else {
        throw new Error("Unsupported file type");
      }
    } catch (error: any) {
      console.error("File upload error:", error);
      toast({
        title: "Upload Failed",
        description: error.message || "Could not process the document",
        variant: "destructive"
      });
    } finally {
      setUploadProgress(0);
    }
  };

  // Handle pasted text from dialog
  const handlePasteSubmit = async (text: string) => {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to import documents.",
        variant: "destructive"
      });
      return;
    }

    try {
      setUploadProgress(30);
      
      // Create source document record
      const doc = await createTextDocument({
        rawContent: text,
        title: `Pasted Notes - ${new Date().toLocaleDateString()}`,
        sourceType: 'chat_note',
      });
      
      setUploadProgress(70);
      
      if (doc) {
        setUploadDialogOpen(false);
        setUploadProgress(100);
        
        // Send to chat for extraction
        await sendMessage(`[Pasted notes]\n\n${text}`);
      }
    } catch (error: any) {
      console.error("Paste submit error:", error);
      toast({
        title: "Import Failed",
        description: error.message || "Could not process the pasted content",
        variant: "destructive"
      });
    } finally {
      setUploadProgress(0);
    }
  };

  const handleDroppedFileUpload = (files: File[]) => {
    const file = files[0];
    if (!file) return;

    if (files.length > 1) {
      toast({
        title: 'One file at a time',
        description: 'Only the first dropped file will be imported.',
      });
    }

    const validation = validateFile(file);
    if (!validation.valid) {
      toast({
        title: 'Unsupported file',
        description: validation.error || 'Use PDF, Word, text, email, or image files.',
        variant: 'destructive',
      });
      return;
    }

    void handleFileUpload(file);
  };

  // Show loading state only after 300ms debounce (prevents flicker)
  if (showLoadingState && !isReady && initialMessagePayload?.message) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground text-center">
          {loadingTooLong 
            ? "Taking longer than expected. Please check your organization settings." 
            : "Loading your organization..."}
        </p>
        {loadingTooLong && (
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Refresh Page
          </Button>
        )}
      </div>
    );
  }

  // No org selected and not loading - prompt user
  if (!isReady && !orgLoading && initialMessagePayload?.message) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-4">
        <MessageCircle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground text-center">
          Please select an organization to start chatting.
        </p>
        {openSelector && (
          <Button onClick={openSelector} variant="outline" size="sm">
            Select Organization
          </Button>
        )}
      </div>
    );
  }

  return (
    <ChatFileDropZone
      className="flex flex-col h-[calc(100vh-200px)] max-w-4xl mx-auto"
      onFilesDrop={handleDroppedFileUpload}
      disabled={isProcessing || uploading || uploadProgress > 0}
      overlayClassName="rounded-lg"
    >
      {/* Header with Session Management */}
      <div className="border-b p-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <History className="h-4 w-4 mr-2" />
                History
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-64">
              {sessions.map((session) => (
                <DropdownMenuItem
                  key={session.id}
                  onClick={() => switchToSession(session)}
                  className="flex items-center justify-between"
                >
                  <div className="flex-1 truncate">
                    <div className="font-medium text-sm">{session.title}</div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 ml-2"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession(session.id);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </DropdownMenuItem>
              ))}
              {sessions.length === 0 && (
                <DropdownMenuItem disabled>No conversations yet</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={startNewConversation}
        >
          <Plus className="h-4 w-4 mr-2" />
          New Chat
        </Button>
      </div>

      {/* Messages Area */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4" role="log" aria-live="polite" aria-label="Chat messages">
          {/* Welcome Empty State */}
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full text-center px-6 py-12">
              <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
                <Bot className="h-8 w-8 text-primary" />
              </div>
              <h2 className="text-2xl font-semibold mb-2">
                Welcome to Your AI CRM Assistant
              </h2>
              <p className="text-muted-foreground mb-8 max-w-md">
                I can help you manage contacts, accounts, deals, and more. 
                Just type a message or tap the mic to speak!
              </p>
              <div className="space-y-2 w-full max-w-md">
                <div className="text-sm text-left">
                  <p className="font-medium mb-2">Try asking me:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>"Add contact John Smith at Acme Corp"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>"Show me my pipeline"</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <span className="text-primary">•</span>
                      <span>"How many accounts do I have?"</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, msgIdx) => {
            // Attach ref to the last assistant message so auto-scroll targets answer start
            const isLastAssistant = msg.role === 'assistant' &&
              !messages.slice(msgIdx + 1).some((m) => m.role === 'assistant');
            const messageArtifacts = msg.artifacts?.length ? msg.artifacts : (msg.artifact ? [msg.artifact] : []);

            return (
            <div
              key={msg.id}
              ref={isLastAssistant ? lastAssistantRef : undefined}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {/* Avatar */}
              {msg.role === 'assistant' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary flex items-center justify-center">
                  <Bot className="h-5 w-5 text-primary-foreground" />
                </div>
              )}

              {/* Message Bubble, Artifact Card, or Zoom Decision Card */}
              {messageArtifacts.length > 0 ? (
                <div className="max-w-[90%] space-y-3">
                  {msg.content && (
                    <div className="rounded-lg px-4 py-3 bg-muted">
                      <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                    </div>
                  )}
                  {messageArtifacts.map((artifact, index) => (
                    <ArtifactCard
                      key={`${artifact.generatedAt}-${artifact.title}-${index}`}
                      artifact={artifact}
                      onSave={() => saveArtifact(artifact)}
                      onExport={() => exportArtifact(artifact, 'csv')}
                    />
                  ))}
                </div>
              ) : msg.zoomDecision ? (
                <div className="max-w-[85%] space-y-3">
                  {/* Message text */}
                  <div className="rounded-lg px-4 py-3 bg-muted">
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  </div>
                  {/* Zoom decision buttons */}
                  <ZoomDecisionCard
                    dealName={msg.zoomDecision.deal?.name || 'this deal'}
                    accountContext={msg.zoomDecision.accountContext}
                    options={msg.zoomDecision.options}
                    onSelect={(zoomLevel) => {
                      const dealName = msg.zoomDecision?.deal?.name || 'this deal';
                      if (zoomLevel === 'tactical') {
                        handleSend(`Analyze just this deal: ${dealName}`);
                      } else {
                        handleSend(`Analyze ${dealName} with account history`);
                      }
                    }}
                    disabled={isProcessing}
                  />
                </div>
              ) : msg.entitySelection ? (
                <div className="max-w-[85%] space-y-3">
                  {/* Message text */}
                  <div className="rounded-lg px-4 py-3 bg-muted">
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  </div>
                  {/* Entity selection card */}
                  <EntitySelectionCard
                    entities={msg.entitySelection.entities as SelectableEntity[]}
                    prompt={msg.entitySelection.prompt}
                    onSelect={(entity: SelectableEntity) => {
                      // Send a structured message the LLM can parse
                      // If it's an account, we want to continue task creation
                      // If it's a deal, use it directly
                      if (entity.type === 'account') {
                        handleSend(`Use account "${entity.name}" (id:${entity.id})`);
                      } else if (entity.type === 'deal') {
                        handleSend(`Use deal "${entity.name}" (deal_id:${entity.id})`);
                      } else {
                        handleSend(`Use ${entity.name} (${entity.type}:${entity.id})`);
                      }
                    }}
                    disabled={isProcessing}
                  />
                </div>
              ) : msg.schedulePreview ? (
                <div className="max-w-[90%] space-y-3">
                  <div className="rounded-lg px-4 py-3 bg-muted">
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  </div>
                  <ScheduleMeetingCard
                    preview={msg.schedulePreview}
                    onConfirm={() => handleSend('Yes, send this scheduling email.')}
                    onSelectSlot={(slotIndex) => handleSend(`Use slot ${slotIndex} and send the scheduling email.`)}
                    onCancel={() => handleSend('Cancel the scheduling email.')}
                    disabled={isProcessing}
                  />
                </div>
              ) : msg.emailDraft ? (
                <div className="max-w-[90%] space-y-3">
                  {/* Message text */}
                  <div className="rounded-lg px-4 py-3 bg-muted">
                    <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  </div>
                  {/* Email draft card */}
                  <EmailDraftCard
                    draft={msg.emailDraft}
                    onSend={sendEmailDraft}
                    onCancel={() => handleSend("Cancel the email draft")}
                    disabled={isProcessing}
                  />
                </div>
              ) : (
                <div
                  className={cn(
                    'rounded-lg px-3 py-3 sm:px-4 max-w-[85%] sm:max-w-[75%] break-words [overflow-wrap:anywhere]',
                    msg.role === 'user'
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted'
                  )}
                >
                  {msg.isLoading ? (
                    <ThinkingStatus message={msg.content} startedAt={msg.timestamp} />
                  ) : (
                    <>
                      {msg.role === 'assistant' ? (
                        <div className="prose prose-sm dark:prose-invert max-w-none break-words prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5 prose-headings:my-2 prose-pre:my-2 prose-pre:overflow-x-auto prose-code:before:content-none prose-code:after:content-none prose-code:bg-background/50 prose-code:px-1 prose-code:rounded">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                        </div>
                      ) : (
                        <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                      )}

                      {/* Retry button for error messages */}
                      {msg.isError && msg.failedUserMessage && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="mt-2 h-7 text-xs"
                          disabled={isProcessing}
                          onClick={() => retryMessage(msg.failedUserMessage!, msg.id)}
                        >
                          <RefreshCw className="h-3 w-3 mr-1.5" />
                          Retry
                        </Button>
                      )}

                      {/* Feedback controls for assistant responses */}
                      {msg.role === 'assistant' && !msg.isError && msg.session_id && (
                        <div className="mt-3 pt-3 border-t border-border/50 flex items-center gap-1.5">
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-7 px-2 text-xs',
                              msg.feedback?.rating === 'up' && 'text-green-600 dark:text-green-400'
                            )}
                            disabled={feedbackSubmittingId === msg.id}
                            onClick={() => applyFeedback(msg.id, {
                              rating: 'up',
                              comment: msg.feedback?.comment || '',
                            })}
                          >
                            {feedbackSubmittingId === msg.id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <ThumbsUp className="h-3.5 w-3.5" />
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-7 px-2 text-xs',
                              msg.feedback?.rating === 'down' && 'text-amber-600 dark:text-amber-400'
                            )}
                            disabled={feedbackSubmittingId === msg.id}
                            onClick={() => applyFeedback(msg.id, {
                              rating: 'down',
                              comment: msg.feedback?.comment || '',
                            })}
                          >
                            <ThumbsDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={feedbackSubmittingId === msg.id}
                            onClick={() => openFeedbackDialog(msg.id)}
                            aria-label="Add response feedback note"
                            title="Add response feedback note"
                          >
                            <MessageSquarePlus className="h-3.5 w-3.5 mr-1.5" />
                            {msg.feedback?.comment ? 'Edit feedback' : 'Add feedback'}
                          </Button>
                          {msg.feedback?.submittedAt && (
                            <span className="text-[11px] text-muted-foreground ml-1">Saved</span>
                          )}
                        </div>
                      )}

                      {/* Strict verification status */}
                      {msg.role === 'assistant' && msg.verification && (
                        (() => {
                          const badge = getVerificationPresentation(msg.verification);
                          if (!badge && !msg.verification.user_summary) {
                            return null;
                          }

                          return (
                            <div className="mt-2 space-y-1.5">
                              {badge && (
                                <div
                                  className={cn(
                                    'inline-flex items-center gap-2 rounded-md px-2 py-1 text-[11px]',
                                    badge.className
                                  )}
                                >
                                  <span>{badge.label}</span>
                                  {badge.detail ? (
                                    <span className="opacity-80">{badge.detail}</span>
                                  ) : null}
                                </div>
                              )}
                              {msg.verification.user_summary && (
                                <p className="text-[11px] text-muted-foreground">
                                  {msg.verification.user_summary}
                                </p>
                              )}
                            </div>
                          );
                        })()
                      )}

                      {/* Citation-backed evidence links — collapsed by default */}
                      {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                        <details className="mt-2 rounded-md border border-border/60 px-2 py-1.5">
                          <summary className="cursor-pointer select-none text-[11px] text-muted-foreground font-medium">
                            {msg.citations.length} database citation{msg.citations.length === 1 ? '' : 's'}
                          </summary>
                          <div className="mt-1.5 space-y-1.5">
                            {msg.citations.slice(0, 8).map((citation, index) => (
                              <div
                                key={citation.id || `${msg.id}-citation-${index}`}
                                className="flex items-center justify-between gap-2 rounded-md border border-border/60 px-2 py-1.5 bg-background/50"
                              >
                                <span className="text-[11px] break-all text-foreground/90">
                                  {formatCitationLabel(citation, index)}
                                </span>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-6 px-2 text-[10px]"
                                  onClick={() => openCitationLocation(citation)}
                                >
                                  Open
                                </Button>
                              </div>
                            ))}
                            {msg.citations.length > 8 && (
                              <p className="text-[11px] text-muted-foreground">
                                Showing 8 of {msg.citations.length} citations.
                              </p>
                            )}
                          </div>
                        </details>
                      )}

                      {msg.role === 'assistant' && msg.verification && Array.isArray(msg.verification.failed_checks) && msg.verification.failed_checks.length > 0 && (
                        <details className="mt-2 rounded-md border border-border/60 px-2 py-1.5 text-[11px] text-muted-foreground">
                          <summary className="cursor-pointer select-none font-medium">Technical checks</summary>
                          <p className="mt-1 break-words">
                            {msg.verification.failed_checks.join(', ')}
                          </p>
                        </details>
                      )}

                      {/* Provenance Badge */}
                      {msg.role === 'assistant' && msg.provenance?.source && (
                        <ProvenanceBadge
                          source={msg.provenance.source}
                          confidence={msg.provenance.confidence || 'high'}
                          recordsFound={msg.provenance.recordsFound}
                        />
                      )}
                      {msg.provenance?.isolationEnforced && (
                        <div className="text-xs mt-1 flex items-center gap-1 text-purple-600 dark:text-purple-400">
                          <Shield className="h-3 w-3" />
                          <span>Isolated analysis (no cross-deal data)</span>
                        </div>
                      )}

                      {/* Mutation action links: created/updated/deleted records are primary actions, not citations */}
                      {msg.role === 'assistant' && msg.recordActions && msg.recordActions.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2">
                          {msg.recordActions.map((action) => (
                            <Button
                              key={`${action.entityType}-${action.id}-${action.action}`}
                              variant={action.action === 'deleted' ? 'secondary' : 'outline'}
                              size="sm"
                              className="h-8 text-xs font-medium"
                              disabled={isProcessing}
                              onClick={() => openRecordAction(action)}
                            >
                              {action.label}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Clickable deal hotlinks for rapid drill-down */}
                      {msg.role === 'assistant' && msg.dealLinks && msg.dealLinks.length > 0 && !msg.recordActions?.some(action => action.entityType === 'deal') && (
                        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2">
                          {msg.dealLinks.map((deal) => (
                            <Button
                              key={deal.id}
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isProcessing}
                              onClick={() => void openDealById({ id: deal.id, name: deal.name })}
                            >
                              {deal.name}
                              {deal.stage ? ` • ${deal.stage}` : ''}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Clickable account hotlinks for create/update account actions */}
                      {msg.role === 'assistant' && msg.accountLinks && msg.accountLinks.length > 0 && !msg.recordActions?.some(action => action.entityType === 'account') && (
                        <div className="mt-2 flex flex-wrap gap-2">
                          {msg.accountLinks.map((account) => (
                            <Button
                              key={account.id}
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={isProcessing}
                              onClick={() => openAccountById({ id: account.id, name: account.name })}
                            >
                              Open account: {account.name}
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Coaching "Add to Next Steps" numbered buttons */}
                      {msg.suggestedTasks && msg.suggestedTasks.tasks.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50 flex flex-wrap gap-2">
                          {msg.suggestedTasks.tasks.map((task, idx) => {
                            const isAdded = addedTasks.has(task.action);
                            const isAdding = addingTask === task.action;
                            const stepNum = idx + 1;
                            return (
                              <Button
                                key={idx}
                                variant={isAdded ? 'ghost' : 'outline'}
                                size="sm"
                                className={cn(
                                  "h-7 text-xs",
                                  isAdded && "text-green-600 dark:text-green-400"
                                )}
                                disabled={isAdded || isAdding}
                                onClick={() => handleAddSuggestedTask(task, msg.suggestedTasks!.dealId)}
                              >
                                {isAdding ? (
                                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                ) : isAdded ? (
                                  <Check className="h-3 w-3 mr-1" />
                                ) : null}
                                {isAdded ? `#${stepNum} Added` : `${stepNum}. Add`}
                              </Button>
                            );
                          })}
                        </div>
                      )}

                      {/* Scheduling slot selection buttons */}
                      {msg.schedulingSlots && msg.schedulingSlots.slots.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-border/50 space-y-2">
                          <p className="text-xs text-muted-foreground font-medium flex items-center gap-1.5">
                            <Calendar className="h-3 w-3" />
                            Select a time slot to propose to {msg.schedulingSlots.contactName}:
                          </p>
                          {msg.schedulingSlots.slots.map((slot, idx) => (
                            <Button
                              key={idx}
                              variant="outline"
                              size="sm"
                              className="w-full justify-start text-left h-auto py-2.5 px-3 hover:bg-primary/5 hover:border-primary/30"
                              disabled={isProcessing}
                              onClick={() => handleSend(
                                `I'd like slot ${idx + 1}: ${slot.dayLabel} ${slot.startTime}-${slot.endTime}`
                              )}
                            >
                              <Clock className="h-4 w-4 mr-2.5 text-primary flex-shrink-0" />
                              <div className="flex flex-col">
                                <span className="font-medium text-sm">{slot.dayLabel}</span>
                                <span className="text-xs text-muted-foreground">{slot.startTime} – {slot.endTime}</span>
                              </div>
                            </Button>
                          ))}
                        </div>
                      )}

                      {/* Gmail scope upgrade prompt */}
                      {msg.needsScopeUpgrade && (
                        <div className="mt-3 pt-3 border-t border-border/50">
                          <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                            <div className="flex items-start gap-2 mb-2">
                              <AlertTriangle className="h-4 w-4 text-amber-700 dark:text-amber-300 mt-0.5 flex-shrink-0" />
                              <div className="space-y-1">
                                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                                  Gmail permission needed
                                </p>
                                <p className="text-sm text-amber-800 dark:text-amber-200">
                                  {msg.needsScopeUpgrade.message}
                                </p>
                                <p className="text-xs text-amber-700/80 dark:text-amber-300/80">
                                  After reconnecting, return here and press Send on the draft again.
                                </p>
                              </div>
                            </div>
                            <Button
                              variant="outline"
                              size="sm"
                              className="border-amber-300 text-amber-700 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                              onClick={async () => {
                                try {
                                  await connectGoogleScope(
                                    msg.needsScopeUpgrade!.scope,
                                    `${window.location.origin}${window.location.pathname}${window.location.search}`,
                                  );
                                } catch (error) {
                                  toast({
                                    title: 'Connection failed',
                                    description: error instanceof Error ? error.message : 'Unable to start Google OAuth.',
                                    variant: 'destructive',
                                  });
                                }
                              }}
                            >
                              <ExternalLink className="h-3 w-3 mr-1.5" />
                              Reconnect Gmail
                            </Button>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Avatar */}
              {msg.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary flex items-center justify-center">
                  <User className="h-5 w-5 text-secondary-foreground" />
                </div>
              )}
            </div>
          );
          })}
          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input Area - Using GlobalChatInput */}
      <div className="border-t p-4">
        <GlobalChatInput
          ref={inputRef}
          value={inputValue}
          onChange={setInputValue}
          onSend={handleSend}
          onStop={stopGeneration}
          onInputModeChange={setLastInputMode}
          onFileUpload={() => setUploadDialogOpen(true)}
          onFileDrop={handleFileUpload}
          isProcessing={isProcessing}
          isUploading={uploading || uploadProgress > 0}
          placeholder="Type your message..."
          autoFocus={lastInputMode === 'text'}
          showQuickActions
          quickActions={[
            { icon: User, label: 'Contacts', action: () => handleSend('Show my contacts') },
            { icon: Plus, label: 'Add Contact', action: () => openContactDialog() },
            { icon: BarChart2, label: 'Reports', action: () => handleSend('Give me a pipeline summary with deal counts by stage and total value') },
            { icon: DollarSign, label: 'Add Deal', action: () => openDealDialog() }
          ] as QuickAction[]}
        />
      </div>

      {/* Feedback note dialog */}
      <Dialog open={feedbackDialogOpen} onOpenChange={setFeedbackDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Response feedback</DialogTitle>
            <DialogDescription>
              Tell me what worked or what should be improved. This will be used to improve future responses.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant={feedbackRatingDraft === 'up' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFeedbackRatingDraft('up')}
              >
                <ThumbsUp className="h-3.5 w-3.5 mr-1.5" />
                Helpful
              </Button>
              <Button
                variant={feedbackRatingDraft === 'down' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setFeedbackRatingDraft('down')}
              >
                <ThumbsDown className="h-3.5 w-3.5 mr-1.5" />
                Needs work
              </Button>
            </div>

            {feedbackTargetMessage?.content && (
              <div className="rounded-md border bg-muted/40 p-3 text-xs text-muted-foreground line-clamp-4">
                {feedbackTargetMessage.content}
              </div>
            )}

            <Textarea
              value={feedbackCommentDraft}
              onChange={(e) => setFeedbackCommentDraft(e.target.value)}
              placeholder="Optional: what should be improved, added, or changed?"
              maxLength={1000}
              rows={5}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setFeedbackDialogOpen(false)}
              disabled={!!feedbackTargetId && feedbackSubmittingId === feedbackTargetId}
            >
              Cancel
            </Button>
            <Button
              onClick={handleFeedbackDialogSubmit}
              disabled={!feedbackTargetId || (!!feedbackTargetId && feedbackSubmittingId === feedbackTargetId)}
            >
              {!!feedbackTargetId && feedbackSubmittingId === feedbackTargetId ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : null}
              Save feedback
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Source Document Upload Dialog */}
      <SourceDocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onFileSelect={handleFileUpload}
        onPasteSubmit={handlePasteSubmit}
        isUploading={uploading || uploadProgress > 0}
        uploadProgress={uploadProgress}
      />
    </ChatFileDropZone>
  );
};

export default UnifiedChatInterface;
