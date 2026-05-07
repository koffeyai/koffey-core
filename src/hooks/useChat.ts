import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from './useOrganizationAccess';
import { supabase } from '@/integrations/supabase/client';
import { queryClient } from '@/lib/cache';
import { useUnifiedChatStore } from '@/stores/unifiedChatStore';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { useDialogStore } from '@/stores/dialogStore';
import { useUIStore } from '@/stores/uiStore';
import { useActiveViewRoleStore } from '@/stores/activeViewRoleStore';
import { useEntityContext } from './useEntityContext';
import { buildDashboardManagerFollowUp, buildVisualArtifactPrompts, isVisualAnalyticsRequest, summarizeVisualArtifacts } from '@/lib/visualAnalytics';
import { crmEventBus } from '@/lib/crmEventBus';
import {
  CHAT_CONTEXT_WINDOW_MS,
  clearStoredActiveChatSession,
  isChatSessionWithinMemoryWindow,
  readStoredActiveChatSession,
  writeStoredActiveChatSession,
} from '@/lib/chatSessionMemory';
import type { ArtifactPayload, GenerateArtifactResponse } from '@/types/analytics';
import type { EntityContextMetadata } from '@/types/entityContext';
import { sanitizeAssistantMessage } from '@/utils/messageSanitizer';

interface MessageProvenance {
  source: 'database' | 'database_empty' | 'clarification_needed' | 'llm_general' | 'mixed' | 'general_chat' | 'artifact';
  recordsFound: number;
  searchPerformed: boolean;
  entityType?: string;
  confidence: 'high' | 'medium' | 'low' | 'pending_consent' | 'verified' | 'failed';
  searchQuery?: string;
  timestamp?: string;
  analysisMode?: 'general' | 'single_entity_analysis' | 'comparison';
  isolationEnforced?: boolean;
}

// UI action types that can be triggered from chat responses
interface MessageAction {
  type: 'open_coaching_dialog' | 'open_deal_form' | 'navigate_to' | 'open_activity_logger' | 'open_deal_dialog';
  deal?: any;
  contact?: any;
  route?: string;
  payload?: Record<string, any>;
}

interface MessageFeedback {
  rating?: 'up' | 'down' | null;
  comment?: string;
  submittedAt?: string;
  source?: string;
}

interface MessageCitation {
  id: string;
  kind: 'retrieved' | 'derived';
  table: string;
  rowId?: string | null;
  columns?: string[];
  sourceTool: string;
  valueSnapshot?: Record<string, unknown> | null;
  query?: Record<string, unknown> | null;
  derivedFrom?: string[];
  uiLink?: {
    view?: string | null;
    entityType?: string | null;
    entityId?: string | null;
  } | null;
  evidenceText?: string | null;
}

interface MessageVerification {
  mode: string;
  is_true: boolean;
  requires_verification?: boolean;
  failed_checks?: string[];
  citation_count?: number;
  operation_count?: number;
  verified_at?: string;
  policy?: 'strict' | 'advisory' | 'none';
  blocking_failure?: boolean;
  mixed_intent?: boolean;
  source_status?: 'source_backed' | 'source_gap' | 'not_applicable';
  user_summary?: string | null;
  legacy_would_block?: boolean;
}

interface DealLink {
  id: string;
  name: string;
  stage?: string | null;
  amount?: number | null;
}

interface AccountLink {
  id: string;
  name: string;
}

interface RecordActionLink {
  id: string;
  entityType: 'deal' | 'account' | 'contact' | 'task' | 'activity' | 'audit';
  action: 'created' | 'updated' | 'deleted' | 'completed' | 'logged';
  name: string;
  label: string;
  route?: string;
  sourceTool?: string;
  relatedEntityId?: string | null;
}

// Zoom decision for contextual analysis
interface ZoomDecision {
  requiresZoomDecision: boolean;
  deal: any;
  accountContext?: {
    wonDeals: number;
    wonValue: number;
    totalDeals?: number;
    winRate?: number;
  };
  options: Array<{ label: string; value: 'tactical' | 'strategic' }>;
}

// Entity selection for disambiguation
interface EntitySelectionData {
  entities: Array<{
    id: string;
    type: 'account' | 'deal' | 'contact' | 'task';
    name: string;
    subtitle?: string;
    metadata?: string;
  }>;
  prompt?: string;
}

// Suggested task from coaching recommendations
interface SuggestedTask {
  action: string;
  priority: string;
  timeframe: string;
  reasoning?: string;
}

interface SuggestedTasksPayload {
  dealId: string | null;
  dealName: string | null;
  tasks: SuggestedTask[];
}

// Scheduling slot from check_availability tool
interface SchedulingSlot {
  date: string;
  dayLabel: string;
  startTime: string;
  endTime: string;
  isoStart: string;
  isoEnd: string;
}

interface SchedulingSlotsPayload {
  slots: SchedulingSlot[];
  contactName: string;
  contactEmail: string;
  dealId: string;
  dealName: string;
  slotType: string;
}

interface ScopeUpgradePayload {
  scope: string;
  message: string;
}

export interface EmailDraftPayload {
  id: string;
  to_email: string;
  to_name?: string;
  subject: string;
  body: string;
  tone?: string;
  audience_scope?: 'internal' | 'external';
  voice_notes?: string;
  user_context?: string;
  deal_context?: { id: string; name: string; stage: string };
}

interface EmailSendFeedback {
  responseText: string;
  scopeMessage?: string;
}

function readableSendFailure(data: any, error: any): string | null {
  const raw = data?.error || data?.message || error?.message;
  if (!raw || typeof raw !== 'string') return null;
  return raw.replace(/\s+/g, ' ').trim();
}

function buildEmailSendFeedback(
  data: any,
  error: any,
  recipientName: string,
  recipientEmail: string,
): EmailSendFeedback {
  const detail = readableSendFailure(data, error);
  const code = data?.errorCode || error?.code;

  switch (code) {
    case 'NEEDS_GMAIL_SCOPE':
      return {
        responseText: "Gmail send access is not connected yet. Reconnect Gmail, then send this draft again.",
        scopeMessage: "Gmail send access is not connected yet. Reconnect Gmail, then send this draft again.",
      };
    case 'GOOGLE_RECONNECT_REQUIRED':
      return {
        responseText: "Your Google connection expired. Reconnect Gmail, then send this draft again.",
        scopeMessage: "Your Google connection expired. Reconnect Gmail, then send this draft again.",
      };
    case 'GOOGLE_OAUTH_CONFIGURATION_ERROR':
      return {
        responseText: "Google email sending is not configured correctly for this workspace. Check the OAuth settings, then reconnect Gmail.",
      };
    case 'UNKNOWN_RECIPIENT':
      return {
        responseText: "I can only send email to CRM contacts. Add this person as a contact first, then send the draft again.",
      };
    case 'EMAIL_RATE_LIMITED':
      return {
        responseText: "This workspace hit its daily email safety limit. Try again later or raise the sending cap.",
      };
    case 'NO_EMAIL_PROVIDER':
      return {
        responseText: "No sending provider is connected. Connect Gmail send access or configure a fallback email provider.",
      };
    case 'GMAIL_SEND_FAILED':
      return {
        responseText: `Gmail rejected the send request.${detail ? ` ${detail}` : ''}`,
      };
    default:
      return {
        responseText: `I couldn't send the email to ${recipientName} <${recipientEmail}>.${detail ? ` ${detail}` : ' Please try again.'}`,
      };
  }
}

export interface SchedulePreviewPayload {
  id: string;
  contact?: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
  meeting_type?: string;
  suggested_time?: string | null;
  suggested_start_iso?: string | null;
  duration_minutes?: number | null;
  available_slots: Array<{
    start?: string;
    end?: string;
    label?: string;
  }>;
  email_draft?: {
    subject: string;
    body: string;
  } | null;
}

interface Message {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  isLoading?: boolean;
  isError?: boolean;
  // The user message that triggered this error, for retry
  failedUserMessage?: string;
  session_id?: string;
  created_at?: string;
  provenance?: MessageProvenance;
  requiresConsent?: boolean;
  consentOptions?: string[];
  artifact?: ArtifactPayload;
  artifacts?: ArtifactPayload[];
  action?: MessageAction;
  // Zoom decision for contextual analysis
  zoomDecision?: ZoomDecision;
  // Entity selection for disambiguation
  entitySelection?: EntitySelectionData;
  // Coaching-recommended next steps with "Add to Next Steps" buttons
  suggestedTasks?: SuggestedTasksPayload;
  // Available scheduling slots from check_availability tool
  schedulingSlots?: SchedulingSlotsPayload;
  // Gmail scope upgrade prompt
  needsScopeUpgrade?: ScopeUpgradePayload;
  // Email draft for approval
  emailDraft?: EmailDraftPayload;
  // Scheduling preview for approval before any calendar or email side effect
  schedulePreview?: SchedulePreviewPayload;
  // Clickable deal links extracted from tool output for low-friction navigation
  dealLinks?: DealLink[];
  // Clickable account links extracted from create/update/search results
  accountLinks?: AccountLink[];
  // Primary record actions for mutation responses; these replace citation-like navigation for writes
  recordActions?: RecordActionLink[];
  // User-provided quality feedback for this assistant response
  feedback?: MessageFeedback;
  // Strict database citations proving where facts came from
  citations?: MessageCitation[];
  verification?: MessageVerification;
}

