/**
 * Skill: search_emails
 *
 * Search ingested email messages by contact, account, deal, or keyword.
 * Returns snippets + metadata, not full bodies.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const searchEmails: SkillDefinition = {
  name: 'search_emails',
  displayName: 'Search Emails',
  domain: 'email',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'search_emails',
      description: 'Search email history synced from Gmail. Find emails by contact name, company, deal, keyword, or match status. Returns email IDs, snippets, dates, direction, and CRM links. Use when user asks about email activity with a person or company, or asks which synced emails still need linking.',
      parameters: {
        type: 'object',
        properties: {
          contact_name: {
            type: 'string',
            description: 'Name of the contact to search emails for (e.g., "Sarah Chen")',
          },
          account_name: {
            type: 'string',
            description: 'Company name to search emails for (e.g., "Netflix")',
          },
          deal_name: {
            type: 'string',
            description: 'Deal name to find associated emails',
          },
          query: {
            type: 'string',
            description: 'Keyword to search in email subjects (e.g., "proposal", "contract")',
          },
          direction: {
            type: 'string',
            enum: ['inbound', 'outbound', 'all'],
            description: 'Filter by email direction. Default: all.',
          },
          match_status: {
            type: 'string',
            enum: ['matched', 'unmatched', 'ignored', 'all'],
            description: 'Filter by CRM matching status. Use "unmatched" for inbox triage.',
          },
          unmatched_only: {
            type: 'boolean',
            description: 'Shortcut for match_status=unmatched.',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of emails to return. Default: 10.',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "show me emails with X", "email history with X", "when did I last email X", "recent emails about X", "show unmatched emails"** → Use search_emails
  - Accepts contact name, account/company name, deal name, or keyword
  - Returns email IDs, snippets (first 200 chars), subject, direction, date, and CRM link status
  - Use direction filter for "emails I sent to X" (outbound) or "emails from X" (inbound)
  - Use match_status="unmatched" when the user wants email triage or asks what still needs to be linked
  - Default limit is 10, user can ask for more`,

  execute: async (ctx: ToolExecutionContext) => {
    const { contact_name, account_name, deal_name, query, direction, match_status, unmatched_only, limit: maxResults } = ctx.args;
    const resultLimit = Math.min(maxResults || 10, 25);

    let dbQuery = ctx.supabase
      .from('email_messages')
      .select('id, subject, snippet, direction, from_email, from_name, to_emails, received_at, match_status, match_method, contact_id, account_id, deal_id, activity_id, contacts(full_name), accounts(name), deals(name)')
      .eq('organization_id', ctx.organizationId)
      .eq('user_id', ctx.userId)
      .order('received_at', { ascending: false })
      .limit(resultLimit);

    // Filter by direction
    if (direction && direction !== 'all') {
      dbQuery = dbQuery.eq('direction', direction);
    }

    if (unmatched_only || match_status === 'unmatched') {
      dbQuery = dbQuery.eq('match_status', 'unmatched');
    } else if (match_status && match_status !== 'all') {
      dbQuery = dbQuery.eq('match_status', match_status);
    }

    // Filter by contact
    if (contact_name) {
      const { data: contacts } = await ctx.supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .ilike('full_name', `%${contact_name}%`)
        .limit(5);
      const contactIds = (contacts || []).map(c => c.id);
      if (contactIds.length > 0) {
        dbQuery = dbQuery.in('contact_id', contactIds);
      } else {
        // Fallback: search by email address containing the name
        dbQuery = dbQuery.or(`from_email.ilike.%${contact_name.toLowerCase().replace(/\s+/g, '.')}%,from_name.ilike.%${contact_name}%`);
      }
    }

    // Filter by account
    if (account_name) {
      const { data: accounts } = await ctx.supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .ilike('name', `%${account_name}%`)
        .limit(5);
      const accountIds = (accounts || []).map(a => a.id);
      if (accountIds.length > 0) {
        dbQuery = dbQuery.in('account_id', accountIds);
      }
    }

    // Filter by deal
    if (deal_name) {
      const { data: deals } = await ctx.supabase
        .from('deals')
        .select('id')
        .eq('organization_id', ctx.organizationId)
        .ilike('name', `%${deal_name}%`)
        .limit(5);
      const dealIds = (deals || []).map(d => d.id);
      if (dealIds.length > 0) {
        dbQuery = dbQuery.in('deal_id', dealIds);
      }
    }

    // Filter by keyword in subject
    if (query) {
      dbQuery = dbQuery.ilike('subject', `%${query}%`);
    }

    const { data: emails, error } = await dbQuery;

    if (error) {
      return { success: false, message: `Error searching emails: ${error.message}` };
    }

    if (!emails || emails.length === 0) {
      return {
        success: true,
        count: 0,
        message: 'No emails found matching your criteria. Make sure email sync is connected in Settings.',
        results: [],
      };
    }

    return {
      success: true,
      count: emails.length,
      results: emails.map((e: any) => ({
        id: e.id,
        subject: e.subject,
        snippet: e.snippet,
        direction: e.direction,
        from: e.from_name || e.from_email,
        from_email: e.from_email,
        to: e.to_emails?.join(', '),
        date: e.received_at,
        match_status: e.match_status,
        match_method: e.match_method,
        contact_id: e.contact_id,
        account_id: e.account_id,
        deal_id: e.deal_id,
        activity_id: e.activity_id,
        contact: e.contacts?.full_name,
        account: e.accounts?.name,
        deal: e.deals?.name,
      })),
    };
  },

  triggerExamples: [
    'show me emails with Sarah',
    'when did I last email Netflix?',
    'recent emails about the proposal',
    'emails I sent to Datadog',
    'show unmatched emails',
  ],
};

export default searchEmails;
