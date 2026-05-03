import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { isRecoverableProvider404Error as isRecoverableVerification404Error } from '../../supabase/functions/unified-chat/gateway/verification.ts';

const repoRoot = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const aiProviderModuleUrl = pathToFileURL(path.join(repoRoot, 'supabase/functions/_shared/ai-provider.ts')).href;

function installDenoEnv(env) {
  globalThis.Deno = {
    env: {
      get(key) {
        return env[key];
      },
    },
  };
}

test('verification gateway treats recoverable 404 provider errors as retryable', () => {
  assert.equal(
    isRecoverableVerification404Error({
      statusCode: 404,
      message: 'kimi API error: 404 - model not found',
      responseBody: '{"error":"model_not_found"}',
    }),
    true,
  );
});

test('callWithFallback retries a recoverable 404 with a lower-tier model on the same provider', async () => {
  installDenoEnv({
    AI_PROVIDER_PRIORITY: 'kimi',
    AI_PROVIDER_STRICT_PRIORITY: 'true',
    AI_FORCE_KIMI_FIRST: 'true',
    AI_FORCE_LMSTUDIO_FIRST: 'false',
    KIMI_API_KEY: 'test-kimi-key',
    KIMI_BASE_URL: 'https://example.test/kimi/chat/completions',
    KIMI_MODEL_PRO: 'bad-pro-model',
    KIMI_MODEL_STANDARD: 'good-standard-model',
    KIMI_MODEL_LITE: 'good-lite-model',
    LMSTUDIO_ENABLED: 'false',
  });

  const { callWithFallback, shouldTriggerProviderFallback } = await import(`${aiProviderModuleUrl}?t=404-fallback`);
  assert.equal(
    shouldTriggerProviderFallback(404, {
      statusCode: 404,
      message: 'kimi API error: 404 - model not found',
      responseBody: '{"error":"model_not_found"}',
    }),
    true,
  );

  const originalFetch = globalThis.fetch;
  const requestedModels = [];

  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(String(options?.body || '{}'));
    requestedModels.push(body.model);

    if (body.model === 'bad-pro-model') {
      return new Response('{"error":"model_not_found"}', {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (body.model === 'good-standard-model') {
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Recovered with standard model' } }],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 8,
          total_tokens: 20,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('{"error":"unexpected model"}', {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await callWithFallback({
      messages: [{ role: 'user', content: 'create a deal for acme' }],
      tier: 'pro',
      temperature: 0.2,
      maxTokens: 400,
    });

    assert.equal(result.provider, 'kimi');
    assert.equal(result.model, 'good-standard-model');
    assert.equal(result.content, 'Recovered with standard model');
    assert.deepEqual(requestedModels, ['bad-pro-model', 'good-standard-model']);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('callWithFallback skips unreachable lmstudio and falls through to next active provider', async () => {
  installDenoEnv({
    AI_PROVIDER_PRIORITY: 'lmstudio,kimi',
    AI_PROVIDER_STRICT_PRIORITY: 'true',
    AI_FORCE_KIMI_FIRST: 'false',
    AI_FORCE_LMSTUDIO_FIRST: 'false',
    AI_PROVIDER_HEALTHCHECK_ENABLED: 'true',
    LMSTUDIO_HEALTHCHECK_ENABLED: 'true',
    LMSTUDIO_HEALTHCHECK_CACHE_TTL_MS: '1',
    LMSTUDIO_HEALTHCHECK_TIMEOUT_MS: '10',
    LMSTUDIO_API_KEY: 'test-lm-key',
    LMSTUDIO_BASE_URL: 'http://127.0.0.1:1234/v1/chat/completions',
    LMSTUDIO_MODEL: 'openai/gpt-oss-20b',
    KIMI_API_KEY: 'test-kimi-key',
    KIMI_BASE_URL: 'https://example.test/kimi/chat/completions',
    KIMI_MODEL_STANDARD: 'good-standard-model',
    KIMI_MODEL_PRO: 'good-standard-model',
    KIMI_MODEL_LITE: 'good-standard-model',
  });

  const { callWithFallback } = await import(`${aiProviderModuleUrl}?t=lmstudio-healthcheck-skip`);
  const originalFetch = globalThis.fetch;
  const invokedUrls = [];

  globalThis.fetch = async (url, options) => {
    const asString = String(url);
    invokedUrls.push(asString);

    if (asString.startsWith('http://127.0.0.1:1234')) {
      throw new Error('ECONNREFUSED');
    }

    if (asString.includes('/kimi/chat/completions')) {
      const body = JSON.parse(String(options?.body || '{}'));
      assert.equal(body.model, 'good-standard-model');
      return new Response(JSON.stringify({
        choices: [{ message: { content: 'Kimi handled request' } }],
        usage: {
          prompt_tokens: 10,
          completion_tokens: 6,
          total_tokens: 16,
        },
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response('{"error":"unexpected URL"}', {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const result = await callWithFallback({
      messages: [{ role: 'user', content: 'summarize this deal quickly' }],
      tier: 'standard',
      temperature: 0.1,
      maxTokens: 300,
    });

    assert.equal(result.provider, 'kimi');
    assert.equal(result.content, 'Kimi handled request');
    assert.equal(invokedUrls.some((u) => u.includes('/v1/models')), true);
    assert.equal(invokedUrls.some((u) => u.includes('/kimi/chat/completions')), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
