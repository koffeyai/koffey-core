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

const PUBLIC_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'yahoo.com',
  'ymail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'hey.com',
  'fastmail.com',
  'mail.com',
  'zoho.com',
]);

function emailDomain(value: unknown): string {
  const match = String(value || '').toLowerCase().match(/@([a-z0-9.-]+\.[a-z]{2,})$/);
  return match?.[1] || '';
}

function normalizeAudienceScope(value: unknown): 'internal' | 'external' | '' {
  const raw = String(value || '').toLowerCase().replace(/[_-]+/g, ' ').trim();
  if (!raw) return '';
  if (/\b(?:internal|internally|for our team|for the team|private|internal facing)\b/.test(raw)) return 'internal';
  if (/\b(?:external|externally|customer facing|client facing|outside|public facing|external facing)\b/.test(raw)) return 'external';
  return '';
}

function isPublicEmailDomain(value: unknown): boolean {
  const domain = emailDomain(value);
  return Boolean(domain && PUBLIC_EMAIL_DOMAINS.has(domain));
}

function stripInternalSourceMarkers(value: unknown): string {
  return String(value || '')
    .replace(/\bAction status:\s*/gi, '')
    .replace(/\b(?:draft_email|send_scheduling_email|crmOperations|tool result|tool call|function call|function output)\b/gi, '')
    .replace(/\b(?:system|developer|assistant)\s+(?:prompt|message|instruction)s?\b/gi, '')
    .replace(/\b(?:hidden|private)\s+(?:prompt|instruction|system note)s?\b/gi, '')
    .replace(/\bCRM note:?\s*/gi, '')
    .replace(/\bAdded\s+(?:task|deal|contact|account|activity|note):\s*/gi, '')
    .replace(/\b(?:verbatim|copy exactly|quote exactly)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeExternalText(value: unknown): string {
  const cleaned = stripInternalSourceMarkers(value);
  if (!cleaned) return '';

  return cleaned
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => !/\b(?:system prompt|developer message|tool result|tool call|Action status|draft_email|CRM note)\b/i.test(sentence))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeVoiceNotes(value: unknown): string {
  const cleaned = stripInternalSourceMarkers(value)
    .replace(/^(?:use\s+)?(?:these\s+)?(?:user\s+)?voice notes?\s*[:=-]?\s*/i, '')
    .trim();
  if (!cleaned) return '';
  return cleaned.slice(0, 260).trim();
}

type UserEmailStylePreferences = {
  tone: string;
  communication_style: string;
  energy_level: string;
  verbosity: string;
  format_preference: string;
  signature_phrases: string[];
  avoid_phrases: string[];
  custom_instructions: string;
  source: 'user_settings' | 'defaults';
};

const DEFAULT_EMAIL_STYLE_PREFERENCES: UserEmailStylePreferences = {
  tone: 'professional',
  communication_style: 'professional',
  energy_level: 'balanced',
  verbosity: 'balanced',
  format_preference: 'mixed',
  signature_phrases: [],
  avoid_phrases: [],
  custom_instructions: '',
  source: 'defaults',
};

function normalizePreferenceValue(value: unknown, allowed: string[], fallback: string): string {
  const normalized = String(value || '').toLowerCase().trim();
  return allowed.includes(normalized) ? normalized : fallback;
}

function normalizeEmailTone(value: unknown): string {
  return normalizePreferenceValue(value, ['casual', 'professional', 'formal', 'warm'], '');
}

function stringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, 10);
}

function sanitizeStyleGuidance(value: unknown): string {
  return stripInternalSourceMarkers(value)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 700)
    .trim();
}

function humanizeStyleValue(value: string): string {
  return value.replace(/[_-]+/g, ' ').trim();
}

