/**
 * Email Provider Abstraction
 *
 * Provider-agnostic interface for email ingestion.
 * Gmail implementation ships first; Outlook plugs in later
 * with the same interface — no changes to the matching pipeline
 * or activity creation logic.
 */

// ============================================================================
// Types
// ============================================================================

export interface EmailMessage {
  providerId: string;        // Gmail message ID or Outlook message ID
  threadId: string | null;   // Gmail thread ID or Outlook conversation ID
  direction: 'inbound' | 'outbound';
  fromEmail: string;
  fromName: string | null;
  toEmails: string[];
  ccEmails: string[];
  subject: string | null;
  snippet: string | null;    // first ~200 chars, no full body
  receivedAt: string;        // ISO timestamp
  labelIds: string[];        // Gmail labels or Outlook categories
  hasAttachments: boolean;
}

export interface SyncOpts {
  maxResults?: number;
  afterDate?: string;        // ISO date, for initial full sync window
  userEmail: string;         // the user's email address (to determine direction)
}

export interface IncrementalResult {
  messages: EmailMessage[];
  newHistoryId: string | null; // updated cursor for next sync
  hasMore: boolean;
}

// ============================================================================
// Provider Interface
// ============================================================================

export interface EmailProvider {
  readonly name: 'gmail' | 'outlook';

  /**
   * Fetch messages for initial full sync (e.g., last 30 days).
   * Returns metadata only — no full body.
   */
  fetchMessages(accessToken: string, opts: SyncOpts): Promise<EmailMessage[]>;

  /**
   * Fetch only messages that changed since the last sync cursor.
   * Gmail: uses historyId. Outlook: uses delta token.
   */
  getIncrementalChanges(
    accessToken: string,
    sinceCursor: string,
    opts: SyncOpts
  ): Promise<IncrementalResult>;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Determine email direction based on the user's email address.
 * If the From matches the user, it's outbound; otherwise inbound.
 */
export function determineDirection(fromEmail: string, userEmail: string): 'inbound' | 'outbound' {
  return fromEmail.toLowerCase().trim() === userEmail.toLowerCase().trim()
    ? 'outbound'
    : 'inbound';
}

/**
 * Extract a clean email address from a "Name <email>" format.
 */
export function extractEmailAddress(raw: string): string {
  const match = raw.match(/<([^>]+)>/);
  return (match ? match[1] : raw).trim().toLowerCase();
}

/**
 * Extract display name from a "Name <email>" format.
 */
export function extractDisplayName(raw: string): string | null {
  const match = raw.match(/^([^<]+)</);
  if (match) {
    const name = match[1].trim().replace(/^["']|["']$/g, '');
    return name || null;
  }
  return null;
}
