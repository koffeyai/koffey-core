export type TokenUsageSnapshot = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type TokenUsageLabelRow = {
  source: 'intent' | 'synthesis' | 'total';
  model: string;
  unit: string;
  input_price_cache_hit: number | null;
  input_price_cache_miss: number | null;
  output_price: number | null;
  context_window: number | null;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cache_hit: boolean;
  estimated_input_cost_cache_hit: number | null;
  estimated_input_cost_cache_miss: number | null;
  estimated_output_cost: number | null;
  estimated_total_cost_cache_hit: number | null;
  estimated_total_cost_cache_miss: number | null;
  currency: 'USD';
};

export type ModelPricingProfile = {
  unit: string;
  inputPriceCacheHit: number | null;
  inputPriceCacheMiss: number | null;
  outputPrice: number | null;
  contextWindow: number | null;
};

export function parseNumberFromEnv(keys: string[], fallback: number | null = null): number | null {
  for (const key of keys) {
    const raw = Deno.env.get(key);
    if (!raw) continue;
    const parsed = Number(raw);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function roundUsd(value: number | null): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  return Math.round(value * 1_000_000_00) / 1_000_000_00;
}

export function normalizeModelLabel(model: string | null | undefined): string {
  const label = String(model || '').trim();
  return label || 'unknown';
}

export function normalizeUsageSnapshot(usage: Partial<TokenUsageSnapshot> | null | undefined): TokenUsageSnapshot {
  const promptTokens = Number.isFinite(Number(usage?.promptTokens)) ? Number(usage?.promptTokens) : 0;
  const completionTokens = Number.isFinite(Number(usage?.completionTokens)) ? Number(usage?.completionTokens) : 0;
  const explicitTotal = Number.isFinite(Number(usage?.totalTokens)) ? Number(usage?.totalTokens) : 0;
  const totalTokens = explicitTotal > 0 ? explicitTotal : Math.max(0, promptTokens + completionTokens);
  return { promptTokens, completionTokens, totalTokens };
}

export function getModelPricingProfile(model: string): ModelPricingProfile {
  const normalized = normalizeModelLabel(model).toLowerCase();
  const unit = Deno.env.get('AI_TOKEN_PRICE_UNIT') || '1M tokens';

  const genericProfile: ModelPricingProfile = {
    unit,
    inputPriceCacheHit: parseNumberFromEnv(['AI_INPUT_PRICE_CACHE_HIT']),
    inputPriceCacheMiss: parseNumberFromEnv(['AI_INPUT_PRICE_CACHE_MISS']),
    outputPrice: parseNumberFromEnv(['AI_OUTPUT_PRICE']),
    contextWindow: parseNumberFromEnv(['AI_CONTEXT_WINDOW'], null),
  };

  // Default Kimi K2.x economics (override per model via env as provider pricing changes).
  if (normalized.includes('kimi-k2.6')) {
    return {
      unit,
      inputPriceCacheHit: parseNumberFromEnv(
        ['KIMI_K26_INPUT_PRICE_CACHE_HIT', 'KIMI_INPUT_PRICE_CACHE_HIT', 'MOONSHOT_INPUT_PRICE_CACHE_HIT'],
        0.10,
      ),
      inputPriceCacheMiss: parseNumberFromEnv(
        ['KIMI_K26_INPUT_PRICE_CACHE_MISS', 'KIMI_INPUT_PRICE_CACHE_MISS', 'MOONSHOT_INPUT_PRICE_CACHE_MISS'],
        0.60,
      ),
      outputPrice: parseNumberFromEnv(
        ['KIMI_K26_OUTPUT_PRICE', 'KIMI_OUTPUT_PRICE', 'MOONSHOT_OUTPUT_PRICE'],
        3.00,
      ),
      contextWindow: parseNumberFromEnv(
        ['KIMI_K26_CONTEXT_WINDOW', 'KIMI_CONTEXT_WINDOW', 'MOONSHOT_CONTEXT_WINDOW'],
        262144,
      ),
    };
  }

  if (normalized === 'kimi-k2.5' || normalized.includes('kimi-k2.5')) {
    return {
      unit,
      inputPriceCacheHit: parseNumberFromEnv(
        ['KIMI_K25_INPUT_PRICE_CACHE_HIT', 'KIMI_INPUT_PRICE_CACHE_HIT', 'MOONSHOT_INPUT_PRICE_CACHE_HIT'],
        0.10,
      ),
      inputPriceCacheMiss: parseNumberFromEnv(
        ['KIMI_K25_INPUT_PRICE_CACHE_MISS', 'KIMI_INPUT_PRICE_CACHE_MISS', 'MOONSHOT_INPUT_PRICE_CACHE_MISS'],
        0.60,
      ),
      outputPrice: parseNumberFromEnv(
        ['KIMI_K25_OUTPUT_PRICE', 'KIMI_OUTPUT_PRICE', 'MOONSHOT_OUTPUT_PRICE'],
        3.00,
      ),
      contextWindow: parseNumberFromEnv(
        ['KIMI_K25_CONTEXT_WINDOW', 'KIMI_CONTEXT_WINDOW', 'MOONSHOT_CONTEXT_WINDOW'],
        262144,
      ),
    };
  }

  if (normalized.includes('moonshot-v1-8k')) {
    return {
      unit,
      inputPriceCacheHit: parseNumberFromEnv(
        ['MOONSHOT_V1_8K_INPUT_PRICE_CACHE_HIT', 'MOONSHOT_V1_8K_INPUT_PRICE'],
        0.20,
      ),
      inputPriceCacheMiss: parseNumberFromEnv(
        ['MOONSHOT_V1_8K_INPUT_PRICE_CACHE_MISS', 'MOONSHOT_V1_8K_INPUT_PRICE'],
        0.20,
      ),
      outputPrice: parseNumberFromEnv(['MOONSHOT_V1_8K_OUTPUT_PRICE'], 2.00),
      contextWindow: parseNumberFromEnv(['MOONSHOT_V1_8K_CONTEXT_WINDOW'], 8192),
    };
  }

  if (normalized.includes('moonshot-v1-32k')) {
    return {
      unit,
      inputPriceCacheHit: parseNumberFromEnv(
        ['MOONSHOT_V1_32K_INPUT_PRICE_CACHE_HIT', 'MOONSHOT_V1_32K_INPUT_PRICE'],
        1.00,
      ),
      inputPriceCacheMiss: parseNumberFromEnv(
        ['MOONSHOT_V1_32K_INPUT_PRICE_CACHE_MISS', 'MOONSHOT_V1_32K_INPUT_PRICE'],
        1.00,
      ),
      outputPrice: parseNumberFromEnv(['MOONSHOT_V1_32K_OUTPUT_PRICE'], 3.00),
      contextWindow: parseNumberFromEnv(['MOONSHOT_V1_32K_CONTEXT_WINDOW'], 32768),
    };
  }

  if (normalized.includes('moonshot-v1-128k')) {
    return {
      unit,
      inputPriceCacheHit: parseNumberFromEnv(
        ['MOONSHOT_V1_128K_INPUT_PRICE_CACHE_HIT', 'MOONSHOT_V1_128K_INPUT_PRICE'],
        2.00,
      ),
      inputPriceCacheMiss: parseNumberFromEnv(
        ['MOONSHOT_V1_128K_INPUT_PRICE_CACHE_MISS', 'MOONSHOT_V1_128K_INPUT_PRICE'],
        2.00,
      ),
      outputPrice: parseNumberFromEnv(['MOONSHOT_V1_128K_OUTPUT_PRICE'], 5.00),
      contextWindow: parseNumberFromEnv(['MOONSHOT_V1_128K_CONTEXT_WINDOW'], 131072),
    };
  }

  return genericProfile;
}

export function estimateCost(tokens: number, pricePerUnit: number | null): number | null {
  if (!Number.isFinite(tokens) || tokens <= 0 || pricePerUnit == null || !Number.isFinite(pricePerUnit)) {
    return 0;
  }
  const unitSize = 1_000_000;
  return roundUsd((tokens / unitSize) * pricePerUnit);
}

export function buildTokenUsageLabelRow(params: {
  source: 'intent' | 'synthesis' | 'total';
  model: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  cacheHit: boolean;
}): TokenUsageLabelRow {
  const profile = getModelPricingProfile(params.model);
  const inputCostHit = estimateCost(params.inputTokens, profile.inputPriceCacheHit);
  const inputCostMiss = estimateCost(params.inputTokens, profile.inputPriceCacheMiss);
  const outputCost = estimateCost(params.outputTokens, profile.outputPrice);

  return {
    source: params.source,
    model: normalizeModelLabel(params.model),
    unit: profile.unit,
    input_price_cache_hit: profile.inputPriceCacheHit,
    input_price_cache_miss: profile.inputPriceCacheMiss,
    output_price: profile.outputPrice,
    context_window: profile.contextWindow,
    input_tokens: Math.max(0, Math.floor(params.inputTokens)),
    output_tokens: Math.max(0, Math.floor(params.outputTokens)),
    total_tokens: Math.max(0, Math.floor(params.totalTokens)),
    cache_hit: params.cacheHit,
    estimated_input_cost_cache_hit: inputCostHit,
    estimated_input_cost_cache_miss: inputCostMiss,
    estimated_output_cost: outputCost,
    estimated_total_cost_cache_hit: roundUsd((inputCostHit || 0) + (outputCost || 0)),
    estimated_total_cost_cache_miss: roundUsd((inputCostMiss || 0) + (outputCost || 0)),
    currency: 'USD',
  };
}

export function buildIndustryTokenUsageColumns(params: {
  intentModel: string | null | undefined;
  intentUsage: Partial<TokenUsageSnapshot> | null | undefined;
  synthesisModel?: string | null;
  synthesisUsage?: Partial<TokenUsageSnapshot> | null;
  cacheHit: boolean;
}): TokenUsageLabelRow[] {
  const rows: TokenUsageLabelRow[] = [];
  const intent = normalizeUsageSnapshot(params.intentUsage);
  const synthesis = normalizeUsageSnapshot(params.synthesisUsage);
  const intentModel = normalizeModelLabel(params.intentModel);
  const synthesisModel = normalizeModelLabel(params.synthesisModel);

  if (intent.totalTokens > 0) {
    rows.push(
      buildTokenUsageLabelRow({
        source: 'intent',
        model: intentModel,
        inputTokens: intent.promptTokens,
        outputTokens: intent.completionTokens,
        totalTokens: intent.totalTokens,
        cacheHit: params.cacheHit,
      })
    );
  }

  if (synthesis.totalTokens > 0) {
    rows.push(
      buildTokenUsageLabelRow({
        source: 'synthesis',
        model: synthesisModel,
        inputTokens: synthesis.promptTokens,
        outputTokens: synthesis.completionTokens,
        totalTokens: synthesis.totalTokens,
        cacheHit: params.cacheHit,
      })
    );
  }

  const totalInputTokens = intent.promptTokens + synthesis.promptTokens;
  const totalOutputTokens = intent.completionTokens + synthesis.completionTokens;
  const totalTokens = intent.totalTokens + synthesis.totalTokens;
  const sharedModel = rows.length <= 1 || intentModel === synthesisModel;
  const totalModel = totalTokens > 0
    ? (sharedModel ? intentModel : 'mixed')
    : (rows[0]?.model || intentModel);

  rows.push(
    buildTokenUsageLabelRow({
      source: 'total',
      model: totalModel,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      totalTokens,
      cacheHit: params.cacheHit,
    })
  );

  return rows;
}
