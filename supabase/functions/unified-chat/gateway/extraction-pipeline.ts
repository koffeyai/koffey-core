/**
 * Extraction Pipeline — deterministic fast path for sloppy meeting notes.
 *
 * When document detection fires, this module:
 * 1. Saves the raw note to source_documents (provenance)
 * 2. Calls extraction-agent to extract structured data
 * 3. Resolves extracted entities against existing CRM data
 * 4. Returns a formatted preview for user confirmation
 *
 * Backported from unified-chat-fullcanary.
 */

import { resolveFuzzyDate, inferIndustryFromName } from '../tools/crm-create.ts';

// ============================================================================
// Entity Resolution — check if extracted entities already exist
// ============================================================================

async function resolveExtractedEntities(
  extraction: any,
  supabase: any,
  organizationId: string
): Promise<any> {
  const resolved = JSON.parse(JSON.stringify(extraction));

  // Resolve account
  const accountName = extraction.anchor?.account?.name;
  if (accountName) {
    const { data: exactMatches } = await supabase
      .from('accounts')
      .select('id, name, domain')
      .eq('organization_id', organizationId)
      .ilike('name', accountName)
      .limit(5);

    if (exactMatches && exactMatches.length === 1) {
      resolved.anchor.account.existingId = exactMatches[0].id;
      resolved.anchor.account.isNew = false;
    } else if (exactMatches && exactMatches.length > 1) {
      resolved.anchor.account.isNew = false;
      resolved.anchor.account.candidates = exactMatches.map((a: any) => ({
        id: a.id, name: a.name, domain: a.domain,
      }));
    } else {
      // Fuzzy: search by first word
      const words = accountName.split(/\s+/).filter((w: string) => w.length > 2);
      if (words.length > 0) {
        const { data: fuzzy } = await supabase
          .from('accounts')
          .select('id, name, domain')
          .eq('organization_id', organizationId)
          .ilike('name', `%${words[0]}%`)
          .limit(5);
        if (fuzzy && fuzzy.length > 0) {
          resolved.anchor.account.isNew = false;
          resolved.anchor.account.candidates = fuzzy.map((a: any) => ({
            id: a.id, name: a.name, domain: a.domain,
          }));
        } else {
          resolved.anchor.account.isNew = true;
        }
      } else {
        resolved.anchor.account.isNew = true;
      }
    }
  }

  // Resolve contacts by name
  if (resolved.contacts) {
    for (let i = 0; i < resolved.contacts.length; i++) {
      const contact = resolved.contacts[i];
      if (contact.email) {
        const { data: byEmail } = await supabase
          .from('contacts')
          .select('id, full_name, email')
          .eq('organization_id', organizationId)
          .ilike('email', contact.email)
          .limit(1);
        if (byEmail && byEmail.length > 0) {
          resolved.contacts[i].existingId = byEmail[0].id;
          resolved.contacts[i].isNew = false;
          continue;
        }
      }
      const nameParts = (contact.name || '').split(' ');
      if (nameParts.length >= 2) {
        const { data: byName } = await supabase
          .from('contacts')
          .select('id, full_name')
          .eq('organization_id', organizationId)
          .ilike('full_name', `%${nameParts[0]}%${nameParts[nameParts.length - 1]}%`)
          .limit(1);
        if (byName && byName.length > 0) {
          resolved.contacts[i].existingId = byName[0].id;
          resolved.contacts[i].isNew = false;
          continue;
        }
      }
      resolved.contacts[i].isNew = true;
    }
  }

  return resolved;
}

// ============================================================================
// Format extraction preview for user confirmation
// ============================================================================

