import { createClient } from "npm:@supabase/supabase-js@2.50.0";

const DEFAULT_CHANNEL_ID_HASH_SALT = "koffey-whatsapp-salt";
const LEGACY_CHANNEL_ID_HASH_SALT = "koffey-default-salt";

export function getSupabaseClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

export function normalizePhoneNumber(phone: string): string {
  // Remove 'whatsapp:' prefix if present
  let normalized = phone.replace(/^whatsapp:/, '');
  // Remove all non-digit characters except leading +
  const hasPlus = normalized.startsWith('+');
  const digits = normalized.replace(/\D/g, '');
  // Assume US if no country code and 10 digits
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  return hasPlus ? `+${digits}` : `+${digits}`;
}

export async function hashChannelUserId(channel: string, userId: string): Promise<string> {
  return hashChannelUserIdWithSalt(
    channel,
    userId,
    Deno.env.get("CHANNEL_ID_HASH_SALT") || DEFAULT_CHANNEL_ID_HASH_SALT
  );
}

async function hashChannelUserIdWithSalt(
  channel: string,
  userId: string,
  salt: string
): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(`${channel}:${userId}:${salt}`);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

type ChannelRegistrationLookup = {
  id: string;
  user_id: string;
  verified_at: string | null;
  last_inbound_at: string | null;
  channel_user_id: string;
  is_primary: boolean | null;
  channel_metadata: Record<string, unknown> | null;
};

