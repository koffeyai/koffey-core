import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createHmac } from "https://deno.land/std@0.177.0/node/crypto.ts";
import type { StandardInboundMessage } from "../_shared/messaging-types.ts";
import { processMessage } from "../_shared/message-processor.ts";
import {
  normalizePhoneNumber, 
  isWithin24HourWindow, 
  getSupabaseClient, 
  findChannelRegistration
} from "../_shared/messaging-utils.ts";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { isInternalServiceCall } from "../_shared/auth.ts";
import { checkRateLimit, createSecureErrorResponse } from "../_shared/security.ts";

let corsHeaders = getCorsHeaders();

// ============================================
// MAIN HANDLER
// ============================================
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  corsHeaders = getCorsHeaders(req);
  const url = new URL(req.url);
  let action = url.searchParams.get("action");
  let jsonBody: Record<string, unknown> | null = null;

  // ============================================
  // FIX: Check body for action (from supabase.functions.invoke calls)
  // Frontend sends { action: "send-verification", ... } in JSON body
  // Twilio sends form-urlencoded data to the webhook
  // ============================================
  if (!action && req.method === "POST") {
    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("application/json")) {
      try {
        jsonBody = await req.json();
        if (jsonBody?.action) {
          action = jsonBody.action as string;
        }
      } catch {
        // Not valid JSON - continue with URL-based routing
      }
    }
  }

  console.log(`[whatsapp-adapter] Received request: ${req.method} action=${action}`);

  try {
    switch (action) {
      case "webhook":
        if (req.method !== "POST") {
          return new Response(
            JSON.stringify({
              error: "invalid_method",
              message: "Twilio webhook must use HTTP POST",
            }),
            {
              status: 405,
              headers: { ...corsHeaders, "Content-Type": "application/json" },
            }
          );
        }
        return await handleWebhook(req);
      case "status":
        return await handleStatusCallback(req);
      case "send":
        // Pass pre-parsed JSON body if available
        return await handleSend(req, jsonBody);
      case "send-verification":
        // Pass pre-parsed JSON body if available
        return await handleSendVerification(req, jsonBody);
      default:
        // Default: handle incoming webhook from Twilio (form-urlencoded)
        if (req.method === "POST") {
          return await handleWebhook(req);
        }
        return new Response(
          JSON.stringify({
            ok: true,
            service: "whatsapp-adapter",
            message: "Use POST for Twilio incoming messages.",
          }),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
    }
  } catch (error) {
    console.error("WhatsApp adapter error:", error);
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

// ============================================
// TWILIO SIGNATURE VALIDATION
// ============================================
async function validateTwilioSignature(req: Request, body: string): Promise<boolean> {
  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    const env = Deno.env.get("ENVIRONMENT") || Deno.env.get("DENO_ENV") || "production";
    if (env === "development" || env === "local") {
      console.warn("Missing Twilio signature - allowed in development only");
      return true;
    }
    console.error("Missing Twilio signature - rejected in production");
    return false;
  }

  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  if (!authToken) {
    console.error("TWILIO_AUTH_TOKEN not configured");
    return false;
  }

  const requestUrl = new URL(req.url);
  const requestUrlNoQuery = `${requestUrl.origin}${requestUrl.pathname}`;
  const requestUrlNoTrailingSlash = requestUrlNoQuery.endsWith("/")
    ? requestUrlNoQuery.slice(0, -1)
    : requestUrlNoQuery;
  const supabaseBaseUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-adapter`;

  const candidateUrls = Array.from(new Set([
    req.url,
    requestUrlNoQuery,
    requestUrlNoTrailingSlash,
    supabaseBaseUrl,
    `${supabaseBaseUrl}?action=webhook`,
  ]));

  // Parse form data and sort parameters alphabetically
  const params = new URLSearchParams(body);
  const sortedParams = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}${value}`)
    .join("");

  const expectedSignatures = candidateUrls.map((url) =>
    createHmac("sha1", authToken).update(url + sortedParams).digest("base64")
  );

  const isValid = expectedSignatures.includes(signature);
  
  if (!isValid) {
    console.error("Invalid Twilio signature", { 
      received: signature, 
      url: req.url,
      candidateUrls,
    });
  }

  return isValid;
}