function formatExtractionPreview(extraction: any): string {
  const parts: string[] = [];
  parts.push(`**Here's what I extracted from your notes:**\n`);

  // Account
  const accountName = extraction.anchor?.account?.name || 'Unknown';
  const candidates = extraction.anchor?.account?.candidates;
  if (candidates && candidates.length > 0 && !extraction.anchor?.account?.existingId) {
    parts.push(`**Account:** ${accountName}`);
    parts.push(`Similar accounts found:`);
    candidates.forEach((c: any, i: number) => {
      parts.push(`  ${i + 1}. ${c.name}${c.domain ? ` (${c.domain})` : ''}${i === 0 ? ' - closest match' : ''}`);
    });
    parts.push(`  ${candidates.length + 1}. Create new "${accountName}"`);
  } else {
    const status = extraction.anchor?.account?.existingId ? 'existing' : 'new';
    parts.push(`**Account:** ${accountName} (${status})`);
  }

  // Deal/Opportunity
  if (extraction.anchor?.opportunity?.name) {
    const rawDealName = extraction.anchor.opportunity.name;
    // Avoid double-prefixing if extraction-agent already included account name
    const dealDisplay = rawDealName.toLowerCase().startsWith(accountName.toLowerCase())
      ? rawDealName
      : `${accountName} - ${rawDealName}`;
    const status = extraction.anchor.opportunity?.existingId ? 'existing' : 'new';
    parts.push(`**Deal:** ${dealDisplay} (${status})`);
    if (extraction.anchor.opportunity.stage) parts.push(`**Stage:** ${extraction.anchor.opportunity.stage}`);
    if (extraction.anchor.opportunity.closeWindow) parts.push(`**Target Close:** ${extraction.anchor.opportunity.closeWindow}`);
  }

  // Amount
  if (extraction.anchor?.opportunity?.amount) {
    const amt = extraction.anchor.opportunity.amount;
    parts.push(`**Amount:** $${amt >= 1_000_000 ? (amt / 1_000_000).toFixed(1) + 'M' : amt >= 1000 ? (amt / 1000).toFixed(0) + 'K' : amt}`);
  }

  // Contacts
  if (extraction.contacts && extraction.contacts.length > 0) {
    parts.push(`\n**Contacts:**`);
    for (const c of extraction.contacts) {
      const status = c.existingId ? 'existing' : 'new';
      const role = c.title || c.role || '';
      parts.push(`- ${c.name}${role ? ` — ${role}` : ''} (${status})`);
    }
  }

  // Next steps
  if (extraction.next_steps) {
    const ours = extraction.next_steps.ours || [];
    const theirs = extraction.next_steps.theirs || [];
    if (ours.length > 0 || theirs.length > 0) {
      parts.push(`\n**Next Steps:**`);
      for (const s of ours) parts.push(`- [Us] ${s.action || s}`);
      for (const s of theirs) parts.push(`- [Them] ${s.action || s}`);
    }
  }

  // Risks
  if (extraction.risks && extraction.risks.length > 0) {
    parts.push(`\n**Risks:**`);
    for (const r of extraction.risks) {
      parts.push(`- ${r.description || r} (${r.severity || 'medium'})`);
    }
  }

  // Competitors
  if (extraction.competitors && extraction.competitors.length > 0) {
    parts.push(`\n**Competitors:** ${extraction.competitors.join(', ')}`);
  }

  parts.push(`\n_Reply "yes" to save this to your CRM, or tell me what to change._`);
  return parts.join('\n');
}

// ============================================================================
// Main extraction pipeline
// ============================================================================

