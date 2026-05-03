/**
 * Shared Google OAuth utilities for edge functions.
 *
 * Provides token refresh and credential access used by calendar sync,
 * availability checks, webhook handling, and email sending functions.
 */

export function getGoogleOAuthCredentials() {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  return { clientId, clientSecret };
}

export interface GoogleTokenRefreshResult {
  accessToken: string | null;
  errorCode?: string;
  errorDescription?: string;
}

export async function refreshAccessTokenWithDiagnostics(refreshToken: string): Promise<GoogleTokenRefreshResult> {
  const { clientId, clientSecret } = getGoogleOAuthCredentials();

  if (!clientId || !clientSecret) {
    console.error('[google-auth] Missing Google OAuth credentials');
    return {
      accessToken: null,
      errorCode: 'oauth_not_configured',
      errorDescription: 'Google OAuth credentials are not configured.',
    };
  }

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokenText = await tokenRes.text();
  let tokenPayload: Record<string, unknown> = {};
  try {
    tokenPayload = tokenText ? JSON.parse(tokenText) : {};
  } catch {
    tokenPayload = {};
  }

  if (!tokenRes.ok) {
    const errorCode = typeof tokenPayload.error === 'string' ? tokenPayload.error : 'token_refresh_failed';
    const errorDescription = typeof tokenPayload.error_description === 'string'
      ? tokenPayload.error_description
      : tokenText || 'Google token refresh failed.';

    console.error('[google-auth] Token refresh failed:', errorCode, errorDescription);
    return { accessToken: null, errorCode, errorDescription };
  }

  const accessToken = typeof tokenPayload.access_token === 'string' ? tokenPayload.access_token : null;
  if (!accessToken) {
    console.error('[google-auth] Token refresh response omitted access_token');
    return {
      accessToken: null,
      errorCode: 'missing_access_token',
      errorDescription: 'Google token refresh response omitted access_token.',
    };
  }

  return { accessToken };
}

export async function refreshAccessToken(refreshToken: string): Promise<string | null> {
  const result = await refreshAccessTokenWithDiagnostics(refreshToken);
  return result.accessToken;
}
