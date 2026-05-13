import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { isWithin24HourWindow } from "../_shared/messaging-utils.ts";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { isInternalServiceCall } from '../_shared/auth.ts';

let corsHeaders = getCorsHeaders();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    if (!isInternalServiceCall(req)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: internal service call required' }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { type, userId, organizationId, data } = await req.json();
    
    console.log(`[notification-router] Processing ${type} notification for user ${userId}`);
    
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Get user's notification preferences
    const { data: prefs } = await supabase
      .from("user_notification_preferences")
      .select("*")
      .eq("user_id", userId)
      .single();

    // Check if notification type is enabled
    if (!isNotificationEnabled(prefs, type)) {
      console.log(`[notification-router] Notification type ${type} disabled for user`);
      return new Response(JSON.stringify({ skipped: true, reason: "disabled" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const preferredChannel = normalizePreferredChannel(String(prefs?.preferred_channel || "whatsapp"));

    // Check quiet hours
    if (isQuietHours(prefs)) {
      console.log(`[notification-router] Quiet hours active, queuing notification`);
      await supabase.from("notification_queue").insert({
        user_id: userId,
        organization_id: organizationId,
        notification_type: type,
        title: type,
        body: formatNotificationBody(type, data),
        data,
        channel: preferredChannel,
        status: 'pending',
        scheduled_for: getNextActiveTime(prefs),
      });
      return new Response(JSON.stringify({ queued: true, reason: "quiet_hours" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve primary channel registration (prefer configured channel, fallback to WhatsApp).
    let channelToUse = preferredChannel;
    let registration = await getPrimaryRegistration(supabase, userId, channelToUse);
    if (!registration && preferredChannel === "telegram") {
      channelToUse = "whatsapp";
      registration = await getPrimaryRegistration(supabase, userId, channelToUse);
    }

    if (!registration) {
      console.log(`[notification-router] No ${preferredChannel} registration for user`);
      return new Response(JSON.stringify({ skipped: true, reason: `no_${preferredChannel}` }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 24-hour window applies to WhatsApp only.
    if (channelToUse === "whatsapp" && !isWithin24HourWindow(registration.last_inbound_at)) {
      console.log(`[notification-router] Outside 24hr window, queuing for template`);
      await supabase.from("notification_queue").insert({
        user_id: userId,
        organization_id: organizationId,
        notification_type: type,
        title: type,
        body: formatNotificationBody(type, data),
        data,
        channel: "whatsapp",
        status: 'pending',
        requires_template: true,
        scheduled_for: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ queued: true, reason: "outside_24hr_window" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Send via channel adapter
    const message = formatNotificationBody(type, data);
    const adapterFn = channelToUse === "telegram" ? "telegram-adapter" : "whatsapp-adapter";

    const sendResponse = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/${adapterFn}?action=send`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          channelUserId: registration.channel_user_id,
          content: message,
          checkWindow: false,
        }),
      }
    );

    const sendResult = await sendResponse.json();

    console.log(`[notification-router] Send result:`, sendResult);

    return new Response(JSON.stringify({ sent: true, result: sendResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Notification router error:", error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

function isNotificationEnabled(prefs: Record<string, unknown> | null, type: string): boolean {
  if (!prefs) return true;
  const mapping: Record<string, string> = {
    deal_stagnation: "notify_deal_stagnation",
    task_reminder: "notify_task_reminders",
    daily_digest: "notify_daily_digest",
    daily_briefing: "notify_daily_digest",
    deal_risk: "notify_deal_stagnation",
    follow_up: "notify_task_reminders",
  };
  const prefKey = mapping[type];
  if (!prefKey) return true;
  return prefs[prefKey] !== false;
}

function normalizePreferredChannel(channel: string): "whatsapp" | "telegram" {
  return channel?.toLowerCase() === "telegram" ? "telegram" : "whatsapp";
}

async function getPrimaryRegistration(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  channel: "whatsapp" | "telegram"
): Promise<{ channel_user_id: string; last_inbound_at: string | null } | null> {
  const { data } = await supabase
    .from("user_channel_registrations")
    .select("channel_user_id, last_inbound_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .eq("is_primary", true)
    .not("verified_at", "is", null)
    .maybeSingle();

  if (data) return data;

  const { data: fallback } = await supabase
    .from("user_channel_registrations")
    .select("channel_user_id, last_inbound_at")
    .eq("user_id", userId)
    .eq("channel", channel)
    .not("verified_at", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return fallback || null;
}

function isQuietHours(prefs: Record<string, unknown> | null): boolean {
  if (!prefs?.quiet_hours_enabled) return false;
  const now = new Date().getHours();
  const start = parseInt(String(prefs.quiet_hours_start || "22").split(":")[0]);
  const end = parseInt(String(prefs.quiet_hours_end || "8").split(":")[0]);
  return start > end ? (now >= start || now < end) : (now >= start && now < end);
}

function getNextActiveTime(prefs: Record<string, unknown> | null): string {
  const endHour = parseInt(String(prefs?.quiet_hours_end || "8").split(":")[0]);
  const next = new Date();
  next.setHours(endHour, 0, 0, 0);
  if (next <= new Date()) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function formatNotificationBody(type: string, data: Record<string, unknown>): string {
  switch (type) {
    case "deal_stagnation":
      return `⚠️ Your *${data.dealName}* deal ($${Number(data.value).toLocaleString()}) has been in ${data.stage} for ${data.daysSinceActivity} days.\n\nNeed to take action?`;
    case "task_reminder":
      return `📋 *Reminder:* ${data.taskTitle}\nDue: ${data.dueDate}`;
    case "daily_briefing": {
      const greeting = data.greeting || "Good morning!";
      const priorityPlay = data.priorityPlay as string || "";
      const plays = (data.topPlays as string[]) || [];
      let msg = `☀️ ${greeting}\n\n`;
      if (priorityPlay) msg += `*Priority:* ${priorityPlay}\n\n`;
      if (plays.length > 0) {
        msg += "*Plays available:*\n";
        plays.slice(0, 2).forEach((p: string) => { msg += `• ${p}\n`; });
      }
      msg += "\n_Open Koffey for full details._";
      return msg;
    }
    case "deal_risk":
      return `⚠️ *${data.dealName || "Deal"}* needs attention: ${data.description || "probability or stage changed significantly."}\n\nCheck your dashboard for details.`;
    case "follow_up":
      return `📌 *${data.title || "Follow-up needed"}*\n${data.description || "A task or contact needs your attention."}`;
    default:
      return String(data.message) || "Notification from Koffey";
  }
}
