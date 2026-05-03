/**
 * Centralized AI Configuration
 * Single source of truth for all LLM settings across edge functions
 *
 * Runtime default: Kimi is primary.
 */

function firstEnv(keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return fallback;
}

const KIMI_MODEL_LITE = firstEnv(['KIMI_MODEL_LITE', 'MOONSHOT_MODEL_LITE'], 'moonshot-v1-8k');
const KIMI_MODEL_STANDARD = firstEnv(['KIMI_MODEL_STANDARD', 'MOONSHOT_MODEL_STANDARD'], 'moonshot-v1-32k');
const KIMI_MODEL_PRO = firstEnv(
  ['KIMI_MODEL_PRO', 'MOONSHOT_MODEL_PRO', 'KIMI_MODEL', 'MOONSHOT_MODEL'],
  'kimi-k2.6',
);
const KIMI_API_URL = Deno.env.get('KIMI_BASE_URL')
  || Deno.env.get('MOONSHOT_BASE_URL')
  || 'https://api.moonshot.ai/v1/chat/completions';

// Model tiers
export const MODEL_TIERS = {
  lite: {
    model: KIMI_MODEL_LITE,
    maxTokens: 512,
    temperature: 0.1,
  },
  standard: {
    model: KIMI_MODEL_STANDARD,
    maxTokens: 2048,
    temperature: 0.3,
  },
  pro: {
    model: KIMI_MODEL_PRO,
    maxTokens: 4096,
    temperature: 0.5,
  },
} as const;

export const AI_CONFIG = {
  // Primary provider
  provider: 'kimi' as const,

  // Default model
  model: KIMI_MODEL_PRO,

  // Models by tier
  models: {
    lite: KIMI_MODEL_LITE,
    standard: KIMI_MODEL_STANDARD,
    pro: KIMI_MODEL_PRO,
  },
  
  // API endpoint
  apiUrl: KIMI_API_URL,
  
  // Default parameters
  defaultTemperature: 0.3,
  defaultMaxTokens: 4096,
  
  // For intent classification
  intentClassification: {
    model: KIMI_MODEL_LITE,
    temperature: 0.0,
    maxTokens: 500,
  },
  
  // For natural language generation
  generation: {
    model: KIMI_MODEL_STANDARD,
    temperature: 0.7,
    maxTokens: 2048,
  },
  
  // For structured data extraction
  extraction: {
    model: KIMI_MODEL_STANDARD,
    temperature: 0.3,
    maxTokens: 2048,
  },
  
  // For complex analytics
  analytics: {
    model: KIMI_MODEL_PRO,
    temperature: 0.5,
    maxTokens: 4096,
  },
} as const;

/**
 * Backward-compatible header helper.
 * Uses LM Studio key first, then Groq key.
 */
export function getGroqHeaders(): HeadersInit {
  const apiKey =
    Deno.env.get('KIMI_API_KEY')
    || Deno.env.get('MOONSHOT_API_KEY')
    || Deno.env.get('LMSTUDIO_API_KEY')
    || Deno.env.get('GROQ_API_KEY');
  if (!apiKey) {
    throw new Error('KIMI_API_KEY not configured');
  }
  return {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Check if an API key is available
 */
export function hasGroqApiKey(): boolean {
  return !!(
    Deno.env.get('KIMI_API_KEY')
    || Deno.env.get('MOONSHOT_API_KEY')
    || Deno.env.get('LMSTUDIO_API_KEY')
    || Deno.env.get('GROQ_API_KEY')
  );
}

/**
 * Create a standard Groq API request body
 */
export function createGroqRequestBody(
  messages: Array<{ role: string; content: string }>,
  options: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  } = {}
): string {
  const body: Record<string, unknown> = {
    model: AI_CONFIG.model,
    messages,
    temperature: options.temperature ?? AI_CONFIG.defaultTemperature,
    max_tokens: options.maxTokens ?? AI_CONFIG.defaultMaxTokens,
  };
  
  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }
  
  return JSON.stringify(body);
}

// Legacy aliases for backward compatibility
export const getGeminiHeaders = getGroqHeaders;
export const hasGeminiApiKey = hasGroqApiKey;
export const createGeminiRequestBody = createGroqRequestBody;
