// Centralized deal stage definitions and probability helpers

export const DEAL_STAGES = [
  { value: 'prospecting', label: 'Prospecting', probability: 10 },
  { value: 'qualified', label: 'Qualified', probability: 25 },
  { value: 'proposal', label: 'Proposal', probability: 50 },
  { value: 'negotiation', label: 'Negotiation', probability: 75 },
  { value: 'closed-won', label: 'Closed Won', probability: 100 },
  { value: 'closed-lost', label: 'Closed Lost', probability: 0 }
] as const;

export type DealStage = typeof DEAL_STAGES[number]['value'];
export type ProbabilitySource = 'stage_default' | 'manual' | 'ai_suggested' | 'imported';

/**
 * Get the default probability for a given deal stage
 */
export const getDefaultProbability = (stage: string): number => {
  return DEAL_STAGES.find(s => s.value === stage)?.probability ?? 0;
};

/**
 * Get the human-readable label for a deal stage
 */
export const getStageLabel = (stage: string): string => {
  return DEAL_STAGES.find(s => s.value === stage)?.label ?? stage;
};

/**
 * Check if a probability has been manually overridden from the stage default
 */
export const isProbabilityOverridden = (stage: string, probability: number | null): boolean => {
  if (probability === null || probability === undefined) return false;
  return probability !== getDefaultProbability(stage);
};
