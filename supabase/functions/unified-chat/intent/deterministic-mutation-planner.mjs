const CREATE_DEAL_PATTERNS = [
  /\b(?:create|add|new)\b[\s\S]*\b(?:deal|opportunit(?:y|ies))\b/i,
  /\b(?:deal|opportunit(?:y|ies))\b[\s\S]*\b(?:create|add|new)\b/i,
];
const CREATE_ACCOUNT_CUE_PATTERN = /\b(?:create|add|new)\b(?:\s+(?:an?|this))?\s+(?:account|company)\b/i;
const CREATE_ACCOUNT_TARGET_PATTERN = /\b(?:create|add|new)\b(?:\s+(?:an?|this))?\s+(?:account|company)\s+(?:for|named|called)\s+(.+?)(?=\s*(?:,|\band\b|\bthen\b|\bplus\b|$))/i;
const CREATE_ACCOUNT_DOMAIN_PATTERN = /\b(?:https?:\/\/)?(?:www\.)?([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+)\b/i;
const CREATE_CONTACT_PATTERNS = [
  /\b(?:create|add|new)\b[\s\S]*\b(?:contact|lead)\b/i,
  /\b(?:contact|lead)\b[\s\S]*\b(?:create|add|new)\b/i,
];
const CREATE_TASK_PATTERNS = [
  /\b(?:create|add|new|make|set|schedule)\b[\s\S]*\b(?:task|next\s+step|todo|to-do|reminder|follow[\s-]?up)\b/i,
  /\bremind\s+me\s+to\b/i,
  /\bneed\s+to\b[\s\S]*\b(?:follow\s+up|send|call|email|schedule|prepare)\b/i,
];
const DELETE_DEAL_PATTERNS = [
  /\b(?:delete|remove|erase|permanently\s+delete)\b[\s\S]*\b(?:deal|opportunit(?:y|ies))\b/i,
  /\b(?:deal|opportunit(?:y|ies))\b[\s\S]*\b(?:delete|remove|erase)\b/i,
];
const SCHEDULE_MEETING_PATTERNS = [
  /\b(?:schedule|book|set\s+up|arrange)\b[\s\S]*\b(?:call|meeting|calendar\s+invite|meeting\s+invite|lunch|coffee)\b/i,
  /\b(?:check|find)\b[\s\S]*\bcalendar\s+availability\b/i,
  /\b(?:send|draft|create)\b[\s\S]*\bscheduling\s+email\b/i,
];

const AMOUNT_CUE_PATTERN = /\b(?:for|worth|valued\s+at|at|amount(?:\s+of)?)\s+\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kmb])?\s*(?:mrr|arr|acv|usd)?\b/i;
const AMOUNT_PREFIX_PATTERN = /\b(?:create|add|new)\b(?:\s+(?:an?|this))?\s+\$?\s*(\d[\d,]*(?:\.\d+)?)\s*([kmb])?\s*(?:mrr|arr|acv|usd)?\s+(?:deal|opportunit(?:y|ies))\b/i;
const ACCOUNT_BEFORE_AMOUNT_PATTERN = /\b(?:deal|opportunit(?:y|ies))\b\s+(?:for|with)\s+(.+?)\s+(?=\b(?:for|worth|valued\s+at|at|amount(?:\s+of)?)\b\s+\$?\s*\d)/i;
const ACCOUNT_AFTER_AMOUNT_PATTERN = /\b(?:create|add|new)\b(?:\s+(?:an?|this))?\s+\$?\s*\d[\d,]*(?:\.\d+)?\s*[kmb]?(?:\s*(?:mrr|arr|acv|usd))?\s+(?:deal|opportunit(?:y|ies))\b\s+(?:for|with)\s+(.+?)(?=\s+(?:for|about|regarding)\s+(?:an?|the)\b|[,.;]|\s+but\b|\s+closing\b|\s+with\s+(?:primary\s+)?contact\b|$)/i;
const ACCOUNT_TRAILING_PATTERN = /\b(?:deal|opportunit(?:y|ies))\b\s+(?:for|with)\s+(.+?)(?=\s+(?:for|about|regarding)\s+(?:an?|the)\b|[,.;]|\s+but\b|\s+closing\b|\s+with\s+(?:primary\s+)?contact\b|$)/i;
const CREATE_DEAL_INSTRUCTIONAL_PATTERN = /^\s*(?:how\s+(?:do|can)\s+i|show\s+me\s+how|what(?:'s| is)\s+(?:the\s+)?(?:best\s+way|process)\s+to|should\s+i|when\s+should\s+i)\b/i;
const PENDING_DEAL_ASSISTANT_PATTERN = /\bcreate_deal\b[\s\S]*\b(?:need|missing|required)\b|\bbefore i (?:can\s+)?create (?:it|this|that)\b[\s\S]*\b(?:need|missing|required)\b/i;
const PENDING_DEAL_FIELDS_PATTERN = /\bexpected close date\b|\bprimary contact name\b/i;
const UPDATE_ACCOUNT_RENAME_PATTERN = /\b(?:rename|change|update)\b[\s\S]*\baccount\b[\s\S]*\bname\b[\s\S]*\bto\b/i;
const UPDATE_ACCOUNT_RENAME_EXPLICIT_PATTERN = /\b(?:rename|change|update)\b(?:\s+(?:the|this|an?|my))?\s+(.+?)\s+account(?:\s+name)?\s+to\s+(.+?)(?:[.?!]|$)/i;
const UPDATE_ACCOUNT_RENAME_WITH_ACCOUNT_PATTERN = /\b(?:rename|change|update)\b(?:\s+(?:the|this|an?|my))?\s+account(?:\s+name)?\s+(?:for|from)?\s*(.+?)\s+to\s+(.+?)(?:[.?!]|$)/i;
const UPDATE_ACCOUNT_NOT_FOUND_PATTERN = /\bi couldn't find an account matching\b/i;
const EMAIL_PATTERN = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const DRAFT_EMAIL_REQUEST_PATTERN = /\b(?:draft|write|compose|create)\b[\s\S]*\b(?:email|message)\b/i;
const PENDING_DRAFT_EMAIL_ASSISTANT_PATTERN = /\bdraft_email\b[\s\S]*\bneed a recipient email\b|\bneed a recipient email before it becomes actionable\b/i;
const SEQUENCE_FILLER_PATTERN = /\b(?:use|the|sequence|cadence|please|thanks|thank\s+you|for|to|in|on)\b/gi;
const DELETE_CONFIRMATION_PATTERN = /^(?:yes|yep|yeah|confirm|confirmed|proceed|delete it|remove it|go ahead|do it|permanently delete it)[\s.!?]*$/i;
const PENDING_DELETE_ASSISTANT_PATTERN = /\bpermanently delete\b[\s\S]*\breply\s+["']?yes["']?\s+to\s+confirm deletion\b/i;
const SCHEDULE_CONFIRMATION_PATTERN = /^(?:yes|yep|yeah|confirm|confirmed|send it|send the email|go ahead|proceed|do it|looks good)[\s.!?]*$/i;
const SCHEDULE_CANCEL_PATTERN = /^(?:no|nope|cancel(?:\s+(?:the\s+)?(?:scheduling\s+)?(?:email|draft|message))?|stop|discard|never mind|nevermind)(?:\s+(?:it|this))?[\s.!?]*$/i;

function normalizeWhitespace(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parseAmount(match) {
  if (!match) return null;
  const numeric = Number(String(match[1] || '').replace(/,/g, ''));
  if (!Number.isFinite(numeric)) return null;
  const suffix = String(match[2] || '').toLowerCase();
  const multiplier = suffix === 'b'
    ? 1_000_000_000
    : suffix === 'm'
      ? 1_000_000
      : suffix === 'k'
        ? 1_000
        : 1;
  return Math.round(numeric * multiplier);
}

function sanitizeAccountName(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`\s]+|[)"'`.,!?;\s]+$/g, '')
    .replace(/\s+(?:deal|opportunity)$/i, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 120) return null;
  return cleaned;
}

function stripTrailingDealLocationQualifier(value) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return cleaned;

  return cleaned.replace(
    /\s+\bin\s+(?:d\.?c\.?|nyc|sf|la|hk|us|usa|u\.?k\.?|eu|emea|apac|new york|san francisco|los angeles|hong kong|london|singapore|tokyo|seattle|boston|austin|miami|chicago)\s*$/i,
    ''
  ).trim();
}

function sanitizeAccountIdentifier(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`“”‘’\s]+|[)"'`“”‘’.,!?;\s]+$/g, '')
    .replace(/^(?:account|acct)\s+/i, '')
    .replace(/^(?:it's|it’s|it['’`]?s|it\s+is|its)\s+/i, '')
    .replace(/\bit['’`]?s\b/ig, '')
    .replace(/\bit\s+is\b/ig, '')
    .replace(/^(?:sorry|apologies)[,:\s-]*/i, '')
    .replace(/^the\s+/i, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 120) return null;
  return cleaned;
}

