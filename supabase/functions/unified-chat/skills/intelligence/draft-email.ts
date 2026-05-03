/**
 * Skill: draft_email
 *
 * Draft an email for user review before sending. NEVER auto-sends.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

function firstNonEmpty(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function extractJoinedName(value: unknown, field: string): string {
  if (Array.isArray(value)) {
    return firstNonEmpty(...value.map((item) => (item as Record<string, unknown>)?.[field]));
  }
  if (value && typeof value === 'object') {
    return firstNonEmpty((value as Record<string, unknown>)[field]);
  }
  return '';
}

function asArray(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  if (value && typeof value === 'object') return [value as Record<string, unknown>];
  return [];
}

function normalizeContactRecord(value: unknown): Record<string, unknown> | null {
  const row = value && typeof value === 'object' ? value as Record<string, unknown> : null;
  if (!row) return null;
  const nested = firstNonEmpty(row.full_name, row.email)
    ? row
    : asArray(row.contact || row.contacts)[0] || row;
  const first = firstNonEmpty(nested.first_name);
  const last = firstNonEmpty(nested.last_name);
  return {
    id: firstNonEmpty(nested.id, row.contact_id),
    full_name: firstNonEmpty(nested.full_name, [first, last].filter(Boolean).join(' ')),
    email: firstNonEmpty(nested.email),
    title: firstNonEmpty(nested.title),
    company: firstNonEmpty(nested.company),
    role: firstNonEmpty(row.role),
  };
}

function formatContactOption(contact: Record<string, unknown>): string {
  const name = firstNonEmpty(contact.full_name, 'Unnamed contact');
  const email = firstNonEmpty(contact.email);
  const role = firstNonEmpty(contact.role, contact.title);
  return [name, email ? `<${email}>` : 'missing email', role].filter(Boolean).join(' - ');
}

function formatMoney(value: unknown): string {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0) return '';
  return `$${amount.toLocaleString()}`;
}

function formatCloseDate(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const date = new Date(raw);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] || 'there';
}

function cleanLookupCandidate(value: unknown): string {
  return String(value || '')
    .replace(/["'`“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,-]+|[\s:,.!?-]+$/g, '')
    .trim();
}

function buildDealLookupCandidates(value: unknown): string[] {
  const raw = cleanLookupCandidate(value);
  if (!raw) return [];

  const candidates = new Set<string>();
  const add = (candidate: unknown) => {
    const cleaned = cleanLookupCandidate(candidate);
    if (cleaned.length >= 2 && cleaned.length <= 160) candidates.add(cleaned);
  };

  add(raw);
  const withoutAction = raw
    .replace(/^(?:advance|open|review|work|move|progress|close|follow\s+up\s+(?:on|with)|prepare)\s+/i, '')
    .replace(/\s+(?:this\s+week|today|tomorrow|next\s+week|next\s+steps?|to\s+next\s+stage)$/i, '');
  add(withoutAction);

  const amountLabel = withoutAction.match(/([A-Za-z0-9][\s\S]*?-\s*\$[\d,.]+(?:\.\d+)?\s*[KMBkmb]?)/);
  if (amountLabel?.[1]) add(amountLabel[1]);

  const accountOnly = withoutAction.match(/^(.+?)\s+-\s+\$[\d,.]+/);
  if (accountOnly?.[1]) add(accountOnly[1]);

  return Array.from(candidates);
}

function stripDealAmountSuffix(value: unknown): string {
  return cleanLookupCandidate(value).replace(/\s+-\s+\$[\d,.]+(?:\.\d+)?\s*[KMBkmb]?$/i, '').trim();
}

function sanitizeOrFilterValue(value: unknown): string {
  return String(value || '').replace(/[%*,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatContextForEmail(value: string): string {
  const cleaned = value
    .replace(/\b(?:please\s+)?(?:mention|include|cover|add)\b\s*/ig, '')
    .replace(/\bwith\s+next\s+steps?\b/ig, 'next steps')
    .replace(/^\$[\d,.]+(?:\.\d+)?\s*[KMBkmb]?\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
  return cleaned;
}

function buildDraftSubject(emailType: string, deal: Record<string, unknown> | null, accountName: string, context: string): string {
  const dealName = firstNonEmpty(deal?.name);
  switch (emailType) {
    case 'meeting_request':
      return `Next steps${accountName ? ` for ${accountName}` : ''}`;
    case 'proposal':
      return `Proposal follow-up${dealName ? `: ${dealName}` : ''}`;
    case 'check_in':
      return `Quick check-in${accountName ? ` on ${accountName}` : ''}`;
    case 'introduction':
      return `Introduction${accountName ? ` for ${accountName}` : ''}`;
    case 'thank_you':
      return `Thank you${accountName ? ` - ${accountName}` : ''}`;
    case 'follow_up':
      return `Following up${dealName ? ` on ${dealName}` : ''}`;
    default:
      return context ? context.slice(0, 72).replace(/[.!?]+$/, '') : `Following up${dealName ? ` on ${dealName}` : ''}`;
  }
}

