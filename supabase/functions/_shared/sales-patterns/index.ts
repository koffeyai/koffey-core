/**
 * Sales Patterns Module
 * Central export for all sales terminology pattern matching utilities
 * 
 * Architecture:
 * - patterns-core.ts: Always loaded - regex patterns for detection
 * - llm-instructions.ts: Loaded when AI is called - context prompts
 * - reference-metadata.ts: Lazy-loaded on demand - acronym expansions
 * - pattern-matcher.ts: Utility functions for pattern analysis
 */

// Core patterns (always available)
export {
  PATTERNS_VERSION,
  PATTERN_FLAGS,
  CATEGORY_PATTERNS,
  HEALTH_INDICATORS,
  COMPOSITE_PATTERNS,
  VALIDATION_PATTERNS,
  SENTIMENT_RANGES
} from './patterns-core.ts';

// LLM instructions (loaded when calling AI)
export {
  INSTRUCTIONS_VERSION,
  CATEGORY_INSTRUCTIONS,
  COMPOSITE_PROMPTS,
  OUTPUT_FORMATS,
  buildContextInstructions,
  getCompositePrompt
} from './llm-instructions.ts';

// Pattern matcher utilities
export {
  analyzeMessage,
  hasSalesContext,
  getRelevantCategories,
  enhanceSystemPrompt,
  extractMetrics
} from './pattern-matcher.ts';

export type {
  PatternMatch,
  HealthMatch,
  PatternAnalysis
} from './pattern-matcher.ts';

// Reference metadata (lazy load on demand)
// Use: const { ACRONYMS, expandAcronym } = await import('./reference-metadata.ts');
export async function loadReferenceMetadata() {
  return await import('./reference-metadata.ts');
}