function sanitizeCreateAccountTarget(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`\s]+|[)"'`.,!?;\s]+$/g, '')
    .replace(/^(?:for|named|called)\s+/i, '')
    .replace(/\s+as\s+(?:an?\s+)?new\s+(?:account|company)\b/ig, '')
    .replace(/\s+(?:account|company)\b$/ig, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 120) return null;
  return cleaned;
}

function normalizeDomainLike(value) {
  const match = String(value || '').toLowerCase().match(CREATE_ACCOUNT_DOMAIN_PATTERN);
  return match?.[1] || null;
}

function isAmountLikeValue(value) {
  const raw = normalizeWhitespace(value).toLowerCase();
  if (!raw) return false;
  return /^\$?\d[\d,]*(?:\.\d+)?\s*(?:k|m|b)?(?:\s*(?:mrr|arr|acv|usd))?$/.test(raw);
}

function sanitizeContactName(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`\s]+|[)"'`.,!?;\s]+$/g, '')
    .replace(/\b(?:please|thanks|thank you)\b/gi, '')
    .replace(/^(?:and|with|closing|close|expected)\s+/i, '')
    .replace(/\s+\bat$/i, '')
    .trim();
  if (!cleaned) return null;
  if (/^(?:today|tomorrow|next\s+month|next\s+week|q[1-4]|jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i.test(cleaned)) {
    return null;
  }
  if (cleaned.length < 2 || cleaned.length > 120) return null;
  return cleaned;
}

function sanitizeGenericEntityName(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`“”‘’\s]+|[)"'`“”‘’.,!?;\s]+$/g, '')
    .replace(/^(?:the|this|that)\s+/i, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 160) return null;
  return cleaned;
}

function sanitizeTaskTitle(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`“”‘’\s]+|[)"'`“”‘’.,!?;\s]+$/g, '')
    .replace(/^to\s+/i, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 220) return null;
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
}

