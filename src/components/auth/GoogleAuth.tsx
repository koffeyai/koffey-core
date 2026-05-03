import { supabase } from '@/integrations/supabase/client';
import { getSupabaseConfig } from '@/lib/secureConfig';

function getFunctionsBaseUrl(): string {
  const { url } = getSupabaseConfig();
  return `${String(url || '').replace(/\/$/, '')}/functions/v1`;
}

function buildFunctionUrl(name: string, query = ''): string {
  const base = getFunctionsBaseUrl();
  return `${base}/${name}${query}`;
}

export interface GoogleOAuthStatus {
  configured: boolean;
  missing: string[];
  redirect_uri?: string;
  storage_ready?: boolean;
  storage_error?: string;
}

export const GMAIL_READ_SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
export const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

export interface GoogleConnectionStatus {
  connected: boolean;
  scopes: string[];
  missingScopes: string[];
  hasRefreshToken: boolean;
}

function parseMissingConfig(value?: string | null): string[] {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function formatMissingConfigList(missing: string[]): string {
  if (missing.length === 0) return 'Google OAuth credentials';
  if (missing.length === 1) return missing[0];
  if (missing.length === 2) return `${missing[0]} and ${missing[1]}`;
  return `${missing.slice(0, -1).join(', ')}, and ${missing[missing.length - 1]}`;
}

export function buildGoogleOAuthSetupMessage(missing: string[] = [], redirectUri?: string): string {
  const missingLabel = formatMissingConfigList(missing);
  const redirectText = redirectUri
    ? ` Then register this Google redirect URI: ${redirectUri}`
    : '';
  return `${missingLabel} is not configured for this deployment. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env and rerun npm run setup.${redirectText}`;
}

export function buildGoogleOAuthStorageMessage(storageError?: string | null): string {
  switch (storageError) {
    case 'invalid_service_role_key':
      return 'Google OAuth is configured, but Supabase token storage is not ready. Replace SUPABASE_SERVICE_ROLE_KEY with the service_role key from this Supabase project, then rerun npm run setup.';
    case 'schema_missing':
      return 'Google OAuth is configured, but the google_tokens table is missing. Run npm run setup to apply the Supabase schema.';
    default:
      return 'Google OAuth is configured, but Koffey cannot verify token storage. Check SUPABASE_SERVICE_ROLE_KEY, the google_tokens table, and edge-function logs.';
  }
}

export function describeGoogleOAuthError(
  errorCode?: string | null,
  missingCsv?: string | null,
  redirectUri?: string | null,
  detail?: string | null,
): string {
  const missing = parseMissingConfig(missingCsv);

  switch (errorCode) {
    case 'access_denied':
      return 'You declined the Google connection request.';
    case 'oauth_not_configured':
      return buildGoogleOAuthSetupMessage(missing, redirectUri || undefined);
    case 'token_exchange_failed':
      if (detail === 'invalid_client_secret' || detail === 'invalid_client') {
        return 'Google accepted the sign-in, but rejected the OAuth client secret. Copy the current client secret from the matching Google OAuth client, update GOOGLE_CLIENT_SECRET, then rerun npm run setup.';
      }
      if (detail === 'redirect_uri_mismatch') {
        return `Google accepted the sign-in, but rejected the callback URL during token exchange. Confirm the authorized redirect URI exactly matches ${redirectUri || 'your Supabase google-oauth function URL'}.`;
      }
      if (detail === 'invalid_grant') {
        return 'Google accepted the sign-in, but rejected the authorization code. Try connecting again; if it repeats, recreate the Google OAuth client secret and rerun npm run setup.';
      }
      return `Google accepted the sign-in, but the token exchange failed. Check that the authorized redirect URI exactly matches ${redirectUri || 'your Supabase google-oauth function URL'}.`;
    case 'no_refresh_token':
      return 'Google did not return a refresh token. Remove the app from your Google account permissions and try connecting again.';
    case 'storage_failed':
      return 'Google returned tokens, but Koffey could not store them. Check SUPABASE_SERVICE_ROLE_KEY, your Supabase schema, and function logs.';
    default:
      return errorCode ? `Error: ${errorCode}` : 'Google connection failed.';
  }
}

export async function getGoogleOAuthStatus(): Promise<GoogleOAuthStatus | null> {
  try {
    const response = await fetch(buildFunctionUrl('google-oauth', '?mode=status'));
    if (!response.ok) return null;

    const data = await response.json();
    return {
      configured: Boolean(data?.configured),
      missing: Array.isArray(data?.missing) ? data.missing.filter((value: unknown): value is string => typeof value === 'string') : [],
      redirect_uri: typeof data?.redirect_uri === 'string' ? data.redirect_uri : undefined,
      storage_ready: typeof data?.storage_ready === 'boolean' ? data.storage_ready : undefined,
      storage_error: typeof data?.storage_error === 'string' ? data.storage_error : undefined,
    };
  } catch (error) {
    console.warn('Unable to verify Google OAuth configuration before redirect:', error);
    return null;
  }
}

async function ensureGoogleOAuthConfigured() {
  const status = await getGoogleOAuthStatus();
  if (status && !status.configured) {
    throw new Error(buildGoogleOAuthSetupMessage(status.missing, status.redirect_uri));
  }
  if (status && status.storage_ready === false) {
    throw new Error(buildGoogleOAuthStorageMessage(status.storage_error));
  }
}

// Sign in- Use supabase's built in oauth
export async function connectGoogleLogin() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      scopes: 'openid email profile',
      redirectTo: `${window.location.origin}/auth/callback`,
      queryParams: {
        include_granted_scopes: 'true',
        prompt: 'consent'
      }
    }
  });
  
  if (error) {
    console.error('Google sign in error:', error);
    throw error;
  }
  
}

