import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
const startTime = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    // Fetch pending notifications that are due
    const { data: pendingItems, error: fetchError } = await supabase
      .from("notification_queue")
      .select("*")
      .eq("status", "pending")
      .lte("scheduled_for", new Date().toISOString())
      .order("scheduled_for", { ascending: true })
      .limit(50);

    if (fetchError) {
      throw new Error(`Failed to fetch pending notifications: ${fetchError.message}`);
    }

    if (!pendingItems || pendingItems.length === 0) {
      return new Response(
        JSON.stringify({ processed: 0, sent: 0, failed: 0, skipped: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[notification-queue-processor] Processing ${pendingItems.length} pending notifications`);

    let sent = 0;
    let failed = 0;
    let skipped = 0;

    for (const item of pendingItems) {
      try {
        // Check user notification preferences
        const { data: prefs } = await supabase
          .from("user_notification_preferences")
          .select("*")
          .eq("user_id", item.user_id)
          .single();

        // Check if notification type is enabled
        if (!isNotificationEnabled(prefs, item.notification_type)) {
          console.log(`[notification-queue-processor] Type ${item.notification_type} disabled for user ${item.user_id}`);
          await supabase
            .from("notification_queue")
            .update({ status: "skipped", sent_at: new Date().toISOString() })
            .eq("id", item.id);
          skipped++;
          continue;
        }

        // Check quiet hours
        if (isQuietHours(prefs)) {
          console.log(`[notification-queue-processor] Quiet hours active for user ${item.user_id}, rescheduling`);
          const nextActive = getNextActiveTime(prefs);
          await supabase
            .from("notification_queue")
            .update({ scheduled_for: nextActive })
            .eq("id", item.id);
          skipped++;
          continue;
        }

        if (item.channel === "whatsapp") {
          // Get user's WhatsApp registration
          const { data: registration } = await supabase
            .from("user_channel_registrations")
            .select("channel_user_id, last_inbound_at")
            .eq("user_id", item.user_id)
            .eq("channel", "whatsapp")
            .eq("is_primary", true)
            .single();

          if (!registration) {
            console.log(`[notification-queue-processor] No WhatsApp registration for user ${item.user_id}`);
            await supabase
              .from("notification_queue")
              .update({ status: "skipped", error_message: "No WhatsApp registration" })
              .eq("id", item.id);
            skipped++;
            continue;
          }

          // Send via WhatsApp adapter
          const sendResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-adapter?action=send`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                channelUserId: registration.channel_user_id,
                content: item.body,
                checkWindow: !item.requires_template,
                templateId: item.requires_template ? item.template_id : undefined,
              }),
            }
          );

          const sendResult = await sendResponse.json();

          if (!sendResponse.ok || sendResult.error) {
            throw new Error(sendResult.error || `WhatsApp send failed: ${sendResponse.status}`);
          }

          // Log to message_log
          await supabase.from("message_log").insert({
            user_id: item.user_id,
            organization_id: item.organization_id,
            channel: "whatsapp",
            direction: "outbound",
            content: item.body,
            intent_detected: item.notification_type,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

          await supabase
            .from("notification_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", item.id);

          sent++;
        } else if (item.channel === "telegram") {
          // Get user's Telegram registration
          const { data: registration } = await supabase
            .from("user_channel_registrations")
            .select("channel_user_id")
            .eq("user_id", item.user_id)
            .eq("channel", "telegram")
            .eq("is_primary", true)
            .not("verified_at", "is", null)
            .single();

          if (!registration) {
            console.log(`[notification-queue-processor] No Telegram registration for user ${item.user_id}`);
            await supabase
              .from("notification_queue")
              .update({ status: "skipped", error_message: "No Telegram registration" })
              .eq("id", item.id);
            skipped++;
            continue;
          }

          // Send via Telegram adapter
          const sendResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/telegram-adapter?action=send`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
              },
              body: JSON.stringify({
                channelUserId: registration.channel_user_id,
                content: item.body,
                checkWindow: false,
              }),
            }
          );

          const sendResult = await sendResponse.json();
          if (!sendResponse.ok || sendResult.error) {
            throw new Error(sendResult.error || `Telegram send failed: ${sendResponse.status}`);
          }

          await supabase.from("message_log").insert({
            user_id: item.user_id,
            organization_id: item.organization_id,
            channel: "telegram",
            direction: "outbound",
            content: item.body,
            intent_detected: item.notification_type,
            status: "sent",
            sent_at: new Date().toISOString(),
          });

          await supabase
            .from("notification_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", item.id);

          sent++;
        } else if (item.channel === "web") {
          // For web channel, insert into suggested_actions (picked up by Realtime)
          await supabase.from("suggested_actions").insert({
            organization_id: item.organization_id,
            action_type: "memory_insight",
            title: item.title,
            description: item.body,
            priority: "medium",
            dedup_key: `notification:${item.id}`,
            confidence: 1.0,
            status: "active",
            assigned_to: item.user_id,
            expires_at: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
          });

          await supabase
            .from("notification_queue")
            .update({ status: "sent", sent_at: new Date().toISOString() })
            .eq("id", item.id);

          sent++;
        } else {
          console.log(`[notification-queue-processor] Unknown channel: ${item.channel}`);
          await supabase
            .from("notification_queue")
            .update({ status: "skipped", error_message: `Unknown channel: ${item.channel}` })
            .eq("id", item.id);
          skipped++;
        }
      } catch (itemError: any) {
        console.error(`[notification-queue-processor] Error processing item ${item.id}:`, itemError);

        // Retry logic with exponential backoff
        const retryCount = (item.data?.retry_count || 0) + 1;
        const maxRetries = 3;

        if (retryCount <= maxRetries) {
          const backoffMinutes = Math.pow(2, retryCount);
          const nextRetry = new Date(Date.now() + backoffMinutes * 60 * 1000).toISOString();

          await supabase
            .from("notification_queue")
            .update({
              error_message: itemError.message,
              scheduled_for: nextRetry,
              data: { ...item.data, retry_count: retryCount },
            })
            .eq("id", item.id);
        } else {
          await supabase
            .from("notification_queue")
            .update({
              status: "failed",
              error_message: `Max retries exceeded: ${itemError.message}`,
            })
            .eq("id", item.id);
        }

        failed++;
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`[notification-queue-processor] Done in ${processingTime}ms: sent=${sent}, failed=${failed}, skipped=${skipped}`);

    return new Response(
      JSON.stringify({ processed: pendingItems.length, sent, failed, skipped, processingTimeMs: processingTime }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[notification-queue-processor] Error:", error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
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
