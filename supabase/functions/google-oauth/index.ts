// supabase/functions/google-oauth/index.ts
// OAuth flow handler for Google integrations (Calendar, Drive)
// Handles start and callback modes

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const GOOGLE_CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID');
const GOOGLE_CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET');
const REDIRECT_URI = `${String(Deno.env.get('SUPABASE_URL') || '').replace(/\/$/, '')}/functions/v1/google-oauth`;

function getMissingOAuthConfig(): string[] {
  const missing: string[] = [];
  if (!GOOGLE_CLIENT_ID) missing.push('GOOGLE_CLIENT_ID');
  if (!GOOGLE_CLIENT_SECRET) missing.push('GOOGLE_CLIENT_SECRET');
  return missing;
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...getCorsHeaders(req),
      'Content-Type': 'application/json',
    },
  });
}

function classifyStorageError(error: unknown): string {
  const record = error && typeof error === 'object' ? error as Record<string, unknown> : {};
  const status = Number(record.status || 0);
  const code = String(record.code || '');
  const message = String(record.message || '').toLowerCase();

  if (status === 401 || message.includes('invalid api key') || message.includes('jwt')) {
    return 'invalid_service_role_key';
  }
  if (code === '42P01' || code === 'PGRST205' || message.includes('google_tokens')) {
    return 'schema_missing';
  }
  return 'storage_unavailable';
}

async function getTokenStorageStatus(): Promise<{ storage_ready: boolean; storage_error?: string }> {
  try {
    const { error } = await supabase
      .from('google_tokens')
      .select('user_id', { head: true })
      .limit(1);

    if (!error) return { storage_ready: true };
    console.error('[google-oauth] Token storage status check failed:', error);
    return { storage_ready: false, storage_error: classifyStorageError(error) };
  } catch (error) {
    console.error('[google-oauth] Token storage status check threw:', error);
    return { storage_ready: false, storage_error: classifyStorageError(error) };
  }
}

function getGoogleTokenErrorDetail(errorText: string): string {
  try {
    const payload = JSON.parse(errorText);
    const errorCode = typeof payload?.error === 'string' ? payload.error : '';
    const description = typeof payload?.error_description === 'string'
      ? payload.error_description.toLowerCase()
      : '';

    if (errorCode === 'invalid_client' && description.includes('secret')) {
      return 'invalid_client_secret';
    }
    if (errorCode) return errorCode;
  } catch {
    // Fall through to a generic diagnostic code.
  }

  return 'unknown';
}

function getAppBaseUrl(): string {
  // APP_BASE_URL is the canonical source — setup.mjs derives it from VITE_APP_URL.
  // Only fall back to localhost when the Supabase URL itself is local (dev mode).
  const configured = Deno.env.get('APP_BASE_URL')
    || Deno.env.get('APP_URL')
    || Deno.env.get('SITE_URL');
  if (configured) return configured.replace(/\/+$/, '');

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const isLocal = /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/.test(supabaseUrl);
  if (!isLocal) {
    console.error(
      '[google-oauth] WARNING: No APP_BASE_URL, APP_URL, or SITE_URL configured. '
      + 'Falling back to localhost, but SUPABASE_URL is non-local — '
      + 'redirects will likely fail. Run npm run setup with VITE_APP_URL set.',
    );
  }
  return 'http://localhost:5173';
}

function collectAllowedRedirectHosts(): string[] {
  const hosts = new Set<string>(['localhost', '127.0.0.1']);
  const configuredOrigins = [
    getAppBaseUrl(),
    Deno.env.get('APP_BASE_URL'),
    Deno.env.get('APP_URL'),
    Deno.env.get('SITE_URL'),
    ...(Deno.env.get('CORS_ALLOWED_ORIGINS') || '').split(',').map((value) => value.trim()),
  ].filter((value): value is string => Boolean(value));

  for (const origin of configuredOrigins) {
    try {
      hosts.add(new URL(origin).hostname);
    } catch {
      // Ignore malformed origins and allow explicit configuration to drive behavior.
    }
  }

  return [...hosts];
}

