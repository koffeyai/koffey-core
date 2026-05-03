import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import type { StandardInboundMessage } from "../_shared/messaging-types.ts";
import { processMessage } from "../_shared/message-processor.ts";
import { getSupabaseClient, hashChannelUserId } from "../_shared/messaging-utils.ts";
import { isInternalServiceCall } from "../_shared/auth.ts";
import { checkRateLimit, createSecureErrorResponse } from "../_shared/security.ts";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  corsHeaders = getCorsHeaders(req);
  const url = new URL(req.url);
  let action = url.searchParams.get("action");
  let jsonBody: Record<string, unknown> | null = null;

  if (req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        jsonBody = await req.json();
        if (!action && jsonBody?.action) {
          action = String(jsonBody.action);
        }
      } catch {
        // Ignore parse errors here; handlers will return validation errors.
      }
    }
  }

  console.log(`[telegram-adapter] Received request: ${req.method} action=${action || "webhook(default)"}`);

  try {
    switch (action) {
      case "send":
        return await handleSend(req, jsonBody);
      case "create-link-code":
        return await handleCreateLinkCode(req, jsonBody);
      case "webhook":
      default:
        if (req.method === "POST") {
          return await handleWebhook(req, jsonBody);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            service: "telegram-adapter",
            message: "Use POST for Telegram updates.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
    }
  } catch (error) {
    console.error("[telegram-adapter] Error:", error);
    return createSecureErrorResponse(error, "Internal server error", 500, req);
  }
});

function getRequesterIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip");
  return realIp?.trim() || "unknown";
}