function buildDraftBody(params: {
  recipientName: string;
  emailType: string;
  tone: string;
  context: string;
  deal: Record<string, unknown> | null;
  accountName: string;
  recentActivities: Array<Record<string, unknown>>;
}): string {
  const greeting = `Hi ${firstName(params.recipientName)},`;
  const dealName = firstNonEmpty(params.deal?.name);
  const amount = formatMoney(params.deal?.amount);
  const stage = firstNonEmpty(params.deal?.stage);
  const closeDate = formatCloseDate(params.deal?.expected_close_date);
  const useCase = firstNonEmpty(params.deal?.key_use_case, params.deal?.description);
  const accountPhrase = params.accountName ? ` with ${params.accountName}` : '';
  const dealPhrase = dealName ? ` on ${dealName}` : accountPhrase;

  const formattedContext = formatContextForEmail(params.context);
  const contextLine = formattedContext
    ? `I wanted to follow up${dealPhrase} and make sure we are aligned on ${formattedContext}.`
    : `I wanted to follow up${dealPhrase} and keep momentum on the next step.`;

  const detailParts = [
    amount ? `deal value: ${amount}` : '',
    stage ? `current stage: ${stage}` : '',
    closeDate ? `target close date: ${closeDate}` : '',
  ].filter(Boolean);

  const detailsLine = detailParts.length > 0
    ? `From my side, I have ${detailParts.join(', ')}.`
    : '';

  const activity = params.recentActivities[0];
  const activityLine = activity
    ? `I also saw the latest CRM note: "${firstNonEmpty(activity.title, activity.description)}".`
    : '';

  const useCaseLine = useCase
    ? `The main thing I want to connect back to is ${useCase}.`
    : '';

  const cta = params.emailType === 'meeting_request'
    ? 'Would you be open to a quick 20-minute conversation this week to confirm priorities and agree on next steps?'
    : 'Can you share what would be most useful for us to cover next so we can move this forward cleanly?';

  const close = params.tone === 'formal'
    ? 'Best regards,'
    : params.tone === 'casual'
      ? 'Thanks,'
      : 'Best,';

  return [
    greeting,
    '',
    contextLine,
    detailsLine,
    activityLine,
    useCaseLine,
    '',
    cta,
    '',
    close,
  ].filter((line, index, lines) => line || lines[index - 1] !== '').join('\n').trim();
}

