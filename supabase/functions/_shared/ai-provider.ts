/**
 * Unified AI Provider
 *
 * Default runtime mode is Kimi first.
 * Provider order can be overridden with AI_PROVIDER_PRIORITY.
 */

export type ModelTier = 'lite' | 'standard' | 'pro';

export interface ProviderConfig {
  name: string;
  url: string;
  getKey: () => string | undefined;
  isEnabled?: () => boolean;
  models: Record<ModelTier, string>;
}

function firstEnv(keys: string[], fallback: string): string {
  for (const key of keys) {
    const value = Deno.env.get(key)?.trim();
    if (value) return value;
  }
  return fallback;
}

const KIMI_TIERED_MODELS = {
  lite: firstEnv(['KIMI_MODEL_LITE', 'MOONSHOT_MODEL_LITE'], 'moonshot-v1-8k'),
  standard: firstEnv(['KIMI_MODEL_STANDARD', 'MOONSHOT_MODEL_STANDARD'], 'moonshot-v1-32k'),
  pro: firstEnv(['KIMI_MODEL_PRO', 'MOONSHOT_MODEL_PRO', 'KIMI_MODEL', 'MOONSHOT_MODEL'], 'kimi-k2.6'),
} as const;

export const PROVIDERS: Record<string, ProviderConfig> = {
  kimi: {
    name: 'kimi',
    url: Deno.env.get('KIMI_BASE_URL')
      || Deno.env.get('MOONSHOT_BASE_URL')
      || 'https://api.moonshot.ai/v1/chat/completions',
    getKey: () => Deno.env.get('KIMI_API_KEY') || Deno.env.get('MOONSHOT_API_KEY'),
    isEnabled: () => (Deno.env.get('KIMI_ENABLED') || 'true').toLowerCase() === 'true',
    models: {
      lite: KIMI_TIERED_MODELS.lite,
      standard: KIMI_TIERED_MODELS.standard,
      pro: KIMI_TIERED_MODELS.pro,
    },
  },
  lmstudio: {
    name: 'lmstudio',
    url: Deno.env.get('LMSTUDIO_BASE_URL') || '',
    getKey: () => Deno.env.get('LMSTUDIO_API_KEY'),
    isEnabled: () => {
      const explicit = Deno.env.get('LMSTUDIO_ENABLED');
      if (explicit) return explicit.toLowerCase() === 'true';
      return !!Deno.env.get('LMSTUDIO_BASE_URL');
    },
    models: {
      lite: firstEnv(['LMSTUDIO_MODEL_LITE', 'LMSTUDIO_MODEL'], 'openai/gpt-oss-20b'),
      standard: firstEnv(['LMSTUDIO_MODEL_STANDARD', 'LMSTUDIO_MODEL'], 'openai/gpt-oss-20b'),
      pro: firstEnv(['LMSTUDIO_MODEL_PRO', 'LMSTUDIO_MODEL'], 'openai/gpt-oss-20b'),
    },
  },
  gemini: {
    name: 'gemini',
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    getKey: () => Deno.env.get('GEMINI_API_KEY'),
    models: {
      lite: firstEnv(['GEMINI_MODEL_LITE', 'GEMINI_MODEL'], 'gemini-2.5-flash-lite'),
      standard: firstEnv(['GEMINI_MODEL_STANDARD', 'GEMINI_MODEL'], 'gemini-2.5-flash-lite'),
      pro: firstEnv(['GEMINI_MODEL_PRO', 'GEMINI_MODEL'], 'gemini-2.5-flash-lite'),
    },
  },
  anthropic: {
    name: 'anthropic',
    url: 'https://api.anthropic.com/v1/messages',
    getKey: () => Deno.env.get('ANTHROPIC_API_KEY'),
    models: {
      lite: firstEnv(['ANTHROPIC_MODEL_LITE', 'ANTHROPIC_MODEL'], 'claude-haiku-4-5-20251001'),
      standard: firstEnv(['ANTHROPIC_MODEL_STANDARD', 'ANTHROPIC_MODEL'], 'claude-sonnet-4-6-20250514'),
      pro: firstEnv(['ANTHROPIC_MODEL_PRO', 'ANTHROPIC_MODEL'], 'claude-sonnet-4-6-20250514'),
    },
  },
  groq: {
    name: 'groq',
    url: 'https://api.groq.com/openai/v1/chat/completions',
    getKey: () => Deno.env.get('GROQ_API_KEY'),
    models: {
      lite: firstEnv(['GROQ_MODEL_LITE', 'GROQ_MODEL'], 'moonshotai/kimi-k2-instruct-0905'),
      standard: firstEnv(['GROQ_MODEL_STANDARD', 'GROQ_MODEL'], 'moonshotai/kimi-k2-instruct-0905'),
      pro: firstEnv(['GROQ_MODEL_PRO', 'GROQ_MODEL'], 'moonshotai/kimi-k2-instruct-0905'),
    },
  },
};

