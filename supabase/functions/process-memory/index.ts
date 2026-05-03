/**
 * Process Memory - Hot Path Event Handler
 *
 * Called by a Supabase Database Webhook when rows are inserted into
 * client_memory_events. Coalesces pending events for the same contact,
 * sends them to the LLM for fact extraction, and upserts the result
 * into the client_memory table.
 *
 * Debounce strategy: If the oldest pending event for a contact is less
 * than 10 seconds old, the function returns early. The next INSERT will
 * re-trigger, giving rapid edits time to accumulate into a single batch.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { callWithFallback } from '../_shared/ai-provider.ts';
import { getServiceRoleClient, isInternalServiceCall } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

// ============================================================================
// SYSTEM PROMPT - Memory Encoding
// ============================================================================

const MEMORY_ENCODING_PROMPT = `You are a CRM memory encoder for a sales intelligence platform. Your job is to extract factual, actionable information from CRM events and maintain a structured memory about each client contact.

Given:
1. The contact's current profile (name, company, title, etc.)
2. Their existing memory (may be empty for new contacts)
3. New CRM events (notes, activities, deal changes, contact updates)

Extract and return valid JSON:

{
  "new_facts": [
    {
      "fact": "Concise factual statement",
      "category": "personal|professional|deal|communication|preference",
      "confidence": 0.9
    }
  ],
  "key_dates": [
    {
      "date": "YYYY-MM-DD",
      "label": "What happens on this date",
      "recurring": false
    }
  ],
  "updated_summary": "2-3 sentence updated summary incorporating new information with existing context",
  "communication_signals": {
    "preferred_channel": "email|phone|in_person|null",
    "tone_preference": "formal|casual|null",
    "best_time": "string description or null"
  }
}

Rules:
- Only extract explicitly stated facts, never infer or assume
- Deduplicate against existing facts — do not repeat what is already known
- Keep updated_summary under 500 characters
- Dates must be in YYYY-MM-DD format
- Confidence 0.0-1.0 based on how clearly the fact was stated
- If no new facts can be extracted, return empty new_facts array
- Preserve existing key_dates — only add new ones
- For communication_signals, only update fields with clear evidence, leave others as null`;

// ============================================================================
// CONSTANTS
// ============================================================================

const DEBOUNCE_SECONDS = 10;
const MAX_EVENTS_PER_BATCH = 20;
const MAX_ENCODING_OPS_PER_HOUR = 10;

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
const startTime = Date.now();

  try {
    // Validate: must be internal service call (webhook or cron)
    if (!isInternalServiceCall(req)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: internal service call required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getServiceRoleClient();
    const body = await req.json();

    // Extract contact_id from webhook payload
    // Supabase Database Webhooks send the record as the body
    const record = body.record || body;
    const contactId = record.contact_id;
    const organizationId = record.organization_id;

    if (!contactId || !organizationId) {
      console.log('[process-memory] No contact_id or organization_id in payload, skipping');
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'missing contact_id or organization_id' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[process-memory] Processing event for contact: ${contactId}`);

    // ========================================================================
    // DEBOUNCE CHECK
    // ========================================================================

    const { data: pendingEvents, error: pendingError } = await supabase
      .from('client_memory_events')
      .select('id, created_at')
      .eq('contact_id', contactId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);

    if (pendingError) {
      console.error('[process-memory] Error checking pending events:', pendingError);
      throw pendingError;
    }

    if (!pendingEvents || pendingEvents.length === 0) {
      console.log('[process-memory] No pending events found, already processed');
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'no_pending_events' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const oldestEventAge = (Date.now() - new Date(pendingEvents[0].created_at).getTime()) / 1000;
    if (oldestEventAge < DEBOUNCE_SECONDS) {
      console.log(`[process-memory] Debounce: oldest event is ${oldestEventAge.toFixed(1)}s old, waiting`);
      return new Response(
        JSON.stringify({ status: 'debounced', age_seconds: oldestEventAge }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // RATE LIMIT CHECK
    // ========================================================================

    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { count: recentOps } = await supabase
      .from('client_memory_events')
      .select('id', { count: 'exact', head: true })
      .eq('contact_id', contactId)
      .eq('status', 'completed')
      .gte('processed_at', oneHourAgo);

    if ((recentOps || 0) >= MAX_ENCODING_OPS_PER_HOUR) {
      console.log(`[process-memory] Rate limit: ${recentOps} ops in last hour for contact ${contactId}`);
      // Mark pending events as skipped to prevent retry storm
      await supabase
        .from('client_memory_events')
        .update({ status: 'skipped', processed_at: new Date().toISOString(), error_message: 'rate_limited' })
        .eq('contact_id', contactId)
        .eq('status', 'pending');

      return new Response(
        JSON.stringify({ status: 'rate_limited', recent_ops: recentOps }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ========================================================================
    // CLAIM BATCH
    // ========================================================================

    // Get IDs of pending events to claim
    const { data: eventsToClaim } = await supabase
      .from('client_memory_events')
      .select('id')
      .eq('contact_id', contactId)
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(MAX_EVENTS_PER_BATCH);

    if (!eventsToClaim || eventsToClaim.length === 0) {
      return new Response(
        JSON.stringify({ status: 'skipped', reason: 'no_events_to_claim' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const claimedIds = eventsToClaim.map((e: any) => e.id);

    // Claim them
    await supabase
      .from('client_memory_events')
      .update({ status: 'processing' })
      .in('id', claimedIds);

    console.log(`[process-memory] Claimed ${claimedIds.length} events for contact ${contactId}`);

    // ========================================================================
    // GATHER CONTEXT
    // ========================================================================

    // Fetch claimed events with full data
    const { data: claimedEvents } = await supabase
      .from('client_memory_events')
      .select('id, event_type, source_table, source_id, event_data, created_at')
      .in('id', claimedIds)
      .order('created_at', { ascending: true });

    // Fetch contact profile
    const { data: contact } = await supabase
      .from('contacts')
      .select('id, first_name, last_name, full_name, email, phone, title, company, notes')
      .eq('id', contactId)
      .single();

    // Fetch existing memory
    const { data: existingMemory } = await supabase
      .from('client_memory')
      .select('*')
      .eq('contact_id', contactId)
      .eq('organization_id', organizationId)
      .single();

    // ========================================================================
    // BUILD LLM PROMPT
    // ========================================================================

    const contactProfile = contact
      ? `Name: ${contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim()}
Company: ${contact.company || 'Unknown'}
Title: ${contact.title || 'Unknown'}
Email: ${contact.email || 'N/A'}
Phone: ${contact.phone || 'N/A'}
Notes: ${contact.notes || 'None'}`
      : 'Contact profile not available';

    const existingMemoryText = existingMemory?.memory
      ? `Existing Memory:
Summary: ${existingMemory.memory.summary || 'None'}
Known Facts (${existingMemory.memory.facts?.length || 0}):
${(existingMemory.memory.facts || []).map((f: any) => `- [${f.category}] ${f.fact}`).join('\n') || 'None'}
Key Dates:
${(existingMemory.memory.key_dates || []).map((d: any) => `- ${d.date}: ${d.label}`).join('\n') || 'None'}`
      : 'No existing memory — this is a new contact.';

    const eventsText = (claimedEvents || []).map((e: any) => {
      const data = e.event_data || {};
      switch (e.event_type) {
        case 'note_created':
          return `[Note Created] Deal note (${data.note_type || 'general'}): "${data.content || ''}"`;
        case 'activity_logged':
          return `[Activity] ${data.type || 'Unknown'}: ${data.subject || ''} — ${data.description || ''}`;
        case 'deal_stage_changed':
          return `[Deal Stage Change] "${data.deal_name}" moved from ${data.old_stage} → ${data.new_stage} (amount: $${data.amount || 0})`;
        case 'contact_updated':
          const changes = data.changed_fields || {};
          const parts = [];
          if (changes.title_changed) parts.push(`Title changed to: ${changes.new_title}`);
          if (changes.company_changed) parts.push(`Company changed to: ${changes.new_company}`);
          if (changes.notes_changed) parts.push(`Notes updated: "${changes.new_notes}"`);
          return `[Contact Updated] ${parts.join('; ') || 'Fields updated'}`;
        default:
          return `[${e.event_type}] ${JSON.stringify(data).substring(0, 200)}`;
      }
    }).join('\n\n');

    const userPrompt = `## Contact Profile
${contactProfile}

## ${existingMemoryText}

## New CRM Events (${claimedEvents?.length || 0} events)
${eventsText}

Based on these new events, extract facts and update the memory. Remember: only extract explicitly stated information.`;

    // ========================================================================
    // CALL LLM
    // ========================================================================

    console.log('[process-memory] Calling AI provider...');

    const result = await callWithFallback({
      messages: [
        { role: 'system', content: MEMORY_ENCODING_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      tier: 'standard',
      temperature: 0.2,
      maxTokens: 1024,
      jsonMode: true
    });

    console.log(`[process-memory] AI response received from ${result.provider}`);

    // Parse response
    let extracted;
    try {
      extracted = JSON.parse(result.content);
    } catch (e) {
      const jsonMatch = result.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Failed to parse LLM response as JSON');
      }
    }

    // ========================================================================
    // MERGE AND UPSERT MEMORY
    // ========================================================================

    const now = new Date().toISOString();
    const existingFacts = existingMemory?.memory?.facts || [];
    const existingDates = existingMemory?.memory?.key_dates || [];

    // Add source metadata to new facts
    const newFacts = (extracted.new_facts || []).map((f: any) => ({
      ...f,
      source: claimedEvents?.[0]?.source_table || 'unknown',
      source_id: claimedEvents?.[0]?.source_id || null,
      extracted_at: now
    }));

    // Merge facts (append new, deduplicate by fact text)
    const existingFactTexts = new Set(existingFacts.map((f: any) => f.fact.toLowerCase().trim()));
    const dedupedNewFacts = newFacts.filter(
      (f: any) => !existingFactTexts.has(f.fact.toLowerCase().trim())
    );
    const mergedFacts = [...existingFacts, ...dedupedNewFacts];

    // Merge key dates (deduplicate by date+label)
    const existingDateKeys = new Set(existingDates.map((d: any) => `${d.date}:${d.label}`));
    const newDates = (extracted.key_dates || []).filter(
      (d: any) => !existingDateKeys.has(`${d.date}:${d.label}`)
    );
    const mergedDates = [...existingDates, ...newDates];

    // Build merged memory
    const mergedMemory = {
      facts: mergedFacts,
      summary: extracted.updated_summary || existingMemory?.memory?.summary || '',
      key_dates: mergedDates,
      communication_preferences: {
        ...(existingMemory?.memory?.communication_preferences || {}),
        // Only overwrite with non-null values
        ...(extracted.communication_signals?.preferred_channel
          ? { channel: extracted.communication_signals.preferred_channel } : {}),
        ...(extracted.communication_signals?.tone_preference
          ? { tone: extracted.communication_signals.tone_preference } : {}),
        ...(extracted.communication_signals?.best_time
          ? { best_time: extracted.communication_signals.best_time } : {}),
      },
      relationship_signals: existingMemory?.memory?.relationship_signals || {
        sentiment: 'neutral',
        engagement_level: 'unknown'
      }
    };

    // Upsert into client_memory
    const { error: upsertError } = await supabase
      .from('client_memory')
      .upsert({
        contact_id: contactId,
        organization_id: organizationId,
        memory: mergedMemory,
        version: (existingMemory?.version || 0) + 1,
        fact_count: mergedFacts.length,
        last_encoded_at: now,
        updated_at: now
      }, {
        onConflict: 'contact_id,organization_id'
      });

    if (upsertError) {
      console.error('[process-memory] Upsert error:', upsertError);
      throw upsertError;
    }

    console.log(`[process-memory] Memory updated: ${dedupedNewFacts.length} new facts, ${mergedFacts.length} total`);

    // ========================================================================
    // MARK EVENTS AS COMPLETED
    // ========================================================================

    await supabase
      .from('client_memory_events')
      .update({ status: 'completed', processed_at: now })
      .in('id', claimedIds);

    const processingTime = Date.now() - startTime;
    console.log(`[process-memory] Completed in ${processingTime}ms`);

    return new Response(
      JSON.stringify({
        status: 'success',
        events_processed: claimedIds.length,
        new_facts: dedupedNewFacts.length,
        total_facts: mergedFacts.length,
        processing_time_ms: processingTime
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[process-memory] Error:', error);

    // Try to mark claimed events as failed
    try {
      const supabase = getServiceRoleClient();
      const body = await req.clone().json();
      const contactId = (body.record || body).contact_id;
      if (contactId) {
        await supabase
          .from('client_memory_events')
          .update({
            status: 'failed',
            processed_at: new Date().toISOString(),
            error_message: error.message?.substring(0, 500)
          })
          .eq('contact_id', contactId)
          .eq('status', 'processing');
      }
    } catch (cleanupError) {
      console.error('[process-memory] Cleanup error:', cleanupError);
    }

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
