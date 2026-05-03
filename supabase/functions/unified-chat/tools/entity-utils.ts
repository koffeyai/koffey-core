/**
 * Shared entity/date utilities for unified-chat tool executors.
 */

export function stripArticles(name: string): string {
  return (name || '').replace(/^(the|a|an)\s+/i, '').trim();
}

export function cleanEntityDisplayName(displayName: string): string {
  if (!displayName) return '';

  let cleaned = displayName;
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  cleaned = cleaned.replace(/^\d+\.\s*/, '');
  cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '');
  cleaned = cleaned.replace(/[\u2013\u2014\u2015]/g, '-');

  const suffixPattern = /\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|\w{3,9}\s+\d{4}|\$[\d,.]+[KMB]?|prospecting|qualification|proposal|negotiation|closed[_\s]?(won|lost)?|\d+%?).*$/i;
  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(suffixPattern, '');
  }

  return stripArticles(cleaned.trim());
}

export function normalizeDealStage(rawStage: string | null | undefined, fallback = 'prospecting'): string {
  if (!rawStage) return fallback;
  const normalized = rawStage.toLowerCase().trim().replace(/[\s-]/g, '_');

  if (normalized.includes('prospect')) return 'prospecting';
  if (normalized.includes('qualif') || normalized.includes('discovery') || normalized.includes('disco')) return 'qualified';
  if (normalized.includes('proposal')) return 'proposal';
  if (normalized.includes('nego')) return 'negotiation';
  if (normalized.includes('closed_won') || normalized === 'won') return 'closed_won';
  if (normalized.includes('closed_lost') || normalized === 'lost') return 'closed_lost';

  return normalized || fallback;
}

export function isClosedDealStage(stage: string | null | undefined): boolean {
  const normalized = normalizeDealStage(stage, 'unknown');
  return normalized === 'closed_won' || normalized === 'closed_lost';
}