function isProviderCallable(name: string): boolean {
  const provider = PROVIDERS[name];
  if (!provider) return false;
  if (provider.isEnabled && !provider.isEnabled()) return false;
  if (name === 'lmstudio') return !!provider.url;
  return !!provider.getKey();
}

interface ProviderHealthState {
  healthy: boolean;
  checkedAt: number;
}

const providerHealthCache = new Map<string, ProviderHealthState>();

function getProviderHealthCacheTtlMs(providerName: string): number {
  if (providerName === 'lmstudio') {
    return Math.max(3000, Number(Deno.env.get('LMSTUDIO_HEALTHCHECK_CACHE_TTL_MS') || '15000'));
  }
  return Math.max(3000, Number(Deno.env.get('AI_PROVIDER_HEALTHCHECK_CACHE_TTL_MS') || '20000'));
}

function shouldRunProviderHealthcheck(providerName: string): boolean {
  if ((Deno.env.get('AI_PROVIDER_HEALTHCHECK_ENABLED') || 'true').toLowerCase() !== 'true') return false;
  if (providerName === 'lmstudio') {
    return (Deno.env.get('LMSTUDIO_HEALTHCHECK_ENABLED') || 'true').toLowerCase() === 'true';
  }
  return false;
}

function buildProviderHealthProbeUrls(providerName: string, provider: ProviderConfig): string[] {
  if (providerName === 'lmstudio' && Deno.env.get('LMSTUDIO_HEALTHCHECK_URL')) {
    return [String(Deno.env.get('LMSTUDIO_HEALTHCHECK_URL'))];
  }

  try {
    const parsed = new URL(provider.url);
    const origin = parsed.origin;
    if (providerName === 'lmstudio') {
      return [`${origin}/v1/models`, `${origin}/health`, `${origin}/`];
    }
    return [`${origin}/`];
  } catch {
    return [];
  }
}

async function isProviderHealthy(providerName: string, provider: ProviderConfig, apiKey: string): Promise<boolean> {
  if (!shouldRunProviderHealthcheck(providerName)) return true;

  const now = Date.now();
  const ttlMs = getProviderHealthCacheTtlMs(providerName);
  const cached = providerHealthCache.get(providerName);
  if (cached && (now - cached.checkedAt) < ttlMs) {
    return cached.healthy;
  }

  const probeUrls = buildProviderHealthProbeUrls(providerName, provider);
  if (probeUrls.length === 0) {
    providerHealthCache.set(providerName, { healthy: true, checkedAt: now });
    return true;
  }

  const timeoutMs = providerName === 'lmstudio'
    ? Math.max(400, Number(Deno.env.get('LMSTUDIO_HEALTHCHECK_TIMEOUT_MS') || '1200'))
    : Math.max(400, Number(Deno.env.get('AI_PROVIDER_HEALTHCHECK_TIMEOUT_MS') || '1200'));

  for (const url of probeUrls) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      // Any HTTP response means endpoint is reachable enough to try.
      if (response.status >= 100) {
        providerHealthCache.set(providerName, { healthy: true, checkedAt: now });
        return true;
      }
    } catch {
      clearTimeout(timeoutId);
      // Try next probe URL.
    }
  }

  providerHealthCache.set(providerName, { healthy: false, checkedAt: now });
  return false;
}

