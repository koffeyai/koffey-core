/**
 * Analytics Operations — extracted from unified-chat/index.ts
 *
 * Contains: executeGetPipelineStats, executeGetSalesCycleAnalytics,
 *           executeGetPipelineVelocity, executeGetActivityStats
 */

// ============================================================================
// executeGetPipelineStats
// ============================================================================

export async function executeGetPipelineStats(supabase: any, organizationId: string, args?: any, userId?: string) {
  const { team_view, rep_name, group_by, date_from, date_to } = args || {};

  // Build query
  let query = supabase
    .from('deals')
    .select('amount, stage, probability, created_at, user_id, forecast_category, assigned_to, updated_at')
    .eq('organization_id', organizationId);

  // Date range filters for QoQ/MoM comparisons
  if (date_from) query = query.gte('created_at', date_from);
  if (date_to) query = query.lte('created_at', date_to);

  // Team view: get team members for this manager
  let teamMembers: any[] = [];
  if (team_view && userId) {
    const { data: directReports } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('manager_id', userId);

    if (directReports && directReports.length > 0) {
      teamMembers = directReports;
      const teamIds = directReports.map((r: any) => r.id);
      query = query.in('user_id', teamIds);
    } else {
      // Fallback: check org members if no direct reports
      const { data: orgMembers } = await supabase
        .from('organization_members')
        .select('user_id, profiles(id, full_name, email)')
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      if (orgMembers) {
        teamMembers = orgMembers.map((m: any) => m.profiles).filter(Boolean);
      }
    }
  }

  // Auto-load team members when rep_name is provided without team_view
  if (rep_name && teamMembers.length === 0) {
    const { data: orgMembers } = await supabase
      .from('organization_members')
      .select('user_id, profiles(id, full_name, email)')
      .eq('organization_id', organizationId)
      .eq('is_active', true);
    if (orgMembers) {
      teamMembers = orgMembers.map((m: any) => m.profiles).filter(Boolean);
    }
  }

  // Filter by specific rep
  if (rep_name && teamMembers.length > 0) {
    const matchedRep = teamMembers.find((m: any) => m.full_name?.toLowerCase().includes(rep_name.toLowerCase()));
    if (matchedRep) {
      query = query.eq('user_id', matchedRep.id);
    }
  }

  const { data: deals } = await query;

  if (!deals || deals.length === 0) {
    return {
      totalDeals: 0,
      totalValue: 0,
      message: 'No deals in pipeline yet'
    };
  }

  const totalValue = deals.reduce((sum: number, d: any) => sum + (d.amount || 0), 0);
  const weightedValue = deals.reduce((sum: number, d: any) =>
    sum + ((d.amount || 0) * (d.probability || 0) / 100), 0);

  const stageBreakdown = deals.reduce((acc: any, d: any) => {
    const stage = d.stage || 'unknown';
    if (!acc[stage]) acc[stage] = { count: 0, value: 0 };
    acc[stage].count++;
    acc[stage].value += d.amount || 0;
    return acc;
  }, {});

  const result: any = {
    totalDeals: deals.length,
    totalValue,
    weightedValue,
    stageBreakdown,
    entity: 'analytics'
  };

  // Forecast category breakdown
  if (group_by === 'forecast_category') {
    const forecastBreakdown: Record<string, { count: number; value: number }> = {};
    deals.forEach((d: any) => {
      const cat = d.forecast_category || (d.probability == null ? 'pipeline' : d.probability >= 80 ? 'commit' : d.probability >= 50 ? 'best_case' : d.probability >= 20 ? 'upside' : 'pipeline');
      if (!forecastBreakdown[cat]) forecastBreakdown[cat] = { count: 0, value: 0 };
      forecastBreakdown[cat].count++;
      forecastBreakdown[cat].value += d.amount || 0;
    });
    result.forecastBreakdown = forecastBreakdown;
  }

  // Rep breakdown for team view
  if (team_view && teamMembers.length > 0 && group_by === 'rep') {
    const repBreakdown: Record<string, { name: string; count: number; value: number; weightedValue: number }> = {};
    teamMembers.forEach((m: any) => {
      repBreakdown[m.id] = { name: m.full_name || m.email, count: 0, value: 0, weightedValue: 0 };
    });
    deals.forEach((d: any) => {
      const uid = d.user_id || d.assigned_to;
      if (repBreakdown[uid]) {
        repBreakdown[uid].count++;
        repBreakdown[uid].value += d.amount || 0;
        repBreakdown[uid].weightedValue += (d.amount || 0) * (d.probability || 0) / 100;
      }
    });
    result.repBreakdown = repBreakdown;
  }

  // Stale deals count
  const now = new Date();
  const staleCount = deals.filter((d: any) => {
    const daysSince = (now.getTime() - new Date(d.updated_at || d.created_at).getTime()) / (1000 * 60 * 60 * 24);
    return daysSince > 7 && !['closed_won', 'closed_lost'].includes(d.stage);
  }).length;
  result.staleDeals = staleCount;

  // Pipeline delta tracking (GAP-010) — compare with last snapshot
  try {
    const { data: lastSnapshot } = await supabase
      .from('pipeline_velocity_metrics')
      .select('velocity_data, calculated_at')
      .eq('organization_id', organizationId)
      .eq('stage_name', '_pipeline_snapshot')
      .order('calculated_at', { ascending: false })
      .limit(1)
      .single();

    const currentSnapshot = {
      totalDeals: deals.length,
      totalValue: totalValue,
      weightedValue: weightedValue,
      stageBreakdown: stageBreakdown,
      timestamp: now.toISOString()
    };

    if (lastSnapshot?.velocity_data) {
      const prev = lastSnapshot.velocity_data;
      result.delta = {
        sinceLast: lastSnapshot.calculated_at,
        dealsChange: currentSnapshot.totalDeals - (prev.totalDeals || 0),
        valueChange: currentSnapshot.totalValue - (prev.totalValue || 0),
        weightedChange: currentSnapshot.weightedValue - (prev.weightedValue || 0)
      };
    }

    // Save current snapshot (throttled — only if last snapshot is >4 hours old)
    const shouldSnapshot = !lastSnapshot || (now.getTime() - new Date(lastSnapshot.calculated_at).getTime()) > 4 * 60 * 60 * 1000;
    if (shouldSnapshot) {
      await supabase.from('pipeline_velocity_metrics').insert({
        organization_id: organizationId,
        stage_name: '_pipeline_snapshot',
        velocity_data: currentSnapshot,
        calculated_at: now.toISOString(),
        avg_days: 0,
        conversion_rate: 0,
        deal_count: deals.length
      });
    }
  } catch (err) {
    console.warn('[get_pipeline_stats] delta tracking error (non-blocking):', err);
  }

  // M2: Quota coverage integration
  try {
    const currentQuarter = `Q${Math.ceil((now.getMonth() + 1) / 3)} ${now.getFullYear()}`;
    const { data: quotas } = await supabase
      .from('sales_quotas')
      .select('user_id, amount, period, period_label')
      .eq('organization_id', organizationId)
      .eq('period', currentQuarter);

    if (quotas && quotas.length > 0) {
      const totalQuota = quotas.reduce((s: number, q: any) => s + (q.amount || 0), 0);
      const pipelineCoverage = totalQuota > 0 ? Math.round(totalValue / totalQuota * 100) : 0;
      const weightedCoverage = totalQuota > 0 ? Math.round(weightedValue / totalQuota * 100) : 0;
      const gap = totalQuota - weightedValue;

      result.quota = {
        period: currentQuarter,
        totalQuota,
        pipelineCoverage,
        weightedCoverage,
        gapToTarget: gap > 0 ? gap : 0,
        reps: quotas.length,
      };
    }
  } catch (err) {
    console.warn('[get_pipeline_stats] quota lookup error (non-blocking):', err);
  }

  return result;
}

