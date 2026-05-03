/**
 * Gmail Email Provider
 *
 * Implements the EmailProvider interface for Google Gmail API.
 * Uses metadata-only fetching (no body) for privacy and performance.
 * Supports incremental sync via Gmail historyId.
 */

import type {
  EmailProvider,
  EmailMessage,
  SyncOpts,
  IncrementalResult,
} from './email-provider.ts';
import { determineDirection, extractEmailAddress, extractDisplayName } from './email-provider.ts';

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me';

// ============================================================================
// Gmail Provider
// ============================================================================

export const gmailProvider: EmailProvider = {
  name: 'gmail',

  async fetchMessages(accessToken: string, opts: SyncOpts): Promise<EmailMessage[]> {
    const maxResults = opts.maxResults || 100;
    const afterDate = opts.afterDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    // Build Gmail search query: messages after date, exclude chats and drafts
    const q = `after:${afterDate.replace(/-/g, '/')} -in:chats -in:drafts`;

    // Step 1: List message IDs
    const listUrl = `${GMAIL_API}/messages?q=${encodeURIComponent(q)}&maxResults=${maxResults}`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!listRes.ok) {
      const err = await listRes.text();
      throw new Error(`Gmail list failed (${listRes.status}): ${err.substring(0, 200)}`);
    }

    const listData = await listRes.json();
    const messageIds: string[] = (listData.messages || []).map((m: any) => m.id);

    if (messageIds.length === 0) return [];

    // Step 2: Fetch metadata for each message (batch-friendly, headers only)
    const messages: EmailMessage[] = [];
    // Process in batches of 20 to avoid rate limits
    for (let i = 0; i < messageIds.length; i += 20) {
      const batch = messageIds.slice(i, i + 20);
      const batchResults = await Promise.all(
        batch.map(id => fetchMessageMetadata(accessToken, id, opts.userEmail))
      );
      messages.push(...batchResults.filter(Boolean) as EmailMessage[]);
    }

    return messages;
  },

  async getIncrementalChanges(
    accessToken: string,
    sinceHistoryId: string,
    opts: SyncOpts
  ): Promise<IncrementalResult> {
    // Gmail history API returns changes since a given historyId
    const url = `${GMAIL_API}/history?startHistoryId=${sinceHistoryId}&historyTypes=messageAdded&maxResults=100`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const err = await res.text();
      // 404 means historyId is too old — need a full resync
      if (res.status === 404) {
        console.warn('[gmail] historyId expired, need full resync');
        return { messages: [], newHistoryId: null, hasMore: false };
      }
      throw new Error(`Gmail history failed (${res.status}): ${err.substring(0, 200)}`);
    }

    const data = await res.json();
    const newHistoryId = data.historyId || sinceHistoryId;

    // Extract unique message IDs from history records
    const messageIds = new Set<string>();
    for (const record of data.history || []) {
      for (const added of record.messagesAdded || []) {
        if (added.message?.id) {
          // Skip drafts and chats
          const labels = added.message.labelIds || [];
          if (!labels.includes('DRAFT') && !labels.includes('CHAT')) {
            messageIds.add(added.message.id);
          }
        }
      }
    }

    // Fetch metadata for new messages
    const messages: EmailMessage[] = [];
    const ids = Array.from(messageIds);
    for (let i = 0; i < ids.length; i += 20) {
      const batch = ids.slice(i, i + 20);
      const batchResults = await Promise.all(
        batch.map(id => fetchMessageMetadata(accessToken, id, opts.userEmail))
      );
      messages.push(...batchResults.filter(Boolean) as EmailMessage[]);
    }

    return {
      messages,
      newHistoryId,
      hasMore: !!data.nextPageToken,
    };
  },
};

// ============================================================================
// Helpers
// ============================================================================

async function fetchMessageMetadata(
  accessToken: string,
  messageId: string,
  userEmail: string
): Promise<EmailMessage | null> {
  try {
    // format=metadata returns headers without body — privacy-first
    const url = `${GMAIL_API}/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      console.warn(`[gmail] Failed to fetch message ${messageId}: ${res.status}`);
      return null;
    }

    const msg = await res.json();
    const headers: Record<string, string> = {};
    for (const h of msg.payload?.headers || []) {
      headers[h.name.toLowerCase()] = h.value;
    }

    const fromRaw = headers['from'] || '';
    const fromEmail = extractEmailAddress(fromRaw);
    const fromName = extractDisplayName(fromRaw);

    const toRaw = headers['to'] || '';
    const toEmails = toRaw
      .split(',')
      .map(e => extractEmailAddress(e.trim()))
      .filter(Boolean);

    const ccRaw = headers['cc'] || '';
    const ccEmails = ccRaw
      ? ccRaw.split(',').map(e => extractEmailAddress(e.trim())).filter(Boolean)
      : [];

    const subject = headers['subject'] || null;
    const dateStr = headers['date'] || '';
    const receivedAt = dateStr ? new Date(dateStr).toISOString() : new Date().toISOString();

    // Snippet from Gmail API (pre-extracted, ~200 chars)
    const snippet = msg.snippet || null;

    // Check for attachments
    const hasAttachments = (msg.payload?.parts || []).some(
      (p: any) => p.filename && p.filename.length > 0
    );

    const labelIds = msg.labelIds || [];

    return {
      providerId: messageId,
      threadId: msg.threadId || null,
      direction: determineDirection(fromEmail, userEmail),
      fromEmail,
      fromName,
      toEmails,
      ccEmails,
      subject,
      snippet,
      receivedAt,
      labelIds,
      hasAttachments,
    };
  } catch (err: any) {
    console.error(`[gmail] Error fetching message ${messageId}:`, err.message);
    return null;
  }
}