function appendFallbackProviders(base: string[]): string[] {
  const strictPriority = (Deno.env.get('AI_PROVIDER_STRICT_PRIORITY') || 'false').toLowerCase() === 'true';
  if (strictPriority) return base;

  const order = ['kimi', 'anthropic', 'lmstudio', 'groq', 'gemini'];
  const chain = [...base];
  for (const name of order) {
    if (chain.includes(name)) continue;
    if (isProviderCallable(name)) {
      chain.push(name);
    }
  }
  return chain;
}

function getProviderChain(): string[] {
  const configured = (Deno.env.get('AI_PROVIDER_PRIORITY') || '')
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => !!p && !!PROVIDERS[p]);

  const kimiEnabled = PROVIDERS.kimi?.isEnabled?.() ?? false;
  const lmEnabled = PROVIDERS.lmstudio?.isEnabled?.() ?? false;
  const forceKimiFirst = (Deno.env.get('AI_FORCE_KIMI_FIRST') || 'true').toLowerCase() === 'true';
  const forceLmFirst = (Deno.env.get('AI_FORCE_LMSTUDIO_FIRST') || 'false').toLowerCase() === 'true';

  // Default policy: Kimi first unless explicitly overridden.
  const base = configured.length > 0 ? configured : ['kimi', 'groq', 'gemini'];
  let ordered = [...base];

  if (forceKimiFirst && kimiEnabled && !base.includes('kimi')) {
    ordered = ['kimi', ...base];
  } else if (forceKimiFirst && kimiEnabled && base[0] !== 'kimi') {
    ordered = ['kimi', ...base.filter((p) => p !== 'kimi')];
  }

  if (forceLmFirst && lmEnabled && !ordered.includes('lmstudio')) {
    ordered = ['lmstudio', ...ordered];
  } else if (forceLmFirst && lmEnabled && ordered[0] !== 'lmstudio') {
    ordered = ['lmstudio', ...ordered.filter((p) => p !== 'lmstudio')];
  } else if (lmEnabled && !ordered.includes('lmstudio')) {
    ordered = ['lmstudio', ...ordered];
  }

  return appendFallbackProviders(ordered);
}

// Errors that trigger fallback/retry.
const FALLBACK_TRIGGER_CODES = new Set([408, 413, 429]);

function isRecoverableProvider400Error(error: any): boolean {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode !== 400) return false;

  const raw = `${String(error?.message || '')} ${String(error?.responseBody || '')}`.toLowerCase();
  if (!raw) return false;

  const recoverableMarkers = [
    'api error: 400',
    'context length',
    'maximum context length',
    'prompt is too long',
    'exceeds context window',
    'input is too long',
    'too many tokens',
    'n_keep',
    'n_ctx',
    'unsupported',
    'unknown parameter',
    'invalid parameter',
    'invalid value',
    'invalid request',
    'does not exist',
    'not found',
    'response_format',
    'tool_choice',
    'messages',
  ];

  return recoverableMarkers.some((marker) => raw.includes(marker));
}

export function isRecoverableProvider404Error(error: any): boolean {
  const statusCode = Number(error?.statusCode || 0);
  if (statusCode !== 404) return false;

  const raw = `${String(error?.message || '')} ${String(error?.responseBody || '')}`.toLowerCase();
  if (!raw) return false;

  const recoverableMarkers = [
    'api error: 404',
    'model not found',
    'model_not_found',
    'unknown model',
    'does not exist',
    'not found',
    'no such model',
    'unknown path',
    'unknown url',
    'route not found',
    'endpoint not found',
  ];

  return recoverableMarkers.some((marker) => raw.includes(marker));
}

