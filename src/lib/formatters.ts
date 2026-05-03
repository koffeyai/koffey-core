/**
 * Shared formatting utilities for consistent display across the CRM
 */

/**
 * Formats a currency value with proper locale handling
 * Handles European format (50.000) and US format (50,000)
 */
export function formatCurrency(
  amount: number | string | null | undefined,
  currency: string | null = 'USD'
): string {
  if (amount === null || amount === undefined) return '-';

  let numericAmount: number;
  
  if (typeof amount === 'string') {
    // Remove any non-numeric chars except . and ,
    const cleaned = amount.replace(/[^\d.,]/g, '');
    
    // Detect European format: "50.000" or "50.000,00" (dot as thousands separator)
    if (/^\d{1,3}(\.\d{3})+([,]\d+)?$/.test(cleaned)) {
      numericAmount = parseFloat(cleaned.replace(/\./g, '').replace(',', '.'));
    } else {
      // US format or simple number
      numericAmount = parseFloat(cleaned.replace(/,/g, ''));
    }
  } else {
    numericAmount = amount;
  }

  if (isNaN(numericAmount)) return '-';

  try {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numericAmount);
  } catch {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(numericAmount);
  }
}

/**
 * Formats a date string for display
 */
export function parseDateOnlyAsLocalDate(dateString: string | null | undefined): Date | null {
  if (!dateString) return null;

  const match = dateString.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const parsed = match
    ? new Date(parseInt(match[1], 10), parseInt(match[2], 10) - 1, parseInt(match[3], 10))
    : new Date(dateString);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatDate(
  dateString: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateString) return '-';
  const parsed = parseDateOnlyAsLocalDate(dateString);
  if (!parsed) return '-';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  };

  return parsed.toLocaleDateString('en-US', options || defaultOptions);
}

/**
 * Formats a percentage value
 */
export function formatPercentage(
  value: number | null | undefined,
  decimals: number = 0
): string {
  if (value === null || value === undefined) return '-';
  return `${value.toFixed(decimals)}%`;
}