async function loadUserEmailStylePreferences(supabase: any, userId: string): Promise<UserEmailStylePreferences> {
  if (!userId) return DEFAULT_EMAIL_STYLE_PREFERENCES;

  try {
    const query = supabase
      .from('user_prompt_preferences')
      .select('tone, verbosity, format_preference, custom_instructions, communication_style, energy_level, signature_phrases, avoid_phrases')
      .eq('user_id', userId)
      .limit(1);
    const { data } = typeof query.maybeSingle === 'function'
      ? await query.maybeSingle()
      : await query.single();
    const row = data && typeof data === 'object' ? data as Record<string, unknown> : null;
    if (!row) return DEFAULT_EMAIL_STYLE_PREFERENCES;

    return {
      tone: normalizePreferenceValue(row.tone, ['casual', 'professional', 'formal'], DEFAULT_EMAIL_STYLE_PREFERENCES.tone),
      communication_style: normalizePreferenceValue(row.communication_style, ['consultative', 'direct', 'storyteller', 'technical', 'professional'], DEFAULT_EMAIL_STYLE_PREFERENCES.communication_style),
      energy_level: normalizePreferenceValue(row.energy_level, ['warm_enthusiastic', 'calm_measured', 'bold_confident', 'balanced'], DEFAULT_EMAIL_STYLE_PREFERENCES.energy_level),
      verbosity: normalizePreferenceValue(row.verbosity, ['concise', 'balanced', 'detailed'], DEFAULT_EMAIL_STYLE_PREFERENCES.verbosity),
      format_preference: normalizePreferenceValue(row.format_preference, ['bullets', 'paragraphs', 'mixed'], DEFAULT_EMAIL_STYLE_PREFERENCES.format_preference),
      signature_phrases: stringArray(row.signature_phrases),
      avoid_phrases: stringArray(row.avoid_phrases),
      custom_instructions: sanitizeStyleGuidance(row.custom_instructions),
      source: 'user_settings',
    };
  } catch (error) {
    console.warn('[draft_email] Failed to load user writing style preferences', error);
    return DEFAULT_EMAIL_STYLE_PREFERENCES;
  }
}

function buildPreferenceStyleGuidance(preferences: UserEmailStylePreferences): string {
  const guidance = [
    preferences.communication_style && preferences.communication_style !== 'professional'
      ? `${humanizeStyleValue(preferences.communication_style)} communication approach`
      : '',
    preferences.energy_level && preferences.energy_level !== 'balanced'
      ? `${humanizeStyleValue(preferences.energy_level)} energy`
      : '',
    preferences.verbosity && preferences.verbosity !== 'balanced'
      ? `${humanizeStyleValue(preferences.verbosity)} length`
      : '',
    preferences.custom_instructions
      ? `Custom style instructions: ${preferences.custom_instructions}`
      : '',
    preferences.signature_phrases.length
      ? `Natural phrases: ${preferences.signature_phrases.join(', ')}`
      : '',
    preferences.avoid_phrases.length
      ? `Avoid phrases: ${preferences.avoid_phrases.join(', ')}`
      : '',
  ].filter(Boolean).join('; ');

  return sanitizeStyleGuidance(guidance);
}