// ============================================
// INBOUND WEBHOOK HANDLER (from Twilio)
// ============================================
async function handleWebhook(req: Request): Promise<Response> {
  const webhookRate = checkRateLimit(`whatsapp:webhook:${getRequesterIp(req)}`, {
    requests: 180,
    windowMs: 60000,
    blockDurationMs: 120000,
  });
  if (!webhookRate.allowed) {
    return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Read body as text for signature validation and parsing
  const bodyText = await req.text();

  console.log(`[whatsapp-adapter] Webhook body received:`, bodyText.substring(0, 200));

  // 1. Validate Twilio signature
  const isValid = await validateTwilioSignature(req, bodyText);
  if (!isValid) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2. Parse form data (Twilio sends application/x-www-form-urlencoded)
  const params = new URLSearchParams(bodyText);
  const from = params.get("From") || "";           // whatsapp:+15551234567
  const body = params.get("Body") || "";
  const messageSid = params.get("MessageSid") || "";
  const numMedia = parseInt(params.get("NumMedia") || "0");
  const profileName = params.get("ProfileName") || "";

  console.log(`[whatsapp-adapter] Message from ${from}: "${body.substring(0, 50)}${body.length > 50 ? '...' : ''}"`);

  // Skip empty messages
  if (!body.trim()) {
    return new Response("OK", { status: 200 });
  }

  // 3. Normalize phone number (strip whatsapp: prefix, ensure E.164 format)
  const phoneNumber = normalizePhoneNumber(from);

  // 4. Convert to standard format for channel-agnostic processing
  const standardMessage: StandardInboundMessage = {
    channel: 'whatsapp',
    channelUserId: phoneNumber,
    channelMessageId: messageSid,
    content: body,
    messageType: numMedia > 0 ? 'image' : 'text',
    userMetadata: { profileName },
    rawPayload: Object.fromEntries(params),
    receivedAt: new Date(),
  };

  // 5. Process through channel-agnostic brain (calls unified-chat)
  const result = await processMessage(standardMessage);

  console.log(`[whatsapp-adapter] AI response: "${result.response.substring(0, 50)}${result.response.length > 50 ? '...' : ''}"`);

  // 6. Format and send response back via Twilio
  const formattedResponse = formatForWhatsApp(result.response);
  const sendResult = await sendWhatsAppMessage(phoneNumber, formattedResponse);
  
  if (!sendResult.success) {
    console.error(`[whatsapp-adapter] Failed to send response: ${sendResult.error}`);
  }

  // 7. Return empty TwiML (Twilio expects this format)
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { 
      status: 200, 
      headers: { "Content-Type": "text/xml" } 
    }
  );
}