// Initiate Google OAuth via the edge function. The edge function verifies the
// Supabase JWT, derives the userId server-side, and returns a signed Google
// auth URL. The frontend then redirects to it.
async function startGoogleOAuth(scopes: string, returnTo: string): Promise<void> {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('Not authenticated. Please sign in first.');

  const fnUrl = buildFunctionUrl(
    'google-oauth',
    `?mode=start&scopes=${encodeURIComponent(scopes)}&returnTo=${encodeURIComponent(returnTo)}`,
  );

  const res = await fetch(fnUrl, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  });

  if (!res.ok) {
    let body: { error?: string; missing?: string[] } = {};
    try { body = await res.json(); } catch { /* not JSON */ }

    if (body.error === 'auth_required') {
      throw new Error('Not authenticated. Please sign in and try again.');
    }
    if (body.error === 'oauth_not_configured') {
      throw new Error(buildGoogleOAuthSetupMessage(body.missing || []));
    }
    throw new Error(body.error || `OAuth start failed (HTTP ${res.status}).`);
  }

  const { auth_url } = await res.json();
  if (!auth_url) throw new Error('OAuth start did not return an auth URL.');

  window.location.href = auth_url;
}

// Google calendar - Handle oauth in edge function
// Now requesting full calendar access for bidirectional sync (create events from tasks)
export async function connectCalendar(user: { id: string }, returnTo?: string) {
  await ensureGoogleOAuthConfigured();

  const url = new URL(window.location.href);
  const finalReturnTo = returnTo || `${url.origin}/app`;

  await startGoogleOAuth('https://www.googleapis.com/auth/calendar', finalReturnTo);
}

// Google Drive - Handle oauth in edge function (for Slide Studio exports)
export async function connectGoogleDrive(user: { id: string }, returnTo?: string) {
  await ensureGoogleOAuthConfigured();

  const url = new URL(window.location.href);
  const finalReturnTo = returnTo || `${url.origin}/slides`;

  await startGoogleOAuth('https://www.googleapis.com/auth/drive.file', finalReturnTo);
}

export async function connectGoogleScope(scopes: string, returnTo?: string) {
  await ensureGoogleOAuthConfigured();

  const url = new URL(window.location.href);
  const finalReturnTo = returnTo || `${url.origin}/app`;

  await startGoogleOAuth(scopes, finalReturnTo);
}

// Gmail Email - request inbox sync and explicit send access used by scheduling/email actions.
export async function connectEmail(user: { id: string }, returnTo?: string) {
  await connectGoogleScope(`${GMAIL_READ_SCOPE} ${GMAIL_SEND_SCOPE}`, returnTo);
}

