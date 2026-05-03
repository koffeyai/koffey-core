function pad(value) {
  return String(value).padStart(2, '0');
}

function toUtcDateString(date) {
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function cloneUtcDate(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function addUtcDays(date, days) {
  const out = cloneUtcDate(date);
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function addUtcMonths(date, months) {
  const out = cloneUtcDate(date);
  out.setUTCMonth(out.getUTCMonth() + months);
  return out;
}

function startOfQuarter(year, quarter) {
  return new Date(Date.UTC(year, (quarter - 1) * 3, 1));
}

function endOfQuarter(year, quarter) {
  const start = startOfQuarter(year, quarter);
  start.setUTCMonth(start.getUTCMonth() + 3);
  start.setUTCDate(0);
  return start;
}

function normalizeSeason(rawSeason) {
  const lower = String(rawSeason || '').toLowerCase();
  if (lower === 'autumn') return 'fall';
  return ['spring', 'summer', 'fall', 'winter'].includes(lower) ? lower : null;
}

function seasonWindow(year, season) {
  switch (season) {
    case 'spring':
      return {
        start: new Date(Date.UTC(year, 2, 1)),
        end: new Date(Date.UTC(year, 4, 31)),
      };
    case 'summer':
      return {
        start: new Date(Date.UTC(year, 5, 1)),
        end: new Date(Date.UTC(year, 7, 31)),
      };
    case 'fall':
      return {
        start: new Date(Date.UTC(year, 8, 1)),
        end: new Date(Date.UTC(year, 10, 30)),
      };
    case 'winter':
      return {
        start: new Date(Date.UTC(year, 11, 1)),
        end: new Date(Date.UTC(year + 1, 1, 28)),
      };
    default:
      return null;
  }
}

function startOfMonth(year, month) {
  return new Date(Date.UTC(year, month - 1, 1));
}

function endOfMonth(year, month) {
  return new Date(Date.UTC(year, month, 0));
}

function normalizeAbsoluteMonth(now, month) {
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  const year = month - 1 < now.getUTCMonth() ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return {
    start: toUtcDateString(now),
    end: toUtcDateString(endOfMonth(year, month)),
    resolution: 'month',
  };
}

export function resolveTimeRangeHint(timeRangeHint, options = {}) {
  if (!timeRangeHint || typeof timeRangeHint !== 'object') return null;

  const now = options.now instanceof Date ? cloneUtcDate(options.now) : cloneUtcDate(new Date());
  const kind = String(timeRangeHint.kind || '').trim().toLowerCase();

  if (!kind || kind === 'unspecified') return null;

  if (kind === 'relative_months') {
    const value = Number(timeRangeHint.value || 0);
    if (value <= 0) return null;
    return {
      start: toUtcDateString(now),
      end: toUtcDateString(addUtcMonths(now, value)),
      resolution: 'month',
    };
  }

  if (kind === 'relative_weeks') {
    const value = Number(timeRangeHint.value || 0);
    if (value <= 0) return null;
    return {
      start: toUtcDateString(now),
      end: toUtcDateString(addUtcDays(now, value * 7)),
      resolution: 'week',
    };
  }

  if (kind === 'relative_days') {
    const value = Number(timeRangeHint.value || 0);
    if (value <= 0) return null;
    return {
      start: toUtcDateString(now),
      end: toUtcDateString(addUtcDays(now, value)),
      resolution: 'day',
    };
  }

  if (kind === 'soon') {
    return {
      start: toUtcDateString(now),
      end: toUtcDateString(addUtcDays(now, 30)),
      resolution: 'day',
    };
  }

  if (kind === 'quarter_end') {
    const currentQuarter = Math.floor(now.getUTCMonth() / 3) + 1;
    const quarter = Number(timeRangeHint.quarter || currentQuarter);
    if (![1, 2, 3, 4].includes(quarter)) return null;
    const year = quarter < (Math.floor(now.getUTCMonth() / 3) + 1) ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
    return {
      start: toUtcDateString(now),
      end: toUtcDateString(endOfQuarter(year, quarter)),
      resolution: 'quarter',
    };
  }

  if (kind === 'season') {
    const season = normalizeSeason(timeRangeHint.season || timeRangeHint.value);
    if (!season) return null;
    let window = seasonWindow(now.getUTCFullYear(), season);
    if (!window) return null;
    if (window.end < now) {
      window = seasonWindow(now.getUTCFullYear() + 1, season);
    }
    return {
      start: toUtcDateString(now),
      end: toUtcDateString(window.end),
      resolution: 'season',
    };
  }

  if (kind === 'absolute_month') {
    return normalizeAbsoluteMonth(now, Number(timeRangeHint.month || 0));
  }

  if (kind === 'absolute_range') {
    const start = String(timeRangeHint.start || '').trim();
    const end = String(timeRangeHint.end || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null;
    if (start > end) return null;
    return {
      start,
      end,
      resolution: 'range',
    };
  }

  return null;
}
