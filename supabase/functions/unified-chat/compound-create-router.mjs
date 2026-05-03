const REQUIRED_COMPOUND_CREATE_TOOLS = ['create_account', 'create_contact', 'create_deal'];

function cleanName(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;。]+$/g, '')
    .trim();
}

function normalizeStage(value) {
  const normalized = String(value || 'prospecting').toLowerCase().replace(/[\s-]+/g, '_');
  return ['prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'].includes(normalized)
    ? normalized
    : 'prospecting';
}

function parseAmount(value) {
  const normalized = String(value || '').replace(/[$,\s]/g, '');
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function parseFlexibleAmount(text) {
  const match = String(text || '').match(/\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kmb])?\s*(?:mrr|arr|acv|usd)?\s+(?:deal|opportunit(?:y|ies))\b/i)
    || String(text || '').match(/\b(?:for|worth|valued\s+at|amount(?:\s+of)?|at)\s+\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kmb])?\s*(?:mrr|arr|acv|usd)?\b/i);
  if (!match) return null;
  const base = Number(String(match[1] || '').replace(/,/g, ''));
  if (!Number.isFinite(base)) return null;
  const suffix = String(match[2] || '').toLowerCase();
  const multiplier = suffix === 'b' ? 1_000_000_000 : suffix === 'm' ? 1_000_000 : suffix === 'k' ? 1_000 : 1;
  return Math.round(base * multiplier);
}

function parseDomain(text) {
  const match = String(text || '').match(/\b(?:website|domain|site)\s*(?:is|=|:)?\s*(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)\b/i);
  return match?.[1]?.toLowerCase() || null;
}

function extractAccountName(text) {
  const raw = String(text || '');
  const match = raw.match(/\baccount\s+named\s+([^,.;]+?)(?=\s+(?:with|and|plus|then)\b|[,.;]|$)/i)
    || raw.match(/\b(?:create|add|new)\s+(?:an?\s+)?account\s+(?:for|called|named)?\s*([^,.;]+?)(?=\s+(?:with|and|plus|then|as\s+(?:an?\s+)?new\s+account)\b|[,.;]|$)/i);
  return cleanName(match?.[1]);
}

function extractContact(text) {
  const raw = String(text || '');
  const email = cleanName(raw.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i)?.[0]).toLowerCase();
  const explicit = raw
    .replace(/\([^)@]*@[A-Z0-9.-]+\.[A-Z]{2,}\)/ig, ' ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig, ' ')
    .match(/\b(?:add|create|new)\s+(?:an?\s+)?contact\s+(?:named|called)?\s*([^,.;]+?)(?=\s+(?:at|with|for|email|e-mail|and|plus|then)\b|[,.;]|$)/i)
    || raw.match(/\bcontact\s+named\s+([^,.;]+?)\s+with\s+email\s+[^\s,;]+/i);
  const name = cleanName(explicit?.[1]);
  return { name, email };
}

function extractCloseDate(text) {
  const raw = String(text || '');
  const iso = raw.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];
  const explicit = raw.match(/\b(?:expected\s+)?close\s+date\s+(?:is\s+)?([^,.;]+?)(?=\s+(?:and|with|for|primary)\b|[,.;]|$)/i)
    || raw.match(/\bclosing\s+([^,.;]+?)(?=\s+(?:and|with|for|primary|add|then)\b|[,.;]|$)/i);
  return cleanName(explicit?.[1]);
}

function extractDealName(text, accountName, amount) {
  const raw = String(text || '');
  const named = raw.match(/\b(?:deal|opportunit(?:y|ies))\s+named\s+([^,.;]+?)(?=\s+(?:for|with|in|closing|and|plus|then)\b|[,.;]|$)/i)?.[1];
  if (named) return cleanName(named);
  if (accountName && amount) return null; // Let create_deal use the standard account - $Amount naming.
  return cleanName(named);
}

function extractNote(text) {
  const raw = String(text || '');
  const match = raw.match(/\b(?:add|include|capture|log)\s+(?:a\s+)?note\s+(?:saying|that|:)?\s*([^]+?)(?=\s+(?:and\s+then|then\s+act|and\s+act|then\s+tell|and\s+tell)\b|[.]\s*$|$)/i);
  return cleanName(match?.[1]);
}

