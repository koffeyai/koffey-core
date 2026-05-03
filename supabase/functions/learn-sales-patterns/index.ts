import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getServiceRoleClient, isInternalServiceCall } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

type LearningEvent = {
  id: string;
  organization_id: string;
  deal_id: string | null;
  event_type: 'interaction' | 'outcome';
  segment_key: string | null;
  industry: string | null;
  amount_band: string | null;
  outcome_label: 'won' | 'lost' | null;
  objection_key: string | null;
  feature_key: string | null;
  metadata: Record<string, any> | null;
  occurred_at: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function computeConfidence(support: number, lift: number): number {
  const base = 0.45 + support / 30 + Math.abs(lift) * 0.8;
  return Number(clamp(base, 0.5, 0.95).toFixed(3));
}

function rankScore(confidence: number, support: number, lift: number): number {
  return Number((confidence * 0.65 + Math.min(support / 50, 1) * 0.2 + Math.min(Math.abs(lift), 0.5) * 0.15).toFixed(4));
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, '_').slice(0, 80);
}

function truncateText(input: string, maxChars: number): string {
  if (input.length <= maxChars) return input;
  return `${input.slice(0, maxChars - 1)}…`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    if (!isInternalServiceCall(req)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: internal service call required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const lookbackDays = clamp(Number(body.lookback_days) || 180, 30, 730);
    const targetOrg = body.organization_id ? String(body.organization_id) : null;

    const supabase = getServiceRoleClient();
    const sinceIso = new Date(Date.now() - lookbackDays * 24 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('sales_learning_events')
      .select('id, organization_id, deal_id, event_type, segment_key, industry, amount_band, outcome_label, objection_key, feature_key, metadata, occurred_at')
      .gte('occurred_at', sinceIso)
      .order('occurred_at', { ascending: false })
      .limit(20000);

    if (targetOrg) {
      query = query.eq('organization_id', targetOrg);
    }

    const { data: events, error } = await query;
    if (error) throw error;

    const byOrg = new Map<string, LearningEvent[]>();
    for (const raw of (events || []) as LearningEvent[]) {
      if (!byOrg.has(raw.organization_id)) byOrg.set(raw.organization_id, []);
      byOrg.get(raw.organization_id)!.push(raw);
    }

    let totalProfiles = 0;
    let orgsProcessed = 0;

    for (const [orgId, orgEvents] of byOrg.entries()) {
      orgsProcessed++;

      const outcomes = orgEvents.filter((e) => e.event_type === 'outcome' && (e.outcome_label === 'won' || e.outcome_label === 'lost'));
      if (outcomes.length < 5) {
        continue;
      }

      const baseWinRate = outcomes.filter((o) => o.outcome_label === 'won').length / outcomes.length;
      const segmentKeys = new Set<string>(['all']);
      outcomes.forEach((o) => {
        if (o.segment_key) segmentKeys.add(o.segment_key);
      });

      const profiles: Array<Record<string, any>> = [];

      const outcomeByDeal = new Map<string, 'won' | 'lost'>();
      for (const o of outcomes) {
        if (o.deal_id) outcomeByDeal.set(o.deal_id, o.outcome_label as 'won' | 'lost');
      }

      const interactionEvents = orgEvents.filter((e) => e.event_type === 'interaction');

      for (const segmentKey of segmentKeys) {
        const segmentOutcomes = segmentKey === 'all'
          ? outcomes
          : outcomes.filter((o) => o.segment_key === segmentKey);

        if (segmentOutcomes.length < 5) continue;

        const segmentWinRate = segmentOutcomes.filter((o) => o.outcome_label === 'won').length / segmentOutcomes.length;

        const segmentLift = segmentWinRate - baseWinRate;
        if (segmentKey !== 'all' && segmentOutcomes.length >= 8) {
          const segmentLabel = segmentKey.replace('industry:', '').replace('|amount:', ' | ');
          const recommendationType = segmentLift >= 0.1 ? 'pursue_segment' : segmentLift <= -0.1 ? 'avoid_segment' : null;
          if (recommendationType) {
            const confidence = computeConfidence(segmentOutcomes.length, segmentLift);
            profiles.push({
              organization_id: orgId,
              segment_key: 'all',
              recommendation_type: recommendationType,
              item_key: normalizeKey(segmentKey),
              item_label: segmentLabel,
              guidance_text: truncateText(
                recommendationType === 'pursue_segment'
                  ? `Prioritize ${segmentLabel}: observed win-rate outperformance in recent outcomes.`
                  : `Be selective with ${segmentLabel}: observed win-rate underperformance in recent outcomes.`,
                180
              ),
              confidence,
              lift: Number(segmentLift.toFixed(4)),
              support_count: segmentOutcomes.length,
              rank_score: rankScore(confidence, segmentOutcomes.length, segmentLift),
              metadata: {
                baseline_win_rate: Number(baseWinRate.toFixed(4)),
                segment_win_rate: Number(segmentWinRate.toFixed(4)),
              },
              last_computed_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            });
          }
        }

        // Feature effectiveness from outcome metadata.products_positioned
        const featureStats = new Map<string, { total: number; wins: number }>();
        for (const o of segmentOutcomes) {
          const features: string[] = Array.isArray(o.metadata?.products_positioned) ? o.metadata.products_positioned : [];
          for (const fRaw of features) {
            const f = normalizeKey(String(fRaw));
            if (!f) continue;
            if (!featureStats.has(f)) featureStats.set(f, { total: 0, wins: 0 });
            const entry = featureStats.get(f)!;
            entry.total++;
            if (o.outcome_label === 'won') entry.wins++;
          }
        }

        for (const [feature, stat] of featureStats.entries()) {
          if (stat.total < 3) continue;
          const featureWinRate = stat.wins / stat.total;
          const lift = featureWinRate - segmentWinRate;
          if (Math.abs(lift) < 0.08) continue;

          const recommendationType = lift > 0 ? 'promote_feature' : 'deprioritize_feature';
          const confidence = computeConfidence(stat.total, lift);

          profiles.push({
            organization_id: orgId,
            segment_key: segmentKey,
            recommendation_type: recommendationType,
            item_key: feature,
            item_label: feature.replaceAll('_', ' '),
            guidance_text: truncateText(
              lift > 0
                ? `Lead with ${feature.replaceAll('_', ' ')} for this segment; observed higher close performance.`
                : `${feature.replaceAll('_', ' ')} underperforms in this segment; deprioritize unless strongly validated.`,
              180
            ),
            confidence,
            lift: Number(lift.toFixed(4)),
            support_count: stat.total,
            rank_score: rankScore(confidence, stat.total, lift),
            metadata: {
              segment_win_rate: Number(segmentWinRate.toFixed(4)),
              feature_win_rate: Number(featureWinRate.toFixed(4)),
            },
            last_computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }

        // Objection handling effectiveness from interaction events linked to deals
        const objectionStats = new Map<string, { total: number; wins: number }>();
        const relevantDeals = new Set(segmentOutcomes.map((o) => o.deal_id).filter(Boolean) as string[]);
        for (const iEvt of interactionEvents) {
          if (!iEvt.deal_id || !iEvt.objection_key || !relevantDeals.has(iEvt.deal_id)) continue;
          const outcome = outcomeByDeal.get(iEvt.deal_id);
          if (!outcome) continue;

          const key = normalizeKey(iEvt.objection_key);
          if (!objectionStats.has(key)) objectionStats.set(key, { total: 0, wins: 0 });
          const s = objectionStats.get(key)!;
          s.total++;
          if (outcome === 'won') s.wins++;
        }

        for (const [objection, stat] of objectionStats.entries()) {
          if (stat.total < 3) continue;
          const objectionWinRate = stat.wins / stat.total;
          const lift = objectionWinRate - segmentWinRate;
          const confidence = computeConfidence(stat.total, lift);

          profiles.push({
            organization_id: orgId,
            segment_key: segmentKey,
            recommendation_type: 'handle_objection',
            item_key: objection,
            item_label: objection.replaceAll('_', ' '),
            guidance_text: truncateText(
              lift >= 0
                ? `For ${objection.replaceAll('_', ' ')} objections, use the current playbook pattern; outcomes are holding up.`
                : `For ${objection.replaceAll('_', ' ')} objections, strengthen qualification and evidence earlier in cycle.`,
              180
            ),
            confidence,
            lift: Number(lift.toFixed(4)),
            support_count: stat.total,
            rank_score: rankScore(confidence, stat.total, lift),
            metadata: {
              segment_win_rate: Number(segmentWinRate.toFixed(4)),
              objection_win_rate: Number(objectionWinRate.toFixed(4)),
            },
            last_computed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }

      // Keep only strongest recommendations per org/segment/type/item
      const dedup = new Map<string, Record<string, any>>();
      for (const p of profiles) {
        const key = `${p.segment_key}::${p.recommendation_type}::${p.item_key}`;
        const existing = dedup.get(key);
        if (!existing || p.rank_score > existing.rank_score) {
          dedup.set(key, p);
        }
      }

      const finalProfiles = [...dedup.values()]
        .sort((a, b) => b.rank_score - a.rank_score)
        .slice(0, 200);

      await supabase.from('sales_learning_profiles').delete().eq('organization_id', orgId);

      if (finalProfiles.length > 0) {
        const { error: upsertError } = await supabase
          .from('sales_learning_profiles')
          .upsert(finalProfiles, { onConflict: 'organization_id,segment_key,recommendation_type,item_key' });

        if (upsertError) throw upsertError;
      }

      totalProfiles += finalProfiles.length;
    }

    return new Response(
      JSON.stringify({
        success: true,
        lookback_days: lookbackDays,
        orgs_processed: orgsProcessed,
        profiles_written: totalProfiles,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[learn-sales-patterns] error:', e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
