/**
 * Pattern Matcher Utility
 * Detects sales terminology in messages and provides context-aware processing
 */

import { CATEGORY_PATTERNS, HEALTH_INDICATORS, COMPOSITE_PATTERNS, SENTIMENT_RANGES } from './patterns-core.ts';
import { CATEGORY_INSTRUCTIONS, buildContextInstructions, getCompositePrompt } from './llm-instructions.ts';

export interface PatternMatch {
  category: string;
  matches: string[];
  label?: string;
}

export interface HealthMatch {
  term: string;
  score: number;
  risk: string;
}

export interface PatternAnalysis {
  categories: PatternMatch[];
  healthIndicators: HealthMatch[];
  aggregateSentiment: number;
  sentimentLevel: string;
  hasUrgency: boolean;
  hasRisk: boolean;
  contextInstructions: string;
  compositePrompt: string | null;
}

/**
 * Analyze a message for sales patterns
 */
export function analyzeMessage(message: string): PatternAnalysis {
  const categories: PatternMatch[] = [];
  const healthIndicators: HealthMatch[] = [];
  let totalSentiment = 0;
  let sentimentCount = 0;
  
  // Match category patterns
  for (const [category, config] of Object.entries(CATEGORY_PATTERNS)) {
    // Reset regex lastIndex
    const pattern = new RegExp(config.pattern.source, config.pattern.flags);
    const matches: string[] = [];
    let match;
    
    while ((match = pattern.exec(message)) !== null) {
      matches.push(match[0]);
    }
    
    if (matches.length > 0) {
      categories.push({
        category,
        matches,
        label: CATEGORY_INSTRUCTIONS[category]?.label
      });
    }
  }
  
  // Match health indicators
  for (const indicator of HEALTH_INDICATORS) {
    const pattern = new RegExp(indicator.pattern.source, indicator.pattern.flags);
    if (pattern.test(message)) {
      healthIndicators.push({
        term: indicator.term,
        score: indicator.score,
        risk: indicator.risk
      });
      totalSentiment += indicator.score;
      sentimentCount++;
    }
  }
  
  // Calculate aggregate sentiment
  const aggregateSentiment = sentimentCount > 0 ? totalSentiment / sentimentCount : 0;
  
  // Determine sentiment level
  let sentimentLevel = "neutral";
  if (aggregateSentiment <= SENTIMENT_RANGES.critical.max) {
    sentimentLevel = "critical";
  } else if (aggregateSentiment <= SENTIMENT_RANGES.risk.max) {
    sentimentLevel = "risk";
  } else if (aggregateSentiment >= SENTIMENT_RANGES.strong.min) {
    sentimentLevel = "strong";
  } else if (aggregateSentiment >= SENTIMENT_RANGES.good.min) {
    sentimentLevel = "good";
  }
  
  // Check composite patterns
  const urgencyPattern = new RegExp(COMPOSITE_PATTERNS.urgency.source, COMPOSITE_PATTERNS.urgency.flags);
  const riskPattern = new RegExp(COMPOSITE_PATTERNS.risk.source, COMPOSITE_PATTERNS.risk.flags);
  
  const hasUrgency = urgencyPattern.test(message);
  const hasRisk = riskPattern.test(message);
  
  // Build context-aware instructions
  const detectedCategories = categories.map(c => c.category);
  const contextInstructions = buildContextInstructions(detectedCategories);
  const compositePrompt = getCompositePrompt(detectedCategories);
  
  return {
    categories,
    healthIndicators,
    aggregateSentiment,
    sentimentLevel,
    hasUrgency,
    hasRisk,
    contextInstructions,
    compositePrompt
  };
}

/**
 * Quick check if message contains any sales terminology
 */
export function hasSalesContext(message: string): boolean {
  const allPattern = new RegExp(COMPOSITE_PATTERNS.all.source, COMPOSITE_PATTERNS.all.flags);
  return allPattern.test(message);
}

/**
 * Get relevant categories for a message (lightweight check)
 */
export function getRelevantCategories(message: string): string[] {
  const categories: string[] = [];
  
  for (const [category, config] of Object.entries(CATEGORY_PATTERNS)) {
    const pattern = new RegExp(config.pattern.source, config.pattern.flags);
    if (pattern.test(message)) {
      categories.push(category);
    }
  }
  
  return categories;
}

/**
 * Build enhanced system prompt with sales context
 */
export function enhanceSystemPrompt(basePrompt: string, message: string): string {
  const analysis = analyzeMessage(message);
  
  if (analysis.categories.length === 0) {
    return basePrompt;
  }
  
  let enhanced = basePrompt;
  
  // Add context instructions
  if (analysis.contextInstructions) {
    enhanced += analysis.contextInstructions;
  }
  
  // Add composite prompt if applicable
  if (analysis.compositePrompt) {
    enhanced += `\n\n## Analysis Focus\n${analysis.compositePrompt}`;
  }
  
  // Add sentiment context if health indicators detected
  if (analysis.healthIndicators.length > 0) {
    enhanced += `\n\n## Deal Health Context\nSentiment Level: ${analysis.sentimentLevel} (score: ${analysis.aggregateSentiment.toFixed(2)})`;
    if (analysis.hasRisk) {
      enhanced += "\n⚠️ Risk indicators detected - prioritize mitigation recommendations.";
    }
    if (analysis.hasUrgency) {
      enhanced += "\n⏰ Urgency detected - consider timeline implications.";
    }
  }
  
  return enhanced;
}

/**
 * Extract metrics values from message
 */
export function extractMetrics(message: string): { type: string; value: string }[] {
  const metrics: { type: string; value: string }[] = [];
  
  if (CATEGORY_PATTERNS.metrics.extractRevenue) {
    const revenuePattern = new RegExp(
      CATEGORY_PATTERNS.metrics.extractRevenue.source, 
      CATEGORY_PATTERNS.metrics.extractRevenue.flags
    );
    let match;
    while ((match = revenuePattern.exec(message)) !== null) {
      metrics.push({ type: match[1], value: match[2] });
    }
  }
  
  if (CATEGORY_PATTERNS.metrics.extractContractValue) {
    const cvPattern = new RegExp(
      CATEGORY_PATTERNS.metrics.extractContractValue.source, 
      CATEGORY_PATTERNS.metrics.extractContractValue.flags
    );
    let match;
    while ((match = cvPattern.exec(message)) !== null) {
      metrics.push({ type: match[1], value: match[2] });
    }
  }
  
  return metrics;
}
