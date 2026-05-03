import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = date.getTime() - now.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    // Past time
    const absDiffMinutes = Math.abs(diffMinutes);
    const absDiffHours = Math.abs(diffHours);
    const absDiffDays = Math.abs(diffDays);

    if (absDiffMinutes < 1) return 'just now';
    if (absDiffMinutes < 60) return `${absDiffMinutes}m ago`;
    if (absDiffHours < 24) return `${absDiffHours}h ago`;
    return `${absDiffDays}d ago`;
  } else {
    // Future time
    if (diffMinutes < 1) return 'now';
    if (diffMinutes < 60) return `in ${diffMinutes}m`;
    if (diffHours < 24) return `in ${diffHours}h`;
    return `in ${diffDays}d`;
  }
}