export function buildCompoundCreateToolCalls(message, allowedToolNames = new Set(REQUIRED_COMPOUND_CREATE_TOOLS)) {
  const text = String(message || '');
  const lower = text.toLowerCase();
  if (!/\b(create|add|new)\b/.test(lower)) return null;
  if (!/\baccount\b/.test(lower) || !/\bcontact\b/.test(lower) || !/\b(?:deal|opportunit(?:y|ies))\b/.test(lower)) return null;

  const hasTools = REQUIRED_COMPOUND_CREATE_TOOLS.every((tool) => allowedToolNames.has(tool));
  if (!hasTools) return null;

  const accountName = extractAccountName(text);
  const contact = extractContact(text);
  const dealMatch = text.match(/\$?\s*([\d,]+(?:\.\d+)?)\s*(?:deal|opportunity)\s+named\s+([^,.;]+?)(?=\s+for\s+(?:that|the)\s+account|[,.;]|$)/i);
  const primaryContactMatch = text.match(/\bprimary\s+contact\s+([^,.;]+?)(?=[,.;]|$)/i);
  const stageMatch = text.match(/\bin\s+(prospecting|qualified|proposal|negotiation|closed[\s_-]+won|closed[\s_-]+lost)\b/i);

  const contactName = contact.name;
  const email = contact.email;
  const amount = parseAmount(dealMatch?.[1]) || parseFlexibleAmount(text);
  const dealName = cleanName(dealMatch?.[2]) || extractDealName(text, accountName, amount);
  const closeDate = extractCloseDate(text);
  const primaryContact = cleanName(primaryContactMatch?.[1]) || contactName;
  const stage = normalizeStage(stageMatch?.[1]);
  const domain = parseDomain(text);
  const note = extractNote(text);

  if (!accountName || !contactName || !email || !amount || !closeDate || !primaryContact) {
    return null;
  }

  return [
    {
      id: 'compound_create_account_1',
      type: 'function',
      function: {
        name: 'create_account',
        arguments: JSON.stringify({
          name: accountName,
          ...(domain ? { website: domain, domain } : {}),
          associated_contacts: `${contactName} <${email}>`,
        }),
      },
    },
    {
      id: 'compound_create_contact_2',
      type: 'function',
      function: {
        name: 'create_contact',
        arguments: JSON.stringify({
          name: contactName,
          email,
          company: accountName,
          confirmed: true,
        }),
      },
    },
    {
      id: 'compound_create_deal_3',
      type: 'function',
      function: {
        name: 'create_deal',
        arguments: JSON.stringify({
          account_name: accountName,
          amount,
          ...(dealName ? { name: dealName } : {}),
          stage,
          close_date: closeDate,
          contact_name: primaryContact,
          contact_email: email,
          ...(note ? { notes: note } : {}),
        }),
      },
    },
  ];
}

function entityLabel(op) {
  const result = op?.result || {};
  return cleanName(result.name || result.full_name || result.deal_name || result.message || op?.tool);
}

function isManagerReviewAsk(message) {
  return /\b(manager|vp\s+of\s+sales|pipeline[-\s]?review|top\s+risk|next\s+best|missing\s+info|forecast)\b/i.test(String(message || ''));
}

function buildManagerReviewFromCreatedDeal(dealOp) {
  const result = dealOp?.result || {};
  const notes = String(result.notes || result.description || '').toLowerCase();
  const risks = [];
  if (/security|legal|procurement|review/.test(notes)) risks.push('security/procurement review is still open');
  if (/roi|business case|proof|value/.test(notes)) risks.push('ROI proof is not yet nailed down');
  if (/budget/.test(notes) && !/approved/.test(notes)) risks.push('budget is not confirmed');
  if (!result.contact_name && !result.contact_id) risks.push('no primary contact is attached');
  if (!result.expected_close_date && !result.close_date) risks.push('no close date is attached');

  const topRisk = risks[0] || 'qualification depth is still thin until next steps, decision process, and buyer evidence are captured';
  const nextAction = /roi|proof|business case|value/.test(notes)
    ? 'send a concise ROI proof point and ask the champion to validate it with the economic buyer'
    : 'confirm the decision process, next meeting date, and buyer-side success criteria';
  const buyerQuestion = /security|procurement|review/.test(notes)
    ? 'What specifically must security or procurement approve before this can move to proposal?'
    : 'What has to be true for you to confidently move this forward by the current close date?';
  const missing = [
    !result.contact_name && !result.contact_id && 'primary buyer or champion',
    'decision process',
    'next meeting date',
    'success criteria',
  ].filter(Boolean).slice(0, 4);

  return [
    '',
    'Pipeline review:',
    `- Top risk: ${topRisk}.`,
    `- Next best action: ${nextAction}.`,
    `- Buyer question: ${buyerQuestion}`,
    `- Missing info: ${missing.join(', ')}.`,
  ].join('\n');
}

export function buildCompoundCreateSummary(crmOperations = [], message = '') {
  const operations = Array.isArray(crmOperations) ? crmOperations : [];
  const failures = operations.filter((op) => op?.result?.error);
  const successes = operations.filter((op) => !op?.result?.error);

  const account = successes.find((op) => op.tool === 'create_account');
  const contact = successes.find((op) => op.tool === 'create_contact');
  const deal = successes.find((op) => op.tool === 'create_deal');

  const createdParts = [
    account && `account "${entityLabel(account)}"`,
    contact && `contact "${entityLabel(contact)}"`,
    deal && `deal "${entityLabel(deal)}"`,
  ].filter(Boolean);

  const failureParts = failures.map((op) => `${op.tool}: ${op.result?.message || 'failed'}`);

  if (createdParts.length === 0 && failureParts.length === 0) {
    return '';
  }

  const created = createdParts.length > 0
    ? `Created ${createdParts.join(', ').replace(/, ([^,]*)$/, ', and $1')}.`
    : '';
  const failed = failureParts.length > 0
    ? ` I could not complete: ${failureParts.join('; ')}.`
    : '';

  const review = isManagerReviewAsk(message) && deal
    ? buildManagerReviewFromCreatedDeal(deal)
    : '';

  return `${created}${failed}${review}`.trim();
}