// ============================================
// STATUS CALLBACK HANDLER (delivery receipts from Twilio)
// ============================================
async function handleStatusCallback(req: Request): Promise<Response> {
  const statusRate = checkRateLimit(`whatsapp:status:${getRequesterIp(req)}`, {
    requests: 240,
    windowMs: 60000,
    blockDurationMs: 120000,
  });
  if (!statusRate.allowed) {
    return new Response(JSON.stringify({ success: false, error: "Rate limit exceeded" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const bodyText = await req.text();
  const isValid = await validateTwilioSignature(req, bodyText);
  if (!isValid) {
    return new Response(JSON.stringify({ success: false, error: "Invalid signature" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  
  const params = new URLSearchParams(bodyText);
  const messageSid = params.get("MessageSid");
  const status = params.get("MessageStatus");      // queued, sent, delivered, read, failed
  const errorCode = params.get("ErrorCode");
  const errorMessage = params.get("ErrorMessage");

  console.log(`[whatsapp-adapter] Status update: ${messageSid} -> ${status}`);

  const supabase = getSupabaseClient();

  const updates: Record<string, unknown> = { status };
  
  if (status === "delivered") {
    updates.delivered_at = new Date().toISOString();
  } else if (status === "read") {
    updates.read_at = new Date().toISOString();
  } else if (status === "failed" || status === "undelivered") {
    updates.failed_at = new Date().toISOString();
    updates.error_message = errorMessage || `Error code: ${errorCode}`;
  }

  await supabase
    .from("message_log")
    .update(updates)
    .eq("channel_message_id", messageSid);

  return new Response("OK", { status: 200 });
}

// ============================================
// SEND MESSAGE (for proactive notifications from frontend)
// ============================================
async function handleSend(req: Request, jsonBody: Record<string, unknown> | null): Promise<Response> {
  if (!isInternalServiceCall(req)) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sendRate = checkRateLimit(`whatsapp:send:${getRequesterIp(req)}`, {
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

  const { channelUserId, content, checkWindow = true } = jsonBody as {
    channelUserId: string;
    content: string;
    checkWindow?: boolean;
  };

  console.log(`[whatsapp-adapter] handleSend to ${channelUserId}, checkWindow=${checkWindow}`);

  // Check 24-hour window if requested
  if (checkWindow) {
    const supabase = getSupabaseClient();
    const registration = await findChannelRegistration(supabase, "whatsapp", channelUserId);

    if (!isWithin24HourWindow(registration?.last_inbound_at)) {
      console.log(`[whatsapp-adapter] Outside 24hr window for ${channelUserId}`);
      return new Response(JSON.stringify({ 
        success: false, 
        error: "outside_24hr_window",
        message: "User hasn't messaged in 24 hours. Template message required."
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const formattedContent = formatForWhatsApp(content);
  const result = await sendWhatsAppMessage(channelUserId, formattedContent);

  const status = result.success ? 200 : 502;
  return new Response(JSON.stringify(result), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ============================================
// SEND VERIFICATION CODE (from frontend registration flow)
// ============================================
async function handleSendVerification(req: Request, jsonBody: Record<string, unknown> | null): Promise<Response> {
  if (!isInternalServiceCall(req)) {
    return new Response(JSON.stringify({ success: false, error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const verifyRate = checkRateLimit(`whatsapp:verify:${getRequesterIp(req)}`, {
    requests: 20,
    windowMs: 60000,
    blockDurationMs: 120000,
  });
  if (!verifyRate.allowed) {
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

  const { phone, code } = jsonBody as { phone: string; code: string };
  
  console.log(`[whatsapp-adapter] handleSendVerification to ${phone}`);
  
  const message = `Your Koffey verification code is: ${code}\n\nThis code expires in 10 minutes.`;
  const result = await sendWhatsAppMessage(phone, message);

  const status = result.success ? 200 : 502;
  return new Response(JSON.stringify(result), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ============================================
// TWILIO API - SEND MESSAGE
// ============================================
async function sendWhatsAppMessage(
  to: string, 
  body: string
): Promise<{ success: boolean; messageSid?: string; error?: string }> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN");
  const fromNumber = Deno.env.get("TWILIO_WHATSAPP_NUMBER");

  if (!accountSid || !authToken || !fromNumber) {
    console.error("[whatsapp-adapter] Missing Twilio credentials", {
      hasAccountSid: !!accountSid,
      hasAuthToken: !!authToken,
      hasFromNumber: !!fromNumber
    });
    return { success: false, error: "Twilio credentials not configured" };
  }

  const normalizedTo = normalizePhoneNumber(to);

  console.log(`[whatsapp-adapter] Sending via Twilio: from=${fromNumber} to=${normalizedTo}`);

  try {
    const chunks = splitForWhatsApp(body, 1500);
    let lastMessageSid: string | undefined;

    for (let i = 0; i < chunks.length; i++) {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
        {
          method: "POST",
          headers: {
            "Authorization": `Basic ${btoa(`${accountSid}:${authToken}`)}`,
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({
            From: `whatsapp:${fromNumber}`,
            To: `whatsapp:${normalizedTo}`,
            Body: chunks[i],
            StatusCallback: `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-adapter?action=status`,
          }),
        }
      );

      const result = await response.json();
      if (!response.ok || result.error_code || result.code) {
        console.error("[whatsapp-adapter] Twilio error:", result);
        return {
          success: false,
          error: `${result.error_code || result.code || response.status}: ${result.error_message || result.message || `Failed chunk ${i + 1}/${chunks.length}`}`,
        };
      }

      if (result.sid) {
        lastMessageSid = result.sid;
      }
    }

    console.log(`[whatsapp-adapter] Message sent successfully (${chunks.length} chunk${chunks.length === 1 ? "" : "s"}): ${lastMessageSid}`);
    return { success: true, messageSid: lastMessageSid };

  } catch (error) {
    console.error("[whatsapp-adapter] Send error:", error);
    return { success: false, error: "Failed to send WhatsApp message" };
  }
}

// ============================================
// FORMAT FOR WHATSAPP
// ============================================
function formatForWhatsApp(content: string): string {
  // WhatsApp formatting rules:
  // - Max 4096 characters
  // - *bold* works, _italic_ works
  // - No markdown headers, code blocks, or clickable links
  // - Emojis work great
  
  let formatted = content
    // Convert **bold** to *bold* (WhatsApp style)
    .replace(/\*\*(.*?)\*\*/g, "*$1*")
    // Remove markdown headers
    .replace(/^#{1,6}\s+/gm, "")
    // Remove markdown links, keep text
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    // Remove code blocks
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    // Clean up excessive newlines
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Keep a safety cap to avoid unbounded payloads (splitForWhatsApp handles delivery chunking).
  if (formatted.length > 14000) {
    formatted = `${formatted.substring(0, 13997)}...`;
  }

  return formatted;
}

function splitForWhatsApp(content: string, maxLength: number): string[] {
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
    if (!chunk) {
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
