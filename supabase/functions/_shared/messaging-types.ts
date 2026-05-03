// ============================================
// STANDARD MESSAGE INTERFACES
// All channel adapters convert to/from these types
// ============================================

// Canonical channel type used across the messaging pipeline
export type ChannelType = 'web' | 'whatsapp' | 'telegram' | 'sms';

// Action payload returned by unified-chat for UI triggers
export interface UnifiedChatAction {
  type: 'open_coaching_dialog' | 'open_deal_form' | 'navigate_to' | 'open_activity_logger' | 'entity_selection';
  deal?: Record<string, unknown>;
  contact?: Record<string, unknown>;
  route?: string;
  payload?: Record<string, unknown>;
  entities?: Array<{ id: string; type: string; name: string; subtitle?: string }>;
  prompt?: string;
}

export interface StandardInboundMessage {
  channel: ChannelType;
  channelUserId: string;          // Phone number (E.164) or Telegram ID
  channelMessageId?: string;      // Twilio MessageSid
  content: string;
  messageType: 'text' | 'image' | 'audio' | 'document';
  mediaUrl?: string;
  userMetadata?: {
    profileName?: string;
  };
  rawPayload: unknown;
  receivedAt: Date;
}

export interface StandardOutboundMessage {
  channel: ChannelType;
  channelUserId: string;
  content: string;
  useTemplate?: boolean;          // For outside 24hr window
  templateId?: string;
  templateVariables?: string[];
}

export interface ProcessedResponse {
  content: string;
  intent?: string;
  entities?: Record<string, unknown>;
  toolCalls?: Array<{ tool: string; input: unknown; result: unknown }>;
  newContext?: { entityType: string; entityId: string };
  processingTimeMs: number;
  action?: UnifiedChatAction;     // Action payload from unified-chat (UI triggers)
  entityContext?: Record<string, unknown>;  // Full entity context for cross-message resolution
  verification?: {
    mode?: string;
    is_true?: boolean;
    requires_verification?: boolean;
    policy?: 'strict' | 'advisory' | 'none';
    blocking_failure?: boolean;
    mixed_intent?: boolean;
    source_status?: 'source_backed' | 'source_gap' | 'not_applicable';
    user_summary?: string | null;
    legacy_would_block?: boolean;
    failed_checks?: string[];
    citation_count?: number;
  };
  citations?: Array<{
    id?: string;
    table?: string;
    rowId?: string | null;
    sourceTool?: string;
    uiLink?: string;
    valueSnapshot?: Record<string, unknown> | null;
  }>;
}

export interface ChannelAdapter {
  parseInbound(request: Request): Promise<StandardInboundMessage>;
  sendMessage(message: StandardOutboundMessage): Promise<{ success: boolean; channelMessageId?: string; error?: string }>;
  formatResponse(content: string): string;
  validateWebhook(request: Request): Promise<boolean>;
}