// Check if user has Gmail connected with proper scope
export async function checkGmailConnection(): Promise<GoogleConnectionStatus> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { connected: false, scopes: [], missingScopes: [GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE], hasRefreshToken: false };

    const { data, error } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error || !data?.refresh_token) {
      return { connected: false, scopes: [], missingScopes: [GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE], hasRefreshToken: false };
    }

    const scopes = data.scopes || [];
    const missingScopes = [GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE].filter((scope) => !scopes.includes(scope));
    const hasGmailScope = missingScopes.length === 0;

    return { connected: hasGmailScope, scopes, missingScopes, hasRefreshToken: true };
  } catch {
    return { connected: false, scopes: [], missingScopes: [GMAIL_READ_SCOPE, GMAIL_SEND_SCOPE], hasRefreshToken: false };
  }
}

// Check if user has Google Drive connected with proper scope
export async function checkGoogleDriveConnection(): Promise<{ connected: boolean; scopes: string[] }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { connected: false, scopes: [] };

    // Check google_tokens (canonical table) for refresh_token and drive scope
    const { data, error } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error || !data?.refresh_token) {
      return { connected: false, scopes: [] };
    }

    const scopes = data.scopes || [];
    
    // Accept either restricted file scope OR full drive scope
    const hasDriveScope = scopes.includes('https://www.googleapis.com/auth/drive.file') || 
                          scopes.includes('https://www.googleapis.com/auth/drive');

    return { 
      connected: hasDriveScope, 
      scopes 
    };
  } catch {
    return { connected: false, scopes: [] };
  }
}

// Check if user has Google Calendar connected with proper scope
export async function checkGoogleCalendarConnection(): Promise<{ connected: boolean; scopes: string[] }> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { connected: false, scopes: [] };

    const { data, error } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', session.user.id)
      .maybeSingle();

    if (error || !data?.refresh_token) {
      return { connected: false, scopes: [] };
    }

    const scopes = data.scopes || [];
    
    // Accept either readonly or full calendar scope
    const hasCalendarScope = scopes.includes('https://www.googleapis.com/auth/calendar.readonly') ||
                             scopes.includes('https://www.googleapis.com/auth/calendar');

    return { 
      connected: hasCalendarScope, 
      scopes 
    };
  } catch {
    return { connected: false, scopes: [] };
  }
}

// Refresh Calendar - Check connection status via token table
export async function refreshCalendar() {
  try {
    const result = await checkGoogleCalendarConnection();
    if (!result.connected) return { connected: false };

    // Get the user's email from the profile
    const { data: { session } } = await supabase.auth.getSession();
    const email = session?.user?.email || null;

    return { connected: true, email };
  } catch (error) {
    console.error("Refresh error:", error);
    return { connected: false };
  }
}

async function describeFunctionInvokeError(error: unknown, fallback: string): Promise<string> {
  const response = error && typeof error === 'object' && 'context' in error
    ? (error as { context?: Response }).context
    : undefined;

  if (response) {
    try {
      const payload = await response.clone().json();
      if (typeof payload?.error === 'string' && payload.error.trim()) {
        return payload.error;
      }
    } catch {
      // Fall through to the generic function error message.
    }
  }

  return error instanceof Error && error.message ? error.message : fallback;
}

export async function getCalendarEvents(timeMin?: string, timeMax?: string) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { connected: false, events: { items: [] } };

  // Check connection first
  const connResult = await checkGoogleCalendarConnection();
  if (!connResult.connected) return { connected: false, events: { items: [] } };

  // Build query params for date range
  const params = new URLSearchParams();
  if (timeMin) params.set('timeMin', timeMin);
  if (timeMax) params.set('timeMax', timeMax);
  const qs = params.toString();
  const fnUrl = qs ? `google-calendar?${qs}` : 'google-calendar';

  try {
    const { data, error } = await supabase.functions.invoke(fnUrl, {
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error) {
      console.error('Calendar events fetch error:', error);
      throw new Error(await describeFunctionInvokeError(error, 'Failed to fetch calendar events.'));
    }
    return { connected: true, events: data };
  } catch (err) {
    console.error('Calendar events error:', err);
    throw err instanceof Error ? err : new Error('Failed to fetch calendar events.');
  }
}
