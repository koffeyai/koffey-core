/**
 * Generate Embedding Edge Function
 *
 * Accepts entity content, generates a vector embedding via OpenAI
 * text-embedding-3-small, and upserts into the centralized embeddings table.
 *
 * Called internally by other Edge Functions (e.g., unified-chat)
 * using the service role key — not exposed to end users.
 */

import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
const EMBEDDING_MODEL = 'text-embedding-3-small';
const MAX_INPUT_TOKENS = 8000; // Safety limit for text-embedding-3-small

// Simple in-memory rate limiter: max 100 calls/min per organization
const rateLimitStore = new Map<string, { count: number; resetAt: number }>();

function checkOrgRateLimit(organizationId: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(organizationId);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(organizationId, { count: 1, resetAt: now + 60_000 });
    return true;
  }

  if (entry.count >= 100) {
    return false;
  }

  entry.count++;
  return true;
}

async function computeHash(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    // Auth: only accept service-role calls
    const authHeader = req.headers.get('authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (jwt !== serviceRoleKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized — service role only' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!OPENAI_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'OPENAI_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const { entity_type, entity_id, organization_id, content } = body;

    if (!entity_type || !entity_id || !organization_id || !content) {
      return new Response(
        JSON.stringify({ success: false, error: 'entity_type, entity_id, organization_id, and content are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limit per organization
    if (!checkOrgRateLimit(organization_id)) {
      console.warn(`[generate-embedding] Rate limit exceeded for org ${organization_id}`);
      return new Response(
        JSON.stringify({ success: false, error: 'Rate limit exceeded (100/min per org)' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Compute content hash to detect changes
    const contentHash = await computeHash(content);

    // Check if embedding already exists with same content hash (skip re-embedding)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: existing } = await supabase
      .from('embeddings')
      .select('id, content_hash')
      .eq('entity_type', entity_type)
      .eq('entity_id', entity_id)
      .maybeSingle();

    if (existing && existing.content_hash === contentHash) {
      console.log(`[generate-embedding] Content unchanged for ${entity_type}/${entity_id}, skipping`);
      return new Response(
        JSON.stringify({ success: true, skipped: true, reason: 'content_unchanged' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate content for embedding
    const truncatedContent = content.slice(0, MAX_INPUT_TOKENS);

    // Call OpenAI embeddings API
    const embeddingStart = Date.now();
    const embeddingResponse = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBEDDING_MODEL,
        input: truncatedContent,
      }),
    });

    if (!embeddingResponse.ok) {
      const errText = await embeddingResponse.text();
      console.error(`[generate-embedding] OpenAI API error (${embeddingResponse.status}):`, errText);
      return new Response(
        JSON.stringify({ success: false, error: `OpenAI API error: ${embeddingResponse.status}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const embeddingData = await embeddingResponse.json();
    const embedding = embeddingData.data[0].embedding;
    const tokenCount = embeddingData.usage?.total_tokens || null;
    const embeddingMs = Date.now() - embeddingStart;

    // Upsert into embeddings table
    const { error: upsertError } = await supabase
      .from('embeddings')
      .upsert(
        {
          organization_id,
          entity_type,
          entity_id,
          content_text: truncatedContent,
          content_hash: contentHash,
          embedding: JSON.stringify(embedding),
          model_used: EMBEDDING_MODEL,
          token_count: tokenCount,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'entity_type,entity_id' }
      );

    if (upsertError) {
      console.error(`[generate-embedding] Upsert error:`, upsertError);
      return new Response(
        JSON.stringify({ success: false, error: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-embedding] Embedded ${entity_type}/${entity_id} (${tokenCount} tokens, ${embeddingMs}ms)`);

    return new Response(
      JSON.stringify({
        success: true,
        entity_type,
        entity_id,
        token_count: tokenCount,
        processing_ms: embeddingMs,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (err: any) {
    console.error('[generate-embedding] Error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
