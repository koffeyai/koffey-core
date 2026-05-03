import { routeRequest, getModelForComplexity } from '../../_shared/complexity-router.ts';

export const TIER_ORDER: Record<'lite' | 'standard' | 'pro', number> = {
  lite: 0,
  standard: 1,
  pro: 2,
};

export function applyMinimumRoutingTier(
  routing: ReturnType<typeof routeRequest>,
  minimumTier: 'lite' | 'standard' | 'pro'
): ReturnType<typeof routeRequest> {
  if (TIER_ORDER[routing.tier] >= TIER_ORDER[minimumTier]) return routing;
  const floor = getModelForComplexity(minimumTier);
  return {
    ...routing,
    tier: minimumTier,
    temperature: floor.temperature,
    maxTokens: Math.max(routing.maxTokens, floor.maxTokens),
    reason: `${routing.reason}; policy_floor=${minimumTier}`,
  };
}

export function shouldTaskClassRequireTools(taskClass: string | null | undefined): boolean {
  return ['crm_read', 'crm_write', 'analytics', 'scoutpad'].includes(String(taskClass || '').trim());
}

export function shouldRetrievalPlanRequireTools(retrievalPlan: { path?: string | null } | null | undefined): boolean {
  const path = String(retrievalPlan?.path || '').trim();
  return [
    'scoutpad',
    'pipeline_context',
    'deal_context',
    'contact_context',
    'entity_messages',
    'draft_with_context',
    'planner_fallback',
  ].includes(path);
}

export function shouldDeferDeterministicMutationPlan(params: {
  intentConfidence?: number | null;
  retrievalPlan?: { path?: string | null } | null;
  hasPendingDealContext?: boolean | null;
}): boolean {
  if (params.hasPendingDealContext) return false;
  const confidence = Number(params.intentConfidence || 0);
  if (confidence < 0.75) return false;
  const path = String(params.retrievalPlan?.path || '').trim();
  if (!path || path === 'none') return false;
  return path !== 'planner_fallback';
}

export function shouldUseLiveForcedRetrievalPlan(params: {
  shouldHonorRetrievalPlan?: boolean | null;
  retrievalPlan?: { path?: string | null; forcedTool?: string | null } | null;
  deterministicPendingDealPlanAvailable?: boolean | null;
}): boolean {
  if (!params.shouldHonorRetrievalPlan) return false;

  const path = String(params.retrievalPlan?.path || '').trim();
  const forcedTool = String(params.retrievalPlan?.forcedTool || '').trim();
  if (!path || !forcedTool) return false;
  if (params.deterministicPendingDealPlanAvailable) return false;

  return ['pipeline_context', 'deal_context', 'contact_context', 'entity_messages'].includes(path);
}

export function shouldApplyPreferredRetrievalToolFilter(params: {
  shouldHonorRetrievalPlan?: boolean | null;
  retrievalPlan?: { preferredTools?: string[] | null } | null;
  hasPendingDealContext?: boolean | null;
}): boolean {
  if (!params.shouldHonorRetrievalPlan) return false;
  if (params.hasPendingDealContext) return false;

  const preferredTools = Array.isArray(params.retrievalPlan?.preferredTools)
    ? params.retrievalPlan.preferredTools.filter((tool) => String(tool || '').trim().length > 0)
    : [];

  return preferredTools.length > 0;
}
