/**
 * Centralized CORS configuration for all Edge Functions.
 *
 * SECURITY: Restricts Access-Control-Allow-Origin to known domains
 * instead of using wildcard (*) which allows any website to make
 * authenticated requests to the API.
 */

const ALLOWED_ORIGINS = [
  'http://localhost:5173',
  'http://localhost:3000',
  'http://localhost:8080',
  'http://127.0.0.1:5173',
];

function appendOrigin(origin: string | undefined) {
  if (!origin) return;
  try {
    const normalized = new URL(origin).origin;
    if (!ALLOWED_ORIGINS.includes(normalized)) {
      ALLOWED_ORIGINS.unshift(normalized);
    }
  } catch {
    console.warn(`[cors] Ignoring malformed configured origin: ${origin}`);
  }
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

function isPrivateIpv4(hostname: string): boolean {
  const privateIpPatterns = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[01])\./,
    /^192\.168\./,
    /^169\.254\./,
    /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./,
  ];
  return privateIpPatterns.some((pattern) => pattern.test(hostname));
}

function isSafeCorsOrigin(origin: string): boolean {
  try {
    const parsed = new URL(origin);
    const protocol = parsed.protocol.toLowerCase();
    const hostname = parsed.hostname.toLowerCase();

    if (parsed.username || parsed.password) return false;
    if (protocol !== 'https:' && protocol !== 'http:') return false;
    if (origin.includes('*')) return false;

    // HTTP is only allowed for local development.
    if (protocol === 'http:') {
      return isLoopbackHost(hostname);
    }

    // For HTTPS origins, block private networks and loopback.
    if (isLoopbackHost(hostname) || isPrivateIpv4(hostname)) return false;

    return true;
  } catch {
    return false;
  }
}

// Allow override via environment variable for staging/preview deployments.
// SECURITY: Only accept explicit, safe origins (no wildcard/private network origins).
appendOrigin(Deno.env.get('APP_BASE_URL') || undefined);
appendOrigin(Deno.env.get('APP_URL') || undefined);
appendOrigin(Deno.env.get('SITE_URL') || undefined);

const EXTRA_ORIGINS = Deno.env.get('CORS_ALLOWED_ORIGINS');
if (EXTRA_ORIGINS) {
  EXTRA_ORIGINS
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0)
    .forEach((origin) => {
      if (!isSafeCorsOrigin(origin)) {
        console.warn(`[cors] Ignoring unsafe CORS_ALLOWED_ORIGINS entry: ${origin}`);
        return;
      }
      if (!ALLOWED_ORIGINS.includes(origin)) {
        ALLOWED_ORIGINS.push(origin);
      }
    });
}

/**
 * Get CORS headers for a given request origin.
 * Returns the origin if it's in the allowlist, otherwise the production domain.
 */
export function getCorsHeaders(req?: Request): Record<string, string> {
  const origin = req?.headers?.get('origin') || '';
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-trace-id, x-request-id, x-internal-call, x-twilio-signature, x-telegram-bot-api-secret-token',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
    'Access-Control-Max-Age': '86400',
  };
}

/**
 * Handle OPTIONS preflight requests.
 */
export function handleCorsOptions(req: Request): Response {
  return new Response('ok', { headers: getCorsHeaders(req) });
}

/**
 * Validate a URL against SSRF attacks.
 * Blocks private IPs, localhost, cloud metadata endpoints, and non-HTTP schemes.
 */
export function validateUrlForSSRF(urlString: string): { safe: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(urlString);
  } catch {
    return { safe: false, reason: 'Invalid URL' };
  }

  // Only allow HTTP/HTTPS
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    return { safe: false, reason: `Blocked protocol: ${parsed.protocol}` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // Block localhost
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '0.0.0.0') {
    return { safe: false, reason: 'Blocked: localhost' };
  }

  // Block .local domains
  if (hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { safe: false, reason: 'Blocked: internal domain' };
  }

  // Block cloud metadata endpoints
  if (hostname === '169.254.169.254' || hostname === 'metadata.google.internal') {
    return { safe: false, reason: 'Blocked: cloud metadata endpoint' };
  }

  // Block private IP ranges
  const privateIpPatterns = [
    /^10\./,                          // 10.0.0.0/8
    /^172\.(1[6-9]|2[0-9]|3[01])\./,  // 172.16.0.0/12
    /^192\.168\./,                     // 192.168.0.0/16
    /^169\.254\./,                     // Link-local
    /^100\.(6[4-9]|[7-9][0-9]|1[01][0-9]|12[0-7])\./, // Carrier-grade NAT
  ];

  for (const pattern of privateIpPatterns) {
    if (pattern.test(hostname)) {
      return { safe: false, reason: 'Blocked: private IP range' };
    }
  }

  return { safe: true };
}
