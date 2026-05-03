/**
 * Unified Chat request intelligence utilities.
 * Pure helpers used by unified-chat and contract tests.
 */

export function estimateTokens(text) {
  return Math.ceil((text || "").length / 4);
}

const MONTH_NAMES = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];
const MONTH_PATTERN = MONTH_NAMES.join("|");

export function trimHistory(history, maxMessages = 10, tokenBudget = 1400) {
  const latest = history.slice(-Math.max(maxMessages * 2, maxMessages));
  const selected = [];
  let used = 0;

  for (let i = latest.length - 1; i >= 0; i--) {
    const msg = latest[i];
    const t = estimateTokens(msg.content || "");
    if (selected.length >= maxMessages) break;
    if (selected.length > 0 && used + t > tokenBudget) break;
    selected.push(msg);
    used += t;
  }
  return selected.reverse();
}

export function normalizeStage(stage) {
  return (stage || "unknown").toLowerCase().replace(/[\s_]/g, "-");
}

export function isClosed(stage) {
  const s = normalizeStage(stage);
  return s === "closed-won" || s === "closed-lost" || s === "won" || s === "lost";
}

export function parseQuarterRequest(message, now) {
  const lower = (message || "").toLowerCase();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1;
  const currentYear = now.getFullYear();

  if (/\b(this|current)\s+(quarter|qtr)\b/.test(lower)) {
    return { quarter: currentQuarter, year: currentYear, explicitYear: false };
  }

  let q = null;
  const qMatch = lower.match(/\bq([1-4])\b/) || lower.match(/\b([1-4])q\b/) || lower.match(/\bquarter\s*([1-4])\b/);
  if (qMatch) q = Number(qMatch[1]);

  if (!q) {
    if (/\b(first|1st)\s+quarter\b/.test(lower)) q = 1;
    else if (/\b(second|2nd)\s+quarter\b/.test(lower)) q = 2;
    else if (/\b(third|3rd)\s+quarter\b/.test(lower)) q = 3;
    else if (/\b(fourth|4th)\s+quarter\b/.test(lower)) q = 4;
  }

  if (!q) return null;

  const yMatch = lower.match(/\b(20\d{2})\b/);
  const year = yMatch ? Number(yMatch[1]) : currentYear;
  return { quarter: q, year, explicitYear: !!yMatch };
}

export function parsePeriodBounds(message, now) {
  const lower = (message || "").toLowerCase();
  const currentYear = now.getFullYear();

  const quarter = parseQuarterRequest(message, now);
  if (quarter) {
    const qStartMonth = (quarter.quarter - 1) * 3;
    // Use UTC boundaries to avoid timezone-dependent date drift in quarter calculations.
    const start = new Date(Date.UTC(quarter.year, qStartMonth, 1));
    const end = new Date(Date.UTC(quarter.year, qStartMonth + 3, 0));
    return {
      start,
      end,
      label: `Q${quarter.quarter} ${quarter.year}`,
      assumption: quarter.explicitYear ? undefined : "Assumption: using current calendar year.",
    };
  }

  const thisWeek = /\b(this|current)\s+week\b/.test(lower);
  if (thisWeek) {
    const utcDay = now.getUTCDay();
    const mondayOffset = (utcDay + 6) % 7;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - mondayOffset));
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
    return {
      start,
      end,
      label: "This Week",
      assumption: undefined,
    };
  }

  const thisMonth = /\b(this|current)\s+month\b/.test(lower);
  if (thisMonth) {
    const month = now.getUTCMonth();
    const year = now.getUTCFullYear();
    const start = new Date(Date.UTC(year, month, 1));
    const end = new Date(Date.UTC(year, month + 1, 0));
    const label = `${MONTH_NAMES[month][0].toUpperCase()}${MONTH_NAMES[month].slice(1)} ${year}`;
    return {
      start,
      end,
      label,
      assumption: undefined,
    };
  }

  const monthMatch = lower.match(new RegExp(`\\b(${MONTH_PATTERN})\\b(?:\\s+(20\\d{2}))?`));
  if (monthMatch) {
    const monthName = monthMatch[1];
    const month = MONTH_NAMES.indexOf(monthName);
    if (month >= 0) {
      const explicitYear = !!monthMatch[2];
      const year = explicitYear ? Number(monthMatch[2]) : currentYear;
      const start = new Date(Date.UTC(year, month, 1));
      const end = new Date(Date.UTC(year, month + 1, 0));
      const label = `${monthName[0].toUpperCase()}${monthName.slice(1)} ${year}`;
      return {
        start,
        end,
        label,
        assumption: explicitYear ? undefined : "Assumption: using current calendar year.",
      };
    }
  }

  return null;
}