function sanitizeSequenceName(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`\s]+|[)"'`.,!?;\s]+$/g, '')
    .replace(/\b(?:sequence|cadence)\b$/i, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 120) return null;
  return cleaned;
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function looksLikeLooseContactName(value) {
  const cleaned = sanitizeContactName(value);
  if (!cleaned) return false;

  const tokens = cleaned.split(/\s+/).filter(Boolean);
  if (tokens.length === 0 || tokens.length > 4) return false;
  if (!tokens.every((token) => /^[A-Za-z][A-Za-z'.-]*$/.test(token))) return false;

  const lowered = cleaned.toLowerCase();
  if (/\b(?:create|add|new|deal|deals|opportunity|opportunities|account|accounts|close|closing|date|search|find|lookup|look\s+up|contacts|crm|pipeline|amount|mrr|arr|acv|schedule|book|call|meeting|calendar|availability)\b/.test(lowered)) {
    return false;
  }

  return true;
}

function extractContactEmailFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const match = rawMessage.match(EMAIL_PATTERN);
  return match?.[0] ? match[0].toLowerCase() : null;
}

function extractPendingContactDetailsFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return {};

  const details = {};
  const email = extractContactEmailFromMessage(rawMessage);
  if (email) details.contact_email = email;

  const firstNameMatch = rawMessage.match(/\bfirst\s+name\s*(?:is|=|:)?\s*([A-Za-z][A-Za-z'.-]*)\b/i);
  const lastNameMatch = rawMessage.match(/\blast\s+name\s*(?:is|=|:)?\s*([A-Za-z][A-Za-z'.-]*)\b/i);
  if (firstNameMatch?.[1]) details.contact_first_name = firstNameMatch[1];
  if (lastNameMatch?.[1]) details.contact_last_name = lastNameMatch[1];

  const titleMatch = rawMessage.match(/\btitle\s*(?:is|=|:)?\s*([^,.;]+?)(?=\s+(?:email|e-mail|first\s+name|last\s+name)\b|[,.;]|$)/i);
  if (titleMatch?.[1]) {
    const title = sanitizeGenericEntityName(titleMatch[1]);
    if (title) details.contact_title = title;
  }

  if (email) {
    const beforeEmail = rawMessage.slice(0, rawMessage.toLowerCase().indexOf(email.toLowerCase())).trim();
    const parts = beforeEmail
      .replace(/\b(?:use|add|create|contact|with|email|e-mail|is|it's|its|it is)\b/gi, ' ')
      .split(',')
      .map((part) => normalizeWhitespace(part))
      .filter(Boolean);
    const nameCandidate = sanitizeContactName(parts[0] || '');
    if (nameCandidate && looksLikeLooseContactName(nameCandidate)) {
      const nameParts = nameCandidate.split(/\s+/).filter(Boolean);
      if (nameParts.length >= 2) {
        details.contact_first_name ||= nameParts[0];
        details.contact_last_name ||= nameParts.slice(1).join(' ');
      }
    }
    if (!details.contact_title && parts.length > 1) {
      const title = sanitizeGenericEntityName(parts[1]);
      if (title) details.contact_title = title;
    }
  }

  return details;
}

export function repairScheduleMeetingArgsFromMessage(args, message) {
  const repaired = args && typeof args === 'object' && !Array.isArray(args)
    ? { ...args }
    : {};
  const contactDetails = extractPendingContactDetailsFromMessage(message);

  for (const key of ['contact_email', 'contact_first_name', 'contact_last_name', 'contact_title']) {
    if (!repaired[key] && contactDetails[key]) repaired[key] = contactDetails[key];
  }

  if (!repaired.contact_name && contactDetails.contact_first_name && contactDetails.contact_last_name) {
    repaired.contact_name = `${contactDetails.contact_first_name} ${contactDetails.contact_last_name}`;
  }

  return repaired;
}

function extractTrailingAccountNameFromCreateDealMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const matches = Array.from(rawMessage.matchAll(/\b(?:for|with)\s+([A-Za-z][A-Za-z0-9 .&'’-]{1,100}?)(?=\s*(?:[.?!]|$))/gi));
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const candidate = sanitizeAccountName(matches[index]?.[1] || '');
    if (candidate && !isAmountLikeValue(candidate)) return candidate;
  }

  return null;
}

function sanitizeDraftContext(value) {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`“”‘’\s]+|[)"'`“”‘’.,!?;\s]+$/g, '')
    .replace(/^(?:please\s+)?(?:mention|include|cover|add)\s+/i, '')
    .trim();
  if (!cleaned) return null;
  if (cleaned.length < 2 || cleaned.length > 260) return null;
  return cleaned;
}

function extractDraftDealNameFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage || !DRAFT_EMAIL_REQUEST_PATTERN.test(rawMessage)) return null;

  const quoted = rawMessage.match(/["'“”‘’]([^"'“”‘’]{2,160})["'“”‘’]/)?.[1];
  if (quoted) return sanitizeGenericEntityName(quoted);

  const explicit = rawMessage.match(/\b(?:for|on|about|regarding)\s+(.+?)(?=\s+(?:with\s+next\s+steps?|next\s+steps?|including|include|mention|cover|send\s+to|to\s+[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b|[,.!?]?$)/i);
  if (explicit?.[1]) return sanitizeGenericEntityName(explicit[1]);

  return null;
}

function extractDraftEmailTypeFromMessage(message) {
  const rawMessage = normalizeWhitespace(message).toLowerCase();
  if (/\bproposal\b/.test(rawMessage)) return 'proposal';
  if (/\bmeeting\b|\bschedule\b/.test(rawMessage)) return 'meeting_request';
  if (/\bcheck[\s-]?in\b/.test(rawMessage)) return 'check_in';
  if (/\bintro(?:duction)?\b/.test(rawMessage)) return 'introduction';
  if (/\bthank(?:s| you)\b/.test(rawMessage)) return 'thank_you';
  return 'follow_up';
}

function extractDraftContextFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const explicit = rawMessage.match(/\b(?:mention|include|cover|add)\s+(.+?)(?:[.!?]|$)/i)?.[1];
  if (explicit) return sanitizeDraftContext(explicit);

  if (/\bnext\s+steps?\b/i.test(rawMessage)) return 'next steps';
  return null;
}

function extractDraftRecipientNameFromMessage(message) {
  const rawMessage = normalizeWhitespace(message)
    .replace(EMAIL_PATTERN, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!rawMessage) return null;

  const explicit = rawMessage.match(/^(?:use|send(?:\s+it)?\s+to|to)\s+([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,4})(?=\s*(?:\bat\b|[,.!?]|$|\band\b|\bmention\b|\binclude\b|\bcover\b))/i)
    || rawMessage.match(/\b(?:recipient|contact)\s*(?:is|=|:)?\s*([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,4})(?=\s*(?:\bat\b|[,.!?]|$|\band\b|\bmention\b|\binclude\b|\bcover\b))/i);
  if (explicit?.[1]) {
    return sanitizeContactName(explicit[1].replace(/\s+\b(?:mention|include|cover)\b.*$/i, ''));
  }

  return extractContactNameFromMessage(rawMessage, { allowImplicit: true });
}

function extractDraftEmailArgsFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage || !DRAFT_EMAIL_REQUEST_PATTERN.test(rawMessage)) return null;

  const dealName = extractDraftDealNameFromMessage(rawMessage);
  const context = extractDraftContextFromMessage(rawMessage);
  const args = {
    email_type: extractDraftEmailTypeFromMessage(rawMessage),
  };
  if (dealName) args.deal_name = dealName;
  if (dealName) args.account_name = dealName.replace(/\s+-\s+\$[\d,.]+(?:\.\d+)?\s*[kmb]?$/i, '').trim();
  if (context) args.context = context;
  return args;
}

function extractCloseDateFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const iso = rawMessage.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) return iso[0];

  const slash = rawMessage.match(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/);
  if (slash) return slash[0];

  const fuzzy = rawMessage.match(/\b(?:next month|end of year|year end|eoy|q[1-4](?:\s+\d{4})?|end of q[1-4]|(?:(?:end|middle|mid|late|early|by)\s+(?:of\s+)?)?(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:\s+\d{1,2}(?:st|nd|rd|th)?)?)(?:,?\s+\d{4})?\b/i);
  return fuzzy ? fuzzy[0] : null;
}

function extractContactNameFromMessage(message, options = {}) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const explicitMessage = rawMessage
    .replace(/\(\s*[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\s*\)/ig, ' ')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const useAsContact = explicitMessage.match(/\b(?:use|set|make)\s+([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})\s+as\s+(?:the\s+)?(?:primary\s+)?contact\b/i);
  if (useAsContact?.[1]) return sanitizeContactName(useAsContact[1]);

  const pronounContact = explicitMessage.match(/\b(?:it['’`]?s|its|it\s+is)\s+([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})(?=\s+(?:and|with|,|\.|$))/i);
  if (pronounContact?.[1]) {
    const contact = sanitizeContactName(pronounContact[1]);
    if (looksLikeLooseContactName(contact)) return contact;
  }

  const explicit = explicitMessage.match(/\b(?:primary\s+contact(?:\s+name)?|contact(?:\s+name)?)\s*(?:is|=|:)?\s*([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})\b/i)
    || explicitMessage.match(/\b(?:primary\s+contact(?:\s+name)?|contact(?:\s+name)?)\s*(?:is|=|:)\s*([^,.;\n]+)$/i)
    || explicitMessage.match(/\b(?:primary\s+contact(?:\s+name)?|contact(?:\s+name)?)\s*(?:is|=|:)?\s*([^,.;\n]+?)(?:\s+\b(?:and|with|closing|close|expected)\b|$)/i);
  if (explicit?.[1]) return sanitizeContactName(explicit[1]);

  if (!options.allowImplicit) return null;

  let candidate = rawMessage;
  const extractedCloseDate = extractCloseDateFromMessage(rawMessage);
  if (extractedCloseDate) {
    candidate = candidate.replace(new RegExp(`\\b${escapeRegExp(extractedCloseDate)}\\b`, 'ig'), ' ');
  }
  const extractedEmail = extractContactEmailFromMessage(rawMessage);
  if (extractedEmail) {
    candidate = candidate.replace(new RegExp(`\\b${escapeRegExp(extractedEmail)}\\b`, 'ig'), ' ');
  }

  candidate = candidate
    .replace(/\b(?:close\s+date|expected\s+close\s+date|closing)\b\s*(?:is|=|:)?/gi, ' ')
    .replace(/\b(?:primary\s+contact(?:\s+name)?|contact(?:\s+name)?)\b\s*(?:is|=|:)?/gi, ' ')
    .replace(/\b(?:email|e-mail)\b\s*(?:is|=|:)?/gi, ' ')
    .replace(/[()]/g, ' ')
    .replace(/[,:;]+/g, ' ')
    .replace(/\b(?:and|with|use|it'?s|its|is|please|thanks|thank\s+you)\b/gi, ' ');

  const cleanedCandidate = sanitizeContactName(candidate);
  return looksLikeLooseContactName(cleanedCandidate) ? cleanedCandidate : null;
}

function extractMissingPendingFields(pendingDealData) {
  const pending = Array.isArray(pendingDealData) ? pendingDealData[0] : pendingDealData;
  return {
    closeDateMissing: !pending?.close_date,
    contactNameMissing: !pending?.contact_name,
    contactEmailMissing: !pending?.contact_email,
    refreshContactDetails: String(pending?.confirmation_type || '').toLowerCase() === 'contact_resolution',
  };
}

function extractUpdateAccountRenameArgsFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;
  if (!UPDATE_ACCOUNT_RENAME_PATTERN.test(rawMessage)) return null;

  const match = rawMessage.match(UPDATE_ACCOUNT_RENAME_EXPLICIT_PATTERN)
    || rawMessage.match(UPDATE_ACCOUNT_RENAME_WITH_ACCOUNT_PATTERN);
  if (!match?.[1] || !match?.[2]) return null;

  const accountName = sanitizeAccountIdentifier(match[1]);
  const newAccountName = sanitizeAccountName(match[2]);
  if (!accountName || !newAccountName) return null;
  if (accountName.toLowerCase() === newAccountName.toLowerCase()) return null;

  return {
    account_name: accountName,
    updates: { name: newAccountName },
  };
}

function extractAccountIdentifierFromFollowUpMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const explicit = rawMessage.match(/\b(?:it(?:'s| is)|account(?:\s+name)?)\s*(?:is|=|:)?\s*([^,.;\n]+)$/i)
    || rawMessage.match(/^(?:sorry|apologies)[,:\s-]*(?:it(?:'s| is)\s+)?([^,.;\n]+)$/i);
  if (explicit?.[1]) return sanitizeAccountIdentifier(explicit[1]);

  // Accept terse follow-ups like "12.5k" or "example.net".
  return sanitizeAccountIdentifier(rawMessage);
}

function extractSequenceNameFromMessage(message, options = {}) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const explicit = rawMessage.match(/\b(?:sequence|cadence)\s*(?:is|=|:)?\s*([^,.;\n]+)$/i)
    || rawMessage.match(/\b(?:in|to|on)\s+([^,.;\n]+?)\s+(?:sequence|cadence)\b/i);
  if (explicit?.[1]) return sanitizeSequenceName(explicit[1]);

  if (!options.allowImplicit) return null;

  const candidate = rawMessage
    .replace(SEQUENCE_FILLER_PATTERN, ' ')
    .replace(/[,:;]+/g, ' ')
    .trim();

  return sanitizeSequenceName(candidate);
}

function extractTitleFromTaskMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const toAction = rawMessage.match(/\bto\s+(.+?)(?=\s+(?:for|on|with|at)\s+[^,.;]+(?:[,.!?]|$)|[,.!?]?$)/i);
  if (toAction?.[1]) {
    const title = sanitizeTaskTitle(toAction[1]);
    if (title) return title;
  }

  const remind = rawMessage.match(/\bremind\s+me\s+to\s+(.+?)(?=\s+(?:today|tomorrow|tonight|next\s+\w+|on\s+\w+|by\s+\w+|due\b)|[,.!?]?$)/i);
  if (remind?.[1]) {
    const title = sanitizeTaskTitle(remind[1]);
    if (title) return title;
  }

  const taskNamed = rawMessage.match(/\b(?:task|next\s+step|todo|to-do|reminder)\s+(?:to|for|called|named)\s+(.+?)(?=\s+(?:for|on|with|at|today|tomorrow|next\s+\w+|due\b|by\b)|[,.!?]?$)/i);
  if (taskNamed?.[1] && !/\b(?:deal|account|company|contact)\b/i.test(taskNamed[1])) {
    const title = sanitizeTaskTitle(taskNamed[1]);
    if (title) return title;
  }

  if (/\bfollow[\s-]?up\b/i.test(rawMessage)) return 'Follow up';
  if (/\bsend\s+(?:a\s+)?proposal\b/i.test(rawMessage)) return 'Send proposal';
  if (/\bschedule\s+(?:a\s+)?(?:call|meeting)\b/i.test(rawMessage)) return 'Schedule call';
  if (/\bcall\b/i.test(rawMessage)) return 'Call';
  if (/\bemail\b/i.test(rawMessage)) return 'Email';
  return null;
}

function extractDueDateFromTaskMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const explicit = rawMessage.match(/\b(?:due|by|on)\s+((?:today|tomorrow|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|\d{4}-\d{2}-\d{2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:,\s*\d{4})?))\b/i);
  if (explicit?.[1]) return explicit[1];

  const bare = rawMessage.match(/\b(today|tomorrow|tonight|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i);
  return bare?.[1] || null;
}

function extractScheduleMeetingType(message) {
  const rawMessage = normalizeWhitespace(message).toLowerCase();
  if (/\blunch\b/.test(rawMessage)) return 'lunch';
  if (/\bcoffee\b/.test(rawMessage)) return 'coffee';
  if (/\bcall\b/.test(rawMessage)) return 'call';
  return 'meeting';
}

function extractScheduleTimePreference(message) {
  const rawMessage = normalizeWhitespace(message).toLowerCase();
  if (/\bmorning\b|\bbefore noon\b|\bam\b/.test(rawMessage)) return 'morning';
  if (/\bafternoon\b|\bafter lunch\b|\bpm\b/.test(rawMessage)) return 'afternoon';
  return null;
}

function extractScheduleTarget(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const explicit = rawMessage.match(/\b(?:schedule|book|set\s+up|arrange)\s+(?:a\s+)?(?:call|meeting|calendar\s+invite|meeting\s+invite|lunch|coffee)\s+(?:for|with)\s+(.+?)(?=\s*(?:[.!?]|,|\bcheck\b|\bhelp\b|\bsend\b|\bdraft\b|\binclude\b|\bmention\b|$))/i)
    || rawMessage.match(/\b(?:availability|scheduling\s+email)\s+(?:for|with)\s+(.+?)(?=\s*(?:[.!?]|,|\bcheck\b|\bhelp\b|\bsend\b|\bdraft\b|\binclude\b|\bmention\b|$))/i);
  return sanitizeGenericEntityName(explicit?.[1] || '');
}

function extractScheduleAccountName(message) {
  const rawMessage = normalizeWhitespace(message);
  const explicit = rawMessage.match(/\b(?:at|from|for)\s+([A-Za-z0-9][A-Za-z0-9&.,' -]{1,80})(?=\s*(?:[.!?]|,|\bcheck\b|\bhelp\b|\bsend\b|\bdraft\b|\binclude\b|\bmention\b|$))/i);
  return sanitizeAccountIdentifier(explicit?.[1] || '');
}

function extractScheduleMessageNote(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;
  const explicit = rawMessage.match(/\b(?:about|regarding|to discuss|mention|include)\s+(.+?)(?:[.!?]|$)/i)?.[1];
  if (!explicit) return null;
  return sanitizeDraftContext(explicit);
}

function extractScheduleArgsFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage || !SCHEDULE_MEETING_PATTERNS.some((pattern) => pattern.test(rawMessage))) return null;
  const contactEmail = extractContactEmailFromMessage(rawMessage);
  const scheduleTargetSource = contactEmail
    ? normalizeWhitespace(rawMessage.replace(new RegExp(`\\s+(?:with|to)\\s+${escapeRegExp(contactEmail)}`, 'i'), ' '))
    : rawMessage;

  const args = {
    meeting_type: extractScheduleMeetingType(rawMessage),
  };

  const target = extractScheduleTarget(scheduleTargetSource);
  const contactName = extractContactNameFromTaskMessage(scheduleTargetSource);
  if (contactName && !/\bcontact\b/i.test(contactName)) {
    args.contact_name = contactName;
  }
  if (contactEmail) {
    args.contact_email = contactEmail;
    const contactDetails = extractPendingContactDetailsFromMessage(rawMessage);
    if (contactDetails.contact_first_name) args.contact_first_name = contactDetails.contact_first_name;
    if (contactDetails.contact_last_name) args.contact_last_name = contactDetails.contact_last_name;
    if (contactDetails.contact_title) args.contact_title = contactDetails.contact_title;
  }
  if (target && !args.contact_name) {
    const strippedTarget = target.replace(/\s+-\s+\$[\d,.]+(?:\.\d+)?\s*[kmb]?$/i, '').trim();
    // Targets with CRM/deal cues should resolve through the deal/account path.
    if (/[$€£]\s*\d|\b\d+(?:\.\d+)?\s*(?:k|m|b)\b|\bdeal\b|\bopportunit/i.test(target)) {
      args.deal_name = target;
      if (strippedTarget && strippedTarget !== target) args.account_name = strippedTarget;
    } else if (!/\bcontact\b/i.test(target)) {
      args.deal_name = target;
      args.account_name = strippedTarget || target;
    }
  }

  const accountName = extractScheduleAccountName(scheduleTargetSource);
  if (accountName && !args.account_name && !/^(call|meeting|lunch|coffee)$/i.test(accountName)) {
    args.account_name = accountName;
  }

  const proposedDate = extractDueDateFromTaskMessage(rawMessage) || extractCloseDateFromMessage(rawMessage);
  if (proposedDate) args.proposed_date = proposedDate;

  const timePreference = extractScheduleTimePreference(rawMessage);
  if (timePreference) args.time_preference = timePreference;

  const messageNote = extractScheduleMessageNote(rawMessage);
  if (messageNote) args.message_note = messageNote;

  if (!args.contact_name && !args.contact_email && !args.deal_name && !args.account_name) return null;
  return args;
}

function extractAccountNameFromTaskMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const explicit = rawMessage.match(/\b(?:for|on|about|regarding)\s+(.+?)(?=\s+(?:due|by|today|tomorrow|tonight|next\s+\w+|to\s+\w+|with\s+(?:email|primary|contact)|because|from\s+\w+)|[,.!?]?$)/i);
  if (explicit?.[1]) return sanitizeAccountIdentifier(explicit[1]);

  const atCompany = rawMessage.match(/\b(?:at|with)\s+(.+?)(?=\s+(?:due|by|today|tomorrow|tonight|next\s+\w+|to\s+\w+)|[,.!?]?$)/i);
  if (atCompany?.[1] && !EMAIL_PATTERN.test(atCompany[1])) return sanitizeAccountIdentifier(atCompany[1]);

  return null;
}

function extractContactNameFromTaskMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;

  const withPerson = rawMessage.match(/\b(?:follow\s+up\s+with|call|email|meet\s+with)\s+([A-Za-z][A-Za-z'.-]*(?:\s+[A-Za-z][A-Za-z'.-]*){0,3})(?=\s+(?:at|from|for|about|regarding|due|by|today|tomorrow|next\b)|[,.!?]?$)/i);
  return withPerson?.[1] ? sanitizeContactName(withPerson[1]) : null;
}

function extractCreateTaskArgsFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;
  if (!CREATE_TASK_PATTERNS.some((pattern) => pattern.test(rawMessage))) return null;

  const title = extractTitleFromTaskMessage(rawMessage);
  if (!title) return null;

  const args = { title };
  const dueDate = extractDueDateFromTaskMessage(rawMessage);
  if (dueDate) args.due_date = dueDate;

  const accountName = extractAccountNameFromTaskMessage(rawMessage);
  if (accountName) args.account_name = accountName;

  const contactName = extractContactNameFromTaskMessage(rawMessage);
  if (contactName) args.contact_name = contactName;

  if (/\b(urgent|critical|high priority|asap)\b/i.test(rawMessage)) args.priority = 'high';
  if (/\b(low priority|whenever)\b/i.test(rawMessage)) args.priority = 'low';

  return args;
}

function extractCreateContactArgsFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;
  if (!CREATE_CONTACT_PATTERNS.some((pattern) => pattern.test(rawMessage))) return null;

  const nameMatch = rawMessage.match(/\b(?:add|create|new)\s+(.+?)\s+as\s+(?:an?\s+)?(?:contact|lead)\b/i)
    || rawMessage.match(/\b(?:add|create|new)\s+(?:an?\s+)?(?:contact|lead)\s+(?:named|called)?\s*([^,.;]+?)(?=\s+(?:for|at|with|email|e-mail|title|phone)\b|[,.!?]?$)/i);
  const name = sanitizeContactName(nameMatch?.[1]);
  if (!name) return null;

  const email = extractContactEmailFromMessage(rawMessage);
  const companyMatch = rawMessage.match(/\b(?:for|at)\s+(.+?)(?=\s+(?:with\s+)?(?:email|e-mail|title|phone|notes?)\b|[,.!?]?$)/i);
  const company = sanitizeAccountIdentifier(companyMatch?.[1] || '');
  const titleMatch = rawMessage.match(/\btitle\s*(?:is|=|:)?\s*([^,.;]+?)(?=\s+(?:with|email|phone|notes?)\b|[,.!?]?$)/i)
    || rawMessage.match(/\bas\s+(?:an?\s+)?([^,.;]+?)\s+(?:at|for)\b/i);
  const title = sanitizeGenericEntityName(titleMatch?.[1] || '');

  const args = { name };
  if (email) args.email = email;
  if (company) args.company = company;
  if (title && !/\bcontact|lead\b/i.test(title)) args.title = title;
  return args;
}

function extractDeleteDealArgsFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;
  if (!DELETE_DEAL_PATTERNS.some((pattern) => pattern.test(rawMessage))) return null;

  const nameMatch = rawMessage.match(/\b(?:delete|remove|erase|permanently\s+delete)\s+(?:the\s+)?(.+?)\s+(?:deal|opportunit(?:y|ies))\b/i)
    || rawMessage.match(/\b(?:delete|remove|erase|permanently\s+delete)\s+(?:the\s+)?(?:deal|opportunit(?:y|ies))\s+(?:for|called|named)?\s*(.+?)(?:[.?!]|$)/i);
  const dealName = sanitizeGenericEntityName(nameMatch?.[1] || '');
  if (!dealName) return null;

  const reasonMatch = rawMessage.match(/\b(?:because|reason(?: is)?|due to)\s+(.+?)(?:[.?!]|$)/i);
  const args = { deal_name: dealName };
  if (reasonMatch?.[1]) args.delete_reason = sanitizeGenericEntityName(reasonMatch[1]);
  return args;
}

export function hasDeterministicMutationCue(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return false;
  return CREATE_DEAL_PATTERNS.some((pattern) => pattern.test(rawMessage))
    || CREATE_ACCOUNT_CUE_PATTERN.test(rawMessage)
    || CREATE_CONTACT_PATTERNS.some((pattern) => pattern.test(rawMessage))
    || CREATE_TASK_PATTERNS.some((pattern) => pattern.test(rawMessage))
    || DELETE_DEAL_PATTERNS.some((pattern) => pattern.test(rawMessage))
    || SCHEDULE_MEETING_PATTERNS.some((pattern) => pattern.test(rawMessage))
    || UPDATE_ACCOUNT_RENAME_PATTERN.test(rawMessage);
}

export function extractCreateDealArgsFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;
  if (!CREATE_DEAL_PATTERNS.some((pattern) => pattern.test(rawMessage))) return null;

  const amount = parseAmount(rawMessage.match(AMOUNT_CUE_PATTERN) || rawMessage.match(AMOUNT_PREFIX_PATTERN));
  const accountCandidate = rawMessage.match(ACCOUNT_BEFORE_AMOUNT_PATTERN)?.[1]
    || rawMessage.match(ACCOUNT_AFTER_AMOUNT_PATTERN)?.[1]
    || rawMessage.match(ACCOUNT_TRAILING_PATTERN)?.[1]
    || extractTrailingAccountNameFromCreateDealMessage(rawMessage)
    || '';
  const accountName = sanitizeAccountName(stripTrailingDealLocationQualifier(
    isAmountLikeValue(accountCandidate) || /\$?\d[\d,]*(?:\.\d+)?\s*[kmb]?\b[\s\S]*\b(?:for|with)\s+[A-Za-z]/i.test(accountCandidate)
      ? extractTrailingAccountNameFromCreateDealMessage(rawMessage)
      : accountCandidate
  ));
  if (!accountName) return null;
  if (isAmountLikeValue(accountName)) return null;

  const args = { account_name: accountName };
  if (amount != null) args.amount = amount;
  const closeDate = extractCloseDateFromMessage(rawMessage);
  if (closeDate) args.close_date = closeDate;
  const contactName = extractContactNameFromMessage(rawMessage);
  if (contactName) args.contact_name = contactName;
  const contactEmail = extractContactEmailFromMessage(rawMessage);
  if (contactEmail) args.contact_email = contactEmail;
  return args;
}

function extractCreateAccountTargetFromMessage(message) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage || !CREATE_ACCOUNT_CUE_PATTERN.test(rawMessage)) return null;

  const explicitTarget = sanitizeCreateAccountTarget(rawMessage.match(CREATE_ACCOUNT_TARGET_PATTERN)?.[1] || '');
  if (explicitTarget) return explicitTarget;

  // Fallback: if user includes a domain when asking to create an account, treat it as the target.
  const domain = normalizeDomainLike(rawMessage);
  return domain || null;
}

export function buildDeterministicCreateAccountThenDealPlan(message, intent, allowedToolNames = new Set()) {
  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage) return null;
  if (CREATE_DEAL_INSTRUCTIONAL_PATTERN.test(rawMessage)) return null;

  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('create_account') || !toolNames.has('create_deal')) return null;
  if (!CREATE_ACCOUNT_CUE_PATTERN.test(rawMessage)) return null;
  if (!CREATE_DEAL_PATTERNS.some((pattern) => pattern.test(rawMessage))) return null;

  const accountTarget = extractCreateAccountTargetFromMessage(rawMessage);
  if (!accountTarget) return null;

  const amount = parseAmount(rawMessage.match(AMOUNT_CUE_PATTERN) || rawMessage.match(AMOUNT_PREFIX_PATTERN));
  const closeDate = extractCloseDateFromMessage(rawMessage);
  const contactName = extractContactNameFromMessage(rawMessage);
  const contactEmail = extractContactEmailFromMessage(rawMessage);
  const domain = normalizeDomainLike(accountTarget);
  const dealAccountName = sanitizeAccountName(accountTarget);
  if (!dealAccountName) return null;

  const normalizedIntent = intent || {};
  const domains = new Set((normalizedIntent.domains || []).map((domainName) => String(domainName || '').toLowerCase()));
  const explicitIntent = String(normalizedIntent.intent || '').toLowerCase();
  const clearlyConflictingIntent = explicitIntent
    && explicitIntent !== 'crm_mutation'
    && !domains.has('create');
  if (clearlyConflictingIntent) return null;

  const createAccountArgs = {
    name: accountTarget,
    ...(domain ? { domain, website: domain } : {}),
  };
  const createDealArgs = {
    account_name: dealAccountName,
    ...(amount != null ? { amount } : {}),
    ...(closeDate ? { close_date: closeDate } : {}),
    ...(contactName ? { contact_name: contactName } : {}),
    ...(contactEmail ? { contact_email: contactEmail } : {}),
  };

  return {
    provider: 'deterministic',
    model: 'deterministic-create-account-deal',
    toolCalls: [
      {
        id: 'deterministic_create_account_0',
        type: 'function',
        function: {
          name: 'create_account',
          arguments: JSON.stringify(createAccountArgs),
        },
      },
      {
        id: 'deterministic_create_deal_1',
        type: 'function',
        function: {
          name: 'create_deal',
          arguments: JSON.stringify(createDealArgs),
        },
      },
    ],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicUpdateAccountRenamePlan(message, intent, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('update_account')) return null;

  const args = extractUpdateAccountRenameArgsFromMessage(message);
  if (!args) return null;

  const normalizedIntent = intent || {};
  const domains = new Set((normalizedIntent.domains || []).map((domain) => String(domain || '').toLowerCase()));
  const entityType = String(normalizedIntent.entityType || '').toLowerCase();
  const explicitIntent = String(normalizedIntent.intent || '').toLowerCase();
  const clearlyConflictingIntent = explicitIntent
    && explicitIntent !== 'crm_mutation'
    && !domains.has('update')
    && !domains.has('create')
    && entityType
    && entityType !== 'account';
  if (clearlyConflictingIntent) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-update-account-rename',
    toolCalls: [{
      id: 'deterministic_update_account_rename_0',
      type: 'function',
      function: {
        name: 'update_account',
        arguments: JSON.stringify(args),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicCreateDealPlan(message, intent, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('create_deal')) return null;
  if (CREATE_DEAL_INSTRUCTIONAL_PATTERN.test(String(message || ''))) return null;

  const args = extractCreateDealArgsFromMessage(message);
  if (!args) return null;

  const normalizedIntent = intent || {};
  const domains = new Set((normalizedIntent.domains || []).map((domain) => String(domain || '').toLowerCase()));
  const entityType = String(normalizedIntent.entityType || '').toLowerCase();
  const mentionsDeal = /\b(?:deal|opportunit(?:y|ies))\b/i.test(String(message || ''));
  const explicitIntent = String(normalizedIntent.intent || '').toLowerCase();
  const clearlyConflictingIntent = explicitIntent
    && explicitIntent !== 'crm_mutation'
    && !domains.has('create')
    && entityType
    && entityType !== 'deal'
    && !mentionsDeal;
  if (clearlyConflictingIntent) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-create-deal',
    toolCalls: [{
      id: 'deterministic_create_deal_0',
      type: 'function',
      function: {
        name: 'create_deal',
        arguments: JSON.stringify(args),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicCreateTaskPlan(message, intent, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('create_task')) return null;

  const args = extractCreateTaskArgsFromMessage(message);
  if (!args) return null;

  const normalizedIntent = intent || {};
  const explicitIntent = String(normalizedIntent.intent || '').toLowerCase();
  const domains = new Set((normalizedIntent.domains || []).map((domain) => String(domain || '').toLowerCase()));
  const clearlyConflictingIntent = explicitIntent
    && explicitIntent !== 'crm_mutation'
    && explicitIntent !== 'drafting'
    && !domains.has('create');
  if (clearlyConflictingIntent) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-create-task',
    toolCalls: [{
      id: 'deterministic_create_task_0',
      type: 'function',
      function: {
        name: 'create_task',
        arguments: JSON.stringify(args),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicScheduleMeetingPlan(message, intent, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('schedule_meeting')) return null;

  const args = extractScheduleArgsFromMessage(message);
  if (!args) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-schedule-meeting',
    toolCalls: [{
      id: 'deterministic_schedule_meeting_0',
      type: 'function',
      function: {
        name: 'schedule_meeting',
        arguments: JSON.stringify(args),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicPendingScheduleMeetingPlan(message, pendingScheduleMeeting, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('schedule_meeting')) return null;
  const pending = pendingScheduleMeeting && typeof pendingScheduleMeeting === 'object'
    ? pendingScheduleMeeting
    : null;
  if (!pending?.args) return null;

  const rawMessage = normalizeWhitespace(message);
  if (!rawMessage || SCHEDULE_CANCEL_PATTERN.test(rawMessage)) return null;

  if (pending.type === 'schedule_meeting_missing_contact_email' || pending.type === 'schedule_meeting_missing_contact_details') {
    const contactDetails = extractPendingContactDetailsFromMessage(rawMessage);
    if (pending.type === 'schedule_meeting_missing_contact_email' && !contactDetails.contact_email) return null;
    if (pending.type === 'schedule_meeting_missing_contact_details' && Object.keys(contactDetails).length === 0) return null;

    const args = {
      ...pending.args,
      ...contactDetails,
    };
    if (pending.contact_id) args.contact_id = pending.contact_id;
    if (pending.contact_name && !args.contact_name) args.contact_name = pending.contact_name;
    if (pending.contact_email && !args.contact_email) args.contact_email = pending.contact_email;

    return {
      provider: 'deterministic',
      model: pending.type === 'schedule_meeting_missing_contact_details'
        ? 'deterministic-pending-schedule-contact-details'
        : 'deterministic-pending-schedule-contact-email',
      toolCalls: [{
        id: pending.type === 'schedule_meeting_missing_contact_details'
          ? 'deterministic_pending_schedule_contact_details_0'
          : 'deterministic_pending_schedule_contact_email_0',
        type: 'function',
        function: {
          name: 'schedule_meeting',
          arguments: JSON.stringify(args),
        },
      }],
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    };
  }

  if (pending.type !== 'schedule_meeting_confirmation') return null;
  if (!SCHEDULE_CONFIRMATION_PATTERN.test(rawMessage) && !/\bslot\s+\d+\b/i.test(rawMessage)) return null;

  const args = {
    ...pending.args,
    confirmed: true,
  };
  const slotIndex = Number(rawMessage.match(/\bslot\s+(\d+)\b/i)?.[1] || 0);
  const slot = slotIndex > 0 && Array.isArray(pending.preview?.available_slots)
    ? pending.preview.available_slots[slotIndex - 1]
    : null;
  if (slot?.start) args.selected_start_iso = slot.start;

  return {
    provider: 'deterministic',
    model: 'deterministic-pending-schedule-meeting',
    toolCalls: [{
      id: 'deterministic_pending_schedule_meeting_0',
      type: 'function',
      function: {
        name: 'schedule_meeting',
        arguments: JSON.stringify(args),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicCreateContactPlan(message, intent, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('create_contact')) return null;

  const args = extractCreateContactArgsFromMessage(message);
  if (!args) return null;

  const normalizedIntent = intent || {};
  const explicitIntent = String(normalizedIntent.intent || '').toLowerCase();
  const domains = new Set((normalizedIntent.domains || []).map((domain) => String(domain || '').toLowerCase()));
  const clearlyConflictingIntent = explicitIntent
    && explicitIntent !== 'crm_mutation'
    && !domains.has('create');
  if (clearlyConflictingIntent) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-create-contact',
    toolCalls: [{
      id: 'deterministic_create_contact_0',
      type: 'function',
      function: {
        name: 'create_contact',
        arguments: JSON.stringify(args),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicDeleteDealPlan(message, intent, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('delete_deal')) return null;

  const args = extractDeleteDealArgsFromMessage(message);
  if (!args) return null;

  const normalizedIntent = intent || {};
  const explicitIntent = String(normalizedIntent.intent || '').toLowerCase();
  const domains = new Set((normalizedIntent.domains || []).map((domain) => String(domain || '').toLowerCase()));
  const clearlyConflictingIntent = explicitIntent
    && explicitIntent !== 'crm_mutation'
    && !domains.has('update');
  if (clearlyConflictingIntent) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-delete-deal',
    toolCalls: [{
      id: 'deterministic_delete_deal_0',
      type: 'function',
      function: {
        name: 'delete_deal',
        arguments: JSON.stringify(args),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function inferPendingDeleteDealFromHistory(conversationHistory = []) {
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const assistantMessage = history[i];
    if (assistantMessage?.role !== 'assistant') continue;

    const assistantContent = normalizeWhitespace(assistantMessage?.content || '');
    if (!PENDING_DELETE_ASSISTANT_PATTERN.test(assistantContent)) continue;

    const markdownName = assistantContent.match(/\*\*([^*]+)\*\*/)?.[1];
    const plainName = assistantContent.match(/\bpermanently delete\s+(.+?)\.\s+reply/i)?.[1];
    const dealName = sanitizeGenericEntityName(markdownName || plainName || '');
    if (!dealName) continue;
    return { deal_name: dealName };
  }

  return null;
}

export function buildDeterministicPendingDeleteDealPlan(message, conversationHistory, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('delete_deal')) return null;
  if (!DELETE_CONFIRMATION_PATTERN.test(normalizeWhitespace(message))) return null;

  const pending = inferPendingDeleteDealFromHistory(conversationHistory);
  if (!pending?.deal_name) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-pending-delete-deal',
    toolCalls: [{
      id: 'deterministic_pending_delete_deal_0',
      type: 'function',
      function: {
        name: 'delete_deal',
        arguments: JSON.stringify({ ...pending, confirmed: true }),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function inferPendingDealDataFromHistory(conversationHistory = []) {
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const assistantMessage = history[i];
    if (assistantMessage?.role !== 'assistant') continue;

    const assistantContent = normalizeWhitespace(assistantMessage?.content || '');
    if (!PENDING_DEAL_ASSISTANT_PATTERN.test(assistantContent) || !PENDING_DEAL_FIELDS_PATTERN.test(assistantContent)) {
      continue;
    }

    for (let j = i - 1; j >= 0; j -= 1) {
      const userMessage = history[j];
      if (userMessage?.role !== 'user') continue;

      const pendingArgs = extractCreateDealArgsFromMessage(userMessage?.content || '');
      if (!pendingArgs?.account_name) continue;

      return {
        account_name: pendingArgs.account_name,
        amount: pendingArgs.amount,
        close_date: pendingArgs.close_date || null,
        contact_name: pendingArgs.contact_name || null,
        contact_email: pendingArgs.contact_email || null,
      };
    }
  }

  return null;
}

export function buildDeterministicPendingDealPlan(message, pendingDealData, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('create_deal')) return null;

  const pending = Array.isArray(pendingDealData) ? pendingDealData[0] : pendingDealData;
  if (!pending || typeof pending !== 'object' || !pending.account_name) return null;

  const {
    closeDateMissing,
    contactNameMissing,
    contactEmailMissing,
    refreshContactDetails,
  } = extractMissingPendingFields(pendingDealData);
  const extractedCloseDate = closeDateMissing ? extractCloseDateFromMessage(message) : null;
  const shouldExtractContactDetails = contactNameMissing || contactEmailMissing || refreshContactDetails;
  const extractedContactName = shouldExtractContactDetails
    ? extractContactNameFromMessage(message, { allowImplicit: true })
    : null;
  const extractedContactEmail = shouldExtractContactDetails
    ? extractContactEmailFromMessage(message)
    : null;
  const mergedArgs = {
    account_name: pending.account_name,
    amount: pending.amount,
    name: pending.name,
    stage: pending.stage,
    probability: pending.probability,
    close_date: extractedCloseDate || pending.close_date,
    contact_name: extractedContactName || pending.contact_name,
    contact_email: extractedContactEmail || pending.contact_email,
  };

  const changed =
    (extractedCloseDate && extractedCloseDate !== pending.close_date)
    || (extractedContactName && extractedContactName !== pending.contact_name)
    || (extractedContactEmail && extractedContactEmail !== pending.contact_email);
  if (!changed) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-pending-create-deal',
    toolCalls: [{
      id: 'deterministic_pending_create_deal_0',
      type: 'function',
      function: {
        name: 'create_deal',
        arguments: JSON.stringify(
          Object.fromEntries(
            Object.entries(mergedArgs).filter(([, value]) => value !== undefined && value !== null && value !== '')
          )
        ),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicPendingDealPlanFromHistory(message, conversationHistory, allowedToolNames = new Set()) {
  const inferredPending = inferPendingDealDataFromHistory(conversationHistory);
  if (!inferredPending) return null;
  return buildDeterministicPendingDealPlan(message, inferredPending, allowedToolNames);
}

export function inferPendingDraftEmailFromHistory(conversationHistory = []) {
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const assistantMessage = history[i];
    if (assistantMessage?.role !== 'assistant') continue;

    const assistantContent = normalizeWhitespace(assistantMessage?.content || '');
    if (!PENDING_DRAFT_EMAIL_ASSISTANT_PATTERN.test(assistantContent)) continue;

    const toolDealName = assistantContent.match(/\bfor\s+(.+?),\s+but i need a recipient email/i)?.[1];

    for (let j = i - 1; j >= 0; j -= 1) {
      const userMessage = history[j];
      if (userMessage?.role !== 'user') continue;

      const draftArgs = extractDraftEmailArgsFromMessage(userMessage?.content || '');
      if (!draftArgs) continue;

      return {
        ...draftArgs,
        deal_name: draftArgs.deal_name || sanitizeGenericEntityName(toolDealName || ''),
      };
    }

    if (toolDealName) {
      return {
        email_type: 'follow_up',
        deal_name: sanitizeGenericEntityName(toolDealName),
      };
    }
  }

  return null;
}

export function buildDeterministicPendingDraftEmailPlan(message, conversationHistory, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('draft_email')) return null;

  const pending = inferPendingDraftEmailFromHistory(conversationHistory);
  if (!pending?.deal_name && !pending?.account_name) return null;

  const recipientEmail = extractContactEmailFromMessage(message);
  const recipientName = extractDraftRecipientNameFromMessage(message);
  if (!recipientEmail && !recipientName) return null;

  const followUpContext = extractDraftContextFromMessage(message);
  const context = [pending.context, followUpContext]
    .filter(Boolean)
    .map((value) => String(value).trim())
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .join('; ');

  const args = Object.fromEntries(
    Object.entries({
      deal_name: pending.deal_name,
      account_name: pending.account_name,
      email_type: pending.email_type || 'follow_up',
      context: context || undefined,
      recipient_name: recipientName || undefined,
      recipient_email: recipientEmail || undefined,
    }).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );

  return {
    provider: 'deterministic',
    model: 'deterministic-pending-draft-email',
    toolCalls: [{
      id: 'deterministic_pending_draft_email_0',
      type: 'function',
      function: {
        name: 'draft_email',
        arguments: JSON.stringify(args),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function inferPendingAccountRenameFromHistory(conversationHistory = []) {
  const history = Array.isArray(conversationHistory) ? conversationHistory : [];

  for (let i = history.length - 1; i >= 0; i -= 1) {
    const assistantMessage = history[i];
    if (assistantMessage?.role !== 'assistant') continue;

    const assistantContent = normalizeWhitespace(assistantMessage?.content || '');
    if (!UPDATE_ACCOUNT_NOT_FOUND_PATTERN.test(assistantContent)) continue;

    for (let j = i - 1; j >= 0; j -= 1) {
      const userMessage = history[j];
      if (userMessage?.role !== 'user') continue;

      const renameArgs = extractUpdateAccountRenameArgsFromMessage(userMessage?.content || '');
      if (!renameArgs?.updates?.name) continue;

      return {
        pending_account_name: renameArgs.account_name,
        target_name: renameArgs.updates.name,
      };
    }
  }

  return null;
}

export function buildDeterministicPendingUpdateAccountRenamePlan(message, conversationHistory, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('update_account')) return null;

  const inferredPending = inferPendingAccountRenameFromHistory(conversationHistory);
  if (!inferredPending?.target_name) return null;

  const followupAccountName = extractAccountIdentifierFromFollowUpMessage(message);
  const resolvedAccountName = followupAccountName || inferredPending.pending_account_name;
  if (!resolvedAccountName) return null;
  if (resolvedAccountName.toLowerCase() === String(inferredPending.target_name).toLowerCase()) return null;

  return {
    provider: 'deterministic',
    model: 'deterministic-pending-update-account-rename',
    toolCalls: [{
      id: 'deterministic_pending_update_account_rename_0',
      type: 'function',
      function: {
        name: 'update_account',
        arguments: JSON.stringify({
          account_name: resolvedAccountName,
          updates: { name: inferredPending.target_name },
        }),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}

export function buildDeterministicPendingSequencePlan(message, pendingSequenceAction, allowedToolNames = new Set()) {
  const toolNames = allowedToolNames instanceof Set ? allowedToolNames : new Set(allowedToolNames || []);
  if (!toolNames.has('manage_sequence')) return null;

  const pending = pendingSequenceAction && typeof pendingSequenceAction === 'object'
    ? pendingSequenceAction
    : null;
  if (!pending?.action) return null;

  const confirmationType = String(pending.confirmation_type || '').toLowerCase();
  const extractedContactName = confirmationType === 'contact_resolution'
    ? extractContactNameFromMessage(message, { allowImplicit: true })
    : null;
  const extractedContactEmail = confirmationType === 'contact_resolution'
    ? extractContactEmailFromMessage(message)
    : null;
  const extractedSequenceName = confirmationType === 'sequence_resolution'
    ? extractSequenceNameFromMessage(message, { allowImplicit: true })
    : null;

  const changed =
    (extractedContactName && extractedContactName !== pending.contact_name)
    || (extractedContactEmail && extractedContactEmail !== pending.contact_email)
    || (extractedSequenceName && extractedSequenceName !== pending.sequence_name);

  if (!changed) return null;

  const mergedArgs = Object.fromEntries(
    Object.entries({
      action: pending.action,
      sequence_id: pending.sequence_id || undefined,
      sequence_name: extractedSequenceName || pending.sequence_name || undefined,
      contact_name: extractedContactName || pending.contact_name || undefined,
      contact_email: extractedContactEmail || pending.contact_email || undefined,
    }).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );

  return {
    provider: 'deterministic',
    model: 'deterministic-pending-manage-sequence',
    toolCalls: [{
      id: 'deterministic_pending_manage_sequence_0',
      type: 'function',
      function: {
        name: 'manage_sequence',
        arguments: JSON.stringify(mergedArgs),
      },
    }],
    usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
  };
}