async function handleWebhook(req: Request, parsedBody: Record<string, unknown> | null): Promise<Response> {
  const webhookRate = checkRateLimit(`telegram:webhook:${getRequesterIp(req)}`, {
    requests: 120,
    windowMs: 60000,
    blockDurationMs: 120000,
  });
  if (!webhookRate.allowed) {
    return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const valid = validateTelegramWebhook(req);
  if (!valid) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const update = parsedBody || {};
  const message = (update.message || update.edited_message || update.channel_post) as Record<string, any> | undefined;

  if (!message) {
    return new Response(JSON.stringify({ ok: true, ignored: "no_message" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const chatIdRaw = message.chat?.id ?? message.from?.id;
  if (chatIdRaw == null) {
    return new Response(JSON.stringify({ ok: true, ignored: "no_chat_id" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const chatId = String(chatIdRaw);

  const text = String(message.text || message.caption || "").trim();
  const from = message.from || {};

  if (/^\/start\b/i.test(text)) {
    const welcome = buildStartMessage();
    await sendTelegramMessage(chatId, welcome);
    return new Response(JSON.stringify({ ok: true, handled: "start" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const verifyCode = extractVerificationCode(text);
  if (verifyCode) {
    const verifyResult = await verifyTelegramCode(verifyCode, chatId, from);
    await sendTelegramMessage(chatId, verifyResult.message);
    return new Response(JSON.stringify({ ok: true, handled: "verify", success: verifyResult.success }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!text) {
    return new Response(JSON.stringify({ ok: true, ignored: "empty_text" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Telegram can't show chain-of-thought, but this shows live "typing..." feedback.
  await sendTelegramChatAction(chatId, "typing");
  if (/\b(analy[sz]e|coach|scoutpad|review|grade|deep dive)\b/i.test(text)) {
    await sendTelegramMessage(chatId, "Analyzing with SCOUTPAD...");
  }

  const profileName = [from.first_name, from.last_name].filter(Boolean).join(" ").trim() || from.username || undefined;
  const standardMessage: StandardInboundMessage = {
    channel: "telegram",
    channelUserId: chatId,
    channelMessageId: message.message_id != null ? String(message.message_id) : undefined,
    content: text,
    messageType: message.photo ? "image" : (message.voice || message.audio ? "audio" : (message.document ? "document" : "text")),
    userMetadata: { profileName },
    rawPayload: update,
    receivedAt: new Date(),
  };

  const result = await processMessage(standardMessage);
  const formatted = formatForTelegram(result.response);
  await sendTelegramMessage(chatId, formatted);

  return new Response(JSON.stringify({ ok: true, handled: "message" }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleSend(req: Request, jsonBody: Record<string, unknown> | null): Promise<Response> {
  if (!isInternalServiceCall(req)) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sendRate = checkRateLimit(`telegram:send:${getRequesterIp(req)}`, {
    requests: 30,
    windowMs: 60000,
    blockDurationMs: 120000,
  });
  if (!sendRate.allowed) {
    return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!jsonBody) {
    return new Response(JSON.stringify({ success: false, error: "Missing request body" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const channelUserId = String(jsonBody.channelUserId || "").trim();
  const content = String(jsonBody.content || "").trim();
  if (!channelUserId || !content) {
    return new Response(JSON.stringify({ success: false, error: "channelUserId and content are required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const result = await sendTelegramMessage(channelUserId, formatForTelegram(content));
  return new Response(JSON.stringify(result), {
    status: result.success ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function handleCreateLinkCode(req: Request, jsonBody: Record<string, unknown> | null): Promise<Response> {
  const user = await getAuthenticatedUser(req);
  if (!user) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const linkRate = checkRateLimit(`telegram:link:${user.id}`, {
    requests: 6,
    windowMs: 60000,
    blockDurationMs: 600000,
  });
  if (!linkRate.allowed) {
    return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const requestedOrganizationId = String(jsonBody?.organizationId || "").trim();
  const codeFromInput = String(jsonBody?.code || "").trim();
  const code = /^\d{6}$/.test(codeFromInput)
    ? codeFromInput
    : Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const pendingId = `pending:${user.id}`;
  const pendingHash = await hashChannelUserId("telegram", pendingId);

  const supabase = getSupabaseClient();
  let scopedOrganizationId: string | null = null;

  if (requestedOrganizationId) {
    const { data: requestedMembership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("organization_id", requestedOrganizationId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();

    if (!requestedMembership?.organization_id) {
      return new Response(JSON.stringify({ success: false, error: "Invalid organization context" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    scopedOrganizationId = requestedMembership.organization_id;
  } else {
    const { data: fallbackMembership } = await supabase
      .from("organization_members")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .order("joined_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    scopedOrganizationId = fallbackMembership?.organization_id || null;
  }

  const { data: existing } = await supabase
    .from("user_channel_registrations")
    .select("id")
    .eq("user_id", user.id)
    .eq("channel", "telegram")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const payload = {
    user_id: user.id,
    channel: "telegram",
    channel_user_id: pendingId,
    channel_user_id_hash: pendingHash,
    verification_code: code,
    verification_expires_at: expiresAt,
    verified_at: null,
    last_inbound_at: null,
    is_primary: true,
    channel_metadata: {
      state: "pending",
      link_code_generated_at: new Date().toISOString(),
      organization_id: scopedOrganizationId,
    },
  };

  let upsertError: any = null;
  if (existing?.id) {
    const { error } = await supabase
      .from("user_channel_registrations")
      .update(payload)
      .eq("id", existing.id);
    upsertError = error;
  } else {
    const { error } = await supabase
      .from("user_channel_registrations")
      .insert(payload);
    upsertError = error;
  }

  if (upsertError) {
    console.error("[telegram-adapter] create-link-code failed:", upsertError.message);
    return new Response(JSON.stringify({ success: false, error: "Failed to generate link code" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const botUsername = String(Deno.env.get("TELEGRAM_BOT_USERNAME") || "").replace(/^@/, "");
  const instructions = botUsername
    ? `Open https://t.me/${botUsername} and send: /verify ${code}`
    : `Open your Telegram bot and send: /verify ${code}`;

  return new Response(JSON.stringify({
    success: true,
    code,
    expiresAt,
    botUsername: botUsername || null,
    instructions,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function validateTelegramWebhook(req: Request): boolean {
  const expectedSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  if (!expectedSecret) {
    console.error("[telegram-adapter] TELEGRAM_WEBHOOK_SECRET is not configured");
    return false;
  }

  const received = req.headers.get("x-telegram-bot-api-secret-token");
  if (!received || received !== expectedSecret) {
    console.error("[telegram-adapter] Invalid webhook secret");
    return false;
  }
  return true;
}

async function getAuthenticatedUser(req: Request): Promise<{ id: string } | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const authHeader = req.headers.get("authorization");

  if (!supabaseUrl || !anonKey || !authHeader) return null;

  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });

  const { data, error } = await authClient.auth.getUser();
  if (error || !data?.user) {
    console.warn("[telegram-adapter] getAuthenticatedUser failed:", error?.message);
    return null;
  }
  return { id: data.user.id };
}

function extractVerificationCode(text: string): string | null {
  if (!text) return null;
  const match = text.trim().match(/^(?:\/?(?:verify|connect|link)(?:@\w+)?\s+|join\s+)(\d{6})\b/i);
  return match?.[1] || null;
}

function normalizeChannelMetadata(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  return { ...(input as Record<string, unknown>) };
}

async function verifyTelegramCode(
  code: string,
  chatId: string,
  from: { username?: string; first_name?: string; last_name?: string } | null | undefined
): Promise<{ success: boolean; message: string }> {
  const supabase = getSupabaseClient();
  const nowIso = new Date().toISOString();

  const { data: pendingRows } = await supabase
    .from("user_channel_registrations")
    .select("id, user_id, channel_metadata")
    .eq("channel", "telegram")
    .eq("verification_code", code)
    .gt("verification_expires_at", nowIso)
    .order("verification_expires_at", { ascending: false })
    .limit(1);

  const pending = pendingRows?.[0];
  if (!pending) {
    return {
      success: false,
      message: "That code is invalid or expired. Generate a new Telegram link code from Koffey Settings > Messaging.",
    };
  }

  const chatHash = await hashChannelUserId("telegram", chatId);
  const { data: existingByChat } = await supabase
    .from("user_channel_registrations")
    .select("id, user_id")
    .eq("channel", "telegram")
    .eq("channel_user_id_hash", chatHash)
    .maybeSingle();

  if (existingByChat && existingByChat.user_id !== pending.user_id) {
    return {
      success: false,
      message: "This Telegram chat is already linked to another account.",
    };
  }

  const metadata = {
    ...normalizeChannelMetadata(pending.channel_metadata),
    username: from?.username || null,
    first_name: from?.first_name || null,
    last_name: from?.last_name || null,
    linked_at: nowIso,
  };

  if (existingByChat?.id && existingByChat.user_id === pending.user_id && existingByChat.id !== pending.id) {
    const { error: updateExistingError } = await supabase
      .from("user_channel_registrations")
      .update({
        channel_user_id: chatId,
        channel_user_id_hash: chatHash,
        verified_at: nowIso,
        verification_code: null,
        verification_expires_at: null,
        last_inbound_at: nowIso,
        is_primary: true,
        channel_metadata: metadata,
      })
      .eq("id", existingByChat.id);

    if (updateExistingError) {
      console.error("[telegram-adapter] verify update existing failed:", updateExistingError.message);
      return { success: false, message: "I couldn't complete verification. Please try again." };
    }

    await supabase.from("user_channel_registrations").delete().eq("id", pending.id);
    await supabase
      .from("user_channel_registrations")
      .update({ is_primary: false })
      .eq("user_id", pending.user_id)
      .eq("channel", "telegram")
      .neq("id", existingByChat.id);

    return {
      success: true,
      message: "Telegram connected successfully. You can now message me here for CRM updates.",
    };
  }

  const { error: updateError } = await supabase
    .from("user_channel_registrations")
    .update({
      channel_user_id: chatId,
      channel_user_id_hash: chatHash,
      verified_at: nowIso,
      verification_code: null,
      verification_expires_at: null,
      last_inbound_at: nowIso,
      is_primary: true,
      channel_metadata: metadata,
    })
    .eq("id", pending.id);

  if (updateError) {
    console.error("[telegram-adapter] verify update failed:", updateError.message);
    return { success: false, message: "I couldn't complete verification. Please try again." };
  }

  await supabase
    .from("user_channel_registrations")
    .update({ is_primary: false })
    .eq("user_id", pending.user_id)
    .eq("channel", "telegram")
    .neq("id", pending.id);

  return {
    success: true,
    message: "Telegram connected successfully. You can now message me here for CRM updates.",
  };
}

async function sendTelegramMessage(
  chatId: string,
  content: string
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) {
    return { success: false, error: "TELEGRAM_BOT_TOKEN is not configured" };
  }

  try {
    const chunks = splitForTelegram(content, 3900);
    let lastMessageSid: string | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: chunks[i],
          disable_web_page_preview: true,
        }),
      });

      const result = await response.json();
      if (!response.ok || !result?.ok) {
        return {
          success: false,
          error: result?.description || `Telegram send failed: ${response.status} (chunk ${i + 1}/${chunks.length})`,
        };
      }

      if (result?.result?.message_id != null) {
        lastMessageSid = String(result.result.message_id);
      }
    }

    return {
      success: true,
      messageSid: lastMessageSid,
    };
  } catch (error) {
    return { success: false, error: "Failed to send Telegram message" };
  }
}

async function sendTelegramChatAction(
  chatId: string,
  action: "typing" | "upload_photo" | "record_video" = "typing"
): Promise<void> {
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!botToken) return;

  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendChatAction`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        action,
      }),
    });
  } catch (error) {
    console.warn("[telegram-adapter] sendChatAction failed:", (error as Error).message);
  }
}

function buildStartMessage(): string {
  const botUsername = String(Deno.env.get("TELEGRAM_BOT_USERNAME") || "").replace(/^@/, "");
  const botHint = botUsername ? ` (@${botUsername})` : "";
  return [
    `Welcome to Koffey${botHint}.`,
    "",
    "To connect this Telegram chat to your CRM account:",
    "1) Open Koffey > Settings > Messaging",
    "2) Tap \"Generate Telegram Code\"",
    "3) Send /verify <code> here",
  ].join("\n");
}

function formatForTelegram(content: string): string {
  const formatted = String(content || "")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return formatted || "Done.";
}

function splitForTelegram(content: string, maxLength: number): string[] {
  const text = String(content || "").trim();
  if (!text) return ["Done."];
  if (text.length <= maxLength) return [text];

  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf("\n\n", maxLength);
    if (splitAt < Math.floor(maxLength * 0.5)) {
      splitAt = remaining.lastIndexOf("\n", maxLength);
    }
    if (splitAt < Math.floor(maxLength * 0.5)) {
      splitAt = remaining.lastIndexOf(" ", maxLength);
    }
    if (splitAt <= 0) {
      splitAt = maxLength;
    }

    const chunk = remaining.slice(0, splitAt).trim();
    if (chunk.length === 0) {
      chunks.push(remaining.slice(0, maxLength));
      remaining = remaining.slice(maxLength).trim();
      continue;
    }

    chunks.push(chunk);
    remaining = remaining.slice(splitAt).trim();
  }

  if (remaining.length > 0) {
    chunks.push(remaining);
  }

  return chunks;
}