interface PendingDraftEmailContext {
  type: 'draft_email_missing_recipient';
  userPrompt: string;
  assistantPrompt: string;
}

interface ChatSession {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  organization_id: string;
  user_id: string;
}

const PROCESSING_TIMEOUT_MS = 30_000;

function normalizeFeedback(raw: unknown): MessageFeedback | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const parsed = raw as Record<string, unknown>;
  const rating = parsed.rating === 'up' || parsed.rating === 'down' ? parsed.rating : undefined;
  const comment = typeof parsed.comment === 'string' ? parsed.comment.trim().slice(0, 1000) : '';
  const submittedAt = typeof parsed.updated_at === 'string'
    ? parsed.updated_at
    : typeof parsed.submittedAt === 'string'
      ? parsed.submittedAt
      : undefined;

  if (!rating && !comment) return undefined;

  return {
    rating: rating ?? null,
    comment: comment || undefined,
    submittedAt,
    source: typeof parsed.source === 'string' ? parsed.source : undefined,
  };
}

function normalizeCitation(raw: unknown): MessageCitation | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const parsed = raw as Record<string, unknown>;
  const id = typeof parsed.id === 'string' && parsed.id.trim() ? parsed.id : null;
  const table = typeof parsed.table === 'string' && parsed.table.trim() ? parsed.table : null;
  const sourceTool = typeof parsed.sourceTool === 'string' && parsed.sourceTool.trim()
    ? parsed.sourceTool
    : 'unknown_tool';

  if (!id || !table) return undefined;

  return {
    id,
    kind: parsed.kind === 'derived' ? 'derived' : 'retrieved',
    table,
    rowId: parsed.rowId != null ? String(parsed.rowId) : null,
    columns: Array.isArray(parsed.columns)
      ? parsed.columns.map((value) => String(value).trim()).filter(Boolean).slice(0, 12)
      : [],
    sourceTool,
    valueSnapshot: parsed.valueSnapshot && typeof parsed.valueSnapshot === 'object'
      ? (parsed.valueSnapshot as Record<string, unknown>)
      : null,
    query: parsed.query && typeof parsed.query === 'object'
      ? (parsed.query as Record<string, unknown>)
      : null,
    derivedFrom: Array.isArray(parsed.derivedFrom)
      ? parsed.derivedFrom.map((value) => String(value).trim()).filter(Boolean).slice(0, 12)
      : [],
    uiLink: parsed.uiLink && typeof parsed.uiLink === 'object'
      ? {
          view: typeof (parsed.uiLink as Record<string, unknown>).view === 'string'
            ? String((parsed.uiLink as Record<string, unknown>).view)
            : null,
          entityType: typeof (parsed.uiLink as Record<string, unknown>).entityType === 'string'
            ? String((parsed.uiLink as Record<string, unknown>).entityType)
            : null,
          entityId: (parsed.uiLink as Record<string, unknown>).entityId != null
            ? String((parsed.uiLink as Record<string, unknown>).entityId)
            : null,
        }
      : null,
    evidenceText: typeof parsed.evidenceText === 'string' ? parsed.evidenceText : null,
  };
}

function normalizeCitations(raw: unknown): MessageCitation[] {
  if (!Array.isArray(raw)) return [];
  const normalized = raw
    .map((item) => normalizeCitation(item))
    .filter(Boolean) as MessageCitation[];
  return normalized.slice(0, 30);
}

function normalizeVerification(raw: unknown): MessageVerification | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const parsed = raw as Record<string, unknown>;
  if (typeof parsed.mode !== 'string') return undefined;

  return {
    mode: parsed.mode,
    is_true: parsed.is_true === true,
    requires_verification: parsed.requires_verification === true,
    failed_checks: Array.isArray(parsed.failed_checks)
      ? parsed.failed_checks.map((item) => String(item)).slice(0, 20)
      : [],
    citation_count: Number.isFinite(Number(parsed.citation_count)) ? Number(parsed.citation_count) : 0,
    operation_count: Number.isFinite(Number(parsed.operation_count)) ? Number(parsed.operation_count) : 0,
    verified_at: typeof parsed.verified_at === 'string' ? parsed.verified_at : undefined,
    policy: parsed.policy === 'strict' || parsed.policy === 'advisory' || parsed.policy === 'none'
      ? parsed.policy
      : undefined,
    blocking_failure: parsed.blocking_failure === true,
    mixed_intent: parsed.mixed_intent === true,
    source_status: parsed.source_status === 'source_backed'
      || parsed.source_status === 'source_gap'
      || parsed.source_status === 'not_applicable'
      ? parsed.source_status
      : undefined,
    user_summary: typeof parsed.user_summary === 'string' ? parsed.user_summary : undefined,
    legacy_would_block: parsed.legacy_would_block === true,
  };
}

function normalizeArtifact(raw: unknown): ArtifactPayload | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const artifact = raw as Partial<ArtifactPayload>;
  if (artifact.type !== 'artifact' || typeof artifact.title !== 'string' || !Array.isArray(artifact.data)) {
    return undefined;
  }
  return {
    ...artifact,
    data: artifact.data,
    rowCount: Number.isFinite(Number(artifact.rowCount)) ? Number(artifact.rowCount) : artifact.data.length,
  } as ArtifactPayload;
}

function normalizeArtifacts(raw: unknown): ArtifactPayload[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeArtifact).filter(Boolean).slice(0, 6) as ArtifactPayload[];
}

function buildFeedbackContext(messages: Message[]) {
  const items = messages
    .filter((m) => m.role === 'assistant' && m.feedback && (m.feedback.rating || m.feedback.comment))
    .slice(-8)
    .map((m) => ({
      messageId: m.id,
      rating: m.feedback?.rating || null,
      comment: m.feedback?.comment || null,
      submittedAt: m.feedback?.submittedAt || null,
    }));

  return items.length > 0 ? { items } : null;
}

function buildProcessingMessage(userMessage: string): string {
  const lower = String(userMessage || '').toLowerCase();

  if (/\b(analy[sz]e|coach|scoutpad|review|grade|deep dive)\b/.test(lower)) {
    return 'Request received. Running SCOUTPAD analysis...';
  }
  if (/\b(report|dashboard|pipeline|forecast|summary|summari[sz]e)\b/.test(lower)) {
    return 'Request received. Pulling CRM data and preparing analysis...';
  }
  if (/\b(create|add|update|log|record|save)\b/.test(lower)) {
    return 'Request received. Processing your CRM update...';
  }
  return 'Request received. Thinking...';
}

function buildPendingDraftEmailContext(
  userPrompt: string,
  assistantResponse: string,
  evidence = ''
): PendingDraftEmailContext | null {
  const response = String(assistantResponse || '');
  const searchable = `${response}\n${String(evidence || '')}`;
  if (
    !/\bdraft_email\b/i.test(searchable)
    || !/(need a recipient email before it becomes actionable|recipient email|reply with the recipient)/i.test(searchable)
  ) {
    return null;
  }

  return {
    type: 'draft_email_missing_recipient',
    userPrompt,
    assistantPrompt: response,
  };
}

async function readFunctionInvokeError(error: any): Promise<string> {
  const fallback = error?.message || 'Visualization function failed';
  const response = error?.context;

  if (response && typeof response.clone === 'function') {
    try {
      const body = await response.clone().json();
      const message = body?.error || body?.details || body?.message;
      if (message) return String(message);
    } catch {
      // Fall through to text/fallback parsing.
    }

    try {
      const text = await response.clone().text();
      if (text) return text.slice(0, 300);
    } catch {
      // Fall through to generic error.
    }
  }

  if (fallback.includes('Edge Function returned a non-2xx status code')) {
    return 'The analytics function returned an error but did not expose details to the client.';
  }

  return fallback;
}

async function generateVisualArtifactsForChat(
  message: string,
  sessionId: string,
  organizationId: string
): Promise<{ artifacts: ArtifactPayload[]; failures: number }> {
  const prompts = buildVisualArtifactPrompts(message).slice(0, 4);
  const results = await Promise.allSettled(prompts.map(async (prompt) => {
    const { data, error } = await supabase.functions.invoke<GenerateArtifactResponse>(
      'generate-analytics-artifact',
      { body: { prompt, sessionId, organizationId } }
    );

    if (error) throw new Error(await readFunctionInvokeError(error));
    if (!data?.success || !data.artifact) {
      const validation = data?.validationErrors?.length ? ` (${data.validationErrors.join(', ')})` : '';
      throw new Error(`${data?.error || 'No visualization returned'}${validation}`);
    }
    return data.artifact;
  }));

  const artifacts = results
    .filter((result): result is PromiseFulfilledResult<ArtifactPayload> => result.status === 'fulfilled')
    .map((result) => result.value);

  if (artifacts.length === 0) {
    const firstError = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
    throw new Error(firstError?.reason?.message || 'No visualizations could be generated');
  }

  return { artifacts, failures: results.length - artifacts.length };
}