// ============================================================================
// executeGetSalesCycleAnalytics
// ============================================================================

export async function executeGetSalesCycleAnalytics(
  supabase: any,
  args: any,
  organizationId: string
) {
  const { amount_min, amount_max, analysis_type } = args;

  console.log(`[unified-chat] Calling get_sales_cycle_analytics with:`, {
    organizationId,
    amount_min: amount_min || null,
    amount_max: amount_max || null,
    analysis_type: analysis_type || 'full'
  });

  const { data, error } = await supabase.rpc('get_sales_cycle_analytics', {
    p_organization_id: organizationId,
    p_amount_min: amount_min || null,
    p_amount_max: amount_max || null,
    p_analysis_type: analysis_type || 'full'
  });

  if (error) {
    console.error('[unified-chat] Sales cycle analytics error:', error);
    throw error;
  }

  console.log('[unified-chat] Sales cycle analytics result:', data);

  return {
    ...data,
    entity: 'sales_cycle_analytics'
  };
}

// ============================================================================
// executeGetPipelineVelocity
// ============================================================================

export async function executeGetPipelineVelocity(supabase: any, args: any, organizationId: string) {
  const { deal_id, date_from, date_to } = args || {};

  const { data: transitions, error } = await supabase
    .rpc('get_deal_stage_transitions', {
      p_organization_id: organizationId,
      p_deal_id: deal_id || null,
      p_date_from: date_from || null,
      p_date_to: date_to || null,
    });

  if (error) {
    return { message: `Failed to query stage transitions: ${error.message}` };
  }

  if (!transitions || transitions.length === 0) {
    return { message: 'No stage transitions found. Stage changes are recorded in the audit log — transitions will appear as deals move through your pipeline.' };
  }

  // Aggregate by transition pair (from_stage → to_stage)
  const byPair: Record<string, { dwell_times: number[]; count: number }> = {};
  transitions.forEach((t: any) => {
    const key = `${t.from_stage} → ${t.to_stage}`;
    if (!byPair[key]) byPair[key] = { dwell_times: [], count: 0 };
    byPair[key].count++;
    if (t.dwell_time_days > 0) byPair[key].dwell_times.push(t.dwell_time_days);
  });

  let msg = `**Pipeline Velocity**${deal_id ? ' (single deal)' : ''}\n\n`;

  // Stage transition summary
  msg += `### Stage Transition Times\n`;
  msg += `| Transition | Count | Avg Days | Median Days |\n|------------|-------|----------|-------------|\n`;

  Object.entries(byPair)
    .sort((a, b) => b[1].count - a[1].count)
    .forEach(([pair, data]) => {
      const times = data.dwell_times;
      const avg = times.length > 0 ? (times.reduce((s, t) => s + t, 0) / times.length).toFixed(1) : '—';
      const median = times.length > 0 ? times.sort((a, b) => a - b)[Math.floor(times.length / 2)].toFixed(1) : '—';
      msg += `| ${pair} | ${data.count} | ${avg} | ${median} |\n`;
    });

  // Recent transitions list (last 10)
  msg += `\n### Recent Transitions\n`;
  transitions.slice(0, 10).forEach((t: any) => {
    const date = new Date(t.changed_at).toLocaleDateString();
    msg += `- **${t.deal_name}**: ${t.from_stage} → ${t.to_stage} (${date}, by ${t.changed_by_name})${t.dwell_time_days > 0 ? ` — ${t.dwell_time_days}d in stage` : ''}\n`;
  });

  if (transitions.length > 10) {
    msg += `\n_...and ${transitions.length - 10} more transitions_`;
  }

  return { message: msg };
}

