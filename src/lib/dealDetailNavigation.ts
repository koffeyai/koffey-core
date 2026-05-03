export const PENDING_DEAL_DETAIL_KEY = 'koffey_pending_deal_detail';
export const PENDING_DEAL_MAX_AGE_MS = 30_000;

export type DealDetailTarget = {
  deal?: unknown;
  dealId?: string | null;
  dealName?: string | null;
};

export function cleanDealLookupCandidate(value: string): string {
  return value
    .replace(/["'`“”‘’]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/^[\s:,-]+|[\s:,.!?-]+$/g, '')
    .trim();
}

export function buildDealLookupCandidates(rawValue?: string | null): string[] {
  const raw = cleanDealLookupCandidate(rawValue || '');
  if (!raw) return [];

  const candidates = new Set<string>();
  const add = (value?: string | null) => {
    const cleaned = cleanDealLookupCandidate(value || '');
    if (cleaned.length >= 2 && cleaned.length <= 160) candidates.add(cleaned);
  };

  add(raw);

  const quoted = String(rawValue || '').match(/["'“”‘’]([^"'“”‘’]{2,160})["'“”‘’]/);
  if (quoted?.[1]) add(quoted[1]);

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

export function queueDealDetailOpen(target: DealDetailTarget): boolean {
  if (typeof window === 'undefined') return false;
  if (!target.deal && !target.dealId && !target.dealName) return false;

  sessionStorage.setItem(PENDING_DEAL_DETAIL_KEY, JSON.stringify({
    ts: Date.now(),
    deal: target.deal,
    dealId: target.dealId || null,
    dealName: target.dealName || null,
  }));

  window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: 'deals' } }));
  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('open-opportunity-deal-detail', { detail: target }));
  }, 0);

  return true;
}
