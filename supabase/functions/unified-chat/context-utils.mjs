/**
 * Helpers for threading explicit UI page context into unified-chat.
 * UI-launched actions should override stale conversational context.
 */

function normalizeContextValue(value, maxLen = 120) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .slice(0, maxLen);
}

function normalizePromptString(value, maxLen = 160) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxLen);
}

function normalizeNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSummaryMetrics(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const metricKeys = [
    'totalDeals',
    'pipelineValue',
    'activePipelineValue',
    'winRate',
    'avgDealSize',
    'averageDealSize',
  ];
  const metrics = {};
  for (const key of metricKeys) {
    const parsed = normalizeNumber(value[key]);
    if (parsed !== null) metrics[key] = parsed;
  }
  return Object.keys(metrics).length > 0 ? metrics : null;
}

function normalizeChartRows(rows, allowedKeys, maxRows = 12) {
  if (!Array.isArray(rows)) return [];
  return rows.slice(0, maxRows).map((row) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null;
    const normalized = {};
    for (const key of allowedKeys) {
      if (row[key] === undefined || row[key] === null) continue;
      const value = row[key];
      if (typeof value === 'number' || typeof value === 'boolean') {
        normalized[key] = value;
      } else {
        const text = normalizePromptString(value, 100);
        if (text) normalized[key] = text;
      }
    }
    return Object.keys(normalized).length > 0 ? normalized : null;
  }).filter(Boolean);
}

export function normalizePageContext(pageContext) {
  if (!pageContext || typeof pageContext !== 'object' || Array.isArray(pageContext)) {
    return null;
  }

  const normalized = {};
  const nestedPageContext = pageContext.pageContext && typeof pageContext.pageContext === 'object' && !Array.isArray(pageContext.pageContext)
    ? pageContext.pageContext
    : {};
  const dealId = String(pageContext.dealId || '').trim();
  const dealName = String(pageContext.dealName || '').trim();
  const type = String(pageContext.type || nestedPageContext.type || '').trim().toLowerCase();
  const pageType = String(
    pageContext.pageType
      || pageContext.from
      || pageContext.currentPage
      || nestedPageContext.pageType
      || nestedPageContext.from
      || nestedPageContext.currentPage
      || type
      || ''
  ).trim().toLowerCase();
  const title = normalizePromptString(pageContext.title, 120);
  const slotType = String(pageContext.slotType || '').trim().toLowerCase();

  if (dealId) normalized.dealId = dealId;
  if (dealName) normalized.dealName = dealName;
  if (type) normalized.type = type;
  if (pageType) normalized.pageType = pageType;
  if (title) normalized.title = title;
  if (slotType) normalized.slotType = slotType;

  const summaryMetrics = normalizeSummaryMetrics(pageContext.summaryMetrics);
  if (summaryMetrics) normalized.summaryMetrics = summaryMetrics;

  const charts = pageContext.charts && typeof pageContext.charts === 'object' && !Array.isArray(pageContext.charts)
    ? pageContext.charts
    : {};
  const dealsByStage = normalizeChartRows(charts.dealsByStage || pageContext.dealsByStage, ['stage', 'count', 'value'], 12);
  const monthlyRevenue = normalizeChartRows(charts.monthlyRevenue || pageContext.monthlyRevenue, ['month', 'revenue'], 12);
  if (dealsByStage.length > 0 || monthlyRevenue.length > 0) {
    normalized.charts = {};
    if (dealsByStage.length > 0) normalized.charts.dealsByStage = dealsByStage;
    if (monthlyRevenue.length > 0) normalized.charts.monthlyRevenue = monthlyRevenue;
  }

  if (Array.isArray(pageContext.sourceTables)) {
    const sourceTables = pageContext.sourceTables
      .map((table) => normalizeContextValue(table, 40))
      .filter(Boolean)
      .slice(0, 8);
    if (sourceTables.length > 0) normalized.sourceTables = sourceTables;
  }

  return Object.keys(normalized).length > 0 ? normalized : null;
}

export function serializePageContextForCache(pageContext) {
  const normalized = normalizePageContext(pageContext);
  if (!normalized) return '';

  const parts = [];
  if (normalized.dealId) parts.push(`deal:${normalizeContextValue(normalized.dealId, 80)}`);
  if (normalized.dealName) parts.push(`name:${normalizeContextValue(normalized.dealName, 120)}`);
  if (normalized.type) parts.push(`type:${normalizeContextValue(normalized.type, 40)}`);
  if (normalized.pageType) parts.push(`page:${normalizeContextValue(normalized.pageType, 40)}`);
  if (normalized.summaryMetrics) {
    const metrics = normalized.summaryMetrics;
    for (const key of Object.keys(metrics).sort()) {
      parts.push(`${key}:${metrics[key]}`);
    }
  }
  if (normalized.slotType) parts.push(`slot:${normalizeContextValue(normalized.slotType, 40)}`);
  return parts.join('|');
}

