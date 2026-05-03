import type { SkillDomain } from './types.ts';
import { estimateRelevantDomains as estimateRelevantDomainsInternal } from './domain-estimator.mjs';

export function estimateRelevantDomains(message: string): SkillDomain[] {
  return estimateRelevantDomainsInternal(message) as SkillDomain[];
}