export async function runExtractionPipeline(params: {
  message: string;
  organizationId: string;
  userId: string;
  sessionId?: string;
  sessionTable?: string;
  admin: any; // supabase service role client
  corsHeaders: Record<string, string>;
  documentDetection: { isDocument: boolean; confidence: number; signals: string[] };
}): Promise<Response | null> {
  const { message, organizationId, userId, sessionId, sessionTable, admin, corsHeaders, documentDetection } = params;

  console.log('[extraction-pipeline] Starting extraction for detected document');

  // 1. Save raw note to source_documents
  let sourceDocumentId: string | null = null;
  try {
    const autoTitle = `Notes - ${new Date().toLocaleDateString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
    })}`;

    const { data: sourceDoc, error } = await admin
      .from('source_documents')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        source_type: 'chat_note',
        raw_content: message,
        title: autoTitle,
        chat_session_id: sessionId || null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('[extraction-pipeline] Failed to save source document:', error.message);
    } else {
      sourceDocumentId = sourceDoc.id;
      console.log('[extraction-pipeline] Saved source document:', sourceDocumentId);
    }
  } catch (err) {
    console.error('[extraction-pipeline] Source document save error:', err);
  }

  // 2. Call extraction-agent
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!supabaseUrl || !serviceKey) {
      console.error('[extraction-pipeline] Missing SUPABASE_URL or SERVICE_ROLE_KEY');
      return null;
    }

    const extractionResponse = await fetch(
      `${supabaseUrl}/functions/v1/extraction-agent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({ content: message, organizationId }),
      }
    );

    if (!extractionResponse.ok) {
      console.error('[extraction-pipeline] Extraction agent error:', await extractionResponse.text());
      return null; // Fall through to LLM
    }

    const extractionResult = await extractionResponse.json();

    if (!extractionResult.success || !extractionResult.extraction) {
      console.error('[extraction-pipeline] Extraction returned no data');
      return null;
    }

    const ext = extractionResult.extraction;
    console.log('[extraction-pipeline] Extraction successful, resolving entities');

    // 3. Resolve entities against existing CRM data
    const resolved = await resolveExtractedEntities(ext, admin, organizationId);
    const previewMessage = formatExtractionPreview(resolved);

    // 4. Store pending extraction for confirmation
    if (sessionId && sessionTable) {
      await admin
        .from(sessionTable)
        .update({
          pending_extraction: {
            ...resolved,
            _sourceDocumentId: sourceDocumentId,
            _rawSourceContent: message,
          },
          pending_extraction_at: new Date().toISOString(),
        })
        .eq('id', sessionId);
      console.log('[extraction-pipeline] Stored pending extraction for confirmation');
    }

    // 5. Return preview response
    return new Response(
      JSON.stringify({
        response: previewMessage,
        extraction: ext,
        crmOperations: [],
        citations: sourceDocumentId ? [{
          table: 'source_documents',
          rowId: sourceDocumentId,
          sourceTool: 'extraction-agent',
          valueSnapshot: { title: `Notes - ${new Date().toLocaleDateString()}` },
        }] : [],
        verification: { is_true: true, citation_count: 1, policy: 'advisory', source_status: 'source_backed', blocking_failure: false },
        meta: {
          channel: 'web',
          documentDetection,
          awaitingConfirmation: true,
          execution: { deterministicPathUsed: true, path: 'extraction_pipeline' },
        },
        provenance: {
          source: 'extraction-agent',
          type: 'document_extraction_preview',
          confidence: ext.confidence?.overall || 0.7,
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('[extraction-pipeline] Error:', error);
    return null; // Fall through to LLM
  }
}

// ============================================================================
// Confirmation patterns — detect user saying "yes" to save
// ============================================================================

const CONFIRM_PATTERNS = [
  /^(yes|yep|yeah|yea|ya|y|sure|ok|okay|go ahead|proceed|confirm|save|do it|go for it|looks good|lgtm|correct|that's right|perfect|sounds good|approved|ship it)[\s!.]*$/i,
];

const REJECT_PATTERNS = [
  /^(no|nope|nah|cancel|stop|don't|discard|never mind|nevermind|scratch that|forget it)[\s!.]*$/i,
];

export function isExtractionConfirmation(message: string): 'confirm' | 'reject' | null {
  const trimmed = message.trim();
  if (CONFIRM_PATTERNS.some(p => p.test(trimmed))) return 'confirm';
  if (REJECT_PATTERNS.some(p => p.test(trimmed))) return 'reject';
  return null;
}

// ============================================================================
// Confirm pending extraction — save entities to CRM
// ============================================================================

export async function confirmPendingExtraction(params: {
  sessionId: string;
  sessionTable: string;
  organizationId: string;
  userId: string;
  admin: any;
  corsHeaders: Record<string, string>;
}): Promise<Response | null> {
  const { sessionId, sessionTable, organizationId, userId, admin, corsHeaders } = params;

  // 1. Load pending extraction from session
  const { data: session, error: sessionError } = await admin
    .from(sessionTable)
    .select('pending_extraction')
    .eq('id', sessionId)
    .maybeSingle();

  if (sessionError || !session?.pending_extraction) {
    console.log('[extraction-confirm] No pending extraction found');
    return null; // No pending extraction — fall through to normal routing
  }

  const extraction = session.pending_extraction;
  console.log('[extraction-confirm] Confirming pending extraction');

  const crmOperations: any[] = [];
  let accountId: string | null = null;
  let accountName = extraction.anchor?.account?.name || 'Unknown';

  try {
    // 2. Create or resolve account
    if (extraction.anchor?.account) {
      if (extraction.anchor.account.existingId) {
        accountId = extraction.anchor.account.existingId;
        console.log(`[extraction-confirm] Using existing account: ${accountId}`);
      } else {
        const inferredIndustry = inferIndustryFromName(accountName);
        const { data: newAccount, error: accountError } = await admin
          .from('accounts')
          .insert({
            organization_id: organizationId,
            user_id: userId,
            name: accountName,
            assigned_to: userId,
            ...(inferredIndustry ? { industry: inferredIndustry } : {}),
          })
          .select('id, name')
          .single();

        if (accountError) {
          console.error('[extraction-confirm] Account creation failed:', accountError.message);
        } else {
          accountId = newAccount.id;
          accountName = newAccount.name;
          crmOperations.push({ type: 'create', entity: 'account', id: accountId, name: accountName });
          console.log(`[extraction-confirm] Created account: ${accountName} (${accountId})`);
        }
      }
    }

    // 3. Create contacts
    const createdContacts: any[] = [];
    if (extraction.contacts) {
      for (const contact of extraction.contacts) {
        if (contact.existingId) {
          createdContacts.push({ id: contact.existingId, name: contact.name, isNew: false });
          continue;
        }
        const nameParts = (contact.name || '').split(' ');
        const insertData: any = {
          organization_id: organizationId,
          user_id: userId,
          full_name: contact.name,
          first_name: nameParts[0] || '',
          last_name: nameParts.slice(1).join(' ') || '',
          title: contact.title || contact.role || null,
          company: accountName,
          account_id: accountId,
          assigned_to: userId,
          status: 'lead',
        };
        if (contact.email) insertData.email = contact.email;
        if (contact.phone) insertData.phone = contact.phone;

        const { data: newContact, error: contactError } = await admin
          .from('contacts')
          .insert(insertData)
          .select('id, full_name')
          .single();

        if (contactError) {
          console.error(`[extraction-confirm] Contact creation failed for ${contact.name}:`, contactError.message);
        } else {
          createdContacts.push({ id: newContact.id, name: newContact.full_name, isNew: true });
          crmOperations.push({ type: 'create', entity: 'contact', id: newContact.id, name: newContact.full_name });
          console.log(`[extraction-confirm] Created contact: ${newContact.full_name} (${newContact.id})`);
        }
      }
    }

    // 4. Create deal
    let dealId: string | null = null;
    if (extraction.anchor?.opportunity?.name) {
      const opp = extraction.anchor.opportunity;
      // Avoid double-prefixing if extraction-agent already included account name
      const dealName = opp.name.toLowerCase().startsWith(accountName.toLowerCase())
        ? opp.name
        : `${accountName} - ${opp.name}`;

      // Parse close date from closeWindow — supports "Q3 2026", "End of April 2026", "next month", etc.
      let closeDate: string | null = null;
      if (opp.closeWindow) {
        closeDate = resolveFuzzyDate(opp.closeWindow);
      }

      const dealData: any = {
        organization_id: organizationId,
        user_id: userId,
        name: dealName,
        stage: opp.stage || 'qualification',
        amount: opp.amount || null,
        assigned_to: userId,
        account_id: accountId,
      };
      if (closeDate) dealData.expected_close_date = closeDate;
      if (createdContacts.length > 0) dealData.contact_id = createdContacts[0].id;

      const { data: newDeal, error: dealError } = await admin
        .from('deals')
        .insert(dealData)
        .select('id, name, amount, stage')
        .single();

      if (dealError) {
        console.error('[extraction-confirm] Deal creation failed:', dealError.message);
      } else {
        dealId = newDeal.id;
        crmOperations.push({ type: 'create', entity: 'deal', id: dealId, name: newDeal.name, amount: newDeal.amount });
        console.log(`[extraction-confirm] Created deal: ${newDeal.name} (${dealId})`);
      }
    }

    // 5. Create activity for next steps
    if (extraction.next_steps) {
      const allSteps = [
        ...(extraction.next_steps.ours || []).map((s: any) => `[Us] ${s.action || s}`),
        ...(extraction.next_steps.theirs || []).map((s: any) => `[Them] ${s.action || s}`),
      ];
      if (allSteps.length > 0 && (dealId || accountId)) {
        await admin.from('activities').insert({
          organization_id: organizationId,
          user_id: userId,
          type: 'note',
          subject: `Next steps from meeting notes`,
          notes: allSteps.join('\n'),
          deal_id: dealId,
          account_id: accountId,
          contact_id: createdContacts[0]?.id || null,
        });
        console.log('[extraction-confirm] Created activity for next steps');
      }
    }

    // 6. Clear pending extraction
    await admin
      .from(sessionTable)
      .update({ pending_extraction: null, pending_extraction_at: null })
      .eq('id', sessionId);
    console.log('[extraction-confirm] Cleared pending extraction');

    // 7. Build confirmation response
    const parts: string[] = [];
    parts.push(`**Saved to your CRM!** Here's what was created:\n`);
    for (const op of crmOperations) {
      if (op.entity === 'account') parts.push(`- **Account:** ${op.name}`);
      if (op.entity === 'contact') parts.push(`- **Contact:** ${op.name}`);
      if (op.entity === 'deal') {
        const amt = op.amount ? ` ($${op.amount >= 1_000_000 ? (op.amount / 1_000_000).toFixed(1) + 'M' : op.amount >= 1000 ? (op.amount / 1000).toFixed(0) + 'K' : op.amount})` : '';
        parts.push(`- **Deal:** ${op.name}${amt}`);
      }
    }
    if (crmOperations.length === 0) {
      parts.push('All entities already existed — no new records needed.');
    }

    return new Response(
      JSON.stringify({
        response: parts.join('\n'),
        crmOperations,
        citations: crmOperations.map(op => ({
          table: op.entity === 'deal' ? 'deals' : op.entity === 'contact' ? 'contacts' : 'accounts',
          rowId: op.id,
          sourceTool: 'extraction-confirm',
          valueSnapshot: { name: op.name },
        })),
        verification: { is_true: true, citation_count: crmOperations.length, policy: 'advisory', source_status: 'source_backed', blocking_failure: false },
        meta: {
          channel: 'web',
          execution: { deterministicPathUsed: true, path: 'extraction_confirm' },
          entityContext: (() => {
            // Build entity context from created entities so pronoun resolution works on the next message
            const referencedEntities: Record<string, any[]> = {};
            let primaryEntity: any = undefined;
            const now = new Date().toISOString();
            for (const op of crmOperations) {
              const type = op.entity === 'deal' ? 'deals' : op.entity === 'contact' ? 'contacts' : 'accounts';
              if (!referencedEntities[type]) referencedEntities[type] = [];
              referencedEntities[type].push({ id: op.id, name: op.name, type: op.entity, referencedAt: now });
              if (op.entity === 'deal') {
                primaryEntity = { id: op.id, name: op.name, type: 'deal', referencedAt: now };
              }
            }
            return { referencedEntities, primaryEntity };
          })(),
        },
        provenance: {
          source: 'extraction-confirm',
          type: 'document_extraction_saved',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  } catch (error) {
    console.error('[extraction-confirm] Error saving entities:', error);
    return new Response(
      JSON.stringify({
        response: 'Sorry, I ran into an error saving those records. Please try again or create them manually.',
        crmOperations: [],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
    );
  }
}

// ============================================================================
// Reject pending extraction — discard without saving
// ============================================================================

export async function rejectPendingExtraction(params: {
  sessionId: string;
  sessionTable: string;
  admin: any;
  corsHeaders: Record<string, string>;
}): Promise<Response> {
  const { sessionId, sessionTable, admin, corsHeaders } = params;

  await admin
    .from(sessionTable)
    .update({ pending_extraction: null, pending_extraction_at: null })
    .eq('id', sessionId);

  console.log('[extraction-confirm] Rejected and cleared pending extraction');

  return new Response(
    JSON.stringify({
      response: 'No problem — I\'ve discarded the extraction. Nothing was saved.',
      crmOperations: [],
      verification: { is_true: true, citation_count: 0, policy: 'advisory', source_status: 'source_backed', blocking_failure: false },
      meta: {
        channel: 'web',
        execution: { deterministicPathUsed: true, path: 'extraction_reject' },
      },
    }),
    { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders } }
  );
}
