/**
 * Sync Email to CRM Edge Function
 *
 * Fetches Gmail messages and automatically associates them with CRM entities:
 * - Matches sender/recipient email to contacts
 * - Links to accounts via email domain
 * - Associates with deals via contact relationships
 * - Creates activity records for each matched email
 * - Updates engagement stats per contact
 *
 * Follows the same pattern as sync-calendar-to-crm.
 * Provider-agnostic: uses EmailProvider interface for future Outlook support.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { refreshAccessToken } from '../_shared/google-auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { gmailProvider } from '../_shared/email-provider-gmail.ts';
import type { EmailMessage, EmailProvider } from '../_shared/email-provider.ts';

const corsHeaders = getCorsHeaders();

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const admin = createClient(supabaseUrl, serviceKey);

// Personal email domains — skip account creation for these
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'outlook.com',
  'hotmail.com', 'live.com', 'aol.com', 'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'zoho.com', 'yandex.com', 'mail.com',
  'gmx.com', 'fastmail.com', 'hey.com', 'tutanota.com',
]);

// Generic senders to skip
const GENERIC_PATTERNS = [
  /^(noreply|no-reply|donotreply|do-not-reply|notifications?|alerts?|info|support|billing|admin|system|mailer-daemon)/i,
];

function isGenericSender(email: string): boolean {
  const local = email.split('@')[0];
  return GENERIC_PATTERNS.some(p => p.test(local));
}

function extractDomain(email: string): string | null {
  const parts = email.split('@');
  return parts.length === 2 ? parts[1].toLowerCase() : null;
}

// ============================================================================
// Contact Matching Pipeline
// ============================================================================

interface MatchResult {
  contactId: string | null;
  accountId: string | null;
  dealId: string | null;
  matchMethod: string | null;
}

interface BounceContext {
  contactId: string | null;
  accountId: string | null;
  dealId: string | null;
  contactName: string | null;
  sendAuditId: string | null;
  originalSubject: string | null;
}

async function matchEmailToCRM(
  email: string,
  organizationId: string
): Promise<MatchResult> {
  const result: MatchResult = { contactId: null, accountId: null, dealId: null, matchMethod: null };

  // 1. Exact email match to contact
  const { data: contact } = await admin
    .from('contacts')
    .select('id, account_id')
    .eq('organization_id', organizationId)
    .ilike('email', email)
    .limit(1)
    .maybeSingle();

  if (contact) {
    result.contactId = contact.id;
    result.accountId = contact.account_id || null;
    result.matchMethod = 'email_exact';

    // 2. Find linked deal via contact
    const { data: dealContact } = await admin
      .from('deals')
      .select('id')
      .eq('organization_id', organizationId)
      .eq('contact_id', contact.id)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (dealContact) {
      result.dealId = dealContact.id;
    } else if (result.accountId) {
      // Try via account
      const { data: dealAccount } = await admin
        .from('deals')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('account_id', result.accountId)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (dealAccount) result.dealId = dealAccount.id;
    }

    return result;
  }

  // 3. Domain match to account (if not a personal domain)
  const domain = extractDomain(email);
  if (domain && !PERSONAL_DOMAINS.has(domain)) {
    const { data: account } = await admin
      .from('accounts')
      .select('id')
      .eq('organization_id', organizationId)
      .ilike('domain', domain)
      .limit(1)
      .maybeSingle();

    if (account) {
      result.accountId = account.id;
      result.matchMethod = 'domain';

      // Find a deal via account
      const { data: deal } = await admin
        .from('deals')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('account_id', account.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (deal) result.dealId = deal.id;
    }
  }

  return result;
}

// ============================================================================
// Activity Creation
// ============================================================================

async function createEmailActivity(
  msg: EmailMessage,
  match: MatchResult,
  userId: string,
  organizationId: string
): Promise<string | null> {
  const activityType = msg.direction === 'outbound' ? 'email_sent' : 'email_received';
  const title = msg.direction === 'outbound'
    ? `Email sent: ${msg.subject || '(no subject)'}`
    : `Email received: ${msg.subject || '(no subject)'}`;

  const { data, error } = await admin
    .from('activities')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      assigned_to: userId,
      type: activityType,
      title,
      subject: msg.subject,
      description: msg.snippet || '',
      contact_id: match.contactId,
      account_id: match.accountId,
      deal_id: match.dealId,
      scheduled_at: msg.receivedAt,
      activity_date: msg.receivedAt,
      completed: true,
    })
    .select('id')
    .single();

  if (error) {
    console.warn(`[sync-email] Activity creation failed: ${error.message}`);
    return null;
  }
  return data.id;
}

async function createBounceActivity(
  msg: EmailMessage,
  ctx: BounceContext,
  userId: string,
  organizationId: string,
  bouncedRecipientEmail: string | null
): Promise<string | null> {
  const subject = ctx.originalSubject || msg.subject || '(no subject)';
  const recipientLabel = ctx.contactName || bouncedRecipientEmail || 'recipient';
  const { data, error } = await admin
    .from('activities')
    .insert({
      organization_id: organizationId,
      user_id: userId,
      assigned_to: userId,
      type: 'email_bounced',
      title: `Email bounced: ${recipientLabel}`,
      subject,
      description: msg.bounceReason || msg.snippet || 'Delivery failure notification',
      contact_id: ctx.contactId,
      account_id: ctx.accountId,
      deal_id: ctx.dealId,
      scheduled_at: msg.receivedAt,
      activity_date: msg.receivedAt,
      completed: true,
    })
    .select('id')
    .single();

  if (error) {
    console.warn(`[sync-email] Bounce activity creation failed: ${error.message}`);
    return null;
  }
  return data.id;
}

async function resolveBounceContext(
  recipientEmail: string | null,
  userId: string,
  organizationId: string
): Promise<BounceContext> {
  const match = recipientEmail
    ? await matchEmailToCRM(recipientEmail, organizationId)
    : { contactId: null, accountId: null, dealId: null, matchMethod: null };

  let sendAudit: any = null;
  if (recipientEmail) {
    const { data } = await admin
      .from('email_sends')
      .select('id, contact_id, deal_id, subject, recipient_name')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('recipient_email', recipientEmail)
      .in('status', ['pending', 'sent'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    sendAudit = data || null;
  }

  const contactId = match.contactId || sendAudit?.contact_id || null;
  const dealId = match.dealId || sendAudit?.deal_id || null;
  let accountId = match.accountId || null;
  let contactName = sendAudit?.recipient_name || null;

  if (contactId) {
    const { data: contact } = await admin
      .from('contacts')
      .select('full_name, first_name, last_name, account_id')
      .eq('organization_id', organizationId)
      .eq('id', contactId)
      .maybeSingle();
    if (contact) {
      accountId ||= contact.account_id || null;
      contactName ||= contact.full_name || [contact.first_name, contact.last_name].filter(Boolean).join(' ') || null;
    }
  }

  if (!accountId && dealId) {
    const { data: deal } = await admin
      .from('deals')
      .select('account_id')
      .eq('organization_id', organizationId)
      .eq('id', dealId)
      .maybeSingle();
    accountId = deal?.account_id || null;
  }

  return {
    contactId,
    accountId,
    dealId,
    contactName,
    sendAuditId: sendAudit?.id || null,
    originalSubject: sendAudit?.subject || null,
  };
}

async function markSendAsBounced(
  auditId: string | null,
  msg: EmailMessage
): Promise<void> {
  if (!auditId) return;

  const metadata = {
    bounceProviderMessageId: msg.providerId,
    bounceThreadId: msg.threadId,
    bounceReason: msg.bounceReason || msg.snippet || null,
    bouncedAt: msg.receivedAt,
  };

  const { error } = await admin
    .from('email_sends')
    .update({
      status: 'bounced',
      error_message: msg.bounceReason || msg.snippet || 'Delivery failure notification',
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', auditId);

  if (!error) return;

  console.warn(`[sync-email] Failed to mark email send as bounced: ${error.message}`);
}

async function notifyBounce(
  msg: EmailMessage,
  ctx: BounceContext,
  userId: string,
  organizationId: string,
  bouncedRecipientEmail: string | null,
  activityId: string | null
): Promise<void> {
  const recipientLabel = ctx.contactName || bouncedRecipientEmail || 'recipient';
  const subject = ctx.originalSubject || msg.subject || '(no subject)';
  const dedupKey = `email-bounce:${organizationId}:${msg.providerId}`;

  const { error } = await admin
    .from('suggested_actions')
    .upsert({
      organization_id: organizationId,
      contact_id: ctx.contactId,
      deal_id: ctx.dealId,
      action_type: 'follow_up',
      title: `Email bounced for ${recipientLabel}`,
      description: `The email "${subject}" appears to have bounced. Verify the address before following up.`,
      priority: 'high',
      dedup_key: dedupKey,
      reasoning: msg.bounceReason || msg.snippet || 'Gmail delivered a bounce notification.',
      confidence: 0.95,
      status: 'active',
      assigned_to: userId,
      expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
      evidence: {
        trigger_event: 'email_bounce',
        data_points: {
          provider_message_id: msg.providerId,
          provider_thread_id: msg.threadId,
          bounced_recipient_email: bouncedRecipientEmail,
          activity_id: activityId,
        },
      },
    }, { onConflict: 'dedup_key', ignoreDuplicates: true });

  if (error) {
    console.warn(`[sync-email] Bounce notification creation failed: ${error.message}`);
  }
}

async function processBounceMessage(
  msg: EmailMessage,
  userId: string,
  organizationId: string,
  providerName: EmailProvider['name']
): Promise<boolean> {
  const bouncedRecipientEmail = msg.bouncedRecipientEmail || null;
  const ctx = await resolveBounceContext(bouncedRecipientEmail, userId, organizationId);
  let emailMessageId: string | null = null;

  const { data: insertedEmail, error: insertError } = await admin
    .from('email_messages')
    .insert({
      user_id: userId,
      organization_id: organizationId,
      provider: providerName,
      provider_message_id: msg.providerId,
      provider_thread_id: msg.threadId,
      direction: msg.direction,
      from_email: msg.fromEmail,
      from_name: msg.fromName,
      to_emails: msg.toEmails,
      cc_emails: msg.ccEmails,
      subject: msg.subject,
      snippet: msg.snippet,
      received_at: msg.receivedAt,
      label_ids: msg.labelIds,
      has_attachments: msg.hasAttachments,
      contact_id: ctx.contactId,
      account_id: ctx.accountId,
      deal_id: ctx.dealId,
      match_status: 'ignored',
      match_method: 'bounce',
    })
    .select('id')
    .single();

  if (insertError) {
    if (insertError.code === '23505') return false;
    console.warn(`[sync-email] Bounce email record insert failed: ${insertError.message}`);
  } else {
    emailMessageId = insertedEmail?.id || null;
  }

  const activityId = await createBounceActivity(msg, ctx, userId, organizationId, bouncedRecipientEmail);
  if (emailMessageId && activityId) {
    await admin
      .from('email_messages')
      .update({ activity_id: activityId, updated_at: new Date().toISOString() })
      .eq('id', emailMessageId);
  }
  await markSendAsBounced(ctx.sendAuditId, msg);
  await notifyBounce(msg, ctx, userId, organizationId, bouncedRecipientEmail, activityId);
  return true;
}

// ============================================================================
// Engagement Stats Update
// ============================================================================

async function updateEngagementStats(
  contactId: string,
  organizationId: string,
  direction: 'inbound' | 'outbound',
  receivedAt: string
): Promise<void> {
  // Upsert engagement stats
  const field = direction === 'outbound' ? 'total_emails_sent' : 'total_emails_received';
  const dateField = direction === 'outbound' ? 'last_email_sent_at' : 'last_email_received_at';

  // Check if stats exist
  const { data: existing } = await admin
    .from('email_engagement_stats')
    .select('id, total_emails_sent, total_emails_received')
    .eq('contact_id', contactId)
    .maybeSingle();

  if (existing) {
    const update: Record<string, any> = {
      [field]: (existing[field as keyof typeof existing] as number || 0) + 1,
      [dateField]: receivedAt,
      updated_at: new Date().toISOString(),
    };
    await admin
      .from('email_engagement_stats')
      .update(update)
      .eq('id', existing.id);
  } else {
    await admin
      .from('email_engagement_stats')
      .insert({
        contact_id: contactId,
        organization_id: organizationId,
        [field]: 1,
        [dateField]: receivedAt,
        updated_at: new Date().toISOString(),
      });
  }
}

// ============================================================================
// Main Sync Logic
// ============================================================================

async function syncEmailsForUser(
  userId: string,
  organizationId: string,
  provider: EmailProvider
): Promise<{ synced: number; matched: number; bounced: number; errors: number }> {
  const stats = { synced: 0, matched: 0, bounced: 0, errors: 0 };

  // 1. Get user's Google token
  const { data: tokenRow, error: tokenError } = await admin
    .from('google_tokens')
    .select('refresh_token, access_token, expires_at, scopes')
    .eq('user_id', userId)
    .maybeSingle();

  if (tokenError || !tokenRow?.refresh_token) {
    console.warn(`[sync-email] No token for user ${userId}`);
    return stats;
  }

  // Check if gmail.readonly scope is granted
  const scopes: string[] = tokenRow.scopes || [];
  if (!scopes.some(s => s.includes('gmail.readonly'))) {
    console.log(`[sync-email] User ${userId} has not granted gmail.readonly scope`);
    return stats;
  }

  // Refresh access token
  let accessToken = tokenRow.access_token;
  const expiresAt = tokenRow.expires_at ? new Date(tokenRow.expires_at) : null;
  if (!expiresAt || expiresAt < new Date()) {
    const refreshed = await refreshAccessToken(tokenRow.refresh_token);
    accessToken = refreshed.accessToken;
    // Update stored token
    await admin
      .from('google_tokens')
      .update({
        access_token: refreshed.accessToken,
        expires_at: new Date(Date.now() + (refreshed.expiresIn || 3600) * 1000).toISOString(),
      })
      .eq('user_id', userId);
  }

  // 2. Get or create sync state
  let { data: syncState } = await admin
    .from('email_sync_state')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', provider.name)
    .maybeSingle();

  if (!syncState) {
    const { data: newState } = await admin
      .from('email_sync_state')
      .insert({
        user_id: userId,
        organization_id: organizationId,
        provider: provider.name,
        sync_status: 'active',
      })
      .select()
      .single();
    syncState = newState;
  }

  // 3. Determine user's email for direction detection
  const { data: profile } = await admin
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle();
  const userEmail = profile?.email || '';

  // 4. Fetch messages (incremental or full)
  let messages: EmailMessage[] = [];
  let newHistoryId: string | null = null;

  try {
    if (syncState?.history_id) {
      // Incremental sync
      const result = await provider.getIncrementalChanges(
        accessToken,
        syncState.history_id,
        { userEmail }
      );
      messages = result.messages;
      newHistoryId = result.newHistoryId;

      if (!newHistoryId) {
        // historyId expired — fall back to full sync
        console.log(`[sync-email] historyId expired for user ${userId}, doing full sync`);
        messages = await provider.fetchMessages(accessToken, {
          userEmail,
          maxResults: 200,
          afterDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        });
      }
    } else {
      // First full sync
      messages = await provider.fetchMessages(accessToken, {
        userEmail,
        maxResults: 200,
        afterDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      });
    }
  } catch (err: any) {
    console.error(`[sync-email] Fetch failed for user ${userId}:`, err.message);
    await admin
      .from('email_sync_state')
      .update({ sync_status: 'error', error_message: err.message, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('provider', provider.name);
    return stats;
  }

  console.log(`[sync-email] Fetched ${messages.length} messages for user ${userId}`);

  // 5. Process each message
  for (const msg of messages) {
    try {
      if (msg.isBounce) {
        const processed = await processBounceMessage(msg, userId, organizationId, provider.name);
        if (processed) {
          stats.bounced++;
          stats.synced++;
        }
        continue;
      }

      // Skip generic senders
      if (isGenericSender(msg.fromEmail)) continue;

      // Check for duplicates
      const { data: existing } = await admin
        .from('email_messages')
        .select('id')
        .eq('user_id', userId)
        .eq('provider', provider.name)
        .eq('provider_message_id', msg.providerId)
        .maybeSingle();

      if (existing) continue; // Already synced

      // Match to CRM entities
      const targetEmail = msg.direction === 'outbound'
        ? (msg.toEmails[0] || msg.fromEmail)
        : msg.fromEmail;
      const match = await matchEmailToCRM(targetEmail, organizationId);

      const hasCrmMatch = Boolean(match.contactId || match.accountId || match.dealId);
      const matchStatus = hasCrmMatch ? 'matched' : 'unmatched';

      // Create activity
      let activityId: string | null = null;
      if (hasCrmMatch) {
        activityId = await createEmailActivity(msg, match, userId, organizationId);
        stats.matched++;
      }

      // Insert email message record
      await admin
        .from('email_messages')
        .insert({
          user_id: userId,
          organization_id: organizationId,
          provider: provider.name,
          provider_message_id: msg.providerId,
          provider_thread_id: msg.threadId,
          direction: msg.direction,
          from_email: msg.fromEmail,
          from_name: msg.fromName,
          to_emails: msg.toEmails,
          cc_emails: msg.ccEmails,
          subject: msg.subject,
          snippet: msg.snippet,
          received_at: msg.receivedAt,
          label_ids: msg.labelIds,
          has_attachments: msg.hasAttachments,
          contact_id: match.contactId,
          account_id: match.accountId,
          deal_id: match.dealId,
          activity_id: activityId,
          match_status: matchStatus,
          match_method: match.matchMethod,
        });

      // Update engagement stats
      if (match.contactId) {
        await updateEngagementStats(match.contactId, organizationId, msg.direction, msg.receivedAt);
      }

      stats.synced++;
    } catch (err: any) {
      console.warn(`[sync-email] Error processing message ${msg.providerId}:`, err.message);
      stats.errors++;
    }
  }

  // 6. Update sync state
  // If we don't have a newHistoryId from incremental, get the current one
  if (!newHistoryId) {
    try {
      const profileRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        newHistoryId = profileData.historyId;
      }
    } catch {
      // Non-critical — we'll get it next time
    }
  }

  await admin
    .from('email_sync_state')
    .update({
      history_id: newHistoryId || syncState?.history_id,
      last_incremental_sync_at: new Date().toISOString(),
      last_full_sync_at: syncState?.history_id ? syncState.last_full_sync_at : new Date().toISOString(),
      sync_status: 'active',
      error_message: null,
      messages_synced_count: (syncState?.messages_synced_count || 0) + stats.synced,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('provider', provider.name);

  console.log(`[sync-email] User ${userId}: synced=${stats.synced}, matched=${stats.matched}, errors=${stats.errors}`);
  return stats;
}

// ============================================================================
// HTTP Handler
// ============================================================================

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return handleCorsOptions(req);

  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    if (userId) {
      // Single user sync (manual trigger from settings)
      const { data: member } = await admin
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', userId)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (!member) {
        return new Response(JSON.stringify({ error: 'No active organization' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        });
      }

      const stats = await syncEmailsForUser(userId, member.organization_id, gmailProvider);
      return new Response(JSON.stringify({ success: true, ...stats }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // Batch sync (cron trigger) — sync all users with active email sync
    const { data: activeUsers } = await admin
      .from('email_sync_state')
      .select('user_id, organization_id')
      .eq('provider', 'gmail')
      .eq('sync_status', 'active');

    const results = [];
    for (const user of activeUsers || []) {
      const stats = await syncEmailsForUser(user.user_id, user.organization_id, gmailProvider);
      results.push({ userId: user.user_id, ...stats });
    }

    return new Response(JSON.stringify({ success: true, users: results.length, results }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  } catch (error: any) {
    console.error('[sync-email] Error:', error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
});
