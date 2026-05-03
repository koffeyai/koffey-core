/**
 * generate-all-briefings
 *
 * Batch generator that runs daily via pg_cron.
 * For each active user with notify_daily_digest enabled:
 * 1. Calls generate-briefing to produce the briefing
 * 2. Inserts a suggested_actions entry so it shows in the bell notification
 * 3. Optionally queues a WhatsApp delivery via notification_queue
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

const MAX_USERS_PER_RUN = 100;

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

    const today = new Date().toISOString().split("T")[0];

    // Fetch active users who signed in within the last 30 days
    const { data: recentUsers, error: usersError } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .gte("updated_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .limit(MAX_USERS_PER_RUN);

    if (usersError) {
      throw new Error(`Failed to fetch users: ${usersError.message}`);
    }

    if (!recentUsers || recentUsers.length === 0) {
      console.log("[generate-all-briefings] No active users found");
      return new Response(
        JSON.stringify({ generated: 0, skipped: 0, failed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[generate-all-briefings] Found ${recentUsers.length} active users`);

    let generated = 0;
    let skipped = 0;
    let failed = 0;

    for (const user of recentUsers) {
      try {
        // Check if user has notify_daily_digest enabled
        const { data: prefs } = await supabase
          .from("user_notification_preferences")
          .select("notify_daily_digest, whatsapp_enabled")
          .eq("user_id", user.id)
          .single();

        if (prefs && prefs.notify_daily_digest === false) {
          console.log(`[generate-all-briefings] Daily digest disabled for ${user.id}`);
          skipped++;
          continue;
        }

        // Check if briefing already generated today
        const { data: existingBriefing } = await supabase
          .from("daily_briefings")
          .select("id, generated_at")
          .eq("user_id", user.id)
          .eq("briefing_date", today)
          .single();

        if (existingBriefing?.generated_at) {
          console.log(`[generate-all-briefings] Briefing already exists for ${user.id} today`);
          skipped++;
          continue;
        }

        // Get user's organization
        const { data: orgMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", user.id)
          .limit(1)
          .single();

        if (!orgMember) {
          console.log(`[generate-all-briefings] No organization for user ${user.id}`);
          skipped++;
          continue;
        }

        // Call generate-briefing Edge Function
        const briefingResponse = await fetch(
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/generate-briefing`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
            },
            body: JSON.stringify({
              organizationId: orgMember.organization_id,
              forceRegenerate: false,
            }),
          }
        );

        if (!briefingResponse.ok) {
          throw new Error(`Briefing generation failed: ${briefingResponse.status}`);
        }

        const briefingResult = await briefingResponse.json();
        const briefing = briefingResult.briefing;

        // Create a notification in suggested_actions for the web bell
        const priorityPlay = briefing?.priority_play?.headline || "Your morning briefing is ready";
        const playsCount = briefing?.available_plays?.length || 0;

        await supabase.from("suggested_actions").insert({
          organization_id: orgMember.organization_id,
          action_type: "memory_insight",
          title: "Morning Briefing Ready",
          description: `${priorityPlay}${playsCount > 0 ? ` + ${playsCount} more plays available` : ""}`,
          priority: "medium",
          dedup_key: `daily_briefing:${user.id}:${today}`,
          confidence: 1.0,
          status: "active",
          assigned_to: user.id,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }).then(({ error }) => {
          if (error && !error.message?.includes("duplicate")) {
            console.error(`[generate-all-briefings] Failed to create notification for ${user.id}:`, error);
          }
        });

        // Optionally queue mobile delivery (preferred channel).
        const preferredChannel = String(prefs?.preferred_channel || "whatsapp").toLowerCase();
        const mobileChannel =
          preferredChannel === "telegram"
            ? "telegram"
            : (prefs?.whatsapp_enabled ? "whatsapp" : null);

        if (mobileChannel) {
          const condensedMessage = formatCondensedBriefing(briefing, user.full_name);
          await supabase.from("notification_queue").insert({
            user_id: user.id,
            organization_id: orgMember.organization_id,
            notification_type: "daily_briefing",
            title: "Morning Briefing",
            body: condensedMessage,
            channel: mobileChannel,
            status: "pending",
            scheduled_for: new Date().toISOString(),
          });
        }

        generated++;
        console.log(`[generate-all-briefings] Generated briefing for ${user.id}`);
      } catch (userError: any) {
        console.error(`[generate-all-briefings] Error for user ${user.id}:`, userError);
        failed++;
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`[generate-all-briefings] Done in ${processingTime}ms: generated=${generated}, skipped=${skipped}, failed=${failed}`);

    return new Response(
      JSON.stringify({ generated, skipped, failed, processingTimeMs: processingTime }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("[generate-all-briefings] Error:", error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function formatCondensedBriefing(briefing: any, userName?: string): string {
  const greeting = briefing?.greeting || `Good morning${userName ? `, ${userName}` : ""}!`;
  const priorityPlay = briefing?.priority_play;
  const plays = briefing?.available_plays || [];

  let message = `${greeting}\n\n`;

  if (priorityPlay) {
    message += `*Priority Play:* ${priorityPlay.headline}\n`;
    if (priorityPlay.why_this_matters) {
      message += `${priorityPlay.why_this_matters}\n`;
    }
    message += "\n";
  }

  if (plays.length > 0) {
    message += "*Other Plays Available:*\n";
    plays.slice(0, 2).forEach((play: any) => {
      message += `• ${play.headline}\n`;
    });
    if (plays.length > 2) {
      message += `_+ ${plays.length - 2} more in your dashboard_\n`;
    }
  }

  message += "\n_Open Koffey for full details._";

  return message;
}
