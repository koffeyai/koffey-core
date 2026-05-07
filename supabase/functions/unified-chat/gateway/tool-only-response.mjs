function formatCurrency(value) {
  return typeof value === 'number'
    ? `$${value.toLocaleString('en-US')}`
    : null;
}

function pluralize(label, count) {
  return count === 1 ? label : `${label}s`;
}

function rowName(row) {
  return row?.name || row?.full_name || row?.title || row?.deal_name || row?.id || 'record';
}

function quadrantLabel(value) {
  const labels = {
    champion_influential: 'Champion (Influential)',
    champion_peripheral: 'Supporter (Peripheral)',
    adversarial_influential: 'Blocker (Influential)',
    adversarial_peripheral: 'Tactical Blocker (Peripheral)',
  };
  return value ? (labels[value] || String(value).replace(/_/g, ' ')) : 'Unranked';
}

function formatStakeholder(row) {
  const parts = [rowName(row)];
  if (row?.role_in_deal) parts.push(String(row.role_in_deal).replace(/_/g, ' '));
  parts.push(row?.quadrant_label || quadrantLabel(row?.quadrant));
  return parts.join(' - ');
}

function formatRow(row) {
  const parts = [rowName(row)];
  if (row?.stage) parts.push(String(row.stage));
  const amount = formatCurrency(row?.amount);
  if (amount) parts.push(amount);
  if (row?.due_date) parts.push(`due ${row.due_date}`);
  return parts.join(' - ');
}

function isPipelineManagerAsk(message) {
  return /\b(vp\s+of\s+sales|pipeline\s+manager|manager|pipeline[-\s]?review|highest[-\s]?risk|top\s+risk|forecastable|next\s+best|buyer\s+question)\b/i.test(String(message || ''));
}

function asRows(value) {
  return Array.isArray(value) ? value.filter(Boolean) : [];
}

