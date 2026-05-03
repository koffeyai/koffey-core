/**
 * Meeting Prep Alert
 *
 * Cron function (every 30 min) that generates pre-meeting prep alerts
 * for upcoming meetings with CRM contacts. Also detects meetings that
 * recently ended without follow-up.
 *
 * Creates suggested_actions for:
 * - Pre-meeting prep (2-4 hours before meeting with CRM contact)
 * - Post-meeting follow-up (meeting ended, no activity logged)
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

const corsHeaders = getCorsHeaders();
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    const now = new Date();
    const twoHoursFromNow = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const fourHoursFromNow = new Date(now.getTime() + 4 * 60 * 60 * 1000);
    const thirtyMinAgo = new Date(now.getTime() - 30 * 60 * 1000);

    // ========================================================================
    // PRE-MEETING PREP: Find meetings in 2-4 hours linked to CRM contacts
    // ========================================================================

    const { data: upcomingSync } = await admin
      .from('calendar_event_sync')
      .select('*, activities(id, contact_id, account_id, deal_id, title, contacts(full_name, company), accounts(name), deals(name, stage, amount))')
      .gte('event_start', twoHoursFromNow.toISOString())
      .lte('event_start', fourHoursFromNow.toISOString())
      .not('activities.contact_id', 'is', null);

    const prepAlerts: any[] = [];

    for (const event of upcomingSync || []) {
      const activity = event.activities;
      if (!activity?.contact_id) continue;

      // Check if we already created a prep alert for this event
      const { data: existingAlert } = await admin
        .from('suggested_actions')
        .select('id')
        .eq('action_type', 'meeting_prep')
        .eq('reference_id', event.id)
        .maybeSingle();

      if (existingAlert) continue;

      // Build prep context
      const contact = activity.contacts;
      const account = activity.accounts;
      const deal = activity.deals;

      // Get email engagement if available
      let emailContext = '';
      if (activity.contact_id) {
        const { data: engagement } = await admin
          .from('email_engagement_stats')
          .select('last_email_sent_at, last_email_received_at, total_emails_sent, total_emails_received')
          .eq('contact_id', activity.contact_id)
          .maybeSingle();

        if (engagement) {
          const lastEmail = engagement.last_email_sent_at || engagement.last_email_received_at;
          if (lastEmail) {
            const daysSince = Math.round((now.getTime() - new Date(lastEmail).getTime()) / (86400000));
            emailContext = `Last email: ${daysSince} day${daysSince !== 1 ? 's' : ''} ago (${engagement.total_emails_sent} sent, ${engagement.total_emails_received} received).`;
          }
        }
      }

      const meetingTime = new Date(event.event_start);
      const hoursUntil = Math.round((meetingTime.getTime() - now.getTime()) / (60 * 60 * 1000));

      const context = [
        contact?.full_name ? `Meeting with ${contact.full_name}` : null,
        account?.name ? `Company: ${account.name}` : null,
        deal ? `Deal: ${deal.name} (${deal.stage}, $${((deal.amount || 0) / 1000).toFixed(0)}K)` : null,
        emailContext || null,
      ].filter(Boolean).join('. ');

      prepAlerts.push({
        organization_id: activity.organization_id || event.organization_id,
        user_id: event.user_id,
        action_type: 'meeting_prep',
        title: `${contact?.full_name || 'Meeting'} call in ${hoursUntil} hours`,
        description: context,
        reference_id: event.id,
        reference_type: 'calendar_event',
        priority: deal ? 'high' : 'medium',
        created_at: now.toISOString(),
      });
    }

    if (prepAlerts.length > 0) {
      await admin.from('suggested_actions').insert(prepAlerts);
      console.log(`[meeting-prep] Created ${prepAlerts.length} prep alerts`);
    }

    // ========================================================================
    // POST-MEETING FOLLOW-UP: Find meetings that ended recently with no activity
    // ========================================================================

    const { data: recentlyEnded } = await admin
      .from('calendar_event_sync')
      .select('*, activities(id, contact_id, title, user_id, organization_id)')
      .lte('event_end', now.toISOString())
      .gte('event_end', thirtyMinAgo.toISOString())
      .not('activities.contact_id', 'is', null);

    const followUpAlerts: any[] = [];

    for (const event of recentlyEnded || []) {
      const activity = event.activities;
      if (!activity?.contact_id) continue;

      // Check if a follow-up activity was already logged
      const { data: followUp } = await admin
        .from('activities')
        .select('id')
        .eq('contact_id', activity.contact_id)
        .gte('created_at', event.event_end)
        .neq('id', activity.id)
        .limit(1)
        .maybeSingle();

      if (followUp) continue;

      // Check if we already created a follow-up alert
      const { data: existingAlert } = await admin
        .from('suggested_actions')
        .select('id')
        .eq('action_type', 'post_meeting_followup')
        .eq('reference_id', event.id)
        .maybeSingle();

      if (existingAlert) continue;

      followUpAlerts.push({
        organization_id: activity.organization_id,
        user_id: activity.user_id,
        action_type: 'post_meeting_followup',
        title: `Log your notes from the ${activity.title || 'meeting'}`,
        description: 'The meeting just ended. Capture key takeaways and next steps while they\'re fresh.',
        reference_id: event.id,
        reference_type: 'calendar_event',
        priority: 'high',
        created_at: now.toISOString(),
      });
    }

    if (followUpAlerts.length > 0) {
      await admin.from('suggested_actions').insert(followUpAlerts);
      console.log(`[meeting-prep] Created ${followUpAlerts.length} follow-up alerts`);
    }

    return new Response(JSON.stringify({
      success: true,
      prep_alerts: prepAlerts.length,
      followup_alerts: followUpAlerts.length,
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: any) {
    console.error('[meeting-prep] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
