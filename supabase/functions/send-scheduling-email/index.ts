// supabase/functions/send-scheduling-email/index.ts
// Sends scheduling emails via Gmail API (primary) or Resend (fallback)
// Dual-provider design for open-source flexibility

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { refreshAccessTokenWithDiagnostics } from '../_shared/google-auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';
import { AuthError, authenticateRequest, isInternalServiceCall, resolveAuthorizedOrganization } from '../_shared/auth.ts';
import { checkPersistentRateLimit, getTraceId } from '../_shared/request-controls.ts';

let corsHeaders = getCorsHeaders();

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const EMAIL_SEND_DAILY_CAP = Number(Deno.env.get('EMAIL_SEND_DAILY_CAP') || '50');
const GMAIL_SEND_SCOPE = 'https://www.googleapis.com/auth/gmail.send';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Wrap plain text body in a minimal, clean HTML email template.
 */
function wrapInHtml(body: string, senderName: string): string {
  // Convert plain text line breaks to HTML, preserve paragraphs
  const htmlBody = body
    .split('\n\n')
    .map(paragraph => `<p style="margin: 0 0 12px 0; line-height: 1.5;">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  ${htmlBody}
</body>
</html>`;
}

function escapeHtml(value: string): string {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'content-type': 'application/json' } }
  );
}

function isReconnectRequiredGoogleError(errorCode?: string): boolean {
  return errorCode === 'invalid_grant' || errorCode === 'unauthorized_client';
}

function normalizePersonName(value?: string | null): string {
  return String(value || '')
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function namesConflict(requestedName?: string | null, storedName?: string | null): boolean {
  if (String(requestedName || '').includes('@')) return false;
  const requested = normalizePersonName(requestedName);
  const stored = normalizePersonName(storedName);
  if (!requested || !stored) return false;
  if (requested === stored) return false;

  const requestedTokens = requested.split(' ').filter(Boolean);
  const storedTokens = new Set(stored.split(' ').filter(Boolean));
  if (requestedTokens.length === 1 && storedTokens.has(requestedTokens[0])) return false;

  return true;
}

function mapGoogleRefreshError(errorCode?: string): {
  errorCode: string;
  error: string;
  requiredScope?: string;
} {
  if (isReconnectRequiredGoogleError(errorCode)) {
    return {
      errorCode: 'GOOGLE_RECONNECT_REQUIRED',
      error: 'Google rejected the stored Gmail refresh token. Reconnect Gmail with send access, then try again.',
      requiredScope: GMAIL_SEND_SCOPE,
    };
  }

  if (errorCode === 'invalid_client' || errorCode === 'oauth_not_configured') {
    return {
      errorCode: 'GOOGLE_OAUTH_CONFIGURATION_ERROR',
      error: 'Google OAuth credentials are not valid for this deployment. Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, rerun setup, and reconnect Gmail.',
    };
  }

  return {
    errorCode: 'GOOGLE_TOKEN_REFRESH_FAILED',
    error: 'Koffey could not refresh the Gmail token. Reconnect Gmail with send access, then try again.',
    requiredScope: GMAIL_SEND_SCOPE,
  };
}

async function logEmailSend(params: {
  organizationId: string;
  userId: string;
  contactId?: string | null;
  dealId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  subject: string;
  status?: 'pending' | 'sent' | 'failed' | 'blocked';
  provider?: string | null;
  providerMessageId?: string | null;
  errorMessage?: string | null;
  traceId: string;
  metadata?: Record<string, unknown>;
}): Promise<string | null> {
  const { data, error } = await supabase
    .from('email_sends')
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      contact_id: params.contactId || null,
      deal_id: params.dealId || null,
      recipient_email: params.recipientEmail,
      recipient_name: params.recipientName || null,
      subject: params.subject,
      status: params.status || 'pending',
      provider: params.provider || null,
      provider_message_id: params.providerMessageId || null,
      error_message: params.errorMessage || null,
      trace_id: params.traceId,
      metadata: params.metadata || {},
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[send-scheduling-email] Failed to write email audit:', error.message);
    return null;
  }

  return data?.id || null;
}

