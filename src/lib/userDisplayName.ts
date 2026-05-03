import type { User } from '@supabase/supabase-js';

function sanitizeName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.includes('@')) return null;
  return trimmed;
}

function firstToken(name: string): string {
  return name.split(/\s+/).filter(Boolean)[0] || name;
}

function inferNameFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null;
  const local = email.split('@')[0]?.toLowerCase().trim();
  if (!local) return null;

  const firstChunk = local.split(/[._-]+/)[0] || local;
  const hasDigits = /\d/.test(firstChunk);
  let token = firstChunk.split(/\d/)[0] || firstChunk;
  if (hasDigits && token.length >= 6 && /^[a-z]+$/.test(token)) {
    token = token.slice(0, -1);
  }
  token = token.replace(/[^a-z]/g, '');
  if (token.length < 2) return null;

  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function getUserDisplayName(
  user: User | null | undefined,
  profile: any,
  fallback = 'User'
): string {
  const candidates = [
    sanitizeName(profile?.full_name),
    sanitizeName(user?.user_metadata?.full_name),
    sanitizeName(profile?.name),
    sanitizeName(user?.user_metadata?.name),
    sanitizeName(profile?.first_name),
    sanitizeName(user?.user_metadata?.first_name),
  ];

  for (const candidate of candidates) {
    if (candidate) return candidate;
  }

  const inferred = inferNameFromEmail(user?.email);
  if (inferred) return inferred;

  return fallback;
}

export function getUserFirstName(
  user: User | null | undefined,
  profile: any,
  fallback = 'there'
): string {
  return firstToken(getUserDisplayName(user, profile, fallback));
}

export function getUserInitials(
  user: User | null | undefined,
  profile: any
): string {
  const name = getUserDisplayName(user, profile, 'User');
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('')
    .slice(0, 2);
  return initials || 'U';
}