function parseDateOnlyAsUtc(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateStr))) return null;
  return new Date(`${String(dateStr)}T00:00:00.000Z`);
}

export function buildDirectPipelineSummaryFromDeals(deals, message) {
  const now = new Date();
  const lower = message.toLowerCase();
  const period = parsePeriodBounds(message, now);
  const asksCloseTiming = /\b(slated|close|closes|closing|closable|forecast|booked|book|landing|due|coming up|upcoming)\b/.test(lower);
  const wantsMissingCloseDates = /\bmissing close dates?\b|\bwithout close dates?\b|\bno close dates?\b/.test(lower);
  const baseOpenDeals = (deals || []).filter((d) => !isClosed(d.stage));
  const missingCloseDates = baseOpenDeals.filter((d) => !d.expected_close_date);

  let scoped = baseOpenDeals;
  if (period) {
    scoped = baseOpenDeals.filter((d) => {
      if (!d.expected_close_date) return false;
      const close = parseDateOnlyAsUtc(d.expected_close_date);
      if (!close) return false;
      return close >= period.start && close <= period.end;
    });
  } else if (asksCloseTiming) {
    scoped = baseOpenDeals.filter((d) => !!d.expected_close_date);
  }

  const periodLabel = period?.label || "Current Pipeline";
  const title = (period || asksCloseTiming) ? `Deals Slated To Close (${periodLabel})` : `Pipeline Summary (${periodLabel})`;

  const totalValue = scoped.reduce((sum, d) => sum + (d.amount || 0), 0);
  const weightedValue = scoped.reduce((sum, d) => sum + ((d.amount || 0) * (d.probability || 0) / 100), 0);
  const stale = scoped.filter((d) => {
    const updated = new Date(d.updated_at || d.created_at || 0);
    return (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24) > 7;
  }).length;

  const stageMap = new Map();
  for (const d of scoped) {
    const stage = d.stage || "unknown";
    const prev = stageMap.get(stage) || { count: 0, value: 0 };
    prev.count += 1;
    prev.value += d.amount || 0;
    stageMap.set(stage, prev);
  }

  const ranked = [...scoped].sort((a, b) => {
    if (a.expected_close_date && b.expected_close_date) {
      const ad = parseDateOnlyAsUtc(a.expected_close_date)?.getTime() || 0;
      const bd = parseDateOnlyAsUtc(b.expected_close_date)?.getTime() || 0;
      if (ad !== bd) return ad - bd;
    } else if (a.expected_close_date && !b.expected_close_date) {
      return -1;
    } else if (!a.expected_close_date && b.expected_close_date) {
      return 1;
    }
    const p = (b.probability || 0) - (a.probability || 0);
    if (p !== 0) return p;
    return (b.amount || 0) - (a.amount || 0);
  });

  let response = `### ${title}\n`;
  if (period?.assumption) response += `${period.assumption}\n\n`;
  else response += `\n`;

  response += `Total Deals: ${scoped.length}\n`;
  response += `Total Value: $${Math.round(totalValue).toLocaleString()}\n`;
  response += `Weighted Value: $${Math.round(weightedValue).toLocaleString()}\n`;
  response += `Stale Deals (7+ days): ${stale}\n\n`;

  const stageLines = [...stageMap.entries()].sort((a, b) => b[1].value - a[1].value).slice(0, 8);
  if (stageLines.length > 0) {
    response += `By stage:\n`;
    for (const [stage, info] of stageLines) {
      response += `- ${stage}: ${info.count} deals ($${Math.round(info.value).toLocaleString()})\n`;
    }
    response += `\n`;
  }

  const top = ranked.slice(0, period || asksCloseTiming ? 10 : 5);
  const displayedTop = top.slice(0, period || asksCloseTiming ? 8 : 3);
  const includeMissingCloseDates = wantsMissingCloseDates || (!period && !asksCloseTiming);
  const displayedMissingCloseDates = includeMissingCloseDates ? missingCloseDates.slice(0, 6) : [];
  if (top.length > 0) {
    response += `Top deals:\n`;
    displayedTop.forEach((d, i) => {
      response += `${i + 1}. ${d.name || "Untitled"} — $${Math.round(d.amount || 0).toLocaleString()} — ${d.probability || 0}% — Close: ${d.expected_close_date || "TBD"}\n`;
    });
  } else {
    response += `No open deals found for this scope.\n`;
  }

  if (includeMissingCloseDates && missingCloseDates.length > 0) {
    response += `\nDeals missing close dates (${missingCloseDates.length}):\n`;
    displayedMissingCloseDates.forEach((d) => {
      response += `- ${d.name || "Untitled"}\n`;
    });
  }

  const citationDealIds = Array.from(new Set(
    [...displayedTop, ...displayedMissingCloseDates]
      .map((d) => d?.id ? String(d.id) : null)
      .filter(Boolean)
  ));

  return {
    response,
    dealLinks: top
      .filter((d) => d.id && d.name)
      .map((d) => ({ id: d.id, name: d.name, stage: d.stage || null, amount: d.amount || null })),
    citationDealIds,
    scopedCount: scoped.length,
  };
}

