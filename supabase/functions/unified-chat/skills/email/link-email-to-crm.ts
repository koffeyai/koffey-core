/**
 * Skill: link_email_to_crm
 *
 * Manually link an ingested email message to a contact, account, and/or deal.
 * This turns unmatched synced email into usable CRM activity.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

type EmailRow = {
  id: string;
  user_id: string;
  organization_id: string;
  direction: 'inbound' | 'outbound';
  from_email: string;
  from_name: string | null;
  to_emails: string[] | null;
  subject: string | null;
  snippet: string | null;
  received_at: string;
  contact_id: string | null;
  account_id: string | null;
  deal_id: string | null;
  activity_id: string | null;
};

function asText(value: unknown): string | null {
  const text = String(value || '').trim();
  return text || null;
}

async function findSingleByIdOrName(
  ctx: ToolExecutionContext,
  table: 'contacts' | 'accounts' | 'deals',
  id?: unknown,
  name?: unknown,
  extraSelect = '*',
): Promise<{ record: any | null; error?: string; matches?: any[] }> {
  const requestedId = asText(id);
  const requestedName = asText(name);
  if (!requestedId && !requestedName) return { record: null };

  let query = ctx.supabase
    .from(table)
    .select(extraSelect)
    .eq('organization_id', ctx.organizationId);

  if (requestedId) {
    query = query.eq('id', requestedId);
  } else if (table === 'contacts') {
    query = query.ilike('full_name', `%${requestedName}%`);
  } else {
    query = query.ilike('name', `%${requestedName}%`);
  }

  const { data, error } = await query.limit(5);
  if (error) return { record: null, error: error.message };
  if (!data || data.length === 0) return { record: null };
  if (data.length > 1) return { record: null, matches: data };
  return { record: data[0] };
}

async function findEmail(ctx: ToolExecutionContext): Promise<{ email: EmailRow | null; error?: string; matches?: EmailRow[] }> {
  const emailId = asText(ctx.args.email_id);
  const subject = asText(ctx.args.email_subject);
  const fromEmail = asText(ctx.args.from_email)?.toLowerCase();
  const unmatchedOnly = ctx.args.unmatched_only !== false;

  let query = ctx.supabase
    .from('email_messages')
    .select('id, user_id, organization_id, direction, from_email, from_name, to_emails, subject, snippet, received_at, contact_id, account_id, deal_id, activity_id')
    .eq('organization_id', ctx.organizationId)
    .eq('user_id', ctx.userId)
    .order('received_at', { ascending: false });

  if (emailId) query = query.eq('id', emailId);
  if (subject) query = query.ilike('subject', `%${subject}%`);
  if (fromEmail) query = query.ilike('from_email', fromEmail);
  if (unmatchedOnly && !emailId) query = query.eq('match_status', 'unmatched');

  const { data, error } = await query.limit(5);
  if (error) return { email: null, error: error.message };
  if (!data || data.length === 0) return { email: null };
  if (data.length > 1) return { email: null, matches: data as EmailRow[] };
  return { email: data[0] as EmailRow };
}

const linkEmailToCrm: SkillDefinition = {
  name: 'link_email_to_crm',
  displayName: 'Link Email to CRM',
  domain: 'email',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'link_email_to_crm',
      description: 'Manually link a synced email message to a CRM contact, account, or deal. Use after search_emails returns an unmatched email, or when the user asks to attach/link an email to a CRM record.',
      parameters: {
        type: 'object',
        properties: {
          email_id: {
            type: 'string',
            description: 'Email message ID returned by search_emails. Preferred for exact linking.',
          },
          email_subject: {
            type: 'string',
            description: 'Subject text to locate the email when email_id is not available.',
          },
          from_email: {
            type: 'string',
            description: 'Sender email address to locate the synced email.',
          },
          contact_id: { type: 'string', description: 'Contact ID to link.' },
          contact_name: { type: 'string', description: 'Contact name to link.' },
          account_id: { type: 'string', description: 'Account ID to link.' },
          account_name: { type: 'string', description: 'Account name to link.' },
          deal_id: { type: 'string', description: 'Deal ID to link.' },
          deal_name: { type: 'string', description: 'Deal name to link.' },
          unmatched_only: {
            type: 'boolean',
            description: 'When locating by subject/from, only consider unmatched emails. Defaults true.',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "link this email to X", "attach that unmatched email to the deal/account/contact"** -> Use link_email_to_crm
  - Prefer email_id from search_emails for exact linking.
  - If the user only gives a subject/from address, locate one recent unmatched email; ask for clarification if multiple match.
  - Link to the most specific CRM target supplied. Deal links can infer account/contact from the deal record.
  - This creates or reuses a CRM activity so the email appears on timelines.`,

  execute: async (ctx: ToolExecutionContext) => {
    const foundEmail = await findEmail(ctx);
    if (foundEmail.error) {
      return { success: false, message: `Error finding email: ${foundEmail.error}` };
    }
    if (foundEmail.matches?.length) {
      return {
        success: false,
        _needsInput: true,
        message: 'I found multiple synced emails. Which one should I link?',
        matches: foundEmail.matches.map((email) => ({
          id: email.id,
          subject: email.subject,
          from: email.from_name || email.from_email,
          received_at: email.received_at,
        })),
      };
    }
    if (!foundEmail.email) {
      return {
        success: false,
        _needsInput: true,
        message: 'I could not find a matching synced email. Search unmatched emails first, then tell me which email ID to link.',
        missing: ['email_id'],
      };
    }

    const contactResult = await findSingleByIdOrName(ctx, 'contacts', ctx.args.contact_id, ctx.args.contact_name, 'id, full_name, account_id');
    const accountResult = await findSingleByIdOrName(ctx, 'accounts', ctx.args.account_id, ctx.args.account_name, 'id, name');
    const dealResult = await findSingleByIdOrName(ctx, 'deals', ctx.args.deal_id, ctx.args.deal_name, 'id, name, account_id, contact_id');

    const ambiguity = contactResult.matches || accountResult.matches || dealResult.matches;
    if (ambiguity?.length) {
      return {
        success: false,
        _needsInput: true,
        message: 'I found multiple matching CRM records. Which exact record should I use?',
        matches: ambiguity.map((record: any) => ({
          id: record.id,
          name: record.full_name || record.name,
        })),
      };
    }
    const errors = [contactResult.error, accountResult.error, dealResult.error].filter(Boolean);
    if (errors.length > 0) {
      return { success: false, message: `Error resolving CRM target: ${errors.join('; ')}` };
    }

    const deal = dealResult.record;
    const contact = contactResult.record;
    const account = accountResult.record;
    const contactId = contact?.id || deal?.contact_id || foundEmail.email.contact_id || null;
    const accountId = account?.id || deal?.account_id || contact?.account_id || foundEmail.email.account_id || null;
    const dealId = deal?.id || foundEmail.email.deal_id || null;

    if (!contactId && !accountId && !dealId) {
      return {
        success: false,
        _needsInput: true,
        message: 'What contact, account, or deal should I link this email to?',
        missing: ['contact_name', 'account_name', 'deal_name'],
      };
    }

    const { data: updated, error: updateError } = await ctx.supabase
      .from('email_messages')
      .update({
        contact_id: contactId,
        account_id: accountId,
        deal_id: dealId,
        match_status: 'matched',
        match_method: 'manual',
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', ctx.organizationId)
      .eq('user_id', ctx.userId)
      .eq('id', foundEmail.email.id)
      .select('id, subject, match_status, match_method')
      .maybeSingle();

    if (updateError) {
      return { success: false, message: `Email link failed: ${updateError.message}` };
    }

    const { data: activityId, error: activityError } = await ctx.supabase.rpc('create_email_activity_for_message', {
      p_email_message_id: foundEmail.email.id,
    });
    if (activityError) {
      console.warn('[link_email_to_crm] Activity creation failed:', activityError.message);
    }

    if (contactId) {
      await ctx.supabase.rpc('refresh_email_engagement_stats_for_contact', {
        p_contact_id: contactId,
      });
    }

    return {
      success: true,
      id: updated?.id || foundEmail.email.id,
      message: `Linked email "${foundEmail.email.subject || '(no subject)'}" to CRM${activityId ? ' and created a timeline activity' : ''}.`,
      email: {
        id: foundEmail.email.id,
        subject: foundEmail.email.subject,
        from: foundEmail.email.from_name || foundEmail.email.from_email,
        received_at: foundEmail.email.received_at,
      },
      linked_to: {
        contact_id: contactId,
        account_id: accountId,
        deal_id: dealId,
        activity_id: activityId,
      },
    };
  },

  triggerExamples: [
    'link this email to the Acme Corp deal',
    'attach email id abc123 to Example Cloud',
    'link the unmatched email from buyer@example.com to Pat',
  ],
};

export default linkEmailToCrm;