export function shouldTriggerProviderFallback(statusCode: number, error?: any): boolean {
  if (!statusCode || Number.isNaN(statusCode)) return false;
  if (statusCode === 400) return isRecoverableProvider400Error(error);
  if (statusCode === 404) return isRecoverableProvider404Error(error);
  if (FALLBACK_TRIGGER_CODES.has(statusCode)) return true;
  // Treat all 5xx upstream failures (including Cloudflare-like 52x/530) as retryable.
  if (statusCode >= 500 && statusCode <= 599) return true;
  return false;
}

export interface CallOptions {
  messages: Array<{ role: string; content: string }>;
  tier: ModelTier;
  temperature?: number;
  maxTokens?: number;
  maxAttempts?: number;
  providerLimit?: number;
  providerTimeoutMs?: number;
  tools?: any[];
  tool_choice?: any;
  jsonMode?: boolean;
  routingDecision?: any; // RoutingDecision from complexity-router — metadata pass-through
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface CallResult {
  content: string;
  provider: string;
  model: string;
  toolCalls?: any[];
  routingDecision?: any; // Echoed from CallOptions for logging
  usage?: TokenUsage;
}

function truncateMessageContent(input: string, maxChars: number): string {
  if (!input || input.length <= maxChars) return input;
  return `${input.slice(0, maxChars)}...`;
}

function estimateTokens(input: string): number {
  return Math.ceil((input || '').length / 4);
}

function estimateMessageTokens(messages: Array<{ role: string; content: string }>): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0;
  return messages.reduce((sum, m) => sum + estimateTokens(m.content || '') + 4, 8);
}