function buildPublicStyleProfile(preferences: UserEmailStylePreferences, tone: string) {
  return {
    source: preferences.source,
    tone,
    communication_style: preferences.communication_style,
    energy_level: preferences.energy_level,
    verbosity: preferences.verbosity,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function applyAvoidPhrases(body: string, avoidPhrases: string[]): string {
  let cleaned = body;
  for (const phrase of avoidPhrases) {
    const safePhrase = phrase.trim();
    if (!safePhrase) continue;
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegExp(safePhrase)}\\b`, 'gi'), '').replace(/\s{2,}/g, ' ');
  }
  return cleaned
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function resolveVoicePreferences(tone: string, voiceNotes: string) {
  const lower = `${tone || ''} ${voiceNotes || ''}`.toLowerCase();
  const signatureMatch = voiceNotes.match(/\bsign(?:ed|ing)?\s*(?:off\s*)?(?:as|with)\s+([A-Za-z][A-Za-z0-9 .'-]{0,60})(?=\s*(?:[.;,]|$))/i);
  return {
    concise: /\b(?:concise|brief|short|tight|punchy)\b/.test(lower),
    direct: /\b(?:direct|clear|straightforward|no fluff|plainspoken)\b/.test(lower),
    warm: /\b(?:warm|friendly|human|casual|approachable)\b/.test(lower),
    formal: /\b(?:formal|polished|executive)\b/.test(lower),
    signature: signatureMatch?.[1]?.trim() || '',
  };
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

function normalizeDealMatchValue(value: unknown): string {
  return stripDealAmountSuffix(value)
    .replace(/\s+(?:deal|deals|opportunity|opportunities)$/i, '')
    .toLowerCase()
    .trim();
}

function sanitizeOrFilterValue(value: unknown): string {
  return String(value || '').replace(/[%*,]/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatContextForEmail(value: string, audienceScope: 'internal' | 'external' = 'external'): string {
  const sourceText = audienceScope === 'external'
    ? sanitizeExternalText(value)
    : stripInternalSourceMarkers(value);
  const cleaned = sourceText
    .replace(/\b(?:please\s+)?(?:mention|include|cover|add|recap|summarize|review)\b\s*/ig, '')
    .replace(/\bwith\s+next\s+steps?\b/ig, 'next steps')
    .replace(/^\$[\d,.]+(?:\.\d+)?\s*[KMBkmb]?\s+/, '')
    .replace(/\s+/g, ' ')
    .replace(/[.!?]+$/g, '')
    .trim();
  return cleaned;
}

function isMissingCommunicationContext(value: unknown): boolean {
  const cleaned = formatContextForEmail(String(value || ''));
  if (!cleaned || cleaned.length < 8) return true;

  const vague = cleaned.toLowerCase().replace(/[^\w\s-]/g, '').trim();
  return [
    'follow up',
    'check in',
    'next step',
    'next steps',
    'move this forward',
    'advance the deal',
    'advance this deal',
    'keep momentum',
    'touch base',
    'send a note',
    'write a note',
    'send message',
    'regarding this deal',
    'about this deal',
  ].includes(vague);
}

function formatDealOption(deal: Record<string, unknown>, index: number): string {
  const facts = [
    firstNonEmpty(deal.stage) ? `stage ${firstNonEmpty(deal.stage)}` : '',
    formatMoney(deal.amount),
    formatCloseDate(deal.expected_close_date),
    extractJoinedName((deal as any).accounts, 'name') ? `account ${extractJoinedName((deal as any).accounts, 'name')}` : '',
  ].filter(Boolean);
  return `${index + 1}. ${firstNonEmpty(deal.name, deal.id)}${facts.length ? ` (${facts.join(', ')})` : ''}`;
}

function buildMultipleDealClarification(params: {
  result: Record<string, unknown>;
  deals: Array<Record<string, unknown>>;
  label: string;
  userContext?: string;
  recipientName?: string;
  recipientEmail?: string;
  emailType?: string;
  accountName?: string;
  audienceScope?: string;
  voiceNotes?: string;
}) {
  const optionLines = params.deals.slice(0, 5).map(formatDealOption);
  const needsContext = isMissingCommunicationContext(params.userContext);
  const contextQuestion = needsContext
    ? '\n\nAlso tell me what the note should communicate.'
    : '';
  return {
    ...params.result,
    success: false,
    _needsInput: true,
    clarification_type: 'multiple_deals',
    multiple_deals: true,
    candidate_deals: params.deals.map((deal) => ({
      id: firstNonEmpty(deal.id),
      name: firstNonEmpty(deal.name),
      stage: firstNonEmpty(deal.stage),
      amount: deal.amount ?? null,
      expected_close_date: deal.expected_close_date ?? null,
      account_name: extractJoinedName((deal as any).accounts, 'name') || null,
    })),
    deal_name: params.label,
    recipient_name: params.recipientName || null,
    recipient_email: params.recipientEmail || null,
    email_type: params.emailType || 'follow_up',
    account_name: params.accountName || null,
    audience_scope: params.audienceScope || null,
    voice_notes: params.voiceNotes || null,
    user_context: params.userContext || null,
    message: `I found ${params.deals.length} matching deals for "${params.label}". Which one should I use?\n${optionLines.join('\n')}${contextQuestion}`,
    follow_up_prompt: needsContext
      ? 'Reply with the deal name or number and what the note should say.'
      : 'Reply with the deal name or number.',
  };
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
  voiceNotes: string;
  audienceScope: 'internal' | 'external';
  context: string;
  deal: Record<string, unknown> | null;
  accountName: string;
  recentActivities: Array<Record<string, unknown>>;
}): string {
  const greeting = `Hi ${firstName(params.recipientName)},`;
  const voice = resolveVoicePreferences(params.tone, params.voiceNotes);
  const externalFacing = params.audienceScope === 'external';
  const dealName = firstNonEmpty(params.deal?.name);
  const amount = formatMoney(params.deal?.amount);
  const stage = firstNonEmpty(params.deal?.stage);
  const closeDate = formatCloseDate(params.deal?.expected_close_date);
  const useCase = firstNonEmpty(params.deal?.key_use_case, params.deal?.description);
  const accountPhrase = params.accountName ? ` with ${params.accountName}` : '';
  const dealPhrase = dealName ? ` on ${dealName}` : accountPhrase;

  const formattedContext = formatContextForEmail(params.context, params.audienceScope);
  const contextLine = formattedContext
    ? voice.concise || voice.direct
      ? `Following up${dealPhrase} regarding ${formattedContext}.`
      : voice.warm
        ? `I wanted to follow up${dealPhrase} and make sure we're aligned on ${formattedContext}.`
        : `I wanted to follow up${dealPhrase} and make sure we are aligned on ${formattedContext}.`
    : `I wanted to follow up${dealPhrase} and keep momentum on the next step.`;

  const detailParts = [
    amount ? `deal value: ${amount}` : '',
    stage ? `current stage: ${stage}` : '',
    closeDate ? `target close date: ${closeDate}` : '',
  ].filter(Boolean);

  const detailsLine = !externalFacing && detailParts.length > 0
    ? `From my side, I have ${detailParts.join(', ')}.`
    : '';

  const activity = params.recentActivities[0];
  const activityLine = !externalFacing && activity
    ? `I also saw the latest CRM note: "${firstNonEmpty(activity.title, activity.description)}".`
    : '';

  const useCaseLine = !externalFacing && useCase
    ? `The main thing I want to connect back to is ${useCase}.`
    : '';

  const cta = params.emailType === 'meeting_request'
    ? 'Would you be open to a quick 20-minute conversation this week to confirm priorities and agree on next steps?'
    : voice.concise || voice.direct
      ? 'What is the best next step on your side?'
      : 'Can you share what would be most useful for us to cover next so we can move this forward cleanly?';

  const close = voice.formal
    ? 'Best regards,'
    : params.tone === 'casual' || voice.warm
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
    voice.signature,
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
          voice_notes: {
            type: 'string',
            description: 'Optional user-authored notes about how the email should sound. Use as style guidance only; do not quote these notes in the email.',
          },
          audience_scope: {
            type: 'string',
            enum: ['internal', 'external'],
            description: 'Whether the draft is internal-facing or external-facing. Ask before drafting when the recipient uses a public email domain and this is unclear.',
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
  - For public email domains, ask whether the draft is internal-facing or external-facing before composing
  - External-facing drafts must not quote system/tool/CRM note wording or expose internal CRM metadata verbatim
  - User must explicitly approve before any email is sent`,

  execute: async (ctx: ToolExecutionContext) => {
    const { supabase, organizationId, userId, args, entityContext } = ctx;
    const {
      recipient_name,
      recipient_email,
      email_type,
      context: userContext,
      deal_name,
      deal_id: argDealId,
      account_name,
      tone,
      voice_notes,
      audience_scope,
    } = args as Record<string, string | undefined>;
    const requestedAudienceScope = normalizeAudienceScope(audience_scope);
    const stylePreferences = await loadUserEmailStylePreferences(supabase, userId);
    const safeVoiceNotes = sanitizeVoiceNotes(voice_notes);
    const resolvedTone = normalizeEmailTone(tone) || stylePreferences.tone || 'professional';
    const preferenceStyleGuidance = buildPreferenceStyleGuidance(stylePreferences);
    const effectiveVoiceNotes = [preferenceStyleGuidance, safeVoiceNotes].filter(Boolean).join('; ');
    const styleProfile = buildPublicStyleProfile(stylePreferences, resolvedTone);

    const result: Record<string, unknown> = {
      email_type: email_type || 'custom',
      tone: resolvedTone,
      audience_scope: requestedAudienceScope || null,
      voice_notes: safeVoiceNotes || null,
      style_profile: styleProfile,
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
          .limit(5);
        const matches = asArray(data);
        if (matches.length === 1) {
          deal = matches[0];
          break;
        }
        if (matches.length > 1) {
          const normalizedCandidate = normalizeDealMatchValue(candidate);
          const exactMatches = matches.filter((row) => normalizeDealMatchValue(row.name) === normalizedCandidate);
          if (exactMatches.length === 1) {
            deal = exactMatches[0];
            break;
          }
          return buildMultipleDealClarification({
            result,
            deals: matches,
            label: candidate,
            userContext,
            recipientName: recipient_name,
            recipientEmail: recipient_email,
            emailType: email_type,
            accountName: account_name,
            audienceScope: requestedAudienceScope,
            voiceNotes: safeVoiceNotes,
          });
        }
        if (data) {
          deal = data as Record<string, unknown>;
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

    if (!contact && recipient_email) {
      const { data } = await supabase
        .from('contacts')
        .select('id, full_name, email, title, company, phone, notes, nurture_stage')
        .eq('organization_id', organizationId)
        .eq('email', recipient_email)
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
    const recentActivities = Array.isArray(result.recent_activities)
      ? result.recent_activities as Array<Record<string, unknown>>
      : [];
    const subjectContext = formatContextForEmail(userContext || '', requestedAudienceScope || 'external');
    const subject = buildDraftSubject(resolvedEmailType, deal, resolvedAccountName, subjectContext);

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
        audience_scope: requestedAudienceScope || null,
        voice_notes: safeVoiceNotes || null,
        message,
        follow_up_prompt: 'Reply with the recipient name/email and any notes to include, and I will create the draft.',
      };
    }

    if (isMissingCommunicationContext(userContext)) {
      const dealLabel = firstNonEmpty((deal as any)?.name, deal_name, resolvedAccountName, 'this opportunity');
      const recipientLabel = resolvedRecipientName && resolvedRecipientName !== 'there'
        ? resolvedRecipientName
        : resolvedRecipientEmail;
      return {
        ...result,
        success: false,
        _needsInput: true,
        clarification_type: 'missing_communication_context',
        deal_id: (deal as any)?.id || null,
        deal_name: (deal as any)?.name || deal_name || null,
        account_name: resolvedAccountName || null,
        recipient_name: recipientLabel || null,
        recipient_email: resolvedRecipientEmail,
        email_type: resolvedEmailType,
        audience_scope: requestedAudienceScope || null,
        voice_notes: safeVoiceNotes || null,
        message: `I can draft the note${recipientLabel ? ` to ${recipientLabel}` : ''}${dealLabel ? ` about ${dealLabel}` : ''}, but I need to know what it should communicate. What should the note say or ask for?`,
        follow_up_prompt: 'Reply with the message goal/details, and I will create the draft.',
      };
    }

    if (isPublicEmailDomain(resolvedRecipientEmail) && !requestedAudienceScope) {
      const domain = emailDomain(resolvedRecipientEmail);
      const recipientLabel = resolvedRecipientName && resolvedRecipientName !== 'there'
        ? resolvedRecipientName
        : resolvedRecipientEmail;
      return {
        ...result,
        success: false,
        _needsInput: true,
        clarification_type: 'missing_audience_scope',
        deal_id: (deal as any)?.id || null,
        deal_name: (deal as any)?.name || deal_name || null,
        account_name: resolvedAccountName || null,
        recipient_name: recipientLabel || null,
        recipient_email: resolvedRecipientEmail,
        email_type: resolvedEmailType,
        public_domain: domain,
        message: `${recipientLabel} uses a public email domain (${domain}). Is this internal-facing or external-facing? I will keep external-facing drafts free of internal CRM/system wording.`,
        follow_up_prompt: 'Reply with "external-facing" or "internal-facing", and I will create the draft.',
      };
    }

    const resolvedAudienceScope = requestedAudienceScope || 'external';
    result.success = true;
    result.isDraft = true;
    result.recipientName = resolvedRecipientName === 'there' ? '' : resolvedRecipientName;
    result.recipientEmail = resolvedRecipientEmail;
    result.emailType = resolvedEmailType;
    result.tone = resolvedTone;
    result.audience_scope = resolvedAudienceScope;
    result.audienceScope = resolvedAudienceScope;
    result.voice_notes = safeVoiceNotes || null;
    result.voiceNotes = safeVoiceNotes || '';
    result.style_profile = styleProfile;
    result.styleProfile = styleProfile;
    result.subject = subject;
    result.message = applyAvoidPhrases(buildDraftBody({
      recipientName: resolvedRecipientName,
      emailType: resolvedEmailType,
      tone: resolvedTone,
      voiceNotes: effectiveVoiceNotes,
      audienceScope: resolvedAudienceScope,
      context: userContext || '',
      deal,
      accountName: resolvedAccountName,
      recentActivities,
    }), stylePreferences.avoid_phrases);
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