// ============================================================================
// executeGetActivityStats
// ============================================================================

export async function executeGetActivityStats(supabase: any, args: any, organizationId: string) {
  const { date_from, date_to, rep_name, group_by = 'type' } = args || {};

  // Default 7-day window
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 7);
  const startDate = date_from || defaultFrom.toISOString().split('T')[0];
  const endDate = date_to || now.toISOString().split('T')[0];

  let query = supabase
    .from('activities')
    .select('id, type, call_outcome, user_id, activity_date, completed')
    .eq('organization_id', organizationId)
    .gte('activity_date', startDate)
    .lte('activity_date', endDate);

  // Filter by rep
  if (rep_name) {
    const { data: repProfiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', `%${rep_name}%`);
    if (repProfiles && repProfiles.length > 0) {
      query = query.in('user_id', repProfiles.map((p: any) => p.id));
    } else {
      return { message: `No rep found matching "${rep_name}".` };
    }
  }

  const { data: activities, error } = await query;

  if (error) {
    return { message: `Failed to query activities: ${error.message}` };
  }

  if (!activities || activities.length === 0) {
    return { message: `No activities found from ${startDate} to ${endDate}${rep_name ? ` for ${rep_name}` : ''}.` };
  }

  const total = activities.length;
  let msg = `**Activity Stats** — ${startDate} to ${endDate}${rep_name ? ` (${rep_name})` : ''}\n`;
  msg += `_${total} total activities_\n\n`;

  if (group_by === 'type') {
    const byType: Record<string, number> = {};
    activities.forEach((a: any) => { byType[a.type || 'other'] = (byType[a.type || 'other'] || 0) + 1; });
    msg += `| Type | Count | % |\n|------|-------|---|\n`;
    Object.entries(byType).sort((a, b) => b[1] - a[1]).forEach(([type, count]) => {
      msg += `| ${type} | ${count} | ${Math.round(count / total * 100)}% |\n`;
    });
  } else if (group_by === 'outcome') {
    const byOutcome: Record<string, number> = {};
    activities.forEach((a: any) => { byOutcome[a.call_outcome || 'n/a'] = (byOutcome[a.call_outcome || 'n/a'] || 0) + 1; });
    msg += `| Outcome | Count | % |\n|---------|-------|---|\n`;
    Object.entries(byOutcome).sort((a, b) => b[1] - a[1]).forEach(([outcome, count]) => {
      msg += `| ${outcome} | ${count} | ${Math.round(count / total * 100)}% |\n`;
    });
  } else if (group_by === 'rep') {
    const byRep: Record<string, number> = {};
    activities.forEach((a: any) => { if (a.user_id) byRep[a.user_id] = (byRep[a.user_id] || 0) + 1; });
    const repIds = Object.keys(byRep);
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name, email')
      .in('id', repIds);
    const nameMap: Record<string, string> = {};
    (profiles || []).forEach((p: any) => { nameMap[p.id] = p.full_name || p.email || p.id; });

    msg += `| Rep | Count | % |\n|-----|-------|---|\n`;
    Object.entries(byRep).sort((a, b) => b[1] - a[1]).forEach(([uid, count]) => {
      msg += `| ${nameMap[uid] || uid} | ${count} | ${Math.round(count / total * 100)}% |\n`;
    });
  } else if (group_by === 'day') {
    const byDay: Record<string, number> = {};
    activities.forEach((a: any) => {
      const day = a.activity_date?.split('T')[0] || 'unknown';
      byDay[day] = (byDay[day] || 0) + 1;
    });
    msg += `| Date | Count |\n|------|-------|\n`;
    Object.entries(byDay).sort((a, b) => a[0].localeCompare(b[0])).forEach(([day, count]) => {
      msg += `| ${day} | ${count} |\n`;
    });
  }

  return { message: msg };
}