export function parseNaturalDate(dateStr: string | undefined): string | null {
  if (!dateStr) return null;

  const now = new Date();
  const lower = dateStr.toLowerCase().trim();

  if (lower === 'today') return now.toISOString().split('T')[0];
  if (lower === 'tomorrow') {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];
  }
  if (lower === 'next week') {
    const nextWeek = new Date(now);
    nextWeek.setDate(nextWeek.getDate() + 7);
    return nextWeek.toISOString().split('T')[0];
  }

  const inDaysMatch = lower.match(/^in\s+(\d+)\s+days?$/);
  if (inDaysMatch) {
    const days = parseInt(inDaysMatch[1], 10);
    const future = new Date(now);
    future.setDate(future.getDate() + days);
    return future.toISOString().split('T')[0];
  }

  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const nextDayMatch = lower.match(/^next\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (nextDayMatch) {
    const targetDay = dayNames.indexOf(nextDayMatch[1]);
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + daysUntil);
    return targetDate.toISOString().split('T')[0];
  }

  const justDayMatch = lower.match(/^(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
  if (justDayMatch) {
    const targetDay = dayNames.indexOf(justDayMatch[1]);
    const currentDay = now.getDay();
    let daysUntil = targetDay - currentDay;
    if (daysUntil <= 0) daysUntil += 7;
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() + daysUntil);
    return targetDate.toISOString().split('T')[0];
  }

  if (lower === 'end of week' || lower === 'eow') {
    const endOfWeek = new Date(now);
    const daysUntilFriday = (5 - now.getDay() + 7) % 7 || 7;
    endOfWeek.setDate(endOfWeek.getDate() + daysUntilFriday);
    return endOfWeek.toISOString().split('T')[0];
  }

  if (lower === 'end of month' || lower === 'eom') {
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return endOfMonth.toISOString().split('T')[0];
  }

  const quarterMatch = lower.match(/^(?:end\s+of\s+|by\s+)?q([1-4])(?:\s+(\d{4}))?$/);
  if (quarterMatch) {
    const quarter = parseInt(quarterMatch[1], 10);
    const year = quarterMatch[2] ? parseInt(quarterMatch[2], 10) : now.getFullYear();
    const quarterEndMonth = quarter * 3;
    const endOfQuarter = new Date(year, quarterEndMonth, 0);
    if (!quarterMatch[2] && endOfQuarter < now) {
      return new Date(year + 1, quarterEndMonth, 0).toISOString().split('T')[0];
    }
    return endOfQuarter.toISOString().split('T')[0];
  }

  const monthNames = ['january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'];
  const shortMonths = ['jan', 'feb', 'mar', 'apr', 'may', 'jun',
    'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const monthPattern = `(${[...monthNames, ...shortMonths].join('|')})`;

  const monthDayRegex = new RegExp(`^${monthPattern}\\s+(\\d{1,2})(?:st|nd|rd|th)?(?:,?\\s*(\\d{4}))?$`, 'i');
  const monthMatch = lower.match(monthDayRegex);
  if (monthMatch) {
    const monthStr = monthMatch[1].toLowerCase();
    let monthIndex = monthNames.indexOf(monthStr);
    if (monthIndex === -1) monthIndex = shortMonths.indexOf(monthStr);
    const day = parseInt(monthMatch[2], 10);
    const year = monthMatch[3] ? parseInt(monthMatch[3], 10) : now.getFullYear();

    let targetDate = new Date(year, monthIndex, day);
    if (!monthMatch[3] && targetDate < now) {
      targetDate = new Date(year + 1, monthIndex, day);
    }

    return targetDate.toISOString().split('T')[0];
  }

  const monthOnlyRegex = new RegExp(`^(?:end\\s+of\\s+|by\\s+)?${monthPattern}(?:\\s+(\\d{4}))?$`, 'i');
  const monthOnlyMatch = lower.match(monthOnlyRegex);
  if (monthOnlyMatch) {
    const monthStr = monthOnlyMatch[1].toLowerCase();
    let monthIndex = monthNames.indexOf(monthStr);
    if (monthIndex === -1) monthIndex = shortMonths.indexOf(monthStr);

    const year = monthOnlyMatch[2] ? parseInt(monthOnlyMatch[2], 10) : now.getFullYear();
    let targetDate = new Date(year, monthIndex + 1, 0);
    if (!monthOnlyMatch[2] && targetDate < now) {
      targetDate = new Date(year + 1, monthIndex + 1, 0);
    }

    return targetDate.toISOString().split('T')[0];
  }

  const slashMatch = lower.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (slashMatch) {
    const month = parseInt(slashMatch[1], 10) - 1;
    const day = parseInt(slashMatch[2], 10);
    let year = slashMatch[3] ? parseInt(slashMatch[3], 10) : now.getFullYear();
    if (year < 100) year += 2000;

    let targetDate = new Date(year, month, day);
    if (!slashMatch[3] && targetDate < now) {
      targetDate = new Date(year + 1, month, day);
    }

    return targetDate.toISOString().split('T')[0];
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;

  return null;
}

export function formatDateForDisplay(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  if (date.getTime() === today.getTime()) return 'today';
  if (date.getTime() === tomorrow.getTime()) return 'tomorrow';

  return date.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

export async function resolveDealByIdOrName(
  supabase: any,
  organizationId: string,
  options: { dealId?: string | null; dealName?: string | null },
): Promise<{ deal: any | null; multiple?: any[]; error?: string }> {
  if (options.dealId) {
    const { data: byId, error: byIdErr } = await supabase
      .from('deals')
      .select('*, accounts(name)')
      .eq('id', options.dealId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!byIdErr && byId) return { deal: byId };
  }

  if (options.dealName) {
    const cleaned = cleanEntityDisplayName(options.dealName);
    const searchTerm = stripArticles(cleaned);
    // Strip trailing entity words: "Salesforce deal" → "Salesforce"
    const noSuffix = searchTerm.replace(/\s+(?:deal|deals|opportunity|opportunities|account|accounts)$/i, '').trim() || searchTerm;

    const merged: any[] = [];
    const seen = new Set<string>();
    const pushUnique = (rows: any[] | null | undefined) => {
      for (const row of rows || []) {
        if (!row?.id || seen.has(row.id)) continue;
        seen.add(row.id);
        merged.push(row);
      }
    };

    // Build search terms — include stripped variant
    const terms = new Set([cleaned, searchTerm, noSuffix].filter(Boolean));
    const orParts = [...terms].flatMap(t => [`name.ilike.%${t}%`, `description.ilike.%${t}%`]);
    orParts.push(`key_use_case.ilike.%${cleaned}%`);

    const { data: nameMatches, error } = await supabase
      .from('deals')
      .select('*, accounts(name)')
      .eq('organization_id', organizationId)
      .or(orParts.join(','))
      .order('updated_at', { ascending: false })
      .limit(5);
    if (!error) pushUnique(nameMatches);

    // Fallback for "deal with <company>" style lookups by account name.
    if (merged.length === 0) {
      const { data: accountMatches } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .or([...terms].flatMap(t => [`name.ilike.%${t}%`, `domain.ilike.%${t}%`]).concat([`website.ilike.%${cleaned}%`]).join(','))
        .limit(10);
      const accountIds = (accountMatches || []).map((a: any) => a.id).filter(Boolean);

      if (accountIds.length > 0) {
        const { data: accountDeals } = await supabase
          .from('deals')
          .select('*, accounts(name)')
          .eq('organization_id', organizationId)
          .in('account_id', accountIds)
          .order('updated_at', { ascending: false })
          .limit(5);
        pushUnique(accountDeals);
      }
    }

    if (merged.length === 0) {
      const { data: contactMatches } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', organizationId)
        .or(`full_name.ilike.%${cleaned}%,company.ilike.%${cleaned}%,email.ilike.%${cleaned}%`)
        .limit(10);
      const contactIds = (contactMatches || []).map((c: any) => c.id).filter(Boolean);

      if (contactIds.length > 0) {
        const { data: contactDeals } = await supabase
          .from('deals')
          .select('*, accounts(name)')
          .eq('organization_id', organizationId)
          .in('contact_id', contactIds)
          .order('updated_at', { ascending: false })
          .limit(5);
        pushUnique(contactDeals);
      }
    }

    if (merged.length === 0) {
      return { deal: null, error: `I couldn't find a deal matching "${cleaned}".` };
    }
    if (merged.length > 1) return { deal: null, multiple: merged };
    return { deal: merged[0] };
  }

  return { deal: null, error: 'No deal specified.' };
}

export async function resolveAccountByIdOrName(
  supabase: any,
  organizationId: string,
  options: { accountId?: string | null; accountName?: string | null },
): Promise<{ account: any | null; multiple?: any[]; error?: string }> {
  if (options.accountId) {
    const { data: byId, error: byIdErr } = await supabase
      .from('accounts')
      .select('*')
      .eq('id', options.accountId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!byIdErr && byId) return { account: byId };
  }

  if (options.accountName) {
    const cleaned = cleanEntityDisplayName(options.accountName);
    const { data: matches, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('organization_id', organizationId)
      .or(`name.ilike.%${cleaned}%,name.ilike.%${stripArticles(cleaned)}%`)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (error || !matches || matches.length === 0) {
      return { account: null, error: `I couldn't find an account matching "${cleaned}".` };
    }
    if (matches.length > 1) return { account: null, multiple: matches };
    return { account: matches[0] };
  }

  return { account: null, error: 'No account specified.' };
}

export async function resolveContactByIdOrName(
  supabase: any,
  organizationId: string,
  options: { contactId?: string | null; contactName?: string | null; accountId?: string | null },
): Promise<{ contact: any | null; multiple?: any[]; error?: string }> {
  if (options.contactId) {
    const { data: byId, error: byIdErr } = await supabase
      .from('contacts')
      .select('*, accounts(name)')
      .eq('id', options.contactId)
      .eq('organization_id', organizationId)
      .maybeSingle();
    if (!byIdErr && byId) return { contact: byId };
  }

  if (options.contactName) {
    const cleaned = cleanEntityDisplayName(options.contactName);
    let query = supabase
      .from('contacts')
      .select('*, accounts(name)')
      .eq('organization_id', organizationId)
      .or(`full_name.ilike.%${cleaned}%,first_name.ilike.%${cleaned}%,last_name.ilike.%${cleaned}%`)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (options.accountId) {
      query = query.eq('account_id', options.accountId);
    }

    const { data: matches, error } = await query;
    if (error || !matches || matches.length === 0) {
      return { contact: null, error: `I couldn't find a contact matching "${cleaned}".` };
    }
    if (matches.length > 1) return { contact: null, multiple: matches };
    return { contact: matches[0] };
  }

  return { contact: null, error: 'No contact specified.' };
}

export async function resolveOpenDealsForAccount(
  supabase: any,
  organizationId: string,
  accountId: string,
): Promise<any[]> {
  const { data: deals, error } = await supabase
    .from('deals')
    .select('id, name, stage, amount, account_id, accounts(name)')
    .eq('organization_id', organizationId)
    .eq('account_id', accountId)
    .order('updated_at', { ascending: false })
    .limit(20);

  if (error || !deals) return [];
  return deals.filter((d: any) => !isClosedDealStage(d.stage));
}
