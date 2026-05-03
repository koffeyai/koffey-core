/**
 * Lightweight query embedding helper.
 *
 * Generates an embedding vector for a search query WITHOUT persisting it
 * to the database. Used by entity resolution fallback and the
 * semantic_search tool in unified-chat.
 */

type EmbeddingCacheEntry = {
  embedding: number[];
  expiresAt: number;
  lastAccessedAt: number;
};

const EMBEDDING_CACHE_TTL_MS = Math.max(30_000, Number(Deno.env.get('QUERY_EMBEDDING_CACHE_TTL_MS') || `${60 * 60 * 1000}`));
const EMBEDDING_CACHE_MAX_ENTRIES = Math.max(20, Number(Deno.env.get('QUERY_EMBEDDING_CACHE_MAX_ENTRIES') || '500'));
const embeddingCache = new Map<string, EmbeddingCacheEntry>();

function normalizeQueryText(input: string): string {
  return (input || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 3000);
}

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function evictExpiredEntries(now = Date.now()): void {
  for (const [key, entry] of embeddingCache.entries()) {
    if (entry.expiresAt <= now) {
      embeddingCache.delete(key);
    }
  }
}

function enforceCacheSize(): void {
  if (embeddingCache.size <= EMBEDDING_CACHE_MAX_ENTRIES) return;
  const entriesByAge = Array.from(embeddingCache.entries())
    .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);
  const toDelete = embeddingCache.size - EMBEDDING_CACHE_MAX_ENTRIES;
  for (let i = 0; i < toDelete; i++) {
    const key = entriesByAge[i]?.[0];
    if (key) embeddingCache.delete(key);
  }
}

export async function getQueryEmbedding(text: string): Promise<number[]> {
  const normalizedText = normalizeQueryText(text);
  if (!normalizedText) return [];

  const cacheKey = await sha256Hex(normalizedText);
  const now = Date.now();
  const cached = embeddingCache.get(cacheKey);
  if (cached && cached.expiresAt > now && Array.isArray(cached.embedding) && cached.embedding.length > 0) {
    cached.lastAccessedAt = now;
    embeddingCache.set(cacheKey, cached);
    return cached.embedding;
  }

  evictExpiredEntries(now);

  const apiKey = Deno.env.get('OPENAI_API_KEY');
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: normalizedText.slice(0, 8000), // Token safety — model limit
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`OpenAI embeddings API error (${response.status}): ${errText}`);
  }

  const data = await response.json();
  const embedding = data.data[0].embedding as number[];
  if (Array.isArray(embedding) && embedding.length > 0) {
    embeddingCache.set(cacheKey, {
      embedding,
      expiresAt: now + EMBEDDING_CACHE_TTL_MS,
      lastAccessedAt: now,
    });
    enforceCacheSize();
  }
  return embedding;
}