function extractOrganizationHint(metadata: unknown): string | null {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return null;
  const value =
    (metadata as Record<string, unknown>).organization_id
    ?? (metadata as Record<string, unknown>).preferred_organization_id;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function getCandidateSalts(): string[] {
  const configured = Deno.env.get("CHANNEL_ID_HASH_SALT");
  const candidates = [
    configured,
    DEFAULT_CHANNEL_ID_HASH_SALT,
    LEGACY_CHANNEL_ID_HASH_SALT,
  ].filter((value): value is string => !!value);

  return Array.from(new Set(candidates));
}

export async function findChannelRegistration(
  supabase: ReturnType<typeof getSupabaseClient>,
  channel: string,
  channelUserId: string
): Promise<ChannelRegistrationLookup | null> {
  const normalized = channel === "whatsapp" ? normalizePhoneNumber(channelUserId) : channelUserId;

  // Try hash lookup first (current + legacy salts for backwards compatibility).
  for (const salt of getCandidateSalts()) {
    const hash = await hashChannelUserIdWithSalt(channel, normalized, salt);
    const { data } = await supabase
      .from("user_channel_registrations")
      .select("id, user_id, verified_at, last_inbound_at, channel_user_id, is_primary, channel_metadata")
      .eq("channel", channel)
      .eq("channel_user_id_hash", hash)
      .order("verified_at", { ascending: false, nullsFirst: false })
      .order("is_primary", { ascending: false })
      .order("updated_at", { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      return data[0] as ChannelRegistrationLookup;
    }
  }

  // Fallback to raw channel ID to prevent salt-mismatch lockouts.
  const { data: fallbackData } = await supabase
    .from("user_channel_registrations")
    .select("id, user_id, verified_at, last_inbound_at, channel_user_id, is_primary, channel_metadata")
    .eq("channel", channel)
    .eq("channel_user_id", normalized)
    .order("verified_at", { ascending: false, nullsFirst: false })
    .order("is_primary", { ascending: false })
    .order("updated_at", { ascending: false })
    .limit(1);

  return fallbackData?.[0] ? (fallbackData[0] as ChannelRegistrationLookup) : null;
}

export async function lookupUserByChannel(
  supabase: ReturnType<typeof getSupabaseClient>,
  channel: string,
  channelUserId: string
): Promise<{ userId: string; organizationId: string; verified: boolean; lastInboundAt: string | null } | null> {
  const registration = await findChannelRegistration(supabase, channel, channelUserId);
  if (!registration) return null;

  const organizationHint = extractOrganizationHint(registration.channel_metadata);
  const { data: memberships } = await supabase
    .from("organization_members")
    .select("organization_id, joined_at")
    .eq("user_id", registration.user_id)
    .eq("is_active", true)
    .order("joined_at", { ascending: false })
    .limit(10);

  const activeMemberships = (memberships || []).filter((m) => typeof m.organization_id === "string");
  if (activeMemberships.length === 0) return null;

  const hintedMembership = organizationHint
    ? activeMemberships.find((m) => m.organization_id === organizationHint)
    : null;
  const resolvedOrganizationId = hintedMembership?.organization_id || activeMemberships[0].organization_id;

  return {
    userId: registration.user_id,
    organizationId: resolvedOrganizationId,
    verified: !!registration.verified_at,
    lastInboundAt: registration.last_inbound_at,
  };
}

export async function updateLastInbound(
  supabase: ReturnType<typeof getSupabaseClient>,
  channel: string,
  channelUserId: string
): Promise<void> {
  const registration = await findChannelRegistration(supabase, channel, channelUserId);
  if (!registration) return;

  await supabase
    .from("user_channel_registrations")
    .update({ last_inbound_at: new Date().toISOString() })
    .eq("id", registration.id);
}

export function isWithin24HourWindow(lastInboundAt: string | null): boolean {
  if (!lastInboundAt) return false;
  const lastInbound = new Date(lastInboundAt);
  const now = new Date();
  const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60);
  return hoursDiff < 24;
}

export async function getOrCreateSession(
  supabase: ReturnType<typeof getSupabaseClient>,
  userId: string,
  organizationId: string,
  channel: string,
  channelUserId: string
) {
  const { data: existingSession } = await supabase
    .from("messaging_sessions")
    .select("*")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("is_active", true)
    .gt("session_expires_at", new Date().toISOString())
    .single();

  if (existingSession) {
    await supabase
      .from("messaging_sessions")
      .update({
        last_message_at: new Date().toISOString(),
        session_expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .eq("id", existingSession.id);

    return {
      id: existingSession.id,
      contextEntityType: existingSession.context_entity_type,
      contextEntityId: existingSession.context_entity_id,
      conversationHistory: existingSession.conversation_history || [],
      entityContext: existingSession.entity_context || undefined,
    };
  }

  const { data: newSession } = await supabase
    .from("messaging_sessions")
    .insert({
      user_id: userId,
      organization_id: organizationId,
      channel,
      channel_user_id: channelUserId,
      conversation_history: [],
    })
    .select()
    .single();

  return { id: newSession?.id, conversationHistory: [] };
}

export async function updateSessionContext(
  supabase: ReturnType<typeof getSupabaseClient>,
  sessionId: string,
  userMessage: string,
  assistantResponse: string,
  newContext?: { entityType: string; entityId: string },
  entityContext?: Record<string, unknown>
) {
  const { data: session } = await supabase
    .from("messaging_sessions")
    .select("conversation_history")
    .eq("id", sessionId)
    .single();

  const history = session?.conversation_history || [];
  history.push({ user: userMessage, assistant: assistantResponse, timestamp: new Date().toISOString() });

  const updates: Record<string, unknown> = {
    conversation_history: history.slice(-20),
    updated_at: new Date().toISOString(),
  };

  if (newContext) {
    updates.context_entity_type = newContext.entityType;
    updates.context_entity_id = newContext.entityId;
  }

  if (entityContext) {
    updates.entity_context = entityContext;
  }

  await supabase.from("messaging_sessions").update(updates).eq("id", sessionId);
}

export async function logMessage(
  supabase: ReturnType<typeof getSupabaseClient>,
  params: {
    sessionId: string;
    userId: string;
    organizationId: string;
    channel: string;
    channelMessageId?: string;
    direction: 'inbound' | 'outbound';
    content: string;
    status?: string;
    intent?: string;
    entities?: unknown;
    toolCalls?: unknown;
    processingTimeMs?: number;
    errorMessage?: string;
  }
) {
  await supabase.from("message_log").insert({
    session_id: params.sessionId,
    user_id: params.userId,
    organization_id: params.organizationId,
    channel: params.channel,
    channel_message_id: params.channelMessageId,
    direction: params.direction,
    content: params.content,
    status: params.status || 'sent',
    intent_detected: params.intent,
    entities_extracted: params.entities,
    tool_calls_made: params.toolCalls,
    processing_time_ms: params.processingTimeMs,
    error_message: params.errorMessage,
    sent_at: params.direction === 'outbound' ? new Date().toISOString() : null,
  });
}

export const FALLBACK_RESPONSE = 
  "Sorry, I'm having trouble processing that right now. Try again in a moment, or check the web app.";