function compactMessagesToBudget(
  messages: Array<{ role: string; content: string }>,
  maxPromptTokens: number
): Array<{ role: string; content: string }> {
  if (!messages || messages.length === 0) return messages;

  const system = messages.find((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const selected: Array<{ role: string; content: string }> = [];
  let used = 0;

  for (let i = rest.length - 1; i >= 0; i--) {
    const msg = rest[i];
    const roleLimit = msg.role === 'user' ? 1200 : 900;
    const content = truncateMessageContent(msg.content || '', roleLimit);
    const tokens = estimateTokens(content) + 4;
    if (selected.length >= 10) break;
    if (selected.length > 0 && used + tokens > maxPromptTokens) break;
    selected.push({ ...msg, content });
    used += tokens;
  }
  selected.reverse();

  if (!system) return selected;

  const remainingForSystemTokens = Math.max(260, maxPromptTokens - used);
  const systemCharLimit = Math.max(1000, Math.min(5200, remainingForSystemTokens * 4));
  return [
    { role: 'system', content: truncateMessageContent(system.content || '', systemCharLimit) },
    ...selected,
  ];
}

function prepareLmStudioRequest(
  messages: Array<{ role: string; content: string }>,
  requestedMaxTokens: number
): { messages: Array<{ role: string; content: string }>; maxTokens: number } {
  const contextWindow = Math.max(
    1024,
    Number(Deno.env.get('LMSTUDIO_CONTEXT_WINDOW') || Deno.env.get('LMSTUDIO_N_CTX') || '4096')
  );
  const safetyTokens = Math.max(96, Number(Deno.env.get('LMSTUDIO_CONTEXT_SAFETY_TOKENS') || '192'));
  const minCompletionTokens = Math.max(96, Number(Deno.env.get('LMSTUDIO_MIN_COMPLETION_TOKENS') || '256'));
  const promptBudget = Math.max(700, contextWindow - safetyTokens - minCompletionTokens);

  let preparedMessages = compactMessagesToBudget(messages, promptBudget);
  let promptTokens = estimateMessageTokens(preparedMessages);

  if (promptTokens > promptBudget) {
    preparedMessages = compactMessagesForRetry(preparedMessages);
    promptTokens = estimateMessageTokens(preparedMessages);
  }

  const completionBudget = Math.max(96, contextWindow - promptTokens - safetyTokens);
  const maxTokens = Math.max(96, Math.min(requestedMaxTokens, completionBudget));

  return {
    messages: preparedMessages,
    maxTokens,
  };
}

function isLmStudioContextOverflowError(error: any): boolean {
  const statusCode = Number(error?.statusCode || 0);
  const raw = `${String(error?.message || '')} ${String(error?.responseBody || '')}`.toLowerCase();
  if (!raw) return false;
  if (statusCode !== 400 && statusCode !== 413) return false;

  return raw.includes('cannot truncate prompt with n_keep')
    || (raw.includes('n_keep') && raw.includes('n_ctx'))
    || raw.includes('context length')
    || raw.includes('maximum context length')
    || raw.includes('prompt is too long')
    || raw.includes('exceeds context window')
    || raw.includes('input is too long')
    || raw.includes('too many tokens');
}

function isNetworkLikeError(error: any): boolean {
  const raw = `${String(error?.message || '')} ${String(error?.responseBody || '')}`.toLowerCase();
  if (!raw) return false;
  return raw.includes('fetch failed')
    || raw.includes('network')
    || raw.includes('timed out')
    || raw.includes('timeout')
    || raw.includes('econnrefused')
    || raw.includes('enotfound')
    || raw.includes('socket hang up')
    || raw.includes('connection reset');
}

function compactMessagesForRetry(messages: Array<{ role: string; content: string }>): Array<{ role: string; content: string }> {
  if (!messages || messages.length === 0) return messages;

  const system = messages.find((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const tail = rest.slice(-8).map((m) => ({
    ...m,
    content: truncateMessageContent(m.content || '', 600),
  }));

  if (!system) return tail;
  return [
    { role: 'system', content: truncateMessageContent(system.content || '', 2600) },
    ...tail,
  ];
}

function buildProviderModelChain(provider: ProviderConfig, tier: ModelTier): string[] {
  const fallbackTierOrder: Record<ModelTier, ModelTier[]> = {
    lite: ['lite', 'standard', 'pro'],
    standard: ['standard', 'lite', 'pro'],
    pro: ['pro', 'standard', 'lite'],
  };

  const models = fallbackTierOrder[tier]
    .map((candidateTier) => provider.models[candidateTier])
    .filter((candidate): candidate is string => typeof candidate === 'string' && candidate.trim().length > 0);

  return Array.from(new Set(models));
}

/**
 * Call AI with automatic fallback through provider chain
 */
export async function callWithFallback(options: CallOptions): Promise<CallResult> {
  const { messages, tier, temperature = 0.3, maxTokens = 2048, tools, tool_choice, jsonMode } = options;

  let lastError: Error | null = null;
  let attempt = 0;
  const maxAttempts = Math.max(1, Number(options.maxAttempts || Deno.env.get('AI_PROVIDER_MAX_ATTEMPTS') || '2'));
  const lmstudioFirstPasses = Math.max(1, Number(Deno.env.get('LMSTUDIO_PRIMARY_RETRY_PASSES') || '2'));
  const compactRetryEnabled = (Deno.env.get('AI_RETRY_COMPACT') || 'true').toLowerCase() === 'true';

  while (attempt < maxAttempts) {
    attempt++;
    const useCompactRetry = compactRetryEnabled && attempt > 1;
    const attemptMessages = useCompactRetry ? compactMessagesForRetry(messages) : messages;
    const attemptMaxTokens = useCompactRetry ? Math.max(600, Math.floor(maxTokens * 0.7)) : maxTokens;
    const attemptTemperature = useCompactRetry ? Math.min(temperature, 0.2) : temperature;
    const attemptTools = useCompactRetry && Array.isArray(tools) && tools.length > 12 ? tools.slice(0, 12) : tools;

    const providerChain = getProviderChain();
    const lmstudioPriorityWindow = providerChain[0] === 'lmstudio' && attempt <= lmstudioFirstPasses;
    // Keep LM Studio first during priority passes, but never exclusive.
    // If it's unhealthy/unreachable we should still attempt the remaining active providers.
    const activeChainBase = lmstudioPriorityWindow
      ? ['lmstudio', ...providerChain.filter((name) => name !== 'lmstudio')]
      : providerChain;
    const providerLimit = Number.isFinite(Number(options.providerLimit)) && Number(options.providerLimit) > 0
      ? Number(options.providerLimit)
      : activeChainBase.length;
    const activeChain = activeChainBase.slice(0, providerLimit);

    for (const providerName of activeChain) {
      const provider = PROVIDERS[providerName];
      if (!provider) continue;
      if (provider.isEnabled && !provider.isEnabled()) {
        console.log(`[ai-provider] Skipping ${providerName}: disabled`);
        continue;
      }
      const apiKey = provider.getKey();

      if (!apiKey) {
        console.log(`[ai-provider] Skipping ${providerName}: no API key`);
        continue;
      }

      const healthy = await isProviderHealthy(providerName, provider, apiKey);
      if (!healthy) {
        console.log(`[ai-provider] Skipping ${providerName}: healthcheck failed/unreachable`);
        continue;
      }

      const providerModelChain = buildProviderModelChain(provider, tier);

      for (let modelIndex = 0; modelIndex < providerModelChain.length; modelIndex++) {
        const model = providerModelChain[modelIndex];
        const hasAlternativeModels = modelIndex < providerModelChain.length - 1;

        console.log(
          `[ai-provider] Trying ${providerName} with model ${model} (tier: ${tier}, attempt: ${attempt}/${maxAttempts}${useCompactRetry ? ', compact_retry=true' : ''}${lmstudioPriorityWindow ? ', lmstudio_priority=true' : ''}${hasAlternativeModels ? `, model_fallbacks_left=${providerModelChain.length - modelIndex - 1}` : ''})`
        );

        try {
          const result = await callProvider(provider, model, attemptMessages, {
            temperature: attemptTemperature,
            maxTokens: attemptMaxTokens,
            tools: attemptTools,
            tool_choice,
            jsonMode,
            timeoutMs: options.providerTimeoutMs,
          });

          console.log(`[ai-provider] Success with ${providerName} (${model})${result.usage ? ` [${result.usage.totalTokens} tokens]` : ''}`);
          return {
            ...result,
            provider: providerName,
            model,
            routingDecision: options.routingDecision,
          };
        } catch (error: any) {
          lastError = error;
          const statusCode = error.statusCode || 0;

          console.warn(`[ai-provider] ${providerName} failed:`, {
            status: statusCode,
            model,
            message: error.message?.substring(0, 200),
          });

          if (statusCode === 404 && isRecoverableProvider404Error(error) && hasAlternativeModels) {
            console.warn(`[ai-provider] ${providerName} model ${model} returned recoverable 404, trying alternate model`);
            await sleep(120);
            continue;
          }

          // Fall back on retryable provider statuses.
          if (shouldTriggerProviderFallback(statusCode, error)) {
            console.log(`[ai-provider] Triggering fallback due to ${statusCode}`);
            // Brief delay before fallback
            await sleep(150);
            break;
          }

          // Network-style failures often surface with status 0; keep provider fallback alive.
          if (!statusCode && isNetworkLikeError(error)) {
            console.warn('[ai-provider] Network-style provider failure, trying next provider');
            await sleep(120);
            break;
          }

          // LM Studio context overflows are recoverable by compacting prompts.
          if (providerName === 'lmstudio' && isLmStudioContextOverflowError(error)) {
            console.warn('[ai-provider] LM Studio context overflow detected, retrying with compact context');
            await sleep(120);
            break;
          }

          // For other errors, throw immediately
          throw error;
        }
      }
    }

    // All providers in chain failed with retryable error — retry if attempts remain
    if (attempt < maxAttempts) {
      console.log(`[ai-provider] All providers failed, retrying (attempt ${attempt + 1}/${maxAttempts})...`);
      await sleep(300);
      continue;
    }
  }

  // All providers failed across all attempts
  throw lastError || new Error('All AI providers failed');
}

interface ProviderCallOptions {
  temperature: number;
  maxTokens: number;
  tools?: any[];
  tool_choice?: any;
  jsonMode?: boolean;
  timeoutMs?: number;
}

async function callProvider(
  provider: ProviderConfig,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: ProviderCallOptions
): Promise<{ content: string; toolCalls?: any[]; usage?: TokenUsage }> {
  const apiKey = provider.getKey();
  if (!apiKey) {
    throw new Error(`${provider.name} API key not configured`);
  }

  let providerMessages = messages;
  let providerMaxTokens = options.maxTokens;

  if (provider.name === 'lmstudio') {
    const prepared = prepareLmStudioRequest(messages, options.maxTokens);
    providerMessages = prepared.messages;
    providerMaxTokens = prepared.maxTokens;
  }

  // Anthropic uses a different API format — convert and handle separately
  if (provider.name === 'anthropic') {
    return callAnthropicProvider(provider, model, providerMessages, options);
  }

  const body: Record<string, unknown> = {
    model,
    messages: providerMessages,
    temperature: options.temperature,
    max_tokens: providerMaxTokens,
  };

  if (options.tools && options.tools.length > 0) {
    body.tools = options.tools;
    if (options.tool_choice) {
      body.tool_choice = options.tool_choice;
    }
  }

  if (options.jsonMode) {
    body.response_format = { type: 'json_object' };
  }

  // Disable thinking for Gemini when no tools — tool calling needs reasoning
  if (provider.name === 'gemini' && !options.tools?.length) {
    body.reasoning_effort = 'none';
  }

  const controller = new AbortController();
  const providerTimeoutMs = options.timeoutMs || (provider.name === 'lmstudio'
    ? Number(Deno.env.get('LMSTUDIO_TIMEOUT_MS') || '45000')
    : Number(Deno.env.get('AI_PROVIDER_TIMEOUT_MS') || '35000'));
  const timeoutId = setTimeout(() => controller.abort(), providerTimeoutMs);

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ai-provider] ${provider.name} API error ${response.status}:`, errorText.substring(0, 500));
      const error = new Error(`${provider.name} API error: ${response.status} — ${errorText.substring(0, 300)}`);
      (error as any).statusCode = response.status;
      (error as any).responseBody = errorText;
      throw error;
    }

    const data = await response.json();

    // Extract token usage from OpenAI-compatible response
    const usage: TokenUsage | undefined = data.usage ? {
      promptTokens: data.usage.prompt_tokens || 0,
      completionTokens: data.usage.completion_tokens || 0,
      totalTokens: data.usage.total_tokens || 0,
    } : undefined;

    if (usage) {
      console.log(`[ai-provider] Tokens: ${usage.promptTokens} in + ${usage.completionTokens} out = ${usage.totalTokens} total`);
    }

    // Parse tool calls if present
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (toolCall?.function?.arguments) {
      return {
        content: toolCall.function.arguments,
        toolCalls: data.choices[0].message.tool_calls,
        usage,
      };
    }

    // Parse content
    const content = data.choices?.[0]?.message?.content || '';
    return { content, usage };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`[ai-provider] ${provider.name} request timed out after ${providerTimeoutMs}ms`);
      const error = new Error(`${provider.name} request timed out`);
      (error as any).statusCode = 408;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Anthropic Messages API adapter — converts OpenAI-style messages/tools to
 * Anthropic format and normalizes the response back to OpenAI shape.
 */
async function callAnthropicProvider(
  provider: ProviderConfig,
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: ProviderCallOptions
): Promise<{ content: string; toolCalls?: any[]; usage?: TokenUsage }> {
  const apiKey = provider.getKey();
  if (!apiKey) throw new Error('Anthropic API key not configured');

  // Separate system message from conversation
  const systemMsg = messages.find((m) => m.role === 'system');
  const conversationMsgs = messages.filter((m) => m.role !== 'system');

  // Anthropic requires alternating user/assistant — merge consecutive same-role messages
  const anthropicMessages: Array<{ role: string; content: string }> = [];
  for (const msg of conversationMsgs) {
    const role = msg.role === 'assistant' ? 'assistant' : 'user';
    if (anthropicMessages.length > 0 && anthropicMessages[anthropicMessages.length - 1].role === role) {
      anthropicMessages[anthropicMessages.length - 1].content += '\n\n' + msg.content;
    } else {
      anthropicMessages.push({ role, content: msg.content });
    }
  }

  // Ensure conversation starts with user message
  if (anthropicMessages.length === 0 || anthropicMessages[0].role !== 'user') {
    anthropicMessages.unshift({ role: 'user', content: '(continue)' });
  }

  // Convert OpenAI tools format to Anthropic format
  const anthropicTools = options.tools?.map((t: any) => {
    const fn = t.function || t;
    return {
      name: fn.name,
      description: fn.description || '',
      input_schema: fn.parameters || { type: 'object', properties: {} },
    };
  });

  const body: Record<string, unknown> = {
    model,
    messages: anthropicMessages,
    max_tokens: options.maxTokens,
    temperature: options.temperature,
  };

  if (systemMsg?.content) {
    body.system = systemMsg.content;
  }

  if (anthropicTools && anthropicTools.length > 0) {
    body.tools = anthropicTools;
  }

  const controller = new AbortController();
  const timeoutMs = Number(Deno.env.get('AI_PROVIDER_TIMEOUT_MS') || '55000');
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(provider.url, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[ai-provider] anthropic API error ${response.status}:`, errorText.substring(0, 500));
      const error = new Error(`anthropic API error: ${response.status} — ${errorText.substring(0, 300)}`);
      (error as any).statusCode = response.status;
      (error as any).responseBody = errorText;
      throw error;
    }

    const data = await response.json();

    const usage: TokenUsage | undefined = data.usage ? {
      promptTokens: data.usage.input_tokens || 0,
      completionTokens: data.usage.output_tokens || 0,
      totalTokens: (data.usage.input_tokens || 0) + (data.usage.output_tokens || 0),
    } : undefined;

    if (usage) {
      console.log(`[ai-provider] Tokens: ${usage.promptTokens} in + ${usage.completionTokens} out = ${usage.totalTokens} total`);
    }

    // Parse Anthropic response content blocks
    const contentBlocks = data.content || [];
    const textBlock = contentBlocks.find((b: any) => b.type === 'text');
    const toolUseBlock = contentBlocks.find((b: any) => b.type === 'tool_use');

    if (toolUseBlock) {
      // Convert Anthropic tool_use to OpenAI tool_calls format
      const openaiToolCalls = [{
        id: toolUseBlock.id || `call_${Date.now()}`,
        type: 'function',
        function: {
          name: toolUseBlock.name,
          arguments: JSON.stringify(toolUseBlock.input || {}),
        },
      }];

      return {
        content: JSON.stringify(toolUseBlock.input || {}),
        toolCalls: openaiToolCalls,
        usage,
      };
    }

    return {
      content: textBlock?.text || '',
      usage,
    };
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`[ai-provider] anthropic request timed out after ${timeoutMs}ms`);
      const error = new Error('anthropic request timed out');
      (error as any).statusCode = 408;
      throw error;
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Check if any AI provider is available
 */
export function hasAnyProvider(): boolean {
  return getProviderChain().some((name) => {
    const provider = PROVIDERS[name];
    if (!provider) return false;
    if (provider.isEnabled && !provider.isEnabled()) return false;
    return !!provider.getKey();
  });
}

/**
 * Get the primary available provider name
 */
export function getPrimaryProvider(): string | null {
  for (const name of getProviderChain()) {
    const provider = PROVIDERS[name];
    if (!provider) continue;
    if (provider.isEnabled && !provider.isEnabled()) continue;
    if (provider.getKey()) {
      return name;
    }
  }
  return null;
}
