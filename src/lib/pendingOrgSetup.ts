const PENDING_ORG_SETUP_KEY = 'koffey_pending_org_setup';

export interface PendingOrgSetup {
  orgName: string;
  domain?: string;
}

export function savePendingOrgSetup(data: PendingOrgSetup): void {
  if (typeof window === 'undefined') return;

  localStorage.setItem(PENDING_ORG_SETUP_KEY, JSON.stringify(data));
}

export function loadPendingOrgSetup(): PendingOrgSetup | null {
  if (typeof window === 'undefined') return null;

  const raw = localStorage.getItem(PENDING_ORG_SETUP_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as PendingOrgSetup;
    if (!parsed?.orgName) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingOrgSetup(): void {
  if (typeof window === 'undefined') return;

  localStorage.removeItem(PENDING_ORG_SETUP_KEY);
}
