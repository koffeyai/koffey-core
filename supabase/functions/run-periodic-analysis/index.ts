/**
 * Run Periodic Analysis - Cold Path (6-Hour Cron)
 *
 * Triggered by pg_cron every 6 hours. Performs three operations:
 *
 * 1. Staleness Detection — Contacts not analyzed recently get LLM review.
 *    Generates suggested actions (follow-ups, re-engagement, etc.)
 *
 * 2. Date Monitoring — Checks client_memory for upcoming key dates and
 *    creates date_reminder suggested actions.
 *
 * 3. Memory Compaction — Rewrites bloated memories (fact_count > 50) to
 *    reduce token cost on future LLM calls.
 *
 * Cost guardrails:
 * - Max 50 contacts per run
 * - Tiered by activity recency (recent = standard tier, older = lite tier)
 * - Contacts with no activity in 90+ days are skipped
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { callWithFallback } from '../_shared/ai-provider.ts';
import { getServiceRoleClient, isInternalServiceCall } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

// ============================================================================
// SYSTEM PROMPTS
// ============================================================================

const ANALYSIS_PROMPT = `You are a proactive CRM analyst for a sales intelligence platform. Review a client contact's memory and suggest actions the salesperson should take.

Given:
1. The contact's profile (name, company, title)
2. Their accumulated memory (facts, summary, key dates, communication preferences)
3. Today's date
4. Days since last interaction

Identify and return valid JSON:

{
  "suggestions": [
    {
      "action_type": "follow_up|re_engage|date_reminder|relationship_nurture|deal_risk|memory_insight",
      "title": "Short action title (under 80 chars)",
      "description": "What to do and why (under 250 chars)",
      "priority": "low|medium|high|critical",
      "reasoning": "Why this matters now (under 200 chars)",
      "confidence": 0.85
    }
  ],
  "memory_health": {
    "needs_compaction": false,
    "stale_facts_count": 0,
    "overall_quality": "good|fair|poor"
  }
}

Rules:
- Return 0-3 suggestions maximum. Quality over quantity.
- Only suggest actions with clear evidence from the memory.
- "follow_up" = contact hasn't been touched in a while
- "re_engage" = relationship has gone cold (30+ days)
- "date_reminder" = an upcoming date needs preparation
- "relationship_nurture" = positive signal worth reinforcing
- "deal_risk" = something in the memory indicates deal trouble
- "memory_insight" = a non-obvious pattern you noticed
- Set priority based on urgency and business impact
- If the memory is sparse or there's nothing actionable, return empty suggestions array`;

const COMPACTION_PROMPT = `You are a memory curator for a CRM system. Your job is to compact a bloated client memory by:

1. Merging duplicate or overlapping facts into single consolidated facts
2. Removing facts that are superseded by newer information (e.g., old title when new title exists)
3. Consolidating the summary to be more concise
4. Keeping all key dates that are in the future (remove past dates unless recurring)
5. Preserving the most recent and most important facts

Return the compacted memory in the same JSON structure:

{
  "facts": [{"fact": "...", "category": "...", "confidence": 0.9, "extracted_at": "..."}],
  "summary": "Concise 2-3 sentence summary",
  "key_dates": [{"date": "YYYY-MM-DD", "label": "...", "recurring": false}],
  "communication_preferences": {"channel": "...", "tone": "...", "best_time": "..."},
  "relationship_signals": {"sentiment": "...", "engagement_level": "..."}
}

Target: reduce fact count by 40-60% while preserving all essential information. Prefer recent facts over older ones. Merge facts that describe the same thing differently.`;

// ============================================================================
// CONSTANTS
// ============================================================================

const MAX_CONTACTS_PER_RUN = 50;
const MAX_COMPACTIONS_PER_RUN = 5;
const STALE_HOURS = 6;
const DATE_LOOKAHEAD_DAYS = 7;
const COMPACTION_THRESHOLD = 50;

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
const startTime = Date.now();

  try {
    // Validate: must be internal service call (cron-triggered)
    if (!isInternalServiceCall(req)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: internal service call required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getServiceRoleClient();
    console.log('[periodic-analysis] Starting periodic analysis run');

    const results = {
      staleness: { processed: 0, suggestions_created: 0 },
      dates: { checked: 0, reminders_created: 0 },
      compaction: { processed: 0 },
      outcomes: { measured: 0 },
      errors: [] as string[],
    };

    // ========================================================================
    // LOAD PROACTIVE POLICIES (Block 4B)
    // ========================================================================

    const policyMap: Record<string, any> = {};
    try {
      const { data: policies } = await supabase
        .from('proactive_policies')
        .select('*');
      for (const p of policies || []) {
        policyMap[p.organization_id] = p;
      }
      console.log(`[periodic-analysis] Loaded ${Object.keys(policyMap).length} org policies`);
    } catch (err: any) {
      console.warn('[periodic-analysis] Failed to load policies (proceeding with defaults):', err.message);
    }

    // Daily suggestion counts per org (for fatigue cap enforcement)
    const dailySuggestionCounts: Record<string, { total: number; critical: number }> = {};

    // Last dismissal timestamps per org (for cooldown enforcement)
    const lastDismissalCache: Record<string, number> = {};
    try {
      const { data: recentDismissals } = await supabase
        .from('suggested_actions')
        .select('organization_id, dismissed_at')
        .eq('status', 'dismissed')
        .not('dismissed_at', 'is', null)
        .order('dismissed_at', { ascending: false })
        .limit(200);
      for (const d of recentDismissals || []) {
        if (!lastDismissalCache[d.organization_id]) {
          lastDismissalCache[d.organization_id] = new Date(d.dismissed_at).getTime();
        }
      }
    } catch (err: any) {
      console.warn('[periodic-analysis] Failed to load dismissal cache:', err.message);
    }

    /** Check whether a suggestion should be created based on org policy */
    function shouldCreateSuggestion(orgId: string, priority: string, confidence: number): boolean {
      const policy = policyMap[orgId];
      if (!policy) return true; // No policy = no restrictions

      // Confidence floor
      if (confidence < (policy.min_confidence ?? 0.5)) return false;

      // Quiet hours check
      if (policy.quiet_hours_enabled && policy.quiet_hours_start && policy.quiet_hours_end) {
        const tz = policy.quiet_hours_timezone || 'UTC';
        try {
          const nowInTz = new Date().toLocaleTimeString('en-GB', { timeZone: tz, hour12: false });
          const [hh, mm] = nowInTz.split(':').map(Number);
          const nowMinutes = hh * 60 + mm;
          const [startH, startM] = policy.quiet_hours_start.split(':').map(Number);
          const [endH, endM] = policy.quiet_hours_end.split(':').map(Number);
          const startMinutes = startH * 60 + startM;
          const endMinutes = endH * 60 + endM;
          const inQuiet = startMinutes <= endMinutes
            ? nowMinutes >= startMinutes && nowMinutes < endMinutes
            : nowMinutes >= startMinutes || nowMinutes < endMinutes; // spans midnight
          if (inQuiet) return false;
        } catch { /* timezone parse error — skip quiet hours check */ }
      }

      // Cooldown after recent dismissals
      const cooldownHours = policy.cooldown_after_dismiss_hours ?? 4;
      if (cooldownHours > 0 && lastDismissalCache[orgId] !== undefined) {
        const hoursSinceDismiss = (Date.now() - lastDismissalCache[orgId]) / (1000 * 60 * 60);
        if (hoursSinceDismiss < cooldownHours) return false;
      }

      // Initialize daily counts
      if (!dailySuggestionCounts[orgId]) {
        dailySuggestionCounts[orgId] = { total: 0, critical: 0 };
      }
      const counts = dailySuggestionCounts[orgId];

      // Fatigue cap
      if (counts.total >= (policy.max_actions_per_day ?? 10)) return false;
      if (priority === 'critical' && counts.critical >= (policy.max_critical_per_day ?? 3)) return false;

      // Passed all checks — increment counters
      counts.total++;
      if (priority === 'critical') counts.critical++;
      return true;
    }

    // ========================================================================
    // BATCH 1: STALENESS DETECTION
    // ========================================================================

    console.log('[periodic-analysis] Batch 1: Staleness detection');

    const staleThreshold = new Date(Date.now() - STALE_HOURS * 60 * 60 * 1000).toISOString();

    // Get contacts with memory that needs analysis, with activity recency for tiering
    const { data: staleContacts, error: staleError } = await supabase
      .from('client_memory')
      .select(`
        id, contact_id, organization_id, memory, fact_count, last_analyzed_at,
        contacts!inner(id, full_name, first_name, last_name, company, title, email)
      `)
      .or(`last_analyzed_at.is.null,last_analyzed_at.lt.${staleThreshold}`)
      .order('last_analyzed_at', { ascending: true, nullsFirst: true })
      .limit(MAX_CONTACTS_PER_RUN);

    if (staleError) {
      console.error('[periodic-analysis] Stale contacts query error:', staleError);
      results.errors.push(`Stale query: ${staleError.message}`);
    }

    if (staleContacts && staleContacts.length > 0) {
      console.log(`[periodic-analysis] Found ${staleContacts.length} contacts to analyze`);

      // Get last activity dates for tiering
      const contactIds = staleContacts.map((c: any) => c.contact_id);
      const { data: recentActivities } = await supabase
        .from('activities')
        .select('contact_id, activity_date')
        .in('contact_id', contactIds)
        .order('activity_date', { ascending: false });

      // Build activity map (most recent per contact)
      const lastActivityMap: Record<string, string> = {};
      for (const a of recentActivities || []) {
        if (!lastActivityMap[a.contact_id]) {
          lastActivityMap[a.contact_id] = a.activity_date;
        }
      }

      for (const cm of staleContacts) {
        try {
          const contact = cm.contacts as any;
          const contactName = contact?.full_name || `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() || 'Unknown';
          const lastActivity = lastActivityMap[cm.contact_id];
          const daysSinceActivity = lastActivity
            ? Math.floor((Date.now() - new Date(lastActivity).getTime()) / (1000 * 60 * 60 * 24))
            : 999;

          // Skip contacts with no activity in 90+ days
          if (daysSinceActivity > 90) {
            console.log(`[periodic-analysis] Skipping ${contactName}: ${daysSinceActivity} days since activity`);
            // Still update last_analyzed_at so we don't check again next cycle
            await supabase
              .from('client_memory')
              .update({ last_analyzed_at: new Date().toISOString() })
              .eq('id', cm.id);
            continue;
          }

          // Determine tier based on recency
          const tier = daysSinceActivity <= 7 ? 'standard' : 'lite';

          const userPrompt = `## Contact: ${contactName}
Company: ${contact?.company || 'Unknown'}
Title: ${contact?.title || 'Unknown'}
Email: ${contact?.email || 'N/A'}

## Today's Date: ${new Date().toISOString().split('T')[0]}
## Days Since Last Interaction: ${daysSinceActivity}

## Current Memory
Summary: ${cm.memory?.summary || 'No summary'}
Facts (${cm.memory?.facts?.length || 0}):
${(cm.memory?.facts || []).slice(0, 20).map((f: any) => `- [${f.category}] ${f.fact}`).join('\n') || 'None'}
Key Dates:
${(cm.memory?.key_dates || []).map((d: any) => `- ${d.date}: ${d.label}`).join('\n') || 'None'}
Communication: ${JSON.stringify(cm.memory?.communication_preferences || {})}`;

          const result = await callWithFallback({
            messages: [
              { role: 'system', content: ANALYSIS_PROMPT },
              { role: 'user', content: userPrompt }
            ],
            tier: tier as 'standard' | 'lite',
            temperature: 0.3,
            maxTokens: tier === 'standard' ? 1024 : 512,
            jsonMode: true
          });

          let analysis;
          try {
            analysis = JSON.parse(result.content);
          } catch {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              analysis = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('Failed to parse analysis response');
            }
          }

          // Insert suggestions with deduplication
          const now = new Date().toISOString();
          const today = now.split('T')[0];

          for (const suggestion of analysis.suggestions || []) {
            const sugPriority = suggestion.priority || 'medium';
            const sugConfidence = suggestion.confidence || 0;

            // Policy gate
            if (!shouldCreateSuggestion(cm.organization_id, sugPriority, sugConfidence)) {
              continue;
            }

            const dedupKey = `${suggestion.action_type}:${cm.contact_id}:${today}`;

            const { error: insertError } = await supabase
              .from('suggested_actions')
              .upsert({
                contact_id: cm.contact_id,
                organization_id: cm.organization_id,
                action_type: suggestion.action_type,
                title: suggestion.title?.substring(0, 200) || 'Suggested action',
                description: suggestion.description?.substring(0, 500) || '',
                priority: sugPriority,
                dedup_key: dedupKey,
                reasoning: suggestion.reasoning?.substring(0, 500),
                confidence: sugConfidence,
                status: 'active',
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                evidence: {
                  signals: [{
                    type: 'staleness',
                    description: `No interaction in ${daysSinceActivity} days`,
                    value: daysSinceActivity,
                    threshold: STALE_HOURS / 24,
                  }],
                  source_entities: [{
                    entity_type: 'contact',
                    entity_id: cm.contact_id,
                    entity_name: contactName,
                  }],
                  trigger_event: 'periodic_staleness_detection',
                  data_points: {
                    days_since_activity: daysSinceActivity,
                    tier,
                    contact_company: contact?.company || null,
                    memory_fact_count: cm.memory?.facts?.length || 0,
                  },
                },
              }, {
                onConflict: 'dedup_key,organization_id',
                ignoreDuplicates: true
              });

            if (!insertError) {
              results.staleness.suggestions_created++;
            }
          }

          // Update last_analyzed_at
          await supabase
            .from('client_memory')
            .update({ last_analyzed_at: now })
            .eq('id', cm.id);

          results.staleness.processed++;
        } catch (err: any) {
          console.error(`[periodic-analysis] Error analyzing contact ${cm.contact_id}:`, err.message);
          results.errors.push(`Analysis ${cm.contact_id}: ${err.message?.substring(0, 100)}`);
        }
      }
    }

    // ========================================================================
    // BATCH 2: DATE MONITORING
    // ========================================================================

    console.log('[periodic-analysis] Batch 2: Date monitoring');

    const today = new Date().toISOString().split('T')[0];
    const lookaheadDate = new Date(Date.now() + DATE_LOOKAHEAD_DAYS * 24 * 60 * 60 * 1000)
      .toISOString().split('T')[0];

    // Query memories that have key_dates
    const { data: memoriesWithDates } = await supabase
      .from('client_memory')
      .select(`
        id, contact_id, organization_id, memory,
        contacts!inner(full_name, company)
      `)
      .not('memory->key_dates', 'eq', '[]')
      .not('memory->key_dates', 'is', null);

    if (memoriesWithDates) {
      for (const cm of memoriesWithDates) {
        const keyDates = cm.memory?.key_dates || [];
        const contact = cm.contacts as any;
        const contactName = contact?.full_name || 'Unknown';

        for (const kd of keyDates) {
          if (kd.date >= today && kd.date <= lookaheadDate) {
            results.dates.checked++;

            const daysUntil = Math.ceil(
              (new Date(kd.date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
            );
            const dedupKey = `date:${cm.contact_id}:${kd.date}`;

            const datePriority = daysUntil <= 1 ? 'high' : daysUntil <= 3 ? 'medium' : 'low';

            // Policy gate
            if (!shouldCreateSuggestion(cm.organization_id, datePriority, 1.0)) {
              continue;
            }

            const { error: insertError } = await supabase
              .from('suggested_actions')
              .upsert({
                contact_id: cm.contact_id,
                organization_id: cm.organization_id,
                action_type: 'date_reminder',
                title: `${kd.label} — ${contactName} (${daysUntil === 0 ? 'today' : `in ${daysUntil} days`})`,
                description: `${kd.label} for ${contactName} at ${contact?.company || 'N/A'} is ${daysUntil === 0 ? 'today' : `coming up on ${kd.date}`}. Prepare accordingly.`,
                priority: datePriority,
                dedup_key: dedupKey,
                reasoning: `Key date from client memory`,
                confidence: 1.0,
                status: 'active',
                expires_at: new Date(new Date(kd.date).getTime() + 24 * 60 * 60 * 1000).toISOString(),
                evidence: {
                  signals: [{
                    type: 'upcoming_date',
                    description: `${kd.label} in ${daysUntil} day(s)`,
                    value: daysUntil,
                    threshold: DATE_LOOKAHEAD_DAYS,
                  }],
                  source_entities: [{
                    entity_type: 'contact',
                    entity_id: cm.contact_id,
                    entity_name: contactName,
                  }],
                  trigger_event: 'date_monitoring',
                  data_points: {
                    date_label: kd.label,
                    date_value: kd.date,
                    days_until: daysUntil,
                    contact_company: contact?.company || null,
                    recurring: kd.recurring || false,
                  },
                },
              }, {
                onConflict: 'dedup_key,organization_id',
                ignoreDuplicates: true
              });

            if (!insertError) {
              results.dates.reminders_created++;
            }
          }
        }
      }
    }

    // ========================================================================
    // BATCH 3: MEMORY COMPACTION
    // ========================================================================

    console.log('[periodic-analysis] Batch 3: Memory compaction');

    const compactionThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const { data: bloatedMemories } = await supabase
      .from('client_memory')
      .select('id, contact_id, organization_id, memory, version, fact_count')
      .gt('fact_count', COMPACTION_THRESHOLD)
      .or(`last_compacted_at.is.null,last_compacted_at.lt.${compactionThreshold}`)
      .limit(MAX_COMPACTIONS_PER_RUN);

    if (bloatedMemories && bloatedMemories.length > 0) {
      console.log(`[periodic-analysis] Found ${bloatedMemories.length} memories to compact`);

      for (const cm of bloatedMemories) {
        try {
          const userPrompt = `## Current Memory (${cm.fact_count} facts)

${JSON.stringify(cm.memory, null, 2)}

Today's date: ${new Date().toISOString().split('T')[0]}

Compact this memory. Remove outdated facts, merge duplicates, and consolidate. Target: reduce from ${cm.fact_count} facts to ~${Math.floor(cm.fact_count * 0.5)} facts.`;

          const result = await callWithFallback({
            messages: [
              { role: 'system', content: COMPACTION_PROMPT },
              { role: 'user', content: userPrompt }
            ],
            tier: 'standard',
            temperature: 0.2,
            maxTokens: 2048,
            jsonMode: true
          });

          let compacted;
          try {
            compacted = JSON.parse(result.content);
          } catch {
            const jsonMatch = result.content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
              compacted = JSON.parse(jsonMatch[0]);
            } else {
              throw new Error('Failed to parse compaction response');
            }
          }

          const now = new Date().toISOString();
          const newFactCount = compacted.facts?.length || 0;

          await supabase
            .from('client_memory')
            .update({
              memory: compacted,
              version: (cm.version || 0) + 1,
              fact_count: newFactCount,
              last_compacted_at: now,
              updated_at: now
            })
            .eq('id', cm.id);

          console.log(`[periodic-analysis] Compacted ${cm.contact_id}: ${cm.fact_count} → ${newFactCount} facts`);
          results.compaction.processed++;
        } catch (err: any) {
          console.error(`[periodic-analysis] Compaction error ${cm.contact_id}:`, err.message);
          results.errors.push(`Compaction ${cm.contact_id}: ${err.message?.substring(0, 100)}`);
        }
      }
    }

    // ========================================================================
    // BATCH 4: RENEWAL DETECTION
    // ========================================================================

    console.log('[periodic-analysis] Batch 4: Renewal detection');

    const renewalResults = { processed: 0, alerts_created: 0 };

    try {
      const todayUtc = new Date().toISOString().split('T')[0];

      const { data: renewableTerms, error: renewalError } = await supabase
        .from('deal_terms')
        .select('*, deals!inner(id, name, amount, user_id, account_id)')
        .in('renewal_status', ['not_due', 'upcoming'])
        .not('contract_end_date', 'is', null)
        .gt('contract_end_date', todayUtc);

      if (renewalError) {
        console.error('[periodic-analysis] Renewal query error:', renewalError);
        results.errors.push(`Renewal: ${renewalError.message}`);
      }

      if (renewableTerms && renewableTerms.length > 0) {
        for (const dt of renewableTerms) {
          const endDate = new Date(dt.contract_end_date);
          const daysUntilEnd = Math.ceil((endDate.getTime() - new Date(todayUtc).getTime()) / (1000 * 60 * 60 * 24));
          const noticeDays = dt.renewal_notice_days || 90;

          if (daysUntilEnd <= noticeDays) {
            // Update status to upcoming if still not_due
            if (dt.renewal_status === 'not_due') {
              await supabase
                .from('deal_terms')
                .update({ renewal_status: 'upcoming', updated_at: new Date().toISOString() })
                .eq('id', dt.id);
            }

            const priority = daysUntilEnd > 60 ? 'medium' : daysUntilEnd > 30 ? 'high' : 'critical';
            const dealName = (dt.deals as any)?.name || 'Deal';
            const dealAmount = (dt.deals as any)?.amount || 0;
            const autoRenewNote = dt.auto_renew ? ' (auto-renew)' : '';

            // Policy gate
            if (!shouldCreateSuggestion(dt.organization_id, priority, 1.0)) {
              continue;
            }

            const dedupKey = `renewal:${dt.deal_id}:${dt.contract_end_date}`;
            const { error: insertErr } = await supabase
              .from('suggested_actions')
              .upsert({
                organization_id: dt.organization_id,
                deal_id: dt.deal_id,
                action_type: 'renewal_outreach',
                title: `Renewal${autoRenewNote}: ${dealName} — ${daysUntilEnd}d`,
                description: `Contract ${dt.auto_renew ? 'auto-renews' : 'expires'} on ${dt.contract_end_date}. ${daysUntilEnd} days remaining.`,
                priority,
                dedup_key: dedupKey,
                reasoning: dt.auto_renew
                  ? 'Confirm renewal terms and pricing before auto-rollover'
                  : 'Begin renewal outreach to prevent churn',
                confidence: 1.0,
                status: 'active',
                expires_at: new Date(endDate.getTime() + 24 * 60 * 60 * 1000).toISOString(),
                evidence: {
                  signals: [{
                    type: 'contract_expiring',
                    description: `Contract ${dt.auto_renew ? 'auto-renews' : 'expires'} in ${daysUntilEnd} days`,
                    value: daysUntilEnd,
                    threshold: noticeDays,
                  }],
                  source_entities: [{
                    entity_type: 'deal',
                    entity_id: dt.deal_id,
                    entity_name: dealName,
                  }],
                  trigger_event: 'renewal_detection',
                  data_points: {
                    contract_end_date: dt.contract_end_date,
                    auto_renew: dt.auto_renew,
                    renewal_notice_days: noticeDays,
                    deal_amount: dealAmount,
                    days_until_end: daysUntilEnd,
                  },
                },
              }, {
                onConflict: 'dedup_key,organization_id',
              });

            if (!insertErr) renewalResults.alerts_created++;
            renewalResults.processed++;
          }
        }
      }
    } catch (err: any) {
      console.error('[periodic-analysis] Renewal batch error:', err);
      results.errors.push(`Renewal batch: ${err.message?.substring(0, 100)}`);
    }

    // ========================================================================
    // BATCH 5: QBR CHECK
    // ========================================================================

    console.log('[periodic-analysis] Batch 5: QBR check');

    const qbrResults = { processed: 0, alerts_created: 0 };

    try {
      const todayUtc2 = new Date().toISOString().split('T')[0];
      const qbrLookahead = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      const { data: qbrTerms, error: qbrError } = await supabase
        .from('deal_terms')
        .select('*, deals!inner(id, name, amount)')
        .neq('renewal_status', 'cancelled')
        .not('next_qbr_date', 'is', null)
        .gte('next_qbr_date', todayUtc2)
        .lte('next_qbr_date', qbrLookahead);

      if (qbrError) {
        console.error('[periodic-analysis] QBR query error:', qbrError);
        results.errors.push(`QBR: ${qbrError.message}`);
      }

      if (qbrTerms && qbrTerms.length > 0) {
        for (const dt of qbrTerms) {
          const dealName = (dt.deals as any)?.name || 'Deal';
          const dealAmount = (dt.deals as any)?.amount || 0;
          const daysUntilQbr = Math.ceil((new Date(dt.next_qbr_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
          const qbrPriority = daysUntilQbr <= 3 ? 'high' : 'medium';

          // Policy gate
          if (!shouldCreateSuggestion(dt.organization_id, qbrPriority, 1.0)) {
            continue;
          }

          const dedupKey = `qbr:${dt.deal_id}:${dt.next_qbr_date}`;

          const { error: insertErr } = await supabase
            .from('suggested_actions')
            .upsert({
              organization_id: dt.organization_id,
              deal_id: dt.deal_id,
              action_type: 'schedule_qbr',
              title: `QBR due: ${dealName} — ${daysUntilQbr === 0 ? 'today' : `in ${daysUntilQbr}d`}`,
              description: `Quarterly Business Review for ${dealName} is ${daysUntilQbr === 0 ? 'today' : `coming up on ${dt.next_qbr_date}`}. Prepare a review deck.`,
              priority: qbrPriority,
              dedup_key: dedupKey,
              reasoning: 'Regular QBRs improve retention and surface expansion opportunities',
              confidence: 1.0,
              status: 'active',
              expires_at: new Date(new Date(dt.next_qbr_date).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
              evidence: {
                signals: [{
                  type: 'qbr_due',
                  description: `QBR ${daysUntilQbr === 0 ? 'is today' : `in ${daysUntilQbr} days`}`,
                  value: daysUntilQbr,
                  threshold: 14,
                }],
                source_entities: [{
                  entity_type: 'deal',
                  entity_id: dt.deal_id,
                  entity_name: dealName,
                }],
                trigger_event: 'qbr_check',
                data_points: {
                  next_qbr_date: dt.next_qbr_date,
                  deal_amount: dealAmount,
                  days_until_qbr: daysUntilQbr,
                },
              },
            }, {
              onConflict: 'dedup_key,organization_id',
            });

          if (!insertErr) qbrResults.alerts_created++;
          qbrResults.processed++;
        }
      }
    } catch (err: any) {
      console.error('[periodic-analysis] QBR batch error:', err);
      results.errors.push(`QBR batch: ${err.message?.substring(0, 100)}`);
    }

    // ========================================================================
    // BATCH 6: OUTCOME MEASUREMENT (Block 1D)
    // ========================================================================

    console.log('[periodic-analysis] Batch 6: Outcome measurement');

    try {
      // Find intervention_outcomes that are past their measurement window and haven't been measured
      const { data: pendingOutcomes, error: outcomeQueryErr } = await supabase
        .from('intervention_outcomes')
        .select('*')
        .is('measured_at', null)
        .lt('action_taken_at', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        .limit(50);

      if (outcomeQueryErr) {
        console.error('[periodic-analysis] Outcome query error:', outcomeQueryErr);
        results.errors.push(`Outcomes: ${outcomeQueryErr.message}`);
      }

      if (pendingOutcomes && pendingOutcomes.length > 0) {
        console.log(`[periodic-analysis] Measuring ${pendingOutcomes.length} intervention outcomes`);

        const tableMap: Record<string, string> = {
          deal: 'deals', contact: 'contacts', account: 'accounts', task: 'tasks', activity: 'activities'
        };

        for (const outcome of pendingOutcomes) {
          try {
            const table = tableMap[outcome.entity_type];
            if (!table) continue;

            // Fetch current entity state
            const { data: currentEntity } = await supabase
              .from(table)
              .select('*')
              .eq('id', outcome.entity_id)
              .maybeSingle();

            if (!currentEntity) {
              // Entity was deleted — mark as neutral
              await supabase
                .from('intervention_outcomes')
                .update({
                  measured_at: new Date().toISOString(),
                  outcome_type: 'neutral',
                  outcome_signal: 'entity_deleted',
                  snapshot_after: null,
                  outcome_delta: {},
                })
                .eq('id', outcome.id);
              results.outcomes.measured++;
              continue;
            }

            const snapshotBefore = outcome.snapshot_before || {};
            const delta: Record<string, any> = {};
            let outcomeType: 'positive' | 'neutral' | 'negative' = 'neutral';
            let outcomeSignal = 'no_change';

            // Compute delta based on entity type
            if (outcome.entity_type === 'deal') {
              const probBefore = snapshotBefore.probability ?? 0;
              const probAfter = currentEntity.probability ?? 0;
              delta.probability_change = probAfter - probBefore;
              delta.stage_before = snapshotBefore.stage;
              delta.stage_after = currentEntity.stage;
              delta.amount_before = snapshotBefore.amount ?? 0;
              delta.amount_after = currentEntity.amount ?? 0;

              if (currentEntity.stage === 'closed_won') {
                outcomeType = 'positive';
                outcomeSignal = 'deal_won';
              } else if (currentEntity.stage === 'closed_lost') {
                outcomeType = 'negative';
                outcomeSignal = 'deal_lost';
              } else if (delta.probability_change > 10) {
                outcomeType = 'positive';
                outcomeSignal = 'probability_increased';
              } else if (delta.probability_change < -10) {
                outcomeType = 'negative';
                outcomeSignal = 'probability_decreased';
              }
            } else if (outcome.entity_type === 'contact') {
              delta.status_before = snapshotBefore.status;
              delta.status_after = currentEntity.status;
              const positiveStatuses = ['sql', 'opportunity', 'customer'];
              if (positiveStatuses.includes(currentEntity.status) && !positiveStatuses.includes(snapshotBefore.status)) {
                outcomeType = 'positive';
                outcomeSignal = 'status_advanced';
              }
            } else if (outcome.entity_type === 'task') {
              if (currentEntity.completed && !snapshotBefore.completed) {
                outcomeType = 'positive';
                outcomeSignal = 'task_completed';
              }
            }

            await supabase
              .from('intervention_outcomes')
              .update({
                measured_at: new Date().toISOString(),
                snapshot_after: currentEntity,
                outcome_type: outcomeType,
                outcome_signal: outcomeSignal,
                outcome_delta: delta,
              })
              .eq('id', outcome.id);

            results.outcomes.measured++;
          } catch (err: any) {
            console.error(`[periodic-analysis] Outcome measurement error ${outcome.id}:`, err.message);
            results.errors.push(`Outcome ${outcome.id}: ${err.message?.substring(0, 100)}`);
          }
        }
      }
    } catch (err: any) {
      console.error('[periodic-analysis] Outcome batch error:', err);
      results.errors.push(`Outcome batch: ${err.message?.substring(0, 100)}`);
    }

    // ========================================================================
    // EMAIL ENGAGEMENT ANOMALY DETECTION (Statistical Baseline)
    // ========================================================================

    let emailAlertCount = 0;
    try {
      const { data: engagementStats } = await supabase
        .from('email_engagement_stats')
        .select('contact_id, avg_gap_days, stddev_gap_days, last_email_sent_at, last_email_received_at, contacts(full_name, company)')
        .not('avg_gap_days', 'is', null)
        .gt('avg_gap_days', 0);

      for (const stat of engagementStats || []) {
        const lastEmail = stat.last_email_sent_at || stat.last_email_received_at;
        if (!lastEmail) continue;

        const daysSinceLastEmail = (Date.now() - new Date(lastEmail).getTime()) / (86400000);
        const threshold = (stat.avg_gap_days || 14) + 2 * (stat.stddev_gap_days || 7);

        if (daysSinceLastEmail > threshold && daysSinceLastEmail > 7) {
          // Check if we already alerted for this contact recently
          const { data: existing } = await supabase
            .from('suggested_actions')
            .select('id')
            .eq('reference_id', stat.contact_id)
            .eq('action_type', 'email_engagement_drop')
            .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
            .maybeSingle();

          if (!existing) {
            const contactName = (stat.contacts as any)?.full_name || 'Contact';
            const company = (stat.contacts as any)?.company || '';
            await supabase.from('suggested_actions').insert({
              user_id: userId,
              organization_id: orgId,
              action_type: 'email_engagement_drop',
              title: `Email gap with ${contactName}${company ? ` (${company})` : ''}`,
              description: `You usually email every ${Math.round(stat.avg_gap_days)} days, but it's been ${Math.round(daysSinceLastEmail)} days. Consider following up.`,
              reference_id: stat.contact_id,
              reference_type: 'contact',
              priority: daysSinceLastEmail > threshold * 2 ? 'high' : 'medium',
            });
            emailAlertCount++;
          }
        }
      }
      if (emailAlertCount > 0) {
        console.log(`[periodic-analysis] Created ${emailAlertCount} email engagement alerts`);
      }
    } catch (emailErr: any) {
      console.warn('[periodic-analysis] Email engagement check failed:', emailErr.message);
    }

    // ========================================================================
    // DONE
    // ========================================================================

    const processingTime = Date.now() - startTime;
    console.log(`[periodic-analysis] Run completed in ${processingTime}ms`, {
      ...results,
      renewal: renewalResults,
      qbr: qbrResults,
    });

    return new Response(
      JSON.stringify({
        status: 'success',
        results,
        processing_time_ms: processingTime,
        completed_at: new Date().toISOString()
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[periodic-analysis] Fatal error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
