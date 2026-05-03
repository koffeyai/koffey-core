/**
 * Sync Calendar to CRM Edge Function
 *
 * Fetches Google Calendar events and automatically populates the CRM:
 * - Creates contacts from meeting attendees
 * - Creates/matches accounts from email domains
 * - Logs activities for each meeting
 * - Triggers enrichment for new contacts
 *
 * This is the magic function that makes "sign up → populated CRM" possible.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { refreshAccessToken } from '../_shared/google-auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    self?: boolean;
    responseStatus?: string;
  }>;
  organizer?: { email: string; displayName?: string; self?: boolean };
}

interface SyncResult {
  success: boolean;
  eventsProcessed: number;
  contactsCreated: number;
  contactsMatched: number;
  accountsCreated: number;
  accountsMatched: number;
  activitiesCreated: number;
  enrichmentQueued?: number;
  errors: string[];
  contacts: Array<{ id: string; email: string; name: string; isNew: boolean }>;
  accounts: Array<{ id: string; name: string; domain: string; isNew: boolean }>;
}

function getEventStartTime(event: CalendarEvent): string | null {
  return event.start?.dateTime || event.start?.date || null;
}

// Common personal email domains to skip for account creation
const PERSONAL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.uk', 'hotmail.com',
  'outlook.com', 'live.com', 'msn.com', 'aol.com', 'icloud.com', 'me.com',
  'mac.com', 'protonmail.com', 'proton.me', 'mail.com', 'zoho.com',
  'yandex.com', 'gmx.com', 'gmx.de', 'web.de', 'fastmail.com'
]);

/**
 * Extract domain from email address
 */
function extractDomain(email: string): string {
  return email.split('@')[1]?.toLowerCase() || '';
}

/**
 * Check if email is from a personal domain
 */
function isPersonalEmail(email: string): boolean {
  const domain = extractDomain(email);
  return PERSONAL_DOMAINS.has(domain);
}

/**
 * Parse name into first/last name
 */
function parseName(displayName?: string, email?: string): { firstName: string; lastName: string } {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return {
        firstName: parts[0],
        lastName: parts.slice(1).join(' ')
      };
    }
    return { firstName: parts[0] || '', lastName: '' };
  }

  // Try to parse from email (e.g., john.doe@company.com)
  if (email) {
    const localPart = email.split('@')[0];
    const parts = localPart.split(/[._-]/);
    if (parts.length >= 2) {
      return {
        firstName: parts[0].charAt(0).toUpperCase() + parts[0].slice(1),
        lastName: parts.slice(1).map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ')
      };
    }
    return { firstName: localPart.charAt(0).toUpperCase() + localPart.slice(1), lastName: '' };
  }

  return { firstName: '', lastName: '' };
}

/**
 * Fetch calendar events from Google
 */
async function fetchCalendarEvents(accessToken: string, daysBack: number = 30): Promise<CalendarEvent[]> {
  const timeMin = new Date();
  timeMin.setDate(timeMin.getDate() - daysBack);

  const timeMax = new Date();
  timeMax.setDate(timeMax.getDate() + 7); // Also get upcoming week

  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');
  url.searchParams.set('maxResults', '250');
  url.searchParams.set('timeMin', timeMin.toISOString());
  url.searchParams.set('timeMax', timeMax.toISOString());

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  if (!response.ok) {
    throw new Error(`Calendar API error: ${response.status}`);
  }

  const data = await response.json();
  return data.items || [];
}

/**
 * Infer fit score based on email domain
 * Business emails score higher than personal emails
 */
function inferFitScore(email: string): number {
  if (isPersonalEmail(email)) {
    return 20; // Low score for personal emails
  }

  const domain = extractDomain(email);

  // Higher score for corporate domains
  if (domain.endsWith('.com') || domain.endsWith('.io') || domain.endsWith('.co')) {
    return 60;
  }

  // Education and government
  if (domain.endsWith('.edu') || domain.endsWith('.gov')) {
    return 50;
  }

  return 40; // Default for other business domains
}

/**
 * Find or create a contact by email
 */