function formatMoney(value) {
  return `$${Math.round(Number(value) || 0).toLocaleString()}`;
}

function displayStageLabel(stage) {
  const normalized = normalizeStage(stage);
  const labels = {
    prospecting: 'Prospecting',
    qualification: 'Qualified',
    qualified: 'Qualified',
    proposal: 'Proposal',
    negotiation: 'Negotiation',
    'closed-won': 'Closed Won',
    won: 'Closed Won',
    'closed-lost': 'Closed Lost',
    lost: 'Closed Lost',
    unknown: 'Unknown',
  };
  if (labels[normalized]) return labels[normalized];
  return String(stage || 'Unknown')
    .replace(/[_-]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isWon(stage) {
  const normalized = normalizeStage(stage);
  return normalized === 'closed-won' || normalized === 'won';
}

export function buildAnalyticsDashboardSummaryFromDeals(deals, message = '') {
  const allDeals = Array.isArray(deals) ? deals : [];
  const openDeals = allDeals.filter((deal) => !isClosed(deal.stage));
  const closedDeals = allDeals.filter((deal) => isClosed(deal.stage));
  const wonDeals = allDeals.filter((deal) => isWon(deal.stage));

  const totalDeals = allDeals.length;
  const pipelineValue = openDeals.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0);
  const totalValue = allDeals.reduce((sum, deal) => sum + (Number(deal.amount) || 0), 0);
  const avgDealSize = totalDeals > 0 ? totalValue / totalDeals : 0;
  const winRate = closedDeals.length > 0 ? (wonDeals.length / closedDeals.length) * 100 : 0;

  const stageMap = new Map();
  for (const deal of allDeals) {
    const stage = displayStageLabel(deal.stage);
    const previous = stageMap.get(stage) || { count: 0, value: 0 };
    previous.count += 1;
    previous.value += Number(deal.amount) || 0;
    stageMap.set(stage, previous);
  }
  const stageRows = [...stageMap.entries()]
    .map(([stage, data]) => ({ stage, ...data }))
    .sort((a, b) => b.value - a.value || b.count - a.count);

  const staleOpenDeals = openDeals.filter((deal) => {
    const updated = new Date(deal.updated_at || deal.created_at || 0);
    if (Number.isNaN(updated.getTime())) return false;
    return (Date.now() - updated.getTime()) / (1000 * 60 * 60 * 24) > 14;
  });

  const topOpenDeals = [...openDeals]
    .sort((a, b) => (Number(b.amount) || 0) - (Number(a.amount) || 0))
    .slice(0, 3);

  const dominantStage = stageRows[0];
  const noRevenue = wonDeals.length === 0;
  const attentionItems = [];
  if (dominantStage) {
    attentionItems.push(`Stage concentration: ${dominantStage.stage} holds ${dominantStage.count} deal${dominantStage.count === 1 ? '' : 's'} worth ${formatMoney(dominantStage.value)}.`);
  }
  if (noRevenue) {
    attentionItems.push('Revenue gap: there are no closed-won deals in the visible data, so the dashboard has pipeline but no realized revenue signal yet.');
  }
  if (staleOpenDeals.length > 0) {
    attentionItems.push(`Execution risk: ${staleOpenDeals.length} open deal${staleOpenDeals.length === 1 ? '' : 's'} have not been updated in 14+ days.`);
  }
  if (attentionItems.length === 0) {
    attentionItems.push('No obvious dashboard hygiene issue is visible from the current deal data.');
  }

  const response = [
    '### Sales Analytics Review',
    '',
    `Total deals: ${totalDeals}`,
    `Active pipeline value: ${formatMoney(pipelineValue)}`,
    `Win rate: ${winRate.toFixed(1)}%`,
    `Average deal size: ${formatMoney(avgDealSize)}`,
    '',
    'By stage:',
    ...(stageRows.length > 0
      ? stageRows.slice(0, 8).map((row) => `- ${row.stage}: ${row.count} deal${row.count === 1 ? '' : 's'} (${formatMoney(row.value)})`)
      : ['- No deal stage data available.']),
    '',
    'What to pay attention to:',
    ...attentionItems.map((item) => `- ${item}`),
    '',
    'Manager next question:',
    '- Which open deal has the weakest committed next step, and should I draft the follow-up or create a task for it now?',
    ...(topOpenDeals.length > 0
      ? [
        '',
        'Largest open deals to inspect first:',
        ...topOpenDeals.map((deal, index) => `${index + 1}. ${deal.name || 'Untitled'} — ${formatMoney(deal.amount || 0)} — ${displayStageLabel(deal.stage)} — close: ${deal.expected_close_date || 'TBD'}`),
      ]
      : []),
  ].join('\n');

  return {
    response,
    metrics: {
      totalDeals,
      pipelineValue,
      winRate,
      avgDealSize,
      staleOpenDeals: staleOpenDeals.length,
    },
    citationRows: allDeals.slice(0, 20),
  };
}

export function isDirectPipelineSummaryRequest(message) {
  const lower = (message || "").toLowerCase().trim();
  if (!lower) return false;

  // "show all deals", "list all my deals", "every deal" → listing, not pipeline summary
  const isExhaustiveListRequest = /\b(all\s+(my\s+)?deals|every\s+(single\s+)?deal|list\s+all|show\s+all)\b/.test(lower);
  if (isExhaustiveListRequest) return false;

  const explicitPipeline = /\b(pipeline|pipeline summary|pipeline stats?|forecast|weighted value|stale deals?|top\s+(\d+\s+)?deals?|deals? missing close dates?|what'?s on my plate|biggest deals?|largest deals?|highest value deals?)\b/.test(lower);
  if (explicitPipeline) return true;

  const asksCloseTiming = /\b(slated|close|closes|closing|closable|forecast|booked|book|landing|due|coming up|upcoming)\b/.test(lower);
  const hasPeriodCue = /\b(this\s+quarter|this\s+qtr|this\s+month|this\s+week|q[1-4]|quarter|qtr|eoq)\b/.test(lower)
    || new RegExp(`\\b(${MONTH_PATTERN})\\b`).test(lower);
  const hasPluralDealScope = /\b(deals|opportunities)\b/.test(lower);
  const implicitDealScope = /\bwhat('s| is)?\s+(?:is\s+)?(closing|closable|close|closes|slated|due|booked)\b/.test(lower)
    || /\b(big ones|on my plate|coming up|landing soon)\b/.test(lower);
  const aggregateAsk = /\b(show|list|summari[sz]e|breakdown|overview|stats?|what'?s|what is|how many|what)\b/.test(lower);

  if (asksCloseTiming && hasPeriodCue && (hasPluralDealScope || implicitDealScope) && aggregateAsk) return true;
  if (/\bwhat'?s on my plate\b/.test(lower)) return true;
  if (/\b(big ones|landing soon|coming up)\b/.test(lower) && /\b(deal|deals|pipeline|opportunit)\b/.test(lower)) return true;

  return false;
}

export function isPipelineFollowUpRequest(message, historyText) {
  const lower = (message || "").toLowerCase().trim();
  const history = (historyText || "").toLowerCase();
  if (!lower || !history) return false;

  const followUpCue = /\b(what about|how about|same for|and also|for this quarter|for this qtr|for this month|for this week|this quarter|this qtr|this month|this week|q[1-4])\b/.test(lower)
    || new RegExp(`\\b(what about|how about|for)\\s+(${MONTH_PATTERN})(\\s+20\\d{2})?\\b`).test(lower);
  if (!followUpCue) return false;

  const historyHasPipelineContext = /\b(pipeline|top deals?|stale deals?|slated to close|close dates?|forecast|weighted value)\b/.test(history);
  return historyHasPipelineContext;
}

export function isLikelyFollowUpMessage(message) {
  const lower = (message || "").toLowerCase().trim();
  if (!lower) return false;
  const shortFollowup = lower.length <= 80;
  return shortFollowup && (
    /^(and|also|plus|then|what about|how about|same|that|this|it|those|these)\b/.test(lower) ||
    /^(this deal|that deal|this contact|that contact|this account|that account|this one|that one)\b/.test(lower) ||
    /\b(what about|how about|same for|and also|for this quarter|for this month|for this week)\b/.test(lower)
  );
}

export function isCompoundRequest(message) {
  const lower = (message || "").toLowerCase();
  if (!lower) return false;
  const multiQuestion = (lower.match(/\?/g) || []).length >= 2;
  const multiClause = /\b(and|also|plus|then|along with|as well as|while|after that)\b/.test(lower);
  return multiQuestion || multiClause;
}

export function getLastUserMessage(history) {
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h?.role === "user" && h?.content?.trim()) return h.content.trim();
  }
  return null;
}

export function truncateForContext(input, maxLen = 220) {
  if (input.length <= maxLen) return input;
  return `${input.slice(0, maxLen)}...`;
}

export function augmentFollowUpMessage(message, history) {
  if (!isLikelyFollowUpMessage(message)) return message;
  const previousUser = getLastUserMessage(history);
  if (!previousUser) return message;
  return `Follow-up context from prior user request: "${truncateForContext(previousUser)}"\nCurrent request: "${message}"\nUse the prior context and answer the current request directly.`;
}

export function isDataOrActionRequest(message, historyText) {
  const lower = (message || "").toLowerCase();
  const dataIntent = /\b(show|list|find|get|top|analy(?:z(?:e|ing)|s(?:e|is|ing))|evaluat(?:e|ion|ing)|update|create|add|compare|summari[sz]e|pipeline|deal|dael|opportunit|contact|account|task|stakeholder|convo|conversation|message|draft|email|follow[\s-]?up|closable|plate)\b/.test(lower);
  const followupData = isLikelyFollowUpMessage(message) && /\b(pipeline|deal|opportunit|contact|account|task|analysis|scoutpad)\b/.test(historyText || "");
  return dataIntent || followupData;
}
