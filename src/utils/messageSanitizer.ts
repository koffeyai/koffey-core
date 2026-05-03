/**
 * Message sanitization utilities for cleaning LLM output before rendering.
 * Addresses BUG-001 (raw tool call syntax leak) and BUG-002 (garbled output detection).
 */

// Patterns that indicate raw tool call syntax leaked from the LLM
const TOOL_CALL_PATTERNS = [
  /<\|tool_call.*?\|>/gs,              // OpenAI-style tool call markers
  /<\|\/tool_call\|>/g,                // OpenAI-style closing markers
  /<tool_call>[\s\S]*?<\/tool_call>/g, // XML-style tool calls
  /<function_call>[\s\S]*?<\/function_call>/g, // Function call blocks
  /```tool_code[\s\S]*?```/g,          // Fenced tool code blocks
  /\{"name"\s*:\s*"(search_crm|create_deal|create_contact|create_account|update_deal|update_contact|update_account|create_task|complete_task|get_pipeline_stats|get_sales_cycle_analytics|analyze_deal|check_availability|send_scheduling_email|draft_email|generate_presentation|enrich_contacts|semantic_search_crm)"\s*,\s*"arguments"\s*:/g, // Raw JSON tool invocations
];

// Patterns that indicate garbled/gibberish output
const GARBLED_INDICATORS = {
  // Repetitive token: same 3+ char sequence repeated 5+ times
  repetitiveToken: /(.{3,})\1{4,}/,
  // Excessive special characters (more than 40% non-alphanumeric, excluding markdown)
  excessiveSpecialChars: (text: string): boolean => {
    const stripped = text.replace(/[\s\n\r#*_\-|`>[\]()!.,:;'"$%@&+=~^{}/<>\\]/g, '');
    const nonAlpha = stripped.replace(/[a-zA-Z0-9]/g, '');
    return stripped.length > 20 && nonAlpha.length / stripped.length > 0.4;
  },
  // Language mixing: CJK characters mixed with Latin in a way that suggests corruption
  languageMixing: /[a-zA-Z]{3,}[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff]{2,}[a-zA-Z]{3,}/,
  // Extremely long "word" (100+ chars without spaces) - likely base64 or corrupted
  longWord: /\S{100,}/,
};

/**
 * Strip raw tool call syntax from LLM output.
 * Returns the cleaned text.
 */
function stripToolCallSyntax(text: string): string {
  let cleaned = text;
  for (const pattern of TOOL_CALL_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }
  // Clean up leftover whitespace from removals
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
  return cleaned;
}

/**
 * Detect if the output appears garbled/gibberish.
 * Returns true if the text appears corrupted.
 */
function isGarbledOutput(text: string): boolean {
  if (!text || text.length < 20) return false;

  if (GARBLED_INDICATORS.repetitiveToken.test(text)) return true;
  if (GARBLED_INDICATORS.excessiveSpecialChars(text)) return true;
  if (GARBLED_INDICATORS.languageMixing.test(text)) return true;
  if (GARBLED_INDICATORS.longWord.test(text)) return true;

  return false;
}

/**
 * Detect if a response is primarily a raw JSON object that leaked from the LLM
 * instead of being executed as a tool call (P1-5: raw JSON filter leak).
 */
function isRawJsonLeak(text: string): boolean {
  const trimmed = text.trim();
  // Check if the entire response is a JSON object
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      // If it has keys that look like filter/query params, it's a leaked filter
      if (typeof parsed === 'object' && parsed !== null) {
        const keys = Object.keys(parsed);
        const filterKeys = ['filter', 'filters', 'query', 'entity_type', 'stage', 'close_date', 'sort_by', 'probability'];
        if (keys.some(k => filterKeys.includes(k))) return true;
      }
    } catch {
      // Not valid JSON, not a leak
    }
  }
  // Check for JSON embedded in a short response (e.g., "Here: {"filter": ...}")
  const jsonMatch = trimmed.match(/\{[^}]{20,}\}/);
  if (jsonMatch && jsonMatch[0].length > trimmed.length * 0.5) {
    try {
      JSON.parse(jsonMatch[0]);
      return true; // More than half the response is a JSON object
    } catch {
      // Not valid JSON
    }
  }
  return false;
}

const FALLBACK_MESSAGE = "I had trouble generating a clear response. Could you rephrase your question?";

/**
 * Sanitize an assistant message before rendering.
 * 1. Strips raw tool call syntax (BUG-001)
 * 2. Detects and replaces garbled output (BUG-002)
 * Returns the sanitized text.
 */
export function sanitizeAssistantMessage(text: string): string {
  if (!text) return text;

  // Step 1: Strip tool call artifacts
  let sanitized = stripToolCallSyntax(text);

  // Step 2: If remaining content is empty after stripping, return fallback
  if (!sanitized.trim()) {
    return FALLBACK_MESSAGE;
  }

  // Step 3: Check for raw JSON leak (filter objects returned as response)
  if (isRawJsonLeak(sanitized)) {
    console.warn('[messageSanitizer] Raw JSON filter leak detected, replacing with fallback');
    return "I tried to search your CRM but the query didn't execute properly. Could you rephrase your question?";
  }

  // Step 4: Check for garbled output
  if (isGarbledOutput(sanitized)) {
    console.warn('[messageSanitizer] Garbled output detected, replacing with fallback');
    return FALLBACK_MESSAGE;
  }

  return sanitized;
}