const draftEmail: SkillDefinition = {
  name: 'draft_email',
  displayName: 'Draft Email',
  domain: 'intelligence',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'draft_email',
      description: `Draft an email for the user to review before sending. Use when user wants to:
- Write a follow-up email after a meeting
- Send a proposal or case study
- Check in with a contact they haven't spoken to
- Send a meeting request
- Compose any professional email related to a deal or contact

This tool drafts the email and shows it to the user. It NEVER sends automatically.
The user must explicitly approve before any email is sent.

Use CRM context (deal details, contact info, recent activities, meeting notes) to personalize the draft.
Always include a clear subject line and call-to-action.`,
      parameters: {
        type: 'object',
        properties: {
          recipient_name: {
            type: 'string',
            description: 'Contact name to email',
          },
          recipient_email: {
            type: 'string',
            description: "Contact's email address (if known)",
          },
          email_type: {
            type: 'string',
            enum: ['follow_up', 'meeting_request', 'proposal', 'check_in', 'introduction', 'thank_you', 'custom'],
            description: 'Type of email to draft — determines tone and structure',
          },
          context: {
            type: 'string',
            description: 'Additional context from the user about what the email should cover',
          },
          deal_name: {
            type: 'string',
            description: 'Deal name for CRM context enrichment',
          },
          deal_id: {
            type: 'string',
            description: 'Deal UUID if known from entity context',
          },
          account_name: {
            type: 'string',
            description: 'Account name for context',
          },
          tone: {
            type: 'string',
            enum: ['professional', 'casual', 'warm', 'formal'],
            description: 'Email tone preference (default: professional)',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "draft email to", "write a follow-up", "compose an email"** → Use draft_email
  - Drafts the email and shows it to the user — NEVER sends automatically
  - Uses CRM context to personalize (deal details, contact info, recent activities)
  - Always includes subject line and call-to-action
  - User must explicitly approve before any email is sent`,

  execute: async (ctx: ToolExecutionContext) => {
    const { supabase, organizationId, args, entityContext } = ctx;
    const {
      recipient_name,
      recipient_email,
      email_type,
      context: userContext,
      deal_name,
      deal_id: argDealId,
      account_name,
      tone,
    } = args as Record<string, string | undefined>;

    const result: Record<string, unknown> = {
      email_type: email_type || 'custom',
      tone: tone || 'professional',
      user_context: userContext || null,
    };

    // --- Deal lookup ---
    const dealId = argDealId || entityContext?.primaryEntity?.id;
    let deal: Record<string, unknown> | null = null;

    if (dealId) {
      const { data } = await supabase
        .from('deals')
        .select('id, name, stage, amount, expected_close_date, probability, description, competitor_name, key_use_case, accounts(id, name), contacts(full_name, email, company)')
        .eq('id', dealId)
        .eq('organization_id', organizationId)
        .single();
      deal = data;
    } else if (deal_name) {
      for (const candidate of buildDealLookupCandidates(deal_name)) {
        const { data } = await supabase
          .from('deals')
          .select('id, name, stage, amount, expected_close_date, probability, description, competitor_name, key_use_case, accounts(id, name), contacts(full_name, email, company)')
          .eq('organization_id', organizationId)
          .ilike('name', `%${candidate}%`)
          .limit(1)
          .single();
        if (data) {
          deal = data;
          break;
        }
      }
    }

    if (deal) {
      result.deal = deal;
    }

    // --- Contact lookup ---
    let contact: Record<string, unknown> | null = null;

    if (recipient_name) {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, email, title, company, phone, notes, nurture_stage')
        .eq('organization_id', organizationId)
        .or(`full_name.ilike.%${recipient_name}%,first_name.ilike.%${recipient_name}%,last_name.ilike.%${recipient_name}%`)
        .limit(1)
        .single();
      contact = data;
    }

    if (contact) {
      result.contact = contact;
      // Use found email if caller didn't provide one
      if (!recipient_email && contact.email) {
        result.recipient_email = contact.email;
      }
    }
    if (recipient_email) {
      result.recipient_email = recipient_email;
    }

    // --- Account lookup (fallback if not already from deal) ---
    if (account_name && !deal) {
      const { data } = await supabase
        .from('accounts')
        .select('id, name, industry, website, domain')
        .eq('organization_id', organizationId)
        .ilike('name', `%${account_name}%`)
        .limit(1)
        .single();
      if (data) {
        result.account = data;
      }
    }

    // --- Deal stakeholder lookup ---
    const associatedContacts: Array<Record<string, unknown>> = [];
    for (const joinedContact of asArray((deal as any)?.contacts)) {
      const normalized = normalizeContactRecord(joinedContact);
      if (normalized) associatedContacts.push(normalized);
    }

    const resolvedDealId = (deal as any)?.id;
    if (resolvedDealId) {
      const { data: dealContacts } = await supabase
        .from('deal_contacts')
        .select('contact_id, role, is_primary, contact:contacts(id, full_name, first_name, last_name, email, title, company)')
        .eq('organization_id', organizationId)
        .eq('deal_id', resolvedDealId)
        .order('is_primary', { ascending: false })
        .limit(5);

      for (const row of asArray(dealContacts)) {
        const normalized = normalizeContactRecord(row);
        if (!normalized?.id && !normalized?.full_name && !normalized?.email) continue;
        const duplicate = associatedContacts.some((contactRow) => firstNonEmpty(contactRow.id) === firstNonEmpty(normalized.id));
        if (!duplicate) associatedContacts.push(normalized);
      }
    }

    if (associatedContacts.length > 0) {
      result.contacts = associatedContacts;
    }

    const dealAccountId = extractJoinedName((deal as any)?.accounts, 'id');
    const dealAccountName = firstNonEmpty(
      account_name,
      extractJoinedName((deal as any)?.accounts, 'name'),
      stripDealAmountSuffix((deal as any)?.name),
    );

    if (!contact && !recipient_name && associatedContacts.length > 0) {
      contact = associatedContacts.find((contactRow) => Boolean(firstNonEmpty(contactRow.email))) || associatedContacts[0];
    }

    if (!contact && !recipient_name && dealAccountName) {
      const contactFilters = [];
      if (dealAccountId) contactFilters.push(`account_id.eq.${dealAccountId}`);
      const safeAccountName = sanitizeOrFilterValue(dealAccountName);
      if (safeAccountName) contactFilters.push(`company.ilike.%${safeAccountName}%`);

      if (contactFilters.length > 0) {
        const { data: accountContacts } = await supabase
          .from('contacts')
          .select('id, full_name, first_name, last_name, email, title, company, phone, notes, nurture_stage, account_id')
          .eq('organization_id', organizationId)
          .or(contactFilters.join(','))
          .limit(5);

        for (const row of asArray(accountContacts)) {
          const normalized = normalizeContactRecord(row);
          if (!normalized?.id && !normalized?.full_name && !normalized?.email) continue;
          const duplicate = associatedContacts.some((contactRow) => firstNonEmpty(contactRow.id) === firstNonEmpty(normalized.id));
          if (!duplicate) associatedContacts.push(normalized);
        }

        if (associatedContacts.length > 0) {
          result.contacts = associatedContacts;
          contact = associatedContacts.find((contactRow) => Boolean(firstNonEmpty(contactRow.email))) || associatedContacts[0];
        }
      }
    }

    // --- Recent activities for context ---
    const contactId = (contact as any)?.id;

    if (contactId || resolvedDealId) {
      let activityQuery = supabase
        .from('activities')
        .select('id, type, title, description, scheduled_at, created_at, completed')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(5);

      if (contactId && resolvedDealId) {
        activityQuery = activityQuery.or(`contact_id.eq.${contactId},deal_id.eq.${resolvedDealId}`);
      } else if (contactId) {
        activityQuery = activityQuery.eq('contact_id', contactId);
      } else {
        activityQuery = activityQuery.eq('deal_id', resolvedDealId);
      }

      const { data: activities } = await activityQuery;
      if (activities && activities.length > 0) {
        result.recent_activities = activities;
      }
    }

    const resolvedRecipientName = firstNonEmpty(
      recipient_name,
      (contact as any)?.full_name,
      extractJoinedName((deal as any)?.contacts, 'full_name'),
      'there',
    );
    const resolvedRecipientEmail = firstNonEmpty(
      recipient_email,
      result.recipient_email,
      (contact as any)?.email,
      extractJoinedName((deal as any)?.contacts, 'email'),
    );
    const resolvedAccountName = firstNonEmpty(
      account_name,
      dealAccountName,
      (contact as any)?.company,
    );
    const resolvedEmailType = email_type || 'follow_up';
    const resolvedTone = tone || 'professional';
    const recentActivities = Array.isArray(result.recent_activities)
      ? result.recent_activities as Array<Record<string, unknown>>
      : [];
    const subject = buildDraftSubject(resolvedEmailType, deal, resolvedAccountName, userContext || '');
    const message = buildDraftBody({
      recipientName: resolvedRecipientName,
      emailType: resolvedEmailType,
      tone: resolvedTone,
      context: userContext || '',
      deal,
      accountName: resolvedAccountName,
      recentActivities,
    });

    if (!resolvedRecipientEmail) {
      const dealLabel = firstNonEmpty((deal as any)?.name, deal_name, resolvedAccountName, 'this deal');
      const contactOptions = associatedContacts.map(formatContactOption).filter(Boolean);
      const optionsText = contactOptions.length > 0
        ? ` I found these associated contacts: ${contactOptions.join('; ')}.`
        : '';
      const message = `I can draft the email for ${dealLabel}, but I need a recipient email before it becomes actionable.${optionsText} Who should this go to? You can reply with a contact name/email and any notes or context to include.`;
      return {
        ...result,
        success: false,
        _needsInput: true,
        clarification_type: 'missing_recipient_email',
        deal_id: (deal as any)?.id || null,
        deal_name: (deal as any)?.name || deal_name || null,
        message,
        follow_up_prompt: 'Reply with the recipient name/email and any notes to include, and I will create the draft.',
      };
    }

    result.success = true;
    result.isDraft = true;
    result.recipientName = resolvedRecipientName === 'there' ? '' : resolvedRecipientName;
    result.recipientEmail = resolvedRecipientEmail;
    result.emailType = resolvedEmailType;
    result.tone = resolvedTone;
    result.subject = subject;
    result.message = message;
    result.dealContext = deal ? {
      id: (deal as any).id,
      name: (deal as any).name,
      stage: (deal as any).stage,
    } : null;

    // Summary for the LLM
    result.summary = deal
      ? `Drafted a personalized ${resolvedEmailType} email using CRM context for ${(deal as any).name || deal_name}.`
      : `Drafted a ${resolvedEmailType} email${deal_name ? `, but no matching deal was found for "${deal_name}"` : ''}.`;

    return result;
  },

  triggerExamples: [
    'draft a follow-up email to Sarah',
    'write a proposal email for the Pepsi deal',
    'compose a check-in email to Mike',
  ],
};

export default draftEmail;