// ---- Signed state for CSRF protection ----
// HMAC-signs the OAuth state using SUPABASE_SERVICE_ROLE_KEY so the callback
// can verify it was issued by this function and has not been tampered with.

const STATE_SIGNING_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

async function getHmacKey(): Promise<CryptoKey> {
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(STATE_SIGNING_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function signState(data: Record<string, string>): Promise<string> {
  const payload = btoa(JSON.stringify(data));
  const key = await getHmacKey();
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payload));
  // Format: base64-payload.hex-signature
  return `${payload}.${toHex(sig)}`;
}

async function verifyAndDecodeState(state: string): Promise<Record<string, string>> {
  const dotIdx = state.lastIndexOf('.');
  if (dotIdx === -1) throw new Error('Missing signature');

  const payload = state.slice(0, dotIdx);
  const sigHex = state.slice(dotIdx + 1);

  const key = await getHmacKey();
  const sigBytes = new Uint8Array(sigHex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const valid = await crypto.subtle.verify('HMAC', key, sigBytes, new TextEncoder().encode(payload));
  if (!valid) throw new Error('Invalid state signature');

  return JSON.parse(atob(payload));
}

/**
 * Extract the origin (scheme + host) from a full URL or returnTo value.
 * If returnTo is already absolute, extract origin from it.
 * Otherwise fall back to Referer/Origin headers, then production domain.
 */
// SECURITY: Only allow redirects to configured app hosts plus loopback hosts.
const ALLOWED_REDIRECT_HOSTS = collectAllowedRedirectHosts();

function sanitizeReturnTo(returnTo: string): string {
  if (!returnTo) return '/app';
  // Relative paths are safe
  if (returnTo.startsWith('/')) return returnTo;
  // Absolute URLs: check against allowlist
  try {
    const parsed = new URL(returnTo);
    if (ALLOWED_REDIRECT_HOSTS.includes(parsed.hostname)) {
      return returnTo;
    }
  } catch { /* invalid URL */ }
  // Reject anything else
  return '/app';
}

function resolveBaseUrl(returnTo: string, req: Request): string {
  // If returnTo is already an absolute URL, no base needed
  if (returnTo.startsWith('http')) {
    return '';
  }

  // Try Origin header (set on same-origin navigations)
  const originHeader = req.headers.get('origin');
  if (originHeader) {
    return originHeader;
  }

  // Try Referer header (usually present on navigation)
  const referer = req.headers.get('referer');
  if (referer) {
    try {
      const refUrl = new URL(referer);
      return refUrl.origin;
    } catch { /* ignore */ }
  }

  // Fallback to the configured application URL.
  return getAppBaseUrl();
}

function buildReturnUrl(baseUrl: string, returnTo: string, params: Record<string, string>): string {
  const redirectUrl = new URL(`${baseUrl}${returnTo}`);
  for (const [key, value] of Object.entries(params)) {
    if (value) redirectUrl.searchParams.set(key, value);
  }
  return redirectUrl.toString();
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  const url = new URL(req.url);
  const mode = url.searchParams.get('mode');
  const isCallback = mode === 'callback'
    || url.searchParams.has('code')
    || url.searchParams.has('state')
    || url.searchParams.has('error');

  console.log(`[google-oauth] Request: mode=${mode}`);

  if (mode === 'status') {
    const missing = getMissingOAuthConfig();
    const storage = await getTokenStorageStatus();
    return jsonResponse(req, {
      configured: missing.length === 0,
      missing,
      redirect_uri: REDIRECT_URI,
      ...storage,
    });
  }

  // ========== MODE: START ==========
  if (mode === 'start') {
    const scopes = url.searchParams.get('scopes') || '';
    const returnTo = sanitizeReturnTo(url.searchParams.get('returnTo') || '/app');
    const origin = returnTo.startsWith('http') ? '' : resolveBaseUrl(returnTo, req);

    // Verify Supabase JWT and derive userId server-side.
    // mode=start is called via fetch (not browser redirect), so return JSON errors.
    const jwt = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      console.error('[google-oauth] JWT verification failed:', authError?.message || 'no user');
      return jsonResponse(req, { error: 'auth_required' }, 401);
    }
    const userId = user.id;

    const missing = getMissingOAuthConfig();
    if (missing.length > 0) {
      console.error('[google-oauth] Missing OAuth config:', missing.join(', '));
      return jsonResponse(req, {
        error: 'oauth_not_configured',
        missing,
      }, 400);
    }

    console.log(`[google-oauth] Starting OAuth for user ${userId}, scopes: ${scopes}, returnTo: ${returnTo}, origin: ${origin}`);

    // Build HMAC-signed state for CSRF protection and callback context
    const state = await signState({ userId, returnTo, scopes, origin });

    const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    authUrl.searchParams.set('client_id', GOOGLE_CLIENT_ID);
    authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
    authUrl.searchParams.set('response_type', 'code');
    authUrl.searchParams.set('scope', decodeURIComponent(scopes));
    authUrl.searchParams.set('access_type', 'offline');
    authUrl.searchParams.set('prompt', 'consent');
    authUrl.searchParams.set('include_granted_scopes', 'true');
    authUrl.searchParams.set('state', state);

    console.log('[google-oauth] === DIAGNOSTIC INFO ===');
    console.log('[google-oauth] Client ID (first 20 chars):', GOOGLE_CLIENT_ID?.substring(0, 20));
    console.log('[google-oauth] Redirect URI:', REDIRECT_URI);
    console.log('[google-oauth] Decoded scopes:', decodeURIComponent(scopes));
    console.log('[google-oauth] === END DIAGNOSTIC ===');

    // Return the auth URL as JSON so the frontend can redirect after passing the JWT via fetch
    return jsonResponse(req, { auth_url: authUrl.toString() });
  }

  // ========== MODE: CALLBACK ==========
  if (isCallback) {
    const code = url.searchParams.get('code');
    const stateParam = url.searchParams.get('state');
    const error = url.searchParams.get('error');

    // Handle user denial
    if (error) {
      console.error('[google-oauth] User denied access:', error);
      let returnTo = '/app';
      let baseUrl = getAppBaseUrl();
      try {
        if (stateParam) {
          const stateData = await verifyAndDecodeState(stateParam);
          returnTo = sanitizeReturnTo(stateData.returnTo || '/app');
          baseUrl = returnTo.startsWith('http') ? '' : (stateData.origin || getAppBaseUrl());
        }
      } catch { /* ignore — state may be tampered, fall back to defaults */ }

      return Response.redirect(
        buildReturnUrl(baseUrl, returnTo, {
          google_error: error,
        }),
        302,
      );
    }

    if (!code || !stateParam) {
      console.error('[google-oauth] Missing code or state');
      return new Response('Missing code or state', { status: 400 });
    }

    // Verify HMAC signature and decode state
    let stateData: Record<string, string>;
    try {
      stateData = await verifyAndDecodeState(stateParam);
    } catch (stateError) {
      console.error('[google-oauth] State verification failed:', stateError);
      return new Response('Invalid or tampered state parameter', { status: 400 });
    }

    const { userId, returnTo: rawReturnTo, scopes: requestedScopes, origin: stateOrigin } = stateData;
    const returnTo = sanitizeReturnTo(rawReturnTo);

    // Use origin from state (captured at start time) for all redirects
    const baseUrl = returnTo.startsWith('http') ? '' : (stateOrigin || getAppBaseUrl());
    
    console.log(`[google-oauth] Callback for user ${userId}, returnTo: ${returnTo}, baseUrl: ${baseUrl}`);

    if (!userId) {
      return new Response('Invalid state: missing userId', { status: 400 });
    }

    const missing = getMissingOAuthConfig();
    if (missing.length > 0) {
      console.error('[google-oauth] Missing OAuth credentials:', missing.join(', '));
      return Response.redirect(
        buildReturnUrl(baseUrl, returnTo, {
          google_error: 'oauth_not_configured',
          google_missing: missing.join(','),
        }),
        302,
      );
    }

    // Exchange authorization code for tokens
    const redirectUri = REDIRECT_URI;
    console.log('[google-oauth] Exchanging code for tokens...');

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('[google-oauth] Token exchange failed:', errText);
      const googleDetail = getGoogleTokenErrorDetail(errText);
      return Response.redirect(
        buildReturnUrl(baseUrl, returnTo, {
          google_error: 'token_exchange_failed',
          google_detail: googleDetail,
        }),
        302,
      );
    }

    const tokenData = await tokenRes.json();
    const { refresh_token, access_token, expires_in, scope: grantedScopes } = tokenData;
    console.log(`[google-oauth] Token exchange successful, granted scopes: ${grantedScopes}`);

    if (!refresh_token) {
      console.warn('[google-oauth] No refresh_token returned — user may have already granted access without prompt=consent');
    }

    // Parse granted scopes into an array
    const scopesArray = grantedScopes 
      ? grantedScopes.split(' ').filter((s: string) => s.startsWith('https://')) 
      : [];

    // Get user email from Google userinfo
    let email: string | null = null;
    try {
      const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${access_token}` },
      });
      if (userInfoRes.ok) {
        const userInfo = await userInfoRes.json();
        email = userInfo.email || null;
      }
    } catch {
      // Non-critical, continue without email
    }

    // Calculate expiration
    const expiresAt = expires_in
      ? new Date(Date.now() + expires_in * 1000).toISOString()
      : null;

    // Get existing token to merge scopes
    const { data: existingToken } = await supabase
      .from('google_tokens')
      .select('scopes, refresh_token')
      .eq('user_id', userId)
      .maybeSingle();

    const existingScopes = existingToken?.scopes || [];
    const mergedScopes = [...new Set([...existingScopes, ...scopesArray])];

    // Upsert into google_tokens (the canonical table)
    const upsertData: Record<string, unknown> = {
      user_id: userId,
      access_token,
      scopes: mergedScopes,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    };

    // Only update refresh_token if we got a new one
    if (refresh_token) {
      upsertData.refresh_token = refresh_token;
    } else if (!existingToken?.refresh_token) {
      // No existing token and no new refresh token - this is a problem
      console.error('[google-oauth] No refresh token available');
      return Response.redirect(
        buildReturnUrl(baseUrl, returnTo, {
          google_error: 'no_refresh_token',
        }),
        302,
      );
    }

    const { error: upsertError } = await supabase
      .from('google_tokens')
      .upsert(upsertData, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('[google-oauth] Upsert error:', upsertError);
      return Response.redirect(
        buildReturnUrl(baseUrl, returnTo, {
          google_error: 'storage_failed',
        }),
        302,
      );
    }

    // Sync to calendar_tokens (legacy table - TODO: deprecate after migration to google_tokens is complete)
    if (refresh_token) {
      const { error: calSyncError } = await supabase
        .from('calendar_tokens')
        .upsert({
          user_id: userId,
          refresh_token,
          access_token,
          email,
          expires_at: expiresAt,
        }, { onConflict: 'user_id' });

      if (calSyncError) {
        console.warn('[google-oauth] calendar_tokens sync failed (non-critical):', calSyncError.message);
      }
    }

    console.log(`[google-oauth] Successfully stored tokens for user ${userId} with scopes: ${mergedScopes.join(', ')}`);

    // Redirect back to the app with success indicator
    const successUrl = new URL(`${baseUrl}${returnTo}`);
    successUrl.searchParams.set('google_connected', 'true');
    successUrl.searchParams.set('scopes', mergedScopes.join(','));

    return Response.redirect(successUrl.toString(), 302);
  }

  // Unknown mode - return help
  return jsonResponse(req, {
      error: 'Invalid mode. Use mode=start or mode=callback',
      usage: {
        start: '/google-oauth?mode=start&scopes=SCOPES&returnTo=/path (requires Authorization: Bearer <supabase-jwt>)',
        callback: 'Called by Google after user consent at /google-oauth',
        status: '/google-oauth?mode=status',
      }
    }, 400);
});