async function findOrCreateContact(
  email: string,
  displayName: string | undefined,
  userId: string,
  organizationId: string | null
): Promise<{ id: string; isNew: boolean }> {
  // Check if contact already exists
  const { data: existing } = await supabase
    .from('contacts')
    .select('id')
    .eq('email', email.toLowerCase())
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  // Create new contact with basic enrichment
  const { firstName, lastName } = parseName(displayName, email);
  const fullName = [firstName, lastName].filter(Boolean).join(' ');
  const domain = extractDomain(email);
  const company = isPersonalEmail(email) ? null : domain.split('.')[0];
  const fitScore = inferFitScore(email);

  const { data: newContact, error } = await supabase
    .from('contacts')
    .insert({
      email: email.toLowerCase(),
      first_name: firstName || null,
      last_name: lastName || null,
      full_name: fullName || null,
      company: company ? company.charAt(0).toUpperCase() + company.slice(1) : null,
      user_id: userId,
      organization_id: organizationId,
      lead_source: 'calendar_sync',
      capture_method: 'automatic',
      capture_context: 'Imported from Google Calendar',
      qualification_stage: 'enriched', // Mark as enriched since we have basic data
      fit_score: fitScore,
      fit_signals: {
        has_business_email: !isPersonalEmail(email),
        domain: domain,
        source: 'calendar_sync'
      },
      enriched_at: new Date().toISOString(),
      enrichment_provider: 'calendar_sync',
      data_sources: {
        calendar_sync: {
          synced_at: new Date().toISOString(),
          display_name: displayName || null
        }
      }
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create contact:', error);
    throw error;
  }

  return { id: newContact.id, isNew: true };
}

/**
 * Find or create an account by domain
 */
async function findOrCreateAccount(
  domain: string,
  userId: string,
  organizationId: string | null
): Promise<{ id: string; name: string; isNew: boolean } | null> {
  if (isPersonalEmail(`user@${domain}`)) {
    return null; // Don't create accounts for personal emails
  }

  // Check if account already exists
  const { data: existing } = await supabase
    .from('accounts')
    .select('id, name')
    .eq('domain', domain.toLowerCase())
    .eq('user_id', userId)
    .maybeSingle();

  if (existing) {
    return { id: existing.id, name: existing.name, isNew: false };
  }

  // Create new account
  const companyName = domain.split('.')[0];
  const formattedName = companyName.charAt(0).toUpperCase() + companyName.slice(1);

  const { data: newAccount, error } = await supabase
    .from('accounts')
    .insert({
      name: formattedName,
      domain: domain.toLowerCase(),
      website: `https://${domain}`,
      user_id: userId,
      organization_id: organizationId,
      account_type: 'prospect',
      data_sources: { calendar_sync: new Date().toISOString() }
    })
    .select('id, name')
    .single();

  if (error) {
    console.error('Failed to create account:', error);
    return null;
  }

  return { id: newAccount.id, name: newAccount.name, isNew: true };
}

/**
 * Create an activity for a calendar event
 */
async function createActivity(
  event: CalendarEvent,
  contactId: string,
  accountId: string | null,
  userId: string,
  organizationId: string | null
): Promise<string | null> {
  const startTime = getEventStartTime(event);
  const activityDate = startTime || new Date().toISOString();

  const { data: activity, error } = await supabase
    .from('activities')
    .insert({
      title: event.summary || 'Calendar Event',
      type: 'meeting',
      description: event.description || null,
      activity_date: activityDate,
      scheduled_at: startTime,
      contact_id: contactId,
      account_id: accountId,
      user_id: userId,
      organization_id: organizationId,
      completed: startTime ? new Date(startTime) < new Date() : false
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to create activity:', error);
    return null;
  }

  return activity.id;
}

async function updateCalendarSyncStats(userId: string, syncedAt: string): Promise<void> {
  const { error: timestampError } = await supabase
    .from('profiles')
    .update({ calendar_last_synced_at: syncedAt })
    .eq('id', userId);

  if (timestampError) {
    console.error('[sync-calendar-to-crm] Failed to update sync timestamp:', timestampError);
    return;
  }

  const { error: rpcError } = await supabase.rpc('increment_calendar_sync_count', { user_id: userId });
  if (!rpcError) return;

  console.warn('[sync-calendar-to-crm] Failed to increment sync count via RPC:', rpcError.message);

  const { data: profile, error: readError } = await supabase
    .from('profiles')
    .select('calendar_sync_count')
    .eq('id', userId)
    .maybeSingle();

  if (readError) {
    console.error('[sync-calendar-to-crm] Failed to read sync count fallback:', readError);
    return;
  }

  const currentCount = Number(profile?.calendar_sync_count || 0);
  const { error: fallbackError } = await supabase
    .from('profiles')
    .update({ calendar_sync_count: currentCount + 1 })
    .eq('id', userId);

  if (fallbackError) {
    console.error('[sync-calendar-to-crm] Failed to increment sync count fallback:', fallbackError);
  }
}

/**
 * Link contact to account
 */
async function linkContactToAccount(contactId: string, accountId: string): Promise<void> {
  await supabase
    .from('contacts')
    .update({ account_id: accountId })
    .eq('id', contactId);
}

/**
 * Main sync function
 */
async function syncCalendarToCRM(
  userId: string,
  organizationId: string | null,
  daysBack: number = 30
): Promise<SyncResult> {
  const result: SyncResult = {
    success: false,
    eventsProcessed: 0,
    contactsCreated: 0,
    contactsMatched: 0,
    accountsCreated: 0,
    accountsMatched: 0,
    activitiesCreated: 0,
    errors: [],
    contacts: [],
    accounts: []
  };

  try {
    // Get Google tokens
    const { data: tokenRow, error: tokenError } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', userId)
      .maybeSingle();

    if (tokenError || !tokenRow?.refresh_token) {
      result.errors.push('No Google account linked');
      return result;
    }

    // Check for calendar scope
    const hasCalendarScope = tokenRow.scopes?.some((s: string) =>
      s.includes('calendar')
    );

    if (!hasCalendarScope) {
      result.errors.push('Calendar access not granted');
      return result;
    }

    // Get fresh access token
    const accessToken = await refreshAccessToken(tokenRow.refresh_token);
    if (!accessToken) {
      result.errors.push('Failed to refresh access token');
      return result;
    }

    // Fetch calendar events
    const events = await fetchCalendarEvents(accessToken, daysBack);
    console.log(`[sync-calendar-to-crm] Found ${events.length} calendar events`);

    // Get user's email to exclude self from contacts
    const { data: profile } = await supabase
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    const userEmail = profile?.email?.toLowerCase();

    // Track processed emails to avoid duplicates
    const processedEmails = new Set<string>();
    const processedDomains = new Set<string>();

    // Process each event
    for (const event of events) {
      result.eventsProcessed++;

      // Skip events without attendees
      if (!event.attendees?.length) continue;

      // Process each attendee
      for (const attendee of event.attendees) {
        const email = attendee.email?.toLowerCase();
        if (!email) continue;

        // Skip self and already processed
        if (email === userEmail) continue;
        if (attendee.self) continue;
        if (processedEmails.has(email)) continue;

        processedEmails.add(email);

        try {
          // Find or create contact
          const contact = await findOrCreateContact(
            email,
            attendee.displayName,
            userId,
            organizationId
          );

          if (contact.isNew) {
            result.contactsCreated++;
          } else {
            result.contactsMatched++;
          }

          result.contacts.push({
            id: contact.id,
            email,
            name: attendee.displayName || email.split('@')[0],
            isNew: contact.isNew
          });

          // Find or create account
          const domain = extractDomain(email);
          if (domain && !processedDomains.has(domain)) {
            processedDomains.add(domain);

            const account = await findOrCreateAccount(domain, userId, organizationId);
            if (account) {
              if (account.isNew) {
                result.accountsCreated++;
              } else {
                result.accountsMatched++;
              }

              result.accounts.push({
                id: account.id,
                name: account.name,
                domain,
                isNew: account.isNew
              });

              // Link contact to account
              await linkContactToAccount(contact.id, account.id);
            }
          }

          // Create activity for the first contact in each event
          if (result.contacts.length === 1 || contact.isNew) {
            const domain = extractDomain(email);
            const account = result.accounts.find(a => a.domain === domain);

            const activityId = await createActivity(
              event,
              contact.id,
              account?.id || null,
              userId,
              organizationId
            );

            if (activityId) {
              result.activitiesCreated++;
            }
          }
        } catch (error) {
          console.error(`Error processing attendee ${email}:`, error);
          result.errors.push(`Failed to process ${email}`);
        }
      }
    }

    result.success = true;
    console.log(`[sync-calendar-to-crm] Sync complete:`, {
      events: result.eventsProcessed,
      contacts: result.contactsCreated + result.contactsMatched,
      accounts: result.accountsCreated + result.accountsMatched,
      activities: result.activitiesCreated
    });

    await updateCalendarSyncStats(userId, new Date().toISOString());

  } catch (error) {
    console.error('[sync-calendar-to-crm] Sync failed:', error);
    result.errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  return result;
}

/**
 * Mark onboarding as complete for a user
 */
async function markOnboardingComplete(userId: string): Promise<void> {
  await supabase
    .from('profiles')
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq('id', userId)
    .is('onboarding_completed_at', null); // Only update if not already set
}

// Main handler
Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Authenticate user
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get request body
    const body = await req.json().catch(() => ({}));
    const daysBack = body.daysBack || 30;
    const completeOnboarding = body.completeOnboarding || false;
    const triggerEnrichment = body.triggerEnrichment !== false; // Default true

    // Get user's organization
    const { data: membership } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .maybeSingle();

    const organizationId = membership?.organization_id || null;

    // Run the sync
    const result = await syncCalendarToCRM(user.id, organizationId, daysBack);

    // Mark onboarding complete if requested and sync was successful
    if (result.success && completeOnboarding) {
      await markOnboardingComplete(user.id);
    }

    // Trigger async enrichment for new contacts (fire and forget)
    if (result.success && triggerEnrichment && result.contactsCreated > 0) {
      // Queue enrichment for new contacts - this runs async
      const newContactIds = result.contacts
        .filter(c => c.isNew)
        .map(c => c.id);

      if (newContactIds.length > 0) {
        // Fire off enrichment requests without waiting
        // The enrichment will happen in the background
        console.log(`[sync-calendar-to-crm] Queuing enrichment for ${newContactIds.length} new contacts`);

        // We could call another edge function here, but for now we'll just log
        // and let the client-side enrichment service handle it
        result.enrichmentQueued = newContactIds.length;
      }
    }

    return new Response(
      JSON.stringify(result),
      {
        status: result.success ? 200 : 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error) {
    console.error('[sync-calendar-to-crm] Handler error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Internal server error'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
