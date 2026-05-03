import type { SkillDomain } from '../skills/types.ts';
import {
  interpretMessageIntent as interpretMessageIntentInternal,
  interpretMessageIntentHeuristic as interpretMessageIntentHeuristicInternal,
  normalizeEntityHint as normalizeEntityHintInternal,
  shouldForceDeterministicPath as shouldForceDeterministicPathInternal,
} from './interpret-message.mjs';

export type IntentKind =
  | 'deal_analysis'
  | 'pipeline_summary'
  | 'pipeline_window'
  | 'entity_lookup'
  | 'message_history'
  | 'drafting'
  | 'crm_mutation'
  | 'crm_lookup'
  | 'small_talk'
  | 'unknown';

export type ExecutionPath = 'scoutpad' | 'analytics' | 'standard' | 'none';
export type IntentEntityType = 'deal' | 'contact' | 'account' | null;
export type IntentClassificationSource = 'model' | 'heuristic' | 'context' | 'hybrid';

export interface IntentTimeRangeHint {
  kind:
    | 'relative_months'
    | 'relative_weeks'
    | 'relative_days'
    | 'quarter_end'
    | 'season'
    | 'absolute_month'
    | 'absolute_range'
    | 'soon'
    | 'unspecified';
  raw: string;
  value?: number;
  quarter?: 1 | 2 | 3 | 4;
  month?: number;
  season?: 'spring' | 'summer' | 'fall' | 'winter';
}

export interface ResolvedTimeRange {
  start: string;
  end: string;
  resolution: 'day' | 'week' | 'month' | 'quarter' | 'season' | 'range';
}

export interface IntentFilters {
  owner?: 'current_user' | 'team';
  stages?: string[];
}

export interface IntentContext {
  entityContext?: {
    primaryEntity?: { type?: string; id?: string; name?: string };
    referencedEntities?: Record<string, Array<{ id: string; name: string }>>;
  } | null;
  activeContext?: {
    lastEntityType?: string;
    lastEntityIds?: string[];
    lastEntityNames?: string[];
  } | null;
  channel?: 'web' | 'whatsapp' | 'telegram' | 'sms';
  historyText?: string;
}

export interface IntentContract {
  version: 'intent-v2';
  classificationSource: IntentClassificationSource;
  intent: IntentKind;
  executionPath: ExecutionPath;
  entityType: IntentEntityType;
  entityHintRaw: string | null;
  entityHint: string | null;
  entityId: string | null;
  zoomLevel: 'tactical' | 'strategic' | null;
  confidence: number;
  forcePath: boolean;
  domains: SkillDomain[];
  isFollowUp: boolean;
  isCompound: boolean;
  isDataOrAction: boolean;
  mutationIntent: boolean;
  timeRangeHint: IntentTimeRangeHint | null;
  resolvedTimeRange: ResolvedTimeRange | null;
  filters: IntentFilters | null;
}

export interface IntentInterpreterOverrides {
  extractor?: (message: string, context: IntentContext) => Promise<unknown>;
  now?: Date;
}

export async function interpretMessageIntent(
  message: string,
  context?: IntentContext,
  overrides?: IntentInterpreterOverrides,
): Promise<IntentContract> {
  return await interpretMessageIntentInternal(message, context, overrides) as IntentContract;
}

export function interpretMessageIntentHeuristic(
  message: string,
  context?: IntentContext,
  overrides?: IntentInterpreterOverrides,
): IntentContract {
  return interpretMessageIntentHeuristicInternal(message, context, overrides) as IntentContract;
}

export function normalizeEntityHint(
  name: string,
  options?: { entityType?: IntentEntityType },
): string | null {
  return normalizeEntityHintInternal(name, options);
}

export function shouldForceDeterministicPath(contract: IntentContract): boolean {
  return shouldForceDeterministicPathInternal(contract);
}