function dealAmount(row) {
  const amount = Number(row?.amount ?? row?.value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function dealDate(row) {
  return row?.expected_close_date || row?.close_date || row?.due_date || null;
}

function selectPipelineReviewDeal(result) {
  const candidates = [
    ...asRows(result?.at_risk).map((row) => ({ row, reason: 'marked at risk' })),
    ...asRows(result?.closing_soon).map((row) => ({ row, reason: 'closing soon' })),
    ...asRows(result?.unscheduled).map((row) => ({ row, reason: 'missing a close date' })),
    ...asRows(result?.results).map((row) => ({ row, reason: 'largest open opportunity' })),
  ].filter((entry) => entry.row?.id || entry.row?.name || entry.row?.deal_name);

  if (candidates.length === 0) return null;

  return candidates.sort((a, b) => {
    const aHasDate = dealDate(a.row) ? 0 : 1;
    const bHasDate = dealDate(b.row) ? 0 : 1;
    if (a.reason !== b.reason) {
      const weight = { 'marked at risk': 0, 'closing soon': 1, 'missing a close date': 2, 'largest open opportunity': 3 };
      return (weight[a.reason] ?? 9) - (weight[b.reason] ?? 9);
    }
    if (aHasDate !== bHasDate) return aHasDate - bHasDate;
    return dealAmount(b.row) - dealAmount(a.row);
  })[0];
}

function buildPipelineManagerReview(result, message) {
  const selected = selectPipelineReviewDeal(result);
  const summary = result?.summary || result?.totals || {};
  const totalValue = formatCurrency(summary.total_value ?? summary.total_pipeline ?? result?.total_value ?? result?.total_pipeline);
  const weightedValue = formatCurrency(summary.weighted_value ?? summary.weighted_pipeline ?? result?.weighted_value ?? result?.weighted_pipeline);
  const openCount = summary.open_deals ?? summary.total_deals ?? result?.open_deals ?? result?.total_deals ?? asRows(result?.results).length;
  const unscheduled = asRows(result?.unscheduled);
  const atRisk = asRows(result?.at_risk);
  const closingSoon = asRows(result?.closing_soon);
  const lines = ['Pipeline review:'];

  const metrics = [];
  if (typeof openCount === 'number' && openCount > 0) metrics.push(`${openCount} active ${pluralize('deal', openCount)}`);
  if (totalValue) metrics.push(`${totalValue} total`);
  if (weightedValue) metrics.push(`${weightedValue} weighted`);
  if (metrics.length > 0) lines.push(`- Snapshot: ${metrics.join(' / ')}.`);

  if (selected) {
    const row = selected.row;
    const name = rowName(row);
    const amount = formatCurrency(dealAmount(row));
    const close = dealDate(row) || 'no close date';
    lines.push(`- Highest-risk focus: ${name}${amount ? ` (${amount})` : ''}, ${selected.reason}, close ${close}.`);
    lines.push('- Risk: forecast confidence is weak until the next buyer commitment, close plan, and decision process are explicit.');
    lines.push('- Next best action: create a concrete follow-up tied to the deal and validate the blocker with the buyer.');
    lines.push('- Exact buyer question: "What needs to happen next, and by when, for us to keep this opportunity on track?"');
  } else {
    lines.push('- Highest-risk focus: no active deal was available in the retrieved pipeline context.');
  }

  const missing = [];
  if (unscheduled.length > 0) missing.push(`${unscheduled.length} ${pluralize('deal', unscheduled.length)} missing close dates`);
  if (atRisk.length > 0) missing.push(`${atRisk.length} at-risk ${pluralize('deal', atRisk.length)}`);
  if (closingSoon.length > 0) missing.push(`${closingSoon.length} ${pluralize('deal', closingSoon.length)} closing soon`);
  if (missing.length > 0) lines.push(`- Manager follow-up: ${missing.join('; ')}.`);
  if (/\btask|follow[\s-]?up|next\s+step\b/i.test(String(message || ''))) {
    lines.push('- Task handling: I can create the task once the target deal is resolved; if the system has a single highest-risk deal, it should attach the task there automatically.');
  }

  return lines.join('\n');
}

export function buildPipelineReviewTaskArgs(result, message = '') {
  if (!/\b(create|add|make|set|schedule)\b[\s\S]*\b(task|follow[\s-]?up|next\s+step|todo|reminder)\b/i.test(String(message || ''))) {
    return null;
  }
  if (!/\b(most\s+urgent|highest[-\s]?risk|top\s+risk|at[-\s]?risk|pipeline\s+manager|vp\s+of\s+sales|pipeline[-\s]?review)\b/i.test(String(message || ''))) {
    return null;
  }

  const selected = selectPipelineReviewDeal(result);
  const row = selected?.row;
  if (!row?.id && !row?.name && !row?.deal_name) return null;

  return {
    title: selected?.reason === 'missing a close date'
      ? 'Confirm close date and next buyer step'
      : 'Follow up on pipeline risk',
    due_date: /\btomorrow\b/i.test(String(message || '')) ? 'tomorrow' : undefined,
    priority: 'high',
    ...(row.id ? { deal_id: row.id } : { deal_name: row.name || row.deal_name }),
  };
}

function formatMutationToolLabel(tool) {
  const labels = {
    create_deal: 'Created opportunity',
    update_deal: 'Updated opportunity',
    delete_deal: 'Deletion status',
    create_account: 'Created account',
    update_account: 'Updated account',
    create_contact: 'Created contact',
    update_contact: 'Updated contact',
    create_task: 'Created task',
    complete_task: 'Updated task',
    create_activity: 'Logged activity',
  };
  return labels[tool] || tool;
}

function formatMutationResult(op) {
  const result = op?.result || {};
  const label = formatMutationToolLabel(op?.tool);
  const name = rowName(result);
  const details = [];

  const amount = formatCurrency(result.amount);
  if (amount) details.push(amount);
  if (result.stage) details.push(`stage ${result.stage}`);
  if (result.expected_close_date) details.push(`close ${result.expected_close_date}`);
  if (result.due_date) details.push(`due ${result.due_date}`);
  if (result.industry) details.push(`industry ${result.industry}`);
  if (result.account_name) details.push(`account ${result.account_name}`);
  if (result.contact_name) details.push(`contact ${result.contact_name}`);
  if (result.enrichment_applied) details.push('enriched from website');

  const suffix = details.length ? ` (${details.join(', ')})` : '';
  if (result.action === 'deleted' || op?.tool === 'delete_deal') {
    return `- ${label}: ${name}${suffix}. This was recorded in the change log.`;
  }
  return `- ${label}: ${name}${suffix}`;
}

function formatPipelineContext(result) {
  const summary = result?.summary || result?.totals || {};
  const totalValue = formatCurrency(summary.total_value ?? summary.total_pipeline ?? result?.total_value ?? result?.total_pipeline);
  const weightedValue = formatCurrency(summary.weighted_value ?? summary.weighted_pipeline ?? result?.weighted_value ?? result?.weighted_pipeline);
  const openCount = summary.open_deals ?? summary.total_deals ?? result?.open_deals ?? result?.total_deals;
  const lines = ['Pipeline context:'];

  const metrics = [];
  if (typeof openCount === 'number') metrics.push(`${openCount} ${pluralize('open deal', openCount)}`);
  if (totalValue) metrics.push(`${totalValue} total`);
  if (weightedValue) metrics.push(`${weightedValue} weighted`);
  if (metrics.length > 0) lines.push(`- Summary: ${metrics.join(' / ')}`);

  for (const [label, key] of [
    ['At risk', 'at_risk'],
    ['Closing soon', 'closing_soon'],
    ['Recent wins', 'recent_wins'],
    ['Recent losses', 'recent_losses'],
    ['Missing close date', 'unscheduled'],
  ]) {
    const rows = Array.isArray(result?.[key]) ? result[key] : [];
    if (rows.length === 0) continue;
    lines.push(`- ${label}: ${rows.slice(0, 3).map(formatRow).join('; ')}${rows.length > 3 ? `; +${rows.length - 3} more` : ''}`);
  }

  if (lines.length === 1) return null;
  return lines.join('\n');
}

function formatDealContext(result) {
  if (result?.multiple_deals && Array.isArray(result?.deals)) {
    const lines = [`Deal context: ${result.deals.length} matching opportunities${result.label ? ` for ${result.label}` : ''}`];
    for (const deal of result.deals.slice(0, 5)) {
      const amount = formatCurrency(deal.amount);
      const facts = [];
      if (amount) facts.push(amount);
      if (deal.stage) facts.push(`stage ${deal.stage}`);
      if (deal.probability != null) facts.push(`${deal.probability}% probability`);
      if (deal.close_date || deal.expected_close_date) facts.push(`close ${deal.close_date || deal.expected_close_date}`);
      lines.push(`- ${rowName(deal)}${facts.length ? `: ${facts.join(' / ')}` : ''}`);
      if (deal.account?.name) lines.push(`  Account: ${deal.account.name}`);
      const stakeholders = Array.isArray(deal.stakeholders) ? deal.stakeholders : [];
      lines.push(stakeholders.length > 0
        ? `  Points of contact / power ranks: ${stakeholders.slice(0, 4).map(formatStakeholder).join('; ')}`
        : '  Points of contact / power ranks: no stakeholders linked yet');
    }
    return lines.join('\n');
  }

  const deal = result?.deal || {};
  if (!deal?.id && !deal?.name) return null;

  const lines = [`Deal context: ${rowName(deal)}`];
  const amount = formatCurrency(deal.amount);
  const facts = [];
  if (amount) facts.push(amount);
  if (deal.stage) facts.push(`stage ${deal.stage}`);
  if (deal.probability != null) facts.push(`${deal.probability}% probability`);
  if (deal.expected_close_date || deal.close_date) facts.push(`close ${deal.expected_close_date || deal.close_date}`);
  if (facts.length > 0) lines.push(`- Snapshot: ${facts.join(' / ')}`);
  if (result?.account?.name) lines.push(`- Account: ${result.account.name}`);

  const primaryContact = result?.primary_contact ? [result.primary_contact] : [];
  const contacts = Array.isArray(result?.contacts) ? result.contacts : primaryContact;
  if (contacts.length > 0) lines.push(`- Primary contact: ${contacts.slice(0, 3).map(rowName).join(', ')}`);

  const stakeholders = Array.isArray(result?.stakeholders) ? result.stakeholders : [];
  lines.push(stakeholders.length > 0
    ? `- Points of contact / power ranks: ${stakeholders.slice(0, 5).map(formatStakeholder).join('; ')}`
    : '- Points of contact / power ranks: no stakeholders linked yet');

  const tasks = Array.isArray(result?.tasks) ? result.tasks : (Array.isArray(result?.open_tasks) ? result.open_tasks : []);
  if (tasks.length > 0) lines.push(`- Open tasks: ${tasks.slice(0, 3).map(formatRow).join('; ')}`);

  const activities = Array.isArray(result?.activities) ? result.activities : (Array.isArray(result?.recent_activities) ? result.recent_activities : []);
  if (activities.length > 0) lines.push(`- Recent activity: ${activities.slice(0, 2).map(formatRow).join('; ')}`);

  const notes = Array.isArray(result?.notes) ? result.notes : (Array.isArray(result?.deal_notes) ? result.deal_notes : []);
  if (notes.length > 0) lines.push(`- Notes available: ${notes.length}`);

  return lines.join('\n');
}

function formatSuggestions(result) {
  const suggestions = Array.isArray(result?.suggestions) ? result.suggestions : [];
  if (suggestions.length === 0) return null;
  const rows = suggestions.slice(0, 5).map((s) => `  - ${s.suggested_action || s.action || s.entity_name}: ${s.reasoning || 'recommended next step'}`);
  return `Recommended next actions:\n${rows.join('\n')}`;
}

export function buildToolOnlyResponse(operations, message = '') {
  return buildToolOnlyResponseForMessage(operations, message);
}

export function buildToolOnlyResponseForMessage(operations, message = '') {
  if (!Array.isArray(operations) || operations.length === 0) return 'I finished the request.';

  const lines = [];
  let hasIncompleteStatus = false;
  for (const op of operations.slice(0, 5)) {
    if (op?.result?.error) {
      hasIncompleteStatus = true;
      lines.push(`- ${op.tool}: failed (${op.result.message || 'error'})`);
      continue;
    }
    if (op?.result?._needsInput || op?.result?._needsConfirmation || op?.result?._needsLossReason) {
      hasIncompleteStatus = true;
      const message = String(
        op?.result?.message
        || (op?.result?._needsConfirmation
          ? 'Awaiting your confirmation.'
          : op?.result?._needsLossReason
            ? 'I need a loss reason before I can complete that.'
            : 'I need a bit more information before I can complete that.')
      ).trim();
      const preserveFullPrompt = op?.result?.clarification_type === 'multiple_deals'
        || op?.result?.clarification_type === 'missing_communication_context';
      const trimmed = !preserveFullPrompt && message.length > 220 ? `${message.slice(0, 217)}...` : message;
      lines.push(`- ${op.tool}: ${trimmed}`);
      continue;
    }
    if (op?.result?.success === false && typeof op?.result?.message === 'string') {
      hasIncompleteStatus = true;
      const message = op.result.message.trim();
      const trimmed = message.length > 220 ? `${message.slice(0, 217)}...` : message;
      lines.push(`- ${op.tool}: ${trimmed}`);
      continue;
    }
    if (/^(create|update|delete|complete)_/.test(String(op?.tool || '')) && (op?.result?.id || op?.result?.success)) {
      lines.push(formatMutationResult(op));
      continue;
    }
    if (op?.tool === 'get_pipeline_context') {
      if (isPipelineManagerAsk(message)) {
        lines.push(buildPipelineManagerReview(op.result, message));
        continue;
      }
      const formatted = formatPipelineContext(op.result);
      if (formatted) {
        lines.push(formatted);
        continue;
      }
    }
    if (op?.tool === 'get_deal_context') {
      const formatted = formatDealContext(op.result);
      if (formatted) {
        lines.push(formatted);
        continue;
      }
    }
    if (op?.tool === 'suggest_next_best_action') {
      const formatted = formatSuggestions(op.result);
      if (formatted) {
        lines.push(formatted);
        continue;
      }
    }
    if (Array.isArray(op?.result?.results)) {
      const rows = op.result.results.slice(0, 5).map((row) => `  - ${formatRow(row)}`);
      lines.push(`- ${op.tool}: ${op.result.results.length} records${rows.length ? `\n${rows.join('\n')}` : ''}`);
      continue;
    }
    if (Array.isArray(op?.result?.tasks)) {
      const rows = op.result.tasks.slice(0, 5).map((row) => `  - ${formatRow(row)}`);
      lines.push(`- ${op.tool}: ${op.result.tasks.length} tasks${rows.length ? `\n${rows.join('\n')}` : ''}`);
      continue;
    }
    if (typeof op?.result?.message === 'string' && op.result.message.trim()) {
      lines.push(`- ${op.tool}: ${op.result.message.trim()}`);
      continue;
    }
    if (typeof op?.result?.count === 'number') {
      lines.push(`- ${op.tool}: ${op.result.count} items`);
      continue;
    }
    if (typeof op?.result?.totalDeals === 'number') {
      lines.push(`- ${op.tool}: ${op.result.totalDeals} deals`);
      continue;
    }
    if (op?.result?.id) {
      lines.push(`- ${op.tool}: completed`);
      continue;
    }
    lines.push(`- ${op.tool}: completed`);
  }

  return `${hasIncompleteStatus ? 'Action status' : 'Completed actions'}:\n${lines.join('\n')}`;
}