async function updateEmailSendAudit(
  auditId: string | null,
  params: {
    status: 'sent' | 'failed' | 'blocked';
    provider?: string | null;
    providerMessageId?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (!auditId) return;

  const { error } = await supabase
    .from('email_sends')
    .update({
      status: params.status,
      provider: params.provider || null,
      provider_message_id: params.providerMessageId || null,
      error_message: params.errorMessage || null,
      metadata: params.metadata || {},
      sent_at: params.status === 'sent' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', auditId);

  if (error) {
    console.error('[send-scheduling-email] Failed to update email audit:', error.message);
  }
}

async function logSentEmailActivity(params: {
  organizationId: string;
  userId: string;
  contactId: string;
  accountId?: string | null;
  dealId?: string | null;
  recipientEmail: string;
  recipientName: string;
  subject: string;
  plainBody?: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('activities')
    .insert({
      organization_id: params.organizationId,
      user_id: params.userId,
      assigned_to: params.userId,
      type: 'email_sent',
      title: `Email sent: ${params.subject}`,
      subject: params.subject,
      description: params.plainBody || '',
      contact_id: params.contactId,
      account_id: params.accountId || null,
      deal_id: params.dealId || null,
      scheduled_at: new Date().toISOString(),
      activity_date: new Date().toISOString(),
      completed: true,
    });

  if (error) {
    console.warn('[send-scheduling-email] Failed to log sent email activity:', error.message);
  }
}

/**
 * Encode a string to base64url format (RFC 4648) for Gmail API.
 */
function base64urlEncode(str: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  // Use btoa-compatible approach for Deno
  let binary = '';
  for (const byte of data) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Build an RFC 2822 email message.
 */
function buildRawEmail(params: {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
}): string {
  const boundary = `boundary_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  return [
    `From: ${params.fromName} <${params.from}>`,
    `To: ${params.toName} <${params.to}>`,
    `Subject: ${params.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 7bit',
    '',
    params.htmlBody,
    '',
    `--${boundary}--`,
  ].join('\r\n');
}

// ============================================================================
// EMAIL PROVIDERS
// ============================================================================

async function sendViaGmail(params: {
  accessToken: string;
  from: string;
  fromName: string;
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const rawEmail = buildRawEmail(params);
  const encodedEmail = base64urlEncode(rawEmail);

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedEmail }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[send-scheduling-email] Gmail API error:', errText);
    return { success: false, error: `Gmail send failed: ${res.status}` };
  }

  const data = await res.json();
  return { success: true, messageId: data.id };
}

async function sendViaResend(params: {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  subject: string;
  htmlBody: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  if (!RESEND_API_KEY) {
    return { success: false, error: 'RESEND_API_KEY not configured' };
  }

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${params.fromName} <${params.from}>`,
      to: [`${params.toName} <${params.to}>`],
      subject: params.subject,
      html: params.htmlBody,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error('[send-scheduling-email] Resend API error:', errText);
    return { success: false, error: `Resend send failed: ${res.status}` };
  }

  const data = await res.json();
  return { success: true, messageId: data.id };
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
  const traceId = getTraceId(req, 'email');
	try {
    const body = await req.json();
    const {
      recipientEmail,
      recipientName,
      subject,
      htmlBody,
      plainBody,
      dealId,
      organizationId: requestedOrganizationId,
    } = body;

    let userId: string;

    if (isInternalServiceCall(req)) {
      if (!body.userId) {
        return jsonResponse({ success: false, error: 'userId required for internal calls', traceId }, 400);
      }
      userId = body.userId;
    } else {
      try {
        const auth = await authenticateRequest(req);
        userId = auth.userId;
      } catch (authError) {
        if (authError instanceof AuthError) {
          return jsonResponse({ success: false, error: authError.message, traceId }, authError.statusCode);
        }
        throw authError;
      }
    }

    if (!recipientEmail || !subject) {
      return jsonResponse({ success: false, error: 'recipientEmail and subject are required', traceId }, 400);
    }

    const orgAccess = await resolveAuthorizedOrganization(supabase, userId, requestedOrganizationId || null);
    if (!orgAccess?.organizationId) {
      return jsonResponse({ success: false, error: 'Organization context required', traceId }, 400);
    }
    const organizationId = orgAccess.organizationId;
    const normalizedRecipientEmail = String(recipientEmail).trim().toLowerCase();

    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('id, email, full_name, first_name, last_name, account_id, status')
      .eq('organization_id', organizationId)
      .ilike('email', normalizedRecipientEmail)
      .maybeSingle();

    if (contactError) {
      return jsonResponse({ success: false, error: 'Could not validate recipient contact', traceId }, 500);
    }

    if (!contact?.id) {
      await logEmailSend({
        organizationId,
        userId,
        recipientEmail: normalizedRecipientEmail,
        recipientName,
        subject,
        status: 'blocked',
        errorMessage: 'Recipient is not a known contact in this organization',
        traceId,
        metadata: { reason: 'unknown_contact' },
      });
      return jsonResponse({
        success: false,
        errorCode: 'UNKNOWN_RECIPIENT',
        error: 'I can only send scheduling emails to contacts in this CRM. Add this person as a contact first, then retry.',
        traceId,
      }, 403);
    }

    const storedContactName = contact.full_name
      || [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      || normalizedRecipientEmail;
    if (namesConflict(recipientName, storedContactName)) {
      await logEmailSend({
        organizationId,
        userId,
        contactId: contact.id,
        recipientEmail: normalizedRecipientEmail,
        recipientName,
        subject,
        status: 'blocked',
        errorMessage: 'Recipient name does not match CRM contact for this email',
        traceId,
        metadata: {
          reason: 'contact_name_mismatch',
          crmContactName: storedContactName,
          requestedRecipientName: recipientName,
        },
      });
      return jsonResponse({
        success: false,
        errorCode: 'CONTACT_NAME_MISMATCH',
        error: `That email is attached to ${storedContactName} in the CRM, not ${recipientName}. Update the contact or change the recipient before sending.`,
        crmContact: {
          id: contact.id,
          full_name: storedContactName,
          email: contact.email,
          status: contact.status || null,
        },
        requestedRecipientName: recipientName,
        traceId,
      }, 409);
    }

    if (dealId) {
      const { data: deal } = await supabase
        .from('deals')
        .select('id')
        .eq('id', dealId)
        .eq('organization_id', organizationId)
        .maybeSingle();

      if (!deal?.id) {
        return jsonResponse({ success: false, error: 'Deal does not belong to this organization', traceId }, 403);
      }
    }

    const emailRate = await checkPersistentRateLimit(supabase, `email-send:${organizationId}`, {
      requests: Math.max(1, EMAIL_SEND_DAILY_CAP),
      windowMs: 24 * 60 * 60 * 1000,
      blockDurationMs: 60 * 60 * 1000,
    });
    if (!emailRate.allowed) {
      await logEmailSend({
        organizationId,
        userId,
        contactId: contact.id,
        dealId: dealId || null,
        recipientEmail: normalizedRecipientEmail,
        recipientName: recipientName || contact.full_name,
        subject,
        status: 'blocked',
        errorMessage: 'Per-organization email send cap exceeded',
        traceId,
        metadata: { reason: 'rate_limited', resetTime: emailRate.resetTime },
      });
      return jsonResponse({
        success: false,
        errorCode: 'EMAIL_RATE_LIMITED',
        error: 'This organization has reached its email send safety cap. Try again later or raise the configured cap.',
        traceId,
      }, 429);
    }

    const auditId = await logEmailSend({
      organizationId,
      userId,
      contactId: contact.id,
      dealId: dealId || null,
      recipientEmail: normalizedRecipientEmail,
      recipientName: recipientName || contact.full_name,
      subject,
      status: 'pending',
      traceId,
      metadata: { source: 'send-scheduling-email' },
    });

    if (!auditId) {
      return jsonResponse({
        success: false,
        errorCode: 'AUDIT_REQUIRED',
        error: 'Email was not sent because the audit record could not be created.',
        traceId,
      }, 500);
    }

    // Get sender info
    const { data: senderProfile } = await supabase
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .maybeSingle();

    // Also get Google tokens for Gmail sending
    const { data: tokenRow } = await supabase
      .from('google_tokens')
      .select('refresh_token, scopes')
      .eq('user_id', userId)
      .maybeSingle();

    const senderName = senderProfile?.full_name || 'Sales Team';
    const senderEmail = senderProfile?.email || '';
    const resolvedRecipientName = recipientName
      || contact.full_name
      || [contact.first_name, contact.last_name].filter(Boolean).join(' ')
      || normalizedRecipientEmail;

    // Build HTML email body
    const emailHtml = htmlBody || wrapInHtml(plainBody || '', senderName);

    // Provider selection: Gmail first, then Resend
    const hasGmailScope = tokenRow?.scopes?.includes(GMAIL_SEND_SCOPE);

    let gmailSendFailure: string | null = null;

    if (hasGmailScope && tokenRow?.refresh_token) {
      // Try Gmail API
      console.log('[send-scheduling-email] Sending via Gmail API');

      const tokenRefresh = await refreshAccessTokenWithDiagnostics(tokenRow.refresh_token);
      if (!tokenRefresh.accessToken) {
        const mappedError = mapGoogleRefreshError(tokenRefresh.errorCode);
        await updateEmailSendAudit(auditId, {
          status: 'failed',
          provider: 'gmail',
          errorMessage: mappedError.error,
          metadata: {
            googleRefreshErrorCode: tokenRefresh.errorCode || null,
            googleRefreshErrorDescription: tokenRefresh.errorDescription || null,
          },
        });
        return jsonResponse({
          success: false,
          ...mappedError,
          auditId,
          traceId,
        }, mappedError.errorCode === 'GOOGLE_OAUTH_CONFIGURATION_ERROR' ? 500 : 409);
      }

      const result = await sendViaGmail({
        accessToken: tokenRefresh.accessToken,
        from: senderEmail,
        fromName: senderName,
        to: normalizedRecipientEmail,
        toName: resolvedRecipientName,
        subject,
        htmlBody: emailHtml,
      });

      if (result.success) {
        await updateEmailSendAudit(auditId, {
          status: 'sent',
          provider: 'gmail',
          providerMessageId: result.messageId || null,
        });
        await logSentEmailActivity({
          organizationId,
          userId,
          contactId: contact.id,
          accountId: contact.account_id || null,
          dealId: dealId || null,
          recipientEmail: normalizedRecipientEmail,
          recipientName: resolvedRecipientName,
          subject,
          plainBody: plainBody || null,
        });
        return jsonResponse({
          success: true,
          provider: 'gmail',
          messageId: result.messageId,
          auditId,
          contact: {
            id: contact.id,
            full_name: storedContactName,
            email: contact.email,
            status: contact.status || null,
          },
          traceId,
        });
      }

      // Gmail failed — fall through to Resend if available
      console.warn('[send-scheduling-email] Gmail send failed, trying Resend fallback:', result.error);
      gmailSendFailure = result.error || 'Gmail send failed';
    }

    // Try Resend
    if (RESEND_API_KEY) {
      console.log('[send-scheduling-email] Sending via Resend');

      // For Resend, use a configured sender domain or fall back
      const resendFrom = Deno.env.get('RESEND_FROM_EMAIL') || `noreply@${Deno.env.get('RESEND_DOMAIN') || 'notifications.koffey.com'}`;

      const result = await sendViaResend({
        from: resendFrom,
        fromName: senderName,
        to: normalizedRecipientEmail,
        toName: resolvedRecipientName,
        subject,
        htmlBody: emailHtml,
      });

      if (result.success) {
        await updateEmailSendAudit(auditId, {
          status: 'sent',
          provider: 'resend',
          providerMessageId: result.messageId || null,
        });
        await logSentEmailActivity({
          organizationId,
          userId,
          contactId: contact.id,
          accountId: contact.account_id || null,
          dealId: dealId || null,
          recipientEmail: normalizedRecipientEmail,
          recipientName: resolvedRecipientName,
          subject,
          plainBody: plainBody || null,
        });
        return jsonResponse({
          success: true,
          provider: 'resend',
          messageId: result.messageId,
          auditId,
          contact: {
            id: contact.id,
            full_name: storedContactName,
            email: contact.email,
            status: contact.status || null,
          },
          traceId,
        });
      }

      await updateEmailSendAudit(auditId, {
        status: 'failed',
        provider: 'resend',
        errorMessage: result.error || 'Resend send failed',
      });
      return jsonResponse({ success: false, error: result.error, auditId, traceId });
    }

    if (gmailSendFailure) {
      await updateEmailSendAudit(auditId, {
        status: 'failed',
        provider: 'gmail',
        errorMessage: gmailSendFailure,
      });
      return jsonResponse({
        success: false,
        errorCode: 'GMAIL_SEND_FAILED',
        error: `Gmail send failed: ${gmailSendFailure}`,
        auditId,
        traceId,
      }, 502);
    }

    // No provider available
    if (!hasGmailScope && tokenRow?.refresh_token) {
      // User has Google connected but missing gmail.send scope
      await updateEmailSendAudit(auditId, {
        status: 'failed',
        provider: 'gmail',
        errorMessage: 'Gmail send permission not granted',
      });
      return jsonResponse({
        success: false,
        errorCode: 'NEEDS_GMAIL_SCOPE',
        error: 'Gmail send permission not granted. Please reconnect Google with email sending access, or configure Resend as a fallback.',
        requiredScope: GMAIL_SEND_SCOPE,
        missingScopes: [GMAIL_SEND_SCOPE],
        auditId,
        traceId,
      });
    }

    await updateEmailSendAudit(auditId, {
      status: 'failed',
      errorMessage: 'No email provider configured',
    });
    return jsonResponse({
      success: false,
      errorCode: 'NO_EMAIL_PROVIDER',
      error: 'No email provider configured. Connect Gmail with send permissions, or set RESEND_API_KEY.',
      requiredScope: GMAIL_SEND_SCOPE,
      auditId,
      traceId,
    });

  } catch (err) {
    console.error('[send-scheduling-email] Error:', err);
    if (err instanceof AuthError) {
      return jsonResponse({ success: false, error: err.message, traceId }, err.statusCode);
    }
    return jsonResponse({ success: false, error: err.message || 'Internal error', traceId }, 500);
  }
});