export const useChat = () => {
  const { user } = useAuth();
  const { currentOrganization, loading: orgLoading, openSelector } = useOrganizationAccess();
  const { activeSessionId, setActiveSession } = useChatPanelStore();

  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deferredMessage, setDeferredMessage] = useState<string | null>(null);
  const sessionRestoredRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Single source of truth: ref for synchronous lock, state for UI
  const processingLockRef = useRef(false);
  const messageQueueRef = useRef<string[]>([]);
  const currentSessionIdRef = useRef<string | null>(null);

  // Acquire lock atomically
  const acquireProcessingLock = useCallback(() => {
    if (processingLockRef.current) return false;
    processingLockRef.current = true;
    setIsProcessing(true);
    return true;
  }, []);

  // Release lock atomically
  const releaseProcessingLock = useCallback(() => {
    processingLockRef.current = false;
    setIsProcessing(false);
  }, []);

  const organizationId = currentOrganization?.organization_id;
  
  // Entity context for cross-message pronoun resolution (now with persistence!)
  const {
    entityContext,
    updateContext: updateEntityContext,
    clearPrimaryEntity,
    clearContext: clearEntityContext,
    isLoading: isEntityContextLoading,
    isRestored: isEntityContextRestored
  } = useEntityContext({
    sessionId: currentSession?.id || activeSessionId || null,
    organizationId: organizationId || null
  });

  // FIX: Use ref to avoid stale closure in sendMessage callback
  // This ensures we always send the latest context, not a captured snapshot
  const entityContextRef = useRef(entityContext);
  const pendingDraftEmailRef = useRef<PendingDraftEmailContext | null>(null);
  useEffect(() => {
    entityContextRef.current = entityContext;
    console.log('🔗 [useChat] Entity context updated in ref:', {
      hasContext: !!entityContext,
      deals: entityContext?.referencedEntities?.deals?.length || 0,
      accounts: entityContext?.referencedEntities?.accounts?.length || 0,
      primaryEntity: entityContext?.primaryEntity?.name || 'none'
    });
  }, [entityContext]);

  // Track current session ID via ref for stale-response detection
  useEffect(() => {
    currentSessionIdRef.current = currentSession?.id || null;
  }, [currentSession?.id]);

  // Deterministic ready state - only true when all dependencies are loaded
  const isReady = !!user && !!organizationId && !orgLoading;

  // Load all sessions
  const loadSessions = useCallback(async () => {
    if (!user || !organizationId) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (err: any) {
      console.error('Load sessions error:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [user, organizationId]);

  // Load messages for a session
  const loadSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });
      
      if (error) throw error;
      
      const formattedMessages: Message[] = (data || []).map((msg) => {
        const metadata = msg.metadata && typeof msg.metadata === 'object'
          ? (msg.metadata as Record<string, unknown>)
          : null;
        const artifacts = normalizeArtifacts(metadata?.artifacts);
        const artifact = normalizeArtifact(metadata?.artifact) || artifacts[0];
        const schedulePreview = metadata?.schedulePreview as SchedulePreviewPayload | undefined;
        const emailDraft = metadata?.emailDraft as EmailDraftPayload | undefined;

        return {
          id: msg.id,
          content: msg.content,
          role: msg.message_type === 'user' ? 'user' : 'assistant',
          timestamp: new Date(msg.created_at),
          session_id: msg.session_id,
          created_at: msg.created_at,
          feedback: normalizeFeedback(metadata?.feedback),
          citations: normalizeCitations(metadata?.citations),
          verification: normalizeVerification(metadata?.verification),
          artifact,
          artifacts: artifacts.length > 1 ? artifacts : undefined,
          schedulePreview: schedulePreview || undefined,
          emailDraft: emailDraft || undefined,
        };
      });
      
      setMessages(formattedMessages);
    } catch (err) {
      console.error('Load messages error:', err);
    }
  }, []);

  // Generate a short title from the first user message
  const generateSessionTitle = (message: string): string => {
    const trimmed = message.trim();
    // Remove imported document prefixes
    const cleaned = trimmed
      .replace(/^\[(?:Imported from|Pasted notes|OCR extracted from).*?\]\s*/i, '')
      .trim();
    if (!cleaned) return `Chat ${new Date().toLocaleTimeString()}`;
    // Capitalize first letter, truncate to 50 chars
    const title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return title.length > 50 ? title.slice(0, 47) + '...' : title;
  };

  const rememberActiveSession = useCallback((sessionId: string | null) => {
    setActiveSession(sessionId);
    if (!user?.id || !organizationId) return;
    if (sessionId) {
      writeStoredActiveChatSession(user.id, organizationId, sessionId);
    } else {
      clearStoredActiveChatSession(user.id, organizationId);
    }
  }, [organizationId, setActiveSession, user?.id]);

  const restoreActiveSession = useCallback(async (): Promise<ChatSession | null> => {
    if (!user?.id || !organizationId) return null;

    const storedSessionId = activeSessionId || readStoredActiveChatSession(user.id, organizationId);
    if (!storedSessionId) return null;

    const cutoffIso = new Date(Date.now() - CHAT_CONTEXT_WINDOW_MS).toISOString();
    const { data: session } = await supabase
      .from('chat_sessions')
      .select('*')
      .eq('id', storedSessionId)
      .eq('organization_id', organizationId)
      .eq('user_id', user.id)
      .gte('updated_at', cutoffIso)
      .maybeSingle();

    if (session && isChatSessionWithinMemoryWindow(session.updated_at || session.created_at)) {
      setCurrentSession(session);
      currentSessionIdRef.current = session.id;
      rememberActiveSession(session.id);
      await loadSessionMessages(session.id);
      return session;
    }

    rememberActiveSession(null);
    return null;
  }, [activeSessionId, loadSessionMessages, organizationId, rememberActiveSession, user?.id]);

  // Create new session
  const createSession = useCallback(async (firstMessage: string) => {
    if (!user || !organizationId) return null;

    try {
      const { data: session, error } = await supabase
        .from('chat_sessions')
        .insert({
          title: generateSessionTitle(firstMessage),
          organization_id: organizationId,
          user_id: user.id
        })
        .select()
        .single();

      if (error) throw error;

      setCurrentSession(session);
      currentSessionIdRef.current = session.id;
      rememberActiveSession(session.id);
      setSessions(prev => [session, ...prev]);

      return session;
    } catch (err: any) {
      console.error('Create session error:', err);
      setError(err.message);
      return null;
    }
  }, [user, organizationId, rememberActiveSession]);

  // Track consecutive errors for cascade detection
  const consecutiveErrorsRef = useRef(0);

  // Add message to UI
  const addMessage = useCallback((content: string, role: 'user' | 'assistant', isLoading = false, opts?: { isError?: boolean; failedUserMessage?: string }) => {
    const newMessage: Message = {
      id: `temp-${Date.now()}-${Math.random()}`,
      content,
      role,
      timestamp: new Date(),
      isLoading,
      isError: opts?.isError,
      failedUserMessage: opts?.failedUserMessage,
      session_id: currentSession?.id
    };

    setMessages(prev => [...prev, newMessage]);
    return newMessage.id;
  }, [currentSession]);

  // Remove message by ID
  const removeMessage = useCallback((id: string) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  const extractDealLinksFromResponse = useCallback((data: any, actionPayload?: MessageAction): DealLink[] => {
    const links = new Map<string, DealLink>();

    // 1) Action payload deal (single-deal analysis, coaching, etc.)
    const actionDeal = actionPayload?.deal;
    if (actionDeal?.id && actionDeal?.name) {
      links.set(actionDeal.id, {
        id: actionDeal.id,
        name: actionDeal.name,
        stage: actionDeal.stage ?? null,
        amount: actionDeal.amount ?? null,
      });
    }

    // 2) Explicit deal search results from current response
    const crmOps = Array.isArray(data?.crmOperations) ? data.crmOperations : [];
    for (const op of crmOps) {
      if (op?.tool !== 'search_crm') continue;
      const entityType = String(op?.result?.entity_type || '').toLowerCase();
      if (entityType !== 'deal' && entityType !== 'deals') continue;

      const results = Array.isArray(op?.result?.results) ? op.result.results : [];
      for (const row of results.slice(0, 5)) {
        if (!row?.id || !row?.name) continue;
        links.set(row.id, {
          id: row.id,
          name: row.name,
          stage: row.stage ?? null,
          amount: typeof row.amount === 'number' ? row.amount : null,
        });
      }
    }

    // 3) Explicit deal links from backend meta (deterministic fast paths)
    const metaDealLinks = Array.isArray(data?.meta?.dealLinks) ? data.meta.dealLinks : [];
    for (const d of metaDealLinks) {
      if (!d?.id || !d?.name) continue;
      links.set(d.id, {
        id: d.id,
        name: d.name,
        stage: d.stage ?? null,
        amount: typeof d.amount === 'number' ? d.amount : null,
      });
    }

    return Array.from(links.values()).slice(0, 5);
  }, []);

  const extractAccountLinksFromResponse = useCallback((data: any): AccountLink[] => {
    const links = new Map<string, AccountLink>();

    const crmOps = Array.isArray(data?.crmOperations) ? data.crmOperations : [];
    for (const op of crmOps) {
      const tool = String(op?.tool || '');
      const result = op?.result || {};

      if ((tool === 'create_account' || tool === 'update_account') && result?.id && result?.name) {
        links.set(String(result.id), {
          id: String(result.id),
          name: String(result.name),
        });
      }

      if (tool === 'search_crm') {
        const entityType = String(result?.entity_type || '').toLowerCase();
        if (entityType !== 'account' && entityType !== 'accounts') continue;
        const rows = Array.isArray(result?.results) ? result.results : [];
        for (const row of rows.slice(0, 5)) {
          if (!row?.id || !row?.name) continue;
          links.set(String(row.id), {
            id: String(row.id),
            name: String(row.name),
          });
        }
      }
    }

    return Array.from(links.values()).slice(0, 5);
  }, []);

  const extractRecordActionsFromResponse = useCallback((data: any): RecordActionLink[] => {
    const actions = new Map<string, RecordActionLink>();
    const crmOps = Array.isArray(data?.crmOperations) ? data.crmOperations : [];

    const inferAction = (tool: string, result: any): RecordActionLink['action'] | null => {
      if (result?.action === 'deleted' || tool.startsWith('delete_')) return 'deleted';
      if (result?.action === 'completed' || tool === 'complete_task') return 'completed';
      if (tool === 'create_activity') return 'logged';
      if (tool.startsWith('create_')) return 'created';
      if (tool.startsWith('update_')) return 'updated';
      return null;
    };

    const inferEntityType = (tool: string, result: any): RecordActionLink['entityType'] | null => {
      const rawEntity = String(result?.entity || '').toLowerCase();
      if (rawEntity === 'deal' || rawEntity === 'account' || rawEntity === 'contact' || rawEntity === 'task' || rawEntity === 'activity') {
        return rawEntity as RecordActionLink['entityType'];
      }
      if (tool.includes('deal')) return 'deal';
      if (tool.includes('account')) return 'account';
      if (tool.includes('contact')) return 'contact';
      if (tool.includes('task')) return 'task';
      if (tool.includes('activity')) return 'activity';
      return null;
    };

    const buildLabel = (entityType: RecordActionLink['entityType'], action: RecordActionLink['action'], name: string) => {
      if (action === 'deleted') return `View change log: ${name}`;
      if (entityType === 'deal') return `Open opportunity: ${name}`;
      if (entityType === 'account') return `Open account: ${name}`;
      if (entityType === 'contact') return `Open contact: ${name}`;
      if (entityType === 'task') return `Open tasks: ${name}`;
      if (entityType === 'activity') return `Open activities: ${name}`;
      return `Open ${name}`;
    };

    for (const op of crmOps) {
      const tool = String(op?.tool || '').trim().toLowerCase();
      const result = op?.result || {};
      if (!tool || result?.error || result?._needsInput || result?._needsConfirmation || result?.success === false) continue;

      const action = inferAction(tool, result);
      const entityType = inferEntityType(tool, result);
      const id = String(result?.id || result?.deal_id || result?.account_id || result?.contact_id || result?.task_id || result?.activity_id || '').trim();
      const name = String(
        result?.name
        || result?.full_name
        || result?.title
        || result?.deal_name
        || result?.account_name
        || result?.contact_name
        || result?.deleted_entity_name
        || ''
      ).trim();

      if (!action || !entityType || !id || !name) continue;

      const normalizedEntityType = action === 'deleted' ? 'audit' : entityType;
      const key = `${tool}:${normalizedEntityType}:${id}:${action}`;
      actions.set(key, {
        id,
        entityType: normalizedEntityType,
        action,
        name,
        label: buildLabel(normalizedEntityType, action, name),
        route: normalizedEntityType === 'audit' ? 'audit-log' : undefined,
        sourceTool: tool,
        relatedEntityId: result?.deal_id || result?.account_id || result?.contact_id || null,
      });
    }

    const metaActions = Array.isArray(data?.meta?.recordActions) ? data.meta.recordActions : [];
    for (const action of metaActions) {
      const id = String(action?.id || '').trim();
      const entityType = String(action?.entityType || '').trim() as RecordActionLink['entityType'];
      const actionType = String(action?.action || '').trim() as RecordActionLink['action'];
      const name = String(action?.name || '').trim();
      if (!id || !entityType || !actionType || !name) continue;
      const key = `meta:${entityType}:${id}:${actionType}`;
      actions.set(key, {
        id,
        entityType,
        action: actionType,
        name,
        label: String(action?.label || '').trim() || buildLabel(entityType, actionType, name),
        route: typeof action?.route === 'string' ? action.route : undefined,
        sourceTool: typeof action?.sourceTool === 'string' ? action.sourceTool : undefined,
        relatedEntityId: typeof action?.relatedEntityId === 'string' ? action.relatedEntityId : null,
      });
    }

    return Array.from(actions.values()).slice(0, 6);
  }, []);

  const hasMutationOperation = useCallback((data: any): boolean => {
    const crmOps = Array.isArray(data?.crmOperations) ? data.crmOperations : [];
    return crmOps.some((op: any) => {
      const tool = String(op?.tool || '').trim().toLowerCase();
      if (!tool) return false;
      return tool.startsWith('create_')
        || tool.startsWith('update_')
        || tool.startsWith('delete_')
        || tool === 'complete_task'
        || tool === 'enrich_contacts';
    });
  }, []);

  const inferChangedEntityTypesFromOperations = useCallback((data: any): string[] => {
    const crmOps = Array.isArray(data?.crmOperations) ? data.crmOperations : [];
    const entities = new Set<string>();

    for (const op of crmOps) {
      const tool = String(op?.tool || '').trim().toLowerCase();
      const result = op?.result || {};
      if (!tool || result?.error || result?._needsInput || result?._needsConfirmation || result?.success === false) continue;

      const rawEntity = String(result?.entity || '').trim().toLowerCase();
      if (rawEntity === 'deal') entities.add('deals');
      if (rawEntity === 'account') entities.add('accounts');
      if (rawEntity === 'contact') entities.add('contacts');
      if (rawEntity === 'task') entities.add('tasks');
      if (rawEntity === 'activity') entities.add('activities');

      if (tool.includes('deal')) entities.add('deals');
      if (tool.includes('account')) entities.add('accounts');
      if (tool.includes('contact')) entities.add('contacts');
      if (tool.includes('task')) entities.add('tasks');
      if (tool.includes('activity')) entities.add('activities');

      if (tool === 'create_deal') {
        // Deal creation can create or hydrate an account/contact as a side effect.
        entities.add('accounts');
        if (result?.contact_id || result?.contact_name) entities.add('contacts');
      }
    }

    return Array.from(entities);
  }, []);

  const extractFollowUpPromptsFromOperations = useCallback((data: any): string[] => {
    const crmOps = Array.isArray(data?.crmOperations) ? data.crmOperations : [];
    const prompts: string[] = [];
    for (const op of crmOps) {
      const prompt = op?.result?.follow_up_prompt;
      if (typeof prompt !== 'string') continue;
      const trimmed = prompt.trim();
      if (!trimmed) continue;
      if (!prompts.includes(trimmed)) prompts.push(trimmed);
    }
    return prompts.slice(0, 2);
  }, []);

  // Send message to backend using unified-chat (single LLM call with tool calling)
  const sendMessage = useCallback(async (content: string) => {
    console.log('📤 [useChat] sendMessage called:', content);
    console.log('📤 [useChat] State:', { userId: user?.id, organizationId, orgLoading, isProcessing });

    // Queue messages if already processing — prevents dropped rapid input
    // Use ref (not state) to avoid stale closure — isProcessing state lags behind re-renders
    if (processingLockRef.current) {
      console.log('📤 [useChat] Queuing message (processing in progress):', content);
      messageQueueRef.current.push(content);
      // Show the queued message in the UI immediately
      setMessages(prev => [...prev, {
        id: crypto.randomUUID(),
        content,
        role: 'user' as const,
        timestamp: new Date(),
        isLoading: false,
      }]);
      return;
    }

    if (!user?.id) {
      console.warn('⚠️ [useChat] No user ID - blocking send');
      addMessage('Please sign in to continue.', 'assistant');
      return;
    }

    if (!organizationId) {
      if (orgLoading) {
        console.log('📤 [useChat] Org still loading - deferring message');
        setDeferredMessage(content);
        // Don't set isProcessing or add message to UI here.
        // The deferred effect will call sendMessage again once the org loads,
        // which will add the message and call the backend in one pass.
        // Adding it here caused a duplicate because sendMessage adds it again.
        return;
      } else {
        console.warn('⚠️ [useChat] No organization ID');
        addMessage('Please select an organization to continue.', 'assistant');
        openSelector?.();
        return;
      }
    }

    // Acquire processing lock atomically — queue if already processing
    if (!acquireProcessingLock()) {
      console.log('📤 [useChat] Already processing — queueing message');
      messageQueueRef.current.push(content);
      return;
    }

    // Create abort controller for this request
    abortControllerRef.current = new AbortController();

    // Show user message IMMEDIATELY with a stable UUID (used for both UI and DB persistence).
    // This ensures the user sees their message instantly AND it can be persisted with the same ID.
    const userMessageId = crypto.randomUUID();
    const traceId = `chat_${crypto.randomUUID()}`;
    console.log('📤 [useChat] Adding user message immediately:', content);
    const userMsg: Message = {
      id: userMessageId,
      content,
      role: 'user',
      timestamp: new Date(),
      isLoading: false,
      session_id: currentSession?.id
    };
    setMessages(prev => [...prev, userMsg]);

    // Create session if none exists
    let session = currentSession;
    if (!session) {
      session = await restoreActiveSession();
    }
    if (!session) {
      session = await createSession(content);
      if (!session) {
        addMessage('Failed to create chat session. Please try again.', 'assistant', false, { isError: true, failedUserMessage: content });
        releaseProcessingLock();
        // Drain queue so queued messages aren't silently dropped
        if (messageQueueRef.current.length > 0) {
          const next = messageQueueRef.current.shift()!;
          setTimeout(() => sendMessage(next), 100);
        }
        return;
      }
      setMessages(prev => prev.map(m => (
        m.id === userMessageId ? { ...m, session_id: session!.id } : m
      )));
    } else {
      rememberActiveSession(session.id);
    }

    // PERSIST user message to DB IMMEDIATELY — prevents loss if user navigates during AI processing
    try {
      await supabase.functions.invoke('conversation-logger', {
        body: {
          userMessage: content,
          userMessageId,
          sessionId: session.id,
          userId: user.id
        }
      });
      console.log('💾 User message persisted immediately');
    } catch (persistError) {
      console.warn('⚠️ Failed to persist user message immediately:', persistError);
    }

    console.log('📤 [useChat] Adding loading indicator');
    const loadingId = addMessage(buildProcessingMessage(content), 'assistant', true);

    // 30-second safety timeout — releases lock and notifies user
    const timeoutId = setTimeout(() => {
      console.warn('[useChat] Processing timeout — releasing lock');
      releaseProcessingLock();
      removeMessage(loadingId);
      addMessage(
        "That took longer than expected. Your request may still be processing — check your data in a moment.",
        'assistant'
      );
    }, PROCESSING_TIMEOUT_MS);

    // Get page context from the unified store (set by BottomChatBar)
    const { pendingContext } = useUnifiedChatStore.getState();
    const feedbackContext = buildFeedbackContext(messages);

    try {
      if (isVisualAnalyticsRequest(content)) {
        try {
          const { artifacts, failures } = await generateVisualArtifactsForChat(content, session.id, organizationId);
          removeMessage(loadingId);

          const managerReview = buildDashboardManagerFollowUp(content, artifacts);
          const response = `${summarizeVisualArtifacts(artifacts)}${failures > 0 ? `\n\n${failures} visualization${failures === 1 ? '' : 's'} could not be generated from the available data.` : ''}${managerReview}`;
          const aiMessageId = crypto.randomUUID();
          const provenance: MessageProvenance = {
            source: 'artifact',
            recordsFound: artifacts.reduce((sum, artifact) => sum + (artifact.rowCount || 0), 0),
            searchPerformed: true,
            entityType: 'analytics',
            confidence: 'high',
            searchQuery: content,
            timestamp: new Date().toISOString(),
            analysisMode: 'general',
          };
          const primaryArtifact = artifacts[0];

          setMessages(prev => [...prev, {
            id: aiMessageId,
            content: response,
            role: 'assistant',
            timestamp: new Date(),
            session_id: session.id,
            provenance,
            artifact: primaryArtifact,
            artifacts: artifacts.length > 1 ? artifacts : undefined,
          }]);

          await supabase.functions.invoke('conversation-logger', {
            body: {
              aiResponse: response,
              aiMessageId,
              sessionId: session.id,
              userId: user.id,
              aiMetadata: {
                artifact: primaryArtifact,
                artifacts,
                provenance,
                execution: {
                  taskClass: 'analytics',
                  needsTools: true,
                  retrievalPath: 'visual_artifact',
                  deterministicPathUsed: true,
                },
              },
            }
          });
          return;
        } catch (visualError: any) {
          removeMessage(loadingId);
          const message = visualError?.message || 'Unknown visualization error';
          addMessage(`I could not generate that visualization: ${message}`, 'assistant', false, { isError: true, failedUserMessage: content });
          return;
        }
      }

      // Build conversation history for context — filter out error messages to prevent cascade
      const conversationHistory = messages
        .filter(m => !m.isError && !m.isLoading)
        .slice(-15)
        .map(m => ({
          role: m.role,
          content: m.content
        }));
      const pendingDraftEmail = pendingDraftEmailRef.current;
      if (
        pendingDraftEmail
        && /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(content)
        && !conversationHistory.some((m) => /need a recipient email before it becomes actionable/i.test(m.content))
      ) {
        conversationHistory.push(
          { role: 'user', content: pendingDraftEmail.userPrompt },
          { role: 'assistant', content: pendingDraftEmail.assistantPrompt },
        );
      }

      // Log session check for debugging confirmation flow
      console.log('📤 [useChat] Session check:', {
        hasSession: !!session,
        sessionId: session?.id,
        messageContent: content.substring(0, 50)
      });

      // Log what we're about to send for debugging
      const ctxSnapshot = entityContextRef.current;
      console.log('📤 [useChat] Entity context summary:', {
        hasContext: !!ctxSnapshot,
        deals: ctxSnapshot?.referencedEntities?.deals?.length || 0,
        accounts: ctxSnapshot?.referencedEntities?.accounts?.length || 0,
        primaryEntity: ctxSnapshot?.primaryEntity?.name || 'none'
      });

      // ====== SINGLE UNIFIED CALL ======
      // The unified-chat handler does ALL the work: intent, extraction, CRM ops, response
      const activeSalesRole = useActiveViewRoleStore.getState().activeViewRole;

      // Extract invoke into a helper for retry — with 60s timeout
      const invokeWithTimeout = async () => {
        const timeoutMs = 60000; // 60 seconds
        const controller = abortControllerRef.current;
        const timeoutId = setTimeout(() => controller?.abort(), timeoutMs);
        try {
          return await supabase.functions.invoke('unified-chat', {
            headers: {
              'x-trace-id': traceId,
            },
            body: {
              message: content,
              organizationId,
              sessionId: session.id,
              requestId: userMessageId,
              idempotencyKey: userMessageId,
              traceId,
              conversationHistory,
              pendingWorkflow: pendingDraftEmail || null,
              pageContext: pendingContext?.pageContext || null,
              // FIX: Use ref to get latest context, avoiding stale closure
              entityContext: entityContextRef.current,
              salesRole: activeSalesRole,
              feedbackContext,
            }
          });
        } finally {
          clearTimeout(timeoutId);
        }
      };

      let { data, error } = await invokeWithTimeout();

      // Transient error — retry once with backoff (skip auth errors)
      if (error && !(error?.message?.includes('401') || error?.status === 401)) {
        console.log('🔄 [useChat] Retrying after transient error...');
        await new Promise(r => setTimeout(r, 2000));
        // Create fresh abort controller for retry
        abortControllerRef.current = new AbortController();
        ({ data, error } = await invokeWithTimeout());
      }

      // Auth error — refresh session and retry once
      if (error && (error?.message?.includes('401') || error?.status === 401)) {
        console.log('🔐 [useChat] 401 from unified-chat, attempting session refresh...');
        try {
          const { data: refreshData, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && refreshData?.session) {
            abortControllerRef.current = new AbortController();
            ({ data, error } = await invokeWithTimeout());
          }
        } catch (refreshErr) {
          console.warn('⚠️ [useChat] Session refresh attempt failed:', refreshErr);
        }
      }

      removeMessage(loadingId);
      console.log('📤 [useChat] Unified chat response received');

      // If user started a new chat while processing, discard stale response
      if (currentSessionIdRef.current && currentSessionIdRef.current !== session.id) {
        console.log('⚠️ [useChat] Session changed during processing — discarding stale response');
        return;
      }

      if (error) {
        console.error('❌ [useChat] Unified chat error:', error);
        consecutiveErrorsRef.current++;

        let errorMessage: string;
        const errMsg = error?.message || '';
        if (error?.message?.includes('401') || error?.status === 401) {
          errorMessage = 'Your session has expired. Please refresh the page and sign in again.';
        } else if (errMsg.includes('AbortError') || errMsg.includes('aborted')) {
          errorMessage = 'The request timed out. The server may be busy — try again in a moment.';
        } else if (errMsg.includes('FunctionsFetchError') || errMsg.includes('fetch')) {
          errorMessage = 'Could not reach the server. Check your internet connection and try again.';
        } else if (errMsg.includes('500') || error?.status === 500) {
          errorMessage = 'The server encountered an error processing your request. Try rephrasing or breaking it into simpler steps.';
        } else if (errMsg.includes('429') || error?.status === 429) {
          errorMessage = 'Too many requests. Please wait a moment before sending another message.';
        } else if (consecutiveErrorsRef.current >= 3) {
          errorMessage = 'Multiple errors in a row. Try starting a New Chat, or rephrase your question.';
        } else {
          errorMessage = `Something went wrong: ${errMsg.length > 100 ? errMsg.substring(0, 100) + '...' : errMsg || 'unknown error'}. Please try again.`;
        }

        addMessage(errorMessage, 'assistant', false, { isError: true, failedUserMessage: content });
        return; // finally block releases the lock
      }

      // Handle authentication errors in response
      if (data?.error === 'Authentication required' || data?.error === 'Invalid authentication') {
        console.error('❌ [useChat] Auth error in response:', data.error);
        consecutiveErrorsRef.current++;
        addMessage('Your session has expired. Please refresh the page and log in again.', 'assistant', false, { isError: true });
        return; // finally block releases the lock
      }

      // Reset consecutive error counter on success
      consecutiveErrorsRef.current = 0;

      const rawResponse = data?.response || 'No response received';
      const response = sanitizeAssistantMessage(rawResponse);
      const provenance = data?.provenance as MessageProvenance | undefined;
      const actionPayload = data?.action as MessageAction | undefined;
      const requiresZoomDecision = data?.requiresZoomDecision;
      const zoomDeal = data?.deal;
      const zoomAccountContext = data?.accountContext;
      const zoomOptions = data?.options;
      
      // Extract entity selection for disambiguation
      const entitySelection = data?.entitySelection as EntitySelectionData | undefined;
      
      // Build zoom decision object if present
      const zoomDecision: ZoomDecision | undefined = requiresZoomDecision ? {
        requiresZoomDecision: true,
        deal: zoomDeal,
        accountContext: zoomAccountContext,
        options: zoomOptions
      } : undefined;
      
      // Determine if this requires clarification (zoom or entity selection)
      const needsClarification = zoomDecision || entitySelection;
      
      // Extract suggested tasks from coaching recommendations
      const suggestedTasks = data?.meta?.suggestedTasks as SuggestedTasksPayload | undefined;

      // Extract scheduling slots from check_availability tool
      const schedulingSlots = data?.meta?.schedulingSlots as SchedulingSlotsPayload | undefined;

      // Extract scope upgrade prompt from send_scheduling_email tool
      const needsScopeUpgrade = data?.meta?.needsScopeUpgrade as ScopeUpgradePayload | undefined;

      // Extract email draft from draft_email tool
      const emailDraft = data?.meta?.emailDraft as EmailDraftPayload | undefined;
      if (emailDraft) pendingDraftEmailRef.current = null;

      // Extract scheduling preview from schedule_meeting tool.
      const schedulePreview = data?.meta?.schedulePreview as SchedulePreviewPayload | undefined;
      const pendingDraftOp = (Array.isArray(data?.crmOperations) ? data.crmOperations : []).find((op: any) => (
        op?.tool === 'draft_email'
        && op?.result?._needsInput
        && op?.result?.clarification_type === 'missing_recipient_email'
      ));
      const pendingDraftContext = buildPendingDraftEmailContext(
        content,
        pendingDraftOp?.result?.message
          ? `Action status:\n- draft_email: ${pendingDraftOp.result.message}`
          : response,
        JSON.stringify({
          operations: data?.crmOperations || [],
          meta: data?.meta || {},
        })
      );
      if (pendingDraftContext) {
        pendingDraftEmailRef.current = pendingDraftContext;
      }
      const dealLinks = extractDealLinksFromResponse(data, actionPayload);
      const accountLinks = extractAccountLinksFromResponse(data);
      const recordActions = extractRecordActionsFromResponse(data);
      const mutationFlow = hasMutationOperation(data);
      const followUpPrompts = extractFollowUpPromptsFromOperations(data);
      const responseWithFollowUp = (() => {
        if (followUpPrompts.length === 0) return response;
        const additions = followUpPrompts.filter((prompt) => !response.toLowerCase().includes(prompt.toLowerCase()));
        if (additions.length === 0) return response;
        return `${response}\n\n${additions.join('\n')}`.trim();
      })();
      const citations = normalizeCitations(data?.citations);
      const verification = normalizeVerification(data?.verification);
      const effectiveVerification = mutationFlow ? undefined : verification;

      // Add message with provenance data, action, zoom decision, and entity selection
      const aiMessageId = crypto.randomUUID();
      const newMessage: Message = {
        id: aiMessageId,
        content: responseWithFollowUp,
        role: 'assistant',
        timestamp: new Date(),
        session_id: session.id,
        provenance: needsClarification ? { ...provenance, source: 'clarification_needed' as const, confidence: 'pending_consent' } : provenance,
        action: actionPayload,
        zoomDecision,
        entitySelection,
        suggestedTasks: suggestedTasks || undefined,
        schedulingSlots: schedulingSlots || undefined,
        needsScopeUpgrade: needsScopeUpgrade || undefined,
        emailDraft: emailDraft || undefined,
        schedulePreview: schedulePreview || undefined,
        recordActions: recordActions.length > 0 ? recordActions : undefined,
        dealLinks: dealLinks.length > 0 ? dealLinks : undefined,
        accountLinks: accountLinks.length > 0 ? accountLinks : undefined,
        citations: !mutationFlow && citations.length > 0 ? citations : undefined,
        verification: effectiveVerification,
      };
      setMessages(prev => [...prev, newMessage]);

      // 🎯 HANDLE UI ACTIONS from AI response
      if (actionPayload?.type === 'open_coaching_dialog' && actionPayload.deal) {
        console.log('🎯 [useChat] Opening coaching dialog for deal:', actionPayload.deal.name);
        setTimeout(() => {
          const { openCoachingDialog } = useDialogStore.getState();
          openCoachingDialog(actionPayload.deal);
        }, 100);
      }

      // 🎯 HANDLE OPEN_DEAL_DIALOG actions
      if (actionPayload?.type === 'open_deal_dialog' && actionPayload.deal?.id) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('open-deal-dialog', {
            detail: { dealId: actionPayload.deal.id }
          }));
        }, 100);
      }

      // 🎨 HANDLE NAVIGATE_TO actions (e.g., Slide Studio)
      if (actionPayload?.type === 'navigate_to' && actionPayload.route) {
        console.log('🎯 [useChat] Navigating to:', actionPayload.route, actionPayload.payload);
        setTimeout(() => {
          useUIStore.getState().actions.setCurrentView(actionPayload.route!);
          // Dispatch context event for the target view (e.g., open-slide-studio)
          if (actionPayload.route === 'slides' && actionPayload.payload) {
            setTimeout(() => {
              window.dispatchEvent(new CustomEvent('open-slide-studio', {
                detail: actionPayload.payload
              }));
            }, 200);
          }
        }, 100);
      }

      // 🚀 FAST-PATH CACHE INVALIDATION
      console.log('🔄 [Sync] Response meta:', { 
        hasMeta: !!data?.meta, 
        hasIntent: !!data?.meta?.intent,
        intent: data?.meta?.intent,
        crmOpsCount: data?.crmOperations?.length || 0
      });

      const intentMeta = data?.meta?.intent;
      const hasLegacyMutationIntent = !!(intentMeta?.action && intentMeta?.entity && intentMeta?.id);

      if (hasLegacyMutationIntent) {
        const { action, entity, id } = intentMeta;

        console.log(`🔄 [Sync] Fast-path triggered: ${action} ${entity}:${id}`);
        console.log(`🔄 [Sync] Cache key to invalidate: ['crm', '${entity}', '${organizationId}']`);

        if (action === 'create' || action === 'update') {
          console.log(`🔄 [Sync] Invalidating queries for ${entity}...`);
          
          queryClient.invalidateQueries({
            queryKey: ['crm', entity, organizationId],
            refetchType: 'all'
          });
          
          console.log(`🔄 [Sync] Invalidation dispatched for ${entity}`);

          // Also invalidate accounts when deals created (may create account as side effect)
          if (entity === 'deals') {
            queryClient.invalidateQueries({
              queryKey: ['crm', 'accounts', organizationId],
              refetchType: 'all'
            });
            console.log(`🔄 [Sync] Cascade invalidation: accounts (deal side-effect)`);
          }
          
          // Emit event for realtime sync
          if ((window as any).crmEventBus) {
            (window as any).crmEventBus.emitEntityCreated(entity, { id }, 'chat');
            console.log(`🔄 [Sync] CRM Event Bus notified: ${entity}:${id}`);
          } else {
            console.warn(`🔄 [Sync] CRM Event Bus NOT available on window`);
          }
        }

        if (action === 'delete') {
          console.log(`🔄 [Sync] Removing query for deleted entity: ${entity}:${id}`);
          queryClient.removeQueries({ queryKey: ['crm', entity, id] });
          queryClient.invalidateQueries({
            queryKey: ['crm', entity, organizationId],
            refetchType: 'all'
          });
          console.log(`🔄 [Sync] Delete invalidation complete for ${entity}`);
        }
      }

      // Handle batch save cache invalidation (from extraction flow)
      if (data?.meta?.createdEntities) {
        const { accounts, deals, contacts, tasks, dealId, linkedContacts } = data.meta.createdEntities;
        console.log('🔄 [useChat] Batch save detected, invalidating caches:', { accounts, deals, contacts, tasks, dealId });

        if (accounts?.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['crm', 'accounts', organizationId], refetchType: 'all' });
        }
        if (deals?.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['crm', 'deals', organizationId], refetchType: 'all' });
        }
        if (contacts?.length > 0 || linkedContacts?.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['crm', 'contacts', organizationId], refetchType: 'all' });
        }
        if (tasks?.length > 0) {
          queryClient.invalidateQueries({ queryKey: ['crm', 'tasks', organizationId], refetchType: 'all' });
        }

        // Invalidate deal-specific contact queries so the deal detail page refreshes
        if (dealId && (contacts?.length > 0 || linkedContacts?.length > 0)) {
          queryClient.invalidateQueries({ queryKey: ['deal-contacts', dealId], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['deal-contact-history', dealId], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['available-contacts', dealId], refetchType: 'all' });
          console.log(`🔄 [useChat] Invalidated deal-contacts for deal ${dealId}`);
        }

        // Invalidate deal notes and source documents so the deal detail tabs refresh
        if (dealId) {
          queryClient.invalidateQueries({ queryKey: ['deal-notes', dealId], refetchType: 'all' });
          queryClient.invalidateQueries({ queryKey: ['source-documents', dealId], refetchType: 'all' });
          console.log(`🔄 [useChat] Invalidated deal-notes and source-documents for deal ${dealId}`);
        }
      }

      const operationChangedEntities = inferChangedEntityTypesFromOperations(data);
      if (operationChangedEntities.length > 0) {
        console.log('🔄 [useChat] CRM operation invalidation:', operationChangedEntities);
        for (const entityType of operationChangedEntities) {
          queryClient.invalidateQueries({ queryKey: ['crm', entityType, organizationId], refetchType: 'all' });
          crmEventBus.emitAnalyticsInvalidate(entityType as any);
        }
      }
      
      if (intentMeta?.classification) {
        console.log('🧭 [Intent] Classification metadata received:', {
          classification: intentMeta.classification,
          classificationSource: intentMeta.classificationSource,
          confidence: intentMeta.confidence,
          retrievalPath: intentMeta.retrievalPath,
          rolloutMode: intentMeta.rolloutMode,
        });
      }

      if (!intentMeta && !data?.meta?.createdEntities) {
        // Log when NO intent is present but CRM operations happened
        if (data?.crmOperations?.length > 0) {
          console.warn(`🔄 [Sync] ⚠️ CRM operations occurred but NO meta.intent returned!`, {
            operations: data.crmOperations.map((op: any) => ({
              tool: op.tool,
              hasResultId: !!op.result?.id
            }))
          });
        }
      }

      // 🔗 STORE ENTITY CONTEXT for cross-message pronoun resolution (now persisted!)
      console.log('🔗 [Context] Response meta:', JSON.stringify(data?.meta, null, 2));
      if (data?.meta?.entityContext) {
        const responseContext = data.meta.entityContext as EntityContextMetadata;
        console.log('🔗 [Context] Received entity context from backend:', JSON.stringify(responseContext, null, 2));
        updateEntityContext(responseContext);

        console.log('🔗 [Context] Entity context updated:', {
          deals: responseContext.referencedEntities?.deals?.length || 0,
          accounts: responseContext.referencedEntities?.accounts?.length || 0,
          primaryEntity: responseContext.primaryEntity?.name
        });
      } else {
        console.warn('🔗 [Context] ⚠️ No entityContext in response meta! data.meta:', data?.meta);
      }

      // Handle topic shift — clear primary entity if backend signals it
      if (data?.meta?.clearPrimary) {
        console.log('🔗 [Context] Topic shift detected — clearing primary entity');
        clearPrimaryEntity();
      }

      // Persist AI response to DB (user message was already persisted immediately above)
      if (!data?.meta?.skipClientPersist) {
        try {
          const aiMetadata = {
            verification,
            citations,
            tokenUsage: data?.provenance?.tokenUsage || null,
            aiRuntime: data?.meta?.aiRuntime || null,
            intent: data?.meta?.intent || null,
            execution: data?.meta?.execution || null,
            provenance: data?.provenance || null,
            queryAssist: data?.meta?.queryAssist || null,
          };
          await supabase.functions.invoke('conversation-logger', {
            body: {
              aiResponse: responseWithFollowUp,
              aiMessageId,
              sessionId: session.id,
              userId: user.id,
              aiMetadata,
            }
          });
          console.log('💾 AI response persisted to database');
        } catch (logError) {
          console.warn('⚠️ Failed to persist AI response:', logError);
        }
      } else {
        console.log('💾 Skipping client persist (server already handled)');
      }

    } catch (err: any) {
      // Handle abort gracefully
      if (err.name === 'AbortError' || abortControllerRef.current?.signal.aborted) {
        console.log('🛑 Request aborted by user');
        removeMessage(loadingId);
        addMessage('Response stopped.', 'assistant');
        return;
      }
      console.error('Send message error:', err);
      consecutiveErrorsRef.current++;
      removeMessage(loadingId);
      addMessage('Connection error. Please check your internet and try again.', 'assistant', false, { isError: true, failedUserMessage: content });
    } finally {
      clearTimeout(timeoutId);
      releaseProcessingLock();
      abortControllerRef.current = null;

      // Drain message queue with 100ms debounce to prevent re-entry during state settling
      if (messageQueueRef.current.length > 0) {
        setTimeout(() => {
          const nextMessage = messageQueueRef.current.shift();
          if (nextMessage && !processingLockRef.current) {
            sendMessage(nextMessage);
          }
        }, 100);
      }
    }
  }, [user, organizationId, currentSession, createSession, addMessage, removeMessage, orgLoading, openSelector, messages, acquireProcessingLock, releaseProcessingLock, clearPrimaryEntity, rememberActiveSession, restoreActiveSession, extractDealLinksFromResponse, extractAccountLinksFromResponse, extractRecordActionsFromResponse, hasMutationOperation, inferChangedEntityTypesFromOperations, extractFollowUpPromptsFromOperations]);

  const sendEmailDraft = useCallback(async (draft: EmailDraftPayload): Promise<boolean> => {
    if (!draft?.to_email || !draft.subject) {
      addMessage("I can't send this yet because the draft is missing a recipient or subject.", 'assistant', false, { isError: true });
      return false;
    }

    if (!user?.id) {
      addMessage('Sign in before sending this email.', 'assistant', false, { isError: true });
      return false;
    }

    if (!organizationId) {
      addMessage('Select a workspace before sending this email.', 'assistant', false, { isError: true });
      openSelector?.();
      return false;
    }

    if (!acquireProcessingLock()) {
      addMessage('I am still finishing the previous request. Try sending again in a moment.', 'assistant', false, { isError: true });
      return false;
    }

    const recipientName = draft.to_name || draft.to_email;
    const userContent = `Send email draft to ${recipientName} <${draft.to_email}> with subject "${draft.subject}".`;
    let session = currentSession;
    let loadingId: string | null = null;

    try {
      if (!session) {
        session = await restoreActiveSession();
      }
      if (!session) {
        session = await createSession(userContent);
        if (!session) {
          addMessage("I couldn't start the chat session for this send. Please try again.", 'assistant', false, { isError: true });
          return false;
        }
      } else {
        rememberActiveSession(session.id);
      }

      const userMessageId = crypto.randomUUID();
      const aiMessageId = crypto.randomUUID();
      setMessages(prev => [...prev, {
        id: userMessageId,
        content: userContent,
        role: 'user',
        timestamp: new Date(),
        isLoading: false,
        session_id: session.id,
      }]);

      await supabase.functions.invoke('conversation-logger', {
        body: {
          userMessage: userContent,
          userMessageId,
          sessionId: session.id,
          userId: user.id,
        },
      }).catch((persistError) => {
        console.warn('Failed to persist email send user message:', persistError);
      });

      loadingId = addMessage('Sending the email and logging it in CRM...', 'assistant', true);
      const { data, error } = await supabase.functions.invoke('send-scheduling-email', {
        body: {
          recipientEmail: draft.to_email,
          recipientName,
          subject: draft.subject,
          plainBody: draft.body,
          dealId: draft.deal_context?.id || undefined,
          organizationId,
        },
      });
      removeMessage(loadingId);
      loadingId = null;

      const failed = !!error || data?.success === false;
      const gmailSendScope = 'https://www.googleapis.com/auth/gmail.send';
      const requiredScope = data?.requiredScope
        || (['NEEDS_GMAIL_SCOPE', 'GOOGLE_RECONNECT_REQUIRED'].includes(data?.errorCode) ? gmailSendScope : null);
      const feedback = failed ? buildEmailSendFeedback(data, error, recipientName, draft.to_email) : null;
      const responseText = failed
        ? feedback!.responseText
        : `Sent to ${recipientName} <${draft.to_email}>${data?.provider ? ` using ${data.provider}` : ''}. I logged the email activity in CRM.`;

      setMessages(prev => [...prev, {
        id: aiMessageId,
        content: responseText,
        role: 'assistant',
        timestamp: new Date(),
        isError: failed,
        session_id: session.id,
        needsScopeUpgrade: requiredScope
          ? {
              scope: requiredScope,
              message: feedback?.scopeMessage || 'Gmail send access is required before Koffey can send this email.',
            }
          : undefined,
      }]);

      await supabase.functions.invoke('conversation-logger', {
        body: {
          aiResponse: responseText,
          aiMessageId,
          sessionId: session.id,
          userId: user.id,
          crmOperations: [{ tool: 'send_scheduling_email', result: data || { error: error?.message } }],
        },
      }).catch((persistError) => {
        console.warn('Failed to persist email send assistant message:', persistError);
      });

      if (!failed) {
        queryClient.invalidateQueries({ queryKey: ['crm', 'activities', organizationId], refetchType: 'all' });
        queryClient.invalidateQueries({ queryKey: ['crm', 'contacts', organizationId], refetchType: 'all' });
        crmEventBus.emitAnalyticsInvalidate('activities' as any);
      }

      return !failed;
    } catch (err: any) {
      if (loadingId) removeMessage(loadingId);
      addMessage(`I couldn't send that email.${err?.message ? ` ${err.message}` : ' Please try again.'}`, 'assistant', false, { isError: true });
      return false;
    } finally {
      releaseProcessingLock();
    }
  }, [user?.id, organizationId, currentSession, createSession, addMessage, removeMessage, openSelector, acquireProcessingLock, releaseProcessingLock, rememberActiveSession, restoreActiveSession]);

  // Stop current message generation
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      releaseProcessingLock();
    }
  }, [releaseProcessingLock]);

  // Start new conversation
  const startNewConversation = useCallback(() => {
    // Abort any in-flight request to prevent cross-session message leak
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    // Flush message queue so old messages don't arrive in new session
    messageQueueRef.current = [];

    // Reset processing state
    releaseProcessingLock();
    consecutiveErrorsRef.current = 0;

    setCurrentSession(null);
    rememberActiveSession(null);
    pendingDraftEmailRef.current = null;
    setMessages([
      {
        id: 'welcome',
        content: 'Hi! I can help you manage your CRM. Try: "Add contact John Smith at Acme Corp"',
        role: 'assistant',
        timestamp: new Date()
      }
    ]);
    // Clear entity context on new session (now handled by hook)
    clearEntityContext();
  }, [clearEntityContext, releaseProcessingLock, rememberActiveSession]);

  // Switch to existing session
  const switchToSession = useCallback(async (session: ChatSession) => {
    setCurrentSession(session);
    currentSessionIdRef.current = session.id;
    rememberActiveSession(session.id);
    setMessages([]);
    // Entity context will auto-load from DB via useEntityContext hook
    await loadSessionMessages(session.id);
  }, [loadSessionMessages, rememberActiveSession]);

  // Delete session
  const deleteSession = useCallback(async (sessionId: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .delete()
        .eq('id', sessionId);

      if (error) throw error;
      
      setSessions(prev => prev.filter(s => s.id !== sessionId));
      
      if (currentSession?.id === sessionId) {
        startNewConversation();
      }
    } catch (err: any) {
      console.error('Delete session error:', err);
      setError(err.message);
    }
  }, [currentSession, startNewConversation]);

  // Update session title
  const updateSessionTitle = useCallback(async (sessionId: string, newTitle: string) => {
    try {
      const { error } = await supabase
        .from('chat_sessions')
        .update({ title: newTitle })
        .eq('id', sessionId);

      if (error) throw error;
      
      setSessions(prev => prev.map(s => 
        s.id === sessionId ? { ...s, title: newTitle } : s
      ));
      
      if (currentSession?.id === sessionId) {
        setCurrentSession(prev => prev ? { ...prev, title: newTitle } : null);
      }
    } catch (err: any) {
      console.error('Update title error:', err);
      setError(err.message);
    }
  }, [currentSession]);

  // Load sessions on mount
  useEffect(() => {
    if (user && organizationId) {
      loadSessions();
    }
  }, [user, organizationId, loadSessions]);

  // Restore active session on mount (prevents losing same-day chat on navigation/reload)
  useEffect(() => {
    if (!user || !organizationId || currentSession || sessionRestoredRef.current) return;
    
    const restoreSession = async () => {
      sessionRestoredRef.current = true;
      try {
        await restoreActiveSession();
      } catch (err) {
        console.error('Failed to restore session:', err);
      }
    };
    
    restoreSession();
  }, [user, organizationId, currentSession, restoreActiveSession]);

  // Persist active session ID when it changes
  useEffect(() => {
    if (currentSession?.id) {
      rememberActiveSession(currentSession.id);
    }
  }, [currentSession?.id, rememberActiveSession]);

  // Send deferred message when org becomes available
  useEffect(() => {
    if (deferredMessage && organizationId && !orgLoading) {
      const messageToSend = deferredMessage;
      setDeferredMessage(null);
      // Safety: ensure isProcessing is false so sendMessage doesn't queue
      setIsProcessing(false);
      sendMessage(messageToSend);
    }
  }, [deferredMessage, organizationId, orgLoading, sendMessage]);

  // Realtime subscription for current session — DISABLED
  // Realtime updates are turned off (config.features.realTimeUpdates = false).
  // This subscription was bypassing the feature flag by calling
  // GlobalRealtimeManager.getInstance().subscribe() directly, which:
  //   1. Created broken WebSocket channels causing errors/freezes
  //   2. Could duplicate messages already shown via local state updates
  // Chat messages are added to state directly by sendMessage(), so realtime
  // is not needed for the current user's own conversation.

  // Retry: remove the error message and the failed user message, then resend
  const retryMessage = useCallback((failedUserMessage: string, errorMessageId: string) => {
    // Remove the error message from the UI
    setMessages(prev => {
      // Remove the error message and the user message that triggered it
      const errorIdx = prev.findIndex(m => m.id === errorMessageId);
      if (errorIdx === -1) return prev;
      // The user message is typically the one right before the error
      const userMsgIdx = errorIdx - 1;
      const filtered = prev.filter((_, i) => i !== errorIdx && (userMsgIdx < 0 || i !== userMsgIdx));
      return filtered;
    });
    // Reset error counter and resend
    consecutiveErrorsRef.current = 0;
    sendMessage(failedUserMessage);
  }, [sendMessage]);

  const submitMessageFeedback = useCallback(async (
    messageId: string,
    feedback: { rating?: 'up' | 'down' | null; comment?: string }
  ) => {
    if (!user?.id) {
      throw new Error('Authentication required');
    }

    const targetMessage = messages.find((msg) => msg.id === messageId);
    const sessionId = targetMessage?.session_id || currentSession?.id;
    if (!sessionId) {
      throw new Error('Message session is not available yet');
    }

    const normalizedComment = String(feedback.comment || '').trim().slice(0, 1000);
    const normalizedRating = feedback.rating === 'up' || feedback.rating === 'down' ? feedback.rating : null;
    const optimisticFeedback: MessageFeedback = {
      rating: normalizedRating,
      comment: normalizedComment || undefined,
      submittedAt: new Date().toISOString(),
      source: 'web',
    };

    let previousFeedback: MessageFeedback | undefined;
    setMessages((prev) => prev.map((msg) => {
      if (msg.id !== messageId) return msg;
      previousFeedback = msg.feedback;
      return { ...msg, feedback: optimisticFeedback };
    }));

    try {
      const { data, error } = await supabase.functions.invoke('conversation-logger', {
        body: {
          sessionId,
          feedback: {
            messageId,
            rating: normalizedRating,
            comment: normalizedComment || null,
            source: 'web',
          },
        }
      });

      if (error) throw error;
      if (data?.success === false) {
        throw new Error(
          Array.isArray(data?.errors) ? data.errors.join('; ') : data?.error || 'Failed to save feedback'
        );
      }

      const savedFeedback = normalizeFeedback(data?.feedback) || optimisticFeedback;
      setMessages((prev) => prev.map((msg) => (
        msg.id === messageId ? { ...msg, feedback: savedFeedback } : msg
      )));
    } catch (err) {
      setMessages((prev) => prev.map((msg) => (
        msg.id === messageId ? { ...msg, feedback: previousFeedback } : msg
      )));
      throw err;
    }
  }, [user?.id, messages, currentSession?.id]);

  return {
    messages,
    isProcessing,
    isReady,
    orgLoading,      // Expose org loading state for UI feedback
    openSelector,    // Allow UI to trigger org selector
    sendMessage,
    sendEmailDraft,
    submitMessageFeedback,
    retryMessage,
    stopGeneration,
    currentSession,
    sessions,
    switchToSession,
    startNewConversation,
    deleteSession,
    updateSessionTitle,
    loadSessions,
    loading,
    error
  };
};