export function buildPageContextPrompt(pageContext) {
  const normalized = normalizePageContext(pageContext);
  if (!normalized) return '';

  const parts = [];
  if (normalized.pageType === 'analytics' || normalized.pageType === 'analytics_dashboard') {
    const metrics = normalized.summaryMetrics || {};
    const metricLines = [
      metrics.totalDeals !== undefined && `total_deals: ${metrics.totalDeals}`,
      (metrics.activePipelineValue ?? metrics.pipelineValue) !== undefined && `active_pipeline_value: ${metrics.activePipelineValue ?? metrics.pipelineValue}`,
      metrics.winRate !== undefined && `win_rate: ${metrics.winRate}`,
      (metrics.averageDealSize ?? metrics.avgDealSize) !== undefined && `average_deal_size: ${metrics.averageDealSize ?? metrics.avgDealSize}`,
    ].filter(Boolean);
    const stageRows = normalized.charts?.dealsByStage || [];
    const revenueRows = normalized.charts?.monthlyRevenue || [];

    return [
      '## PAGE CONTEXT (current analytics dashboard)',
      normalized.title ? `title: ${normalized.title}` : 'title: Sales Analytics',
      metricLines.length > 0 ? metricLines.join('\n') : 'summary_metrics: not provided',
      stageRows.length > 0
        ? `deals_by_stage: ${stageRows.map((row) => `${row.stage}: ${row.count} deals, value ${row.value}`).join('; ')}`
        : 'deals_by_stage: not provided',
      revenueRows.length > 0
        ? `monthly_revenue: ${revenueRows.map((row) => `${row.month}: ${row.revenue}`).join('; ')}`
        : 'monthly_revenue: no closed-won revenue shown',
      '',
      'Use this UI-provided context to understand what dashboard the user is looking at.',
      'For factual CRM claims, still ground the answer in CRM retrieval results or return a clarification/failure.',
    ].join('\n');
  }

  if (normalized.dealId) parts.push(`deal_id: ${normalized.dealId}`);
  if (normalized.dealName) parts.push(`deal_name: ${normalized.dealName}`);
  if (normalized.type) parts.push(`action_type: ${normalized.type}`);
  if (normalized.slotType) parts.push(`slot_type: ${normalized.slotType}`);
  if (parts.length === 0) return '';

  return [
    '## PAGE CONTEXT (from UI action button - act on this immediately)',
    parts.join('\n'),
    '',
    'The user clicked an action button with this context.',
    'Use it to resolve the deal and take action immediately without asking which deal they mean.',
  ].join('\n');
}

function cloneReferencedEntities(source) {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return {};

  const cloned = {};
  for (const [key, value] of Object.entries(source)) {
    cloned[key] = Array.isArray(value)
      ? value
        .filter((item) => item && typeof item === 'object')
        .map((item) => ({ ...item }))
      : value;
  }
  return cloned;
}

export function mergeEntityContextWithPageContext(entityContext, pageContext) {
  const normalized = normalizePageContext(pageContext);
  if (!normalized?.dealId && !normalized?.dealName) {
    return entityContext || undefined;
  }

  const base = entityContext && typeof entityContext === 'object' && !Array.isArray(entityContext)
    ? entityContext
    : {};
  const existingPrimaryDeal = base.primaryEntity?.type === 'deal' && base.primaryEntity
    ? base.primaryEntity
    : null;
  const referencedEntities = cloneReferencedEntities(base.referencedEntities);
  const deals = Array.isArray(referencedEntities.deals) ? referencedEntities.deals : [];
  const existingDealIndex = deals.findIndex((deal) =>
    (normalized.dealId && deal?.id === normalized.dealId)
    || (normalized.dealName && normalizeContextValue(deal?.name, 120) === normalizeContextValue(normalized.dealName, 120))
  );

  const mergedDeal = {
    ...(existingDealIndex >= 0 ? deals[existingDealIndex] : {}),
    ...(normalized.dealId ? { id: normalized.dealId } : {}),
    ...(normalized.dealName ? { name: normalized.dealName } : {}),
  };

  if (existingDealIndex >= 0) {
    deals[existingDealIndex] = mergedDeal;
  } else {
    deals.unshift(mergedDeal);
  }

  referencedEntities.deals = deals;

  return {
    ...base,
    primaryEntity: {
      ...(existingPrimaryDeal ? { ...existingPrimaryDeal } : {}),
      type: 'deal',
      ...(normalized.dealId ? { id: normalized.dealId } : {}),
      ...(normalized.dealName ? { name: normalized.dealName } : {}),
    },
    referencedEntities,
  };
}

export function mergeActiveContextWithPageContext(activeContext, pageContext, entityContext) {
  const normalized = normalizePageContext(pageContext);
  const resolvedEntityContext = entityContext && typeof entityContext === 'object' && !Array.isArray(entityContext)
    ? entityContext
    : {};
  const dealId = normalized?.dealId || resolvedEntityContext?.primaryEntity?.id || null;
  const dealName = normalized?.dealName || resolvedEntityContext?.primaryEntity?.name || null;

  if (!dealId && !dealName) {
    return activeContext || undefined;
  }

  const base = activeContext && typeof activeContext === 'object' && !Array.isArray(activeContext)
    ? activeContext
    : {};

  return {
    ...base,
    lastEntityType: 'deals',
    lastEntityIds: dealId ? [dealId] : (Array.isArray(base.lastEntityIds) ? base.lastEntityIds : []),
    lastEntityNames: dealName ? [dealName] : (Array.isArray(base.lastEntityNames) ? base.lastEntityNames : []),
  };
}
