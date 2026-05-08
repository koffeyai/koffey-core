/**
 * CRM update operations for unified-chat skills.
 */

import {
  cleanEntityDisplayName,
  normalizeDealStage,
  parseNaturalDate,
  resolveAccountByIdOrName,
  resolveContactByIdOrName,
  resolveDealByIdOrName,
} from './entity-utils.ts';

function appendText(existing: string | null | undefined, incoming: string): string {
  const oldValue = (existing || '').trim();
  const newValue = (incoming || '').trim();
  if (!oldValue) return newValue;
  if (!newValue) return oldValue;
  if (oldValue.includes(newValue)) return oldValue;
  return `${oldValue}\n\n---\n${newValue}`;
}

function splitProductList(raw: string): string[] {
  return raw
    .split(/,| and /i)
    .map((value) => value.trim())
    .filter((value) => value.length > 1)
    .slice(0, 8);
}

function inferUpdatesFromDealNote(note: string): {
  inferred: Record<string, any>;
  stakeholderName: string | null;
} {
  const text = (note || '').trim();
  const lower = text.toLowerCase();
  const inferred: Record<string, any> = {};

  if (!text) return { inferred, stakeholderName: null };

  const probabilityMatch = lower.match(/\b(\d{1,3})\s?%/);
  if (probabilityMatch) {
    const prob = Math.max(0, Math.min(100, Number(probabilityMatch[1])));
    if (Number.isFinite(prob)) inferred.probability = prob;
  }

  const stagePatterns: Array<{ pattern: RegExp; stage: string }> = [
    { pattern: /\bclosed[\s_-]?won\b|\bwon the deal\b/i, stage: 'closed_won' },
    {
      pattern: /\bclosed[\s_-]?lost\b|\bclose(?:\s+it)?\s+as\s+lost\b|\bmark(?:\s+it)?\s+as\s+lost\b|\bdeal\s+is\s+dead\b|\bno\s+go\b|\bnot\s+moving\s+forward\b/i,
      stage: 'closed_lost'
    },
    { pattern: /\bnegotiation\b|\bnegotiating\b/, stage: 'negotiation' },
    { pattern: /\bproposal\b/, stage: 'proposal' },
    { pattern: /\bqualified\b|\bqualification\b|\bdiscovery\b/, stage: 'qualified' },
    { pattern: /\bprospecting\b/, stage: 'prospecting' },
  ];
  for (const candidate of stagePatterns) {
    if (candidate.pattern.test(lower)) {
      inferred.stage = candidate.stage;
      break;
    }
  }

  const datePhraseMatch = text.match(
    /\b(?:close(?:s|d)?|target(?: close)?|by|before|around|eta)\s+(today|tomorrow|next week|end of week|eow|end of month|eom|next (?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)|(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s*\d{4})?|\d{1,2}[\/-]\d{1,2}(?:[\/-]\d{2,4})?|q[1-4](?:\s+\d{4})?)\b/i
  );
  if (datePhraseMatch?.[1]) {
    const parsedDate = parseNaturalDate(datePhraseMatch[1]);
    if (parsedDate) inferred.expected_close_date = parsedDate;
  }

  if (!inferred.expected_close_date) {
    const quarterMatch = text.match(/\bq[1-4](?:\s+\d{4})?\b/i);
    if (quarterMatch?.[0]) {
      const parsedQuarterDate = parseNaturalDate(quarterMatch[0]);
      if (parsedQuarterDate) inferred.expected_close_date = parsedQuarterDate;
    }
  }

  const competitorMatch = text.match(
    /\b(?:went with|chose|selected|lost to|against|vs\.?|versus|competing with)\s+([A-Z][A-Za-z0-9&.\- ]{1,50})/i,
  );
  if (competitorMatch?.[1]) {
    inferred.competitor_name = competitorMatch[1].trim().replace(/[,.]$/, '');
  }

  if (/\b(no budget|budget cut|budget freeze|budget frozen|budget issue)\b/i.test(lower)) {
    inferred.close_reason = 'lost_budget';
  } else if (/\b(timing|not now|pushed out|next year|next quarter)\b/i.test(lower)) {
    inferred.close_reason = 'lost_timing';
  } else if (/\b(no decision|went dark|ghosted|stalled)\b/i.test(lower)) {
    inferred.close_reason = 'lost_no_decision';
  } else if (inferred.competitor_name && /\b(lost|went with|selected|chose)\b/i.test(lower)) {
    inferred.close_reason = 'lost_to_competitor';
  }

  if (/\bconference|summit|expo|trade show|event\b/i.test(lower)) {
    inferred.lead_source = 'Conference';
  } else if (/\breferral\b/i.test(lower)) {
    inferred.lead_source = 'Referral';
  } else if (/\bwebinar\b/i.test(lower)) {
    inferred.lead_source = 'Webinar';
  } else if (/\binbound\b/i.test(lower)) {
    inferred.lead_source = 'Inbound';
  }

  const useCaseMatch = text.match(/\b(?:needs?|looking to|wants? to|trying to|goal is to)\s+([^.;\n]+)/i);
  if (useCaseMatch?.[1]) {
    inferred.key_use_case = useCaseMatch[1].trim();
  }

  const productsMatch = text.match(/\b(?:products?|modules?|features?)\s*:\s*([^.\n]+)/i);
  if (productsMatch?.[1]) {
    const products = splitProductList(productsMatch[1]);
    if (products.length > 0) inferred.products_positioned = products;
  }

  if (inferred.stage === 'closed_lost' && inferred.close_reason && !inferred.close_notes) {
    inferred.close_notes = text;
  }

  let stakeholderName: string | null = null;
  const stakeholderMatch = text.match(
    /\b(?:met|meeting|spoke|talked|called|call|emailed)\s+(?:with|to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
  );
  if (stakeholderMatch?.[1]) {
    stakeholderName = stakeholderMatch[1].trim();
  } else {
    const altMatch = text.match(/\bwith\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,2})\s+(?:from|at)\b/);
    if (altMatch?.[1]) stakeholderName = altMatch[1].trim();
  }

  return { inferred, stakeholderName };
}

async function upsertStakeholderFromDealNote(
  supabase: any,
  organizationId: string,
  userId: string | undefined,
  deal: any,
  stakeholderName: string,
  note: string,
  leadSource?: string,
): Promise<{ contactId: string; contactName: string; created: boolean } | null> {
  if (!stakeholderName || !userId) return null;

  const normalizedStakeholder = stakeholderName.trim();
  if (!normalizedStakeholder) return null;

  let lookup = supabase
    .from('contacts')
    .select('id, full_name, account_id')
    .eq('organization_id', organizationId)
    .ilike('full_name', normalizedStakeholder)
    .limit(5);

  if (deal.account_id) {
    lookup = lookup.eq('account_id', deal.account_id);
  }

  const { data: existingMatches } = await lookup;
  let contact = (existingMatches || []).find(
    (c: any) => (c.full_name || '').trim().toLowerCase() === normalizedStakeholder.toLowerCase(),
  ) || (existingMatches || [])[0] || null;
  let created = false;

  if (!contact) {
    const nameParts = normalizedStakeholder.split(/\s+/);
    const firstName = nameParts.shift() || null;
    const lastName = nameParts.join(' ') || null;

    const { data: createdContact, error: createError } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        user_id: userId,
        assigned_to: userId,
        first_name: firstName,
        last_name: lastName,
        full_name: normalizedStakeholder,
        company: deal.accounts?.name || null,
        account_id: deal.account_id || null,
        status: 'lead',
        lead_source: leadSource || null,
        notes: note || null,
      })
      .select('id, full_name')
      .single();

    if (createError || !createdContact) {
      console.warn('[update_deal] Failed to create stakeholder contact from note:', createError?.message);
      return null;
    }

    contact = createdContact;
    created = true;
  }

  const { error: linkError } = await supabase
    .from('deal_contacts')
    .upsert({
      deal_id: deal.id,
      contact_id: contact.id,
      organization_id: organizationId,
      created_by: userId,
      notes: note || null,
    }, { onConflict: 'deal_id,contact_id' });

  if (linkError) {
    console.warn('[update_deal] Failed to link stakeholder to deal:', linkError.message);
  }

  return {
    contactId: contact.id,
    contactName: contact.full_name || normalizedStakeholder,
    created,
  };
}

export async function executeUpdateDeal(
  supabase: any,
  args: any,
  organizationId: string,
  userId?: string,
): Promise<any> {
  const { deal_id, deal_name, updates, confirmed } = args || {};

  if (!updates || Object.keys(updates).length === 0) {
    return { success: false, message: 'No updates specified. What would you like to change?' };
  }

  const resolved = await resolveDealByIdOrName(supabase, organizationId, {
    dealId: deal_id,
    dealName: deal_name,
  });

  if (resolved.multiple) {
    const list = resolved.multiple.map((d: any, i: number) =>
      `${i + 1}. **${d.name}** - $${(d.amount || 0).toLocaleString()} (${d.stage || 'unknown'})`
    ).join('\n');
    return { success: false, message: `I found multiple deals:\n\n${list}\n\nWhich one should I update?` };
  }
  if (!resolved.deal) {
    return { success: false, message: resolved.error || 'I could not resolve that deal.' };
  }

  const deal = resolved.deal;
  const normalizedUpdates: Record<string, any> = { ...updates };
  let inferredStakeholderName: string | null = null;

  if (typeof normalizedUpdates.description === 'string' && normalizedUpdates.description.trim().length > 0) {
    const extracted = inferUpdatesFromDealNote(normalizedUpdates.description);
    inferredStakeholderName = extracted.stakeholderName;
    for (const [key, value] of Object.entries(extracted.inferred)) {
      if (normalizedUpdates[key] === undefined) {
        normalizedUpdates[key] = value;
      }
    }
  }

  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  const changed: string[] = [];

  if (normalizedUpdates.stage !== undefined) {
    payload.stage = normalizeDealStage(normalizedUpdates.stage, deal.stage || 'prospecting');
    changed.push('stage');
  }
  if (normalizedUpdates.amount !== undefined) {
    payload.amount = normalizedUpdates.amount;
    changed.push('amount');
  }
  if (normalizedUpdates.probability !== undefined) {
    const p = Math.max(0, Math.min(100, Number(normalizedUpdates.probability)));
    payload.probability = Number.isFinite(p) ? p : deal.probability;
    changed.push('probability');
  }
  if (normalizedUpdates.expected_close_date !== undefined) {
    payload.expected_close_date = normalizedUpdates.expected_close_date;
    changed.push('expected_close_date');
  }
  if (normalizedUpdates.description !== undefined) {
    payload.description = appendText(deal.description, normalizedUpdates.description);
    changed.push('description');
  }
  if (normalizedUpdates.name !== undefined) {
    payload.name = normalizedUpdates.name;
    changed.push('name');
  }
  if (normalizedUpdates.close_reason !== undefined) {
    payload.close_reason = normalizedUpdates.close_reason;
    changed.push('close_reason');
  }
  if (normalizedUpdates.close_notes !== undefined) {
    payload.close_notes = normalizedUpdates.close_notes;
    changed.push('close_notes');
  }
  if (normalizedUpdates.competitor_name !== undefined) {
    payload.competitor_name = normalizedUpdates.competitor_name;
    changed.push('competitor_name');
  }
  if (normalizedUpdates.forecast_category !== undefined) {
    payload.forecast_category = normalizedUpdates.forecast_category;
    changed.push('forecast_category');
  }
  if (normalizedUpdates.key_use_case !== undefined) {
    payload.key_use_case = normalizedUpdates.key_use_case;
    changed.push('key_use_case');
  }
  if (normalizedUpdates.lead_source !== undefined) {
    payload.lead_source = normalizedUpdates.lead_source;
    changed.push('lead_source');
  }
  if (normalizedUpdates.products_positioned !== undefined) {
    payload.products_positioned = Array.isArray(normalizedUpdates.products_positioned)
      ? normalizedUpdates.products_positioned
      : splitProductList(String(normalizedUpdates.products_positioned));
    changed.push('products_positioned');
  }

  const isClosingLostTransition = payload.stage === 'closed_lost' && String(deal.stage || '') !== 'closed_lost';
  if (isClosingLostTransition && !confirmed) {
    return {
      success: false,
      _needsConfirmation: true,
      _confirmationType: 'close_deal_as_lost',
      deal_id: deal.id,
      deal_name: deal.name,
      pending_update: {
        deal_id: deal.id,
        deal_name: deal.name,
        updates: normalizedUpdates,
      },
      message: `You're asking to move **${deal.name}** to **Closed Lost**. Reply "yes" to confirm this stage change, or tell me a different action.`,
    };
  }

  if (payload.stage === 'closed_lost' && !payload.close_reason && !deal.close_reason) {
    return {
      success: false,
      _needsLossReason: true,
      deal_id: deal.id,
      deal_name: deal.name,
      message: `Before I close **${deal.name}** as lost, what was the reason?`,
    };
  }

  const criticalConflicts: string[] = [];
  if (!confirmed) {
    if (
      payload.amount !== undefined
      && deal.amount !== undefined
      && deal.amount !== null
      && Number(payload.amount) !== Number(deal.amount)
    ) {
      criticalConflicts.push(`Amount: $${Number(deal.amount || 0).toLocaleString()} -> $${Number(payload.amount || 0).toLocaleString()}`);
    }

    if (
      payload.stage !== undefined
      && String(payload.stage || '') !== String(deal.stage || '')
      && deal.stage != null
    ) {
      // Only flag regressions or reopening closed deals — forward progressions are fine
      const STAGE_ORDER = ['prospecting', 'qualified', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];
      const fromIdx = STAGE_ORDER.indexOf(String(deal.stage || ''));
      const toIdx = STAGE_ORDER.indexOf(String(payload.stage || ''));
      const isRegression = fromIdx >= 0 && toIdx >= 0 && toIdx < fromIdx;
      const isReopeningClosed = /^closed_/.test(String(deal.stage || '')) && !/^closed_/.test(String(payload.stage || ''));
      if (isRegression || isReopeningClosed) {
        criticalConflicts.push(`Stage: ${deal.stage || 'unknown'} -> ${payload.stage} (regression)`);
      }
    }

    if (
      payload.expected_close_date !== undefined
      && String(payload.expected_close_date || '') !== String(deal.expected_close_date || '')
      && deal.expected_close_date != null
    ) {
      criticalConflicts.push(`Close date: ${deal.expected_close_date} -> ${payload.expected_close_date}`);
    }
  }

  if (criticalConflicts.length > 0) {
    return {
      success: false,
      _needsConfirmation: true,
      _confirmationType: 'update_deal_conflict',
      deal_id: deal.id,
      deal_name: deal.name,
      pending_update: {
        deal_id: deal.id,
        deal_name: deal.name,
        updates: normalizedUpdates,
      },
      message: `I found existing values on **${deal.name}** that would be overwritten:\n\n${criticalConflicts.map((item) => `• ${item}`).join('\n')}\n\nReply "yes" to confirm this update, or tell me what to change.`,
    };
  }

  if (changed.length === 0) {
    return { success: false, message: 'No valid fields to update.' };
  }

  const { error } = await supabase
    .from('deals')
    .update(payload)
    .eq('id', deal.id)
    .eq('organization_id', organizationId);

  if (error) {
    return { success: false, message: `Failed to update the deal: ${error.message}` };
  }

  const extraChanges: string[] = [];
  if (payload.description && inferredStakeholderName) {
    const stakeholderResult = await upsertStakeholderFromDealNote(
      supabase,
      organizationId,
      userId,
      deal,
      inferredStakeholderName,
      normalizedUpdates.description,
      payload.lead_source,
    );

    if (stakeholderResult?.contactId && !deal.contact_id) {
      await supabase
        .from('deals')
        .update({ contact_id: stakeholderResult.contactId, updated_at: new Date().toISOString() })
        .eq('id', deal.id)
        .eq('organization_id', organizationId);
      extraChanges.push(`Primary contact set: ${stakeholderResult.contactName}`);
    }

    if (stakeholderResult?.contactId) {
      extraChanges.push(
        stakeholderResult.created
          ? `Stakeholder captured: ${stakeholderResult.contactName} (new contact created)`
          : `Stakeholder captured: ${stakeholderResult.contactName}`,
      );
    }
  }

  const changes = changed.map((field) => {
    if (field === 'amount') return `Amount: $${(deal.amount || 0).toLocaleString()} -> $${(payload.amount || 0).toLocaleString()}`;
    if (field === 'probability') return `Probability: ${deal.probability || 0}% -> ${payload.probability}%`;
    if (field === 'stage') return `Stage: ${deal.stage || 'unknown'} -> ${payload.stage}`;
    if (field === 'expected_close_date') return `Close date: ${deal.expected_close_date || 'none'} -> ${payload.expected_close_date}`;
    if (field === 'description') return 'Description updated';
    if (field === 'name') return `Name: ${deal.name} -> ${payload.name}`;
    if (field === 'close_reason') return `Close reason: ${payload.close_reason}`;
    if (field === 'close_notes') return 'Close notes updated';
    if (field === 'competitor_name') return `Competitor: ${deal.competitor_name || 'none'} -> ${payload.competitor_name}`;
    if (field === 'forecast_category') return `Forecast: ${deal.forecast_category || 'none'} -> ${payload.forecast_category}`;
    if (field === 'key_use_case') return `Use case: ${payload.key_use_case}`;
    if (field === 'lead_source') return `Lead source: ${payload.lead_source}`;
    if (field === 'products_positioned') return `Products positioned: ${(payload.products_positioned || []).join(', ')}`;
    return `${field} updated`;
  });
  changes.push(...extraChanges);

  return {
    id: deal.id,
    success: true,
    entity: 'deal',
    name: payload.name || deal.name,
    changes,
    message: `✅ **${payload.name || deal.name}** updated!\n\n${changes.map((c) => `• ${c}`).join('\n')}`,
  };
}

export async function executeDeleteDeal(
  supabase: any,
  args: any,
  organizationId: string,
  userId?: string,
): Promise<any> {
  const { deal_id, deal_name, delete_reason, confirmed } = args || {};

  const resolved = await resolveDealByIdOrName(supabase, organizationId, {
    dealId: deal_id,
    dealName: deal_name,
  });

  if (resolved.multiple) {
    const list = resolved.multiple.map((d: any, i: number) =>
      `${i + 1}. **${d.name}** - $${(d.amount || 0).toLocaleString()} (${d.stage || 'unknown'})`
    ).join('\n');
    return { success: false, message: `I found multiple deals:\n\n${list}\n\nWhich one should I delete?` };
  }
  if (!resolved.deal) {
    return { success: false, message: resolved.error || 'I could not resolve that deal.' };
  }

  const deal = resolved.deal;

  if (!confirmed) {
    return {
      success: false,
      _needsConfirmation: true,
      _confirmationType: 'delete_deal',
      deal_id: deal.id,
      deal_name: deal.name,
      pending_delete: {
        deal_id: deal.id,
        deal_name: deal.name,
        delete_reason: delete_reason || null,
      },
      message: `You're asking to permanently delete **${deal.name}**. Reply "yes" to confirm deletion.`,
    };
  }

  // Best-effort cleanup for known dependent tables so deletion can complete across common FK setups.
  const dependentDeletes: Array<{ table: string; field: string }> = [
    { table: 'deal_contacts', field: 'deal_id' },
    { table: 'deal_notes', field: 'deal_id' },
    { table: 'deal_terms', field: 'deal_id' },
    { table: 'deal_feature_gaps', field: 'deal_id' },
    { table: 'deal_attachments', field: 'deal_id' },
    { table: 'campaign_deals', field: 'deal_id' },
    { table: 'commission_records', field: 'deal_id' },
    { table: 'tasks', field: 'deal_id' },
    { table: 'generated_presentations', field: 'deal_id' },
    { table: 'source_documents', field: 'deal_id' },
    { table: 'suggested_actions', field: 'deal_id' },
    { table: 'feature_requests', field: 'source_deal_id' },
  ];

  for (const relation of dependentDeletes) {
    const { error } = await supabase
      .from(relation.table)
      .delete()
      .eq(relation.field, deal.id);

    if (error) {
      console.warn(`[delete_deal] Cleanup warning on ${relation.table}.${relation.field}: ${error.message}`);
    }
  }

  const { error: deleteError } = await supabase
    .from('deals')
    .delete()
    .eq('id', deal.id)
    .eq('organization_id', organizationId);

  if (deleteError) {
    return {
      success: false,
      message: `I couldn't delete **${deal.name}**: ${deleteError.message}`,
    };
  }

  try {
    await supabase.from('audit_log').insert({
      organization_id: organizationId,
      user_id: userId || null,
      table_name: 'deals',
      record_id: deal.id,
      operation: 'DELETE',
      old_values: deal,
      new_values: null,
      changes: {
        deleted: true,
        deal_name: deal.name,
        amount: deal.amount || null,
        stage: deal.stage || null,
        account_id: deal.account_id || null,
        expected_close_date: deal.expected_close_date || null,
      },
      reason: delete_reason || 'user_requested_delete_deal',
      approval_required: false,
      approval_status: 'approved',
    });
  } catch (auditError: any) {
    console.warn('[delete_deal] Failed to write explicit audit log entry:', auditError?.message || auditError);
  }

  return {
    success: true,
    id: deal.id,
    deal_id: deal.id,
    entity: 'deal',
    action: 'deleted',
    name: deal.name,
    deleted_entity_name: deal.name,
    delete_reason: delete_reason || 'user_requested_delete_deal',
    message: `✅ Deleted **${deal.name}**.`,
  };
}

export async function executeUpdateContact(
  supabase: any,
  args: any,
  organizationId: string,
): Promise<any> {
  const { contact_id, contact_name, contact_email, updates } = args || {};

  if (!updates || Object.keys(updates).length === 0) {
    return { success: false, message: 'No updates specified. What would you like to change?' };
  }

  const resolved = await resolveContactByIdOrName(supabase, organizationId, {
    contactId: contact_id,
    contactName: contact_name,
    contactEmail: contact_email,
  });

  if (resolved.multiple) {
    const list = resolved.multiple.map((c: any, i: number) =>
      `${i + 1}. **${c.full_name || `${c.first_name || ''} ${c.last_name || ''}`.trim()}** - ${c.email || c.company || 'No email'}`
    ).join('\n');
    return { success: false, message: `I found multiple contacts:\n\n${list}\n\nWhich one should I update?` };
  }
  if (!resolved.contact) {
    return { success: false, message: resolved.error || 'I could not resolve that contact.' };
  }

  const contact = resolved.contact;
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  const changed: string[] = [];

  const allowedFields = [
    'email', 'phone', 'title', 'company', 'first_name', 'last_name', 'decision_authority',
    'lead_source', 'budget_status', 'authority_level', 'need_urgency', 'timeline_status',
    'qualification_stage', 'nurture_stage',
  ];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      payload[field] = updates[field];
      changed.push(field);
    }
  }

  if (updates.qualification_notes !== undefined) {
    payload.qualification_notes = appendText(contact.qualification_notes, updates.qualification_notes);
    changed.push('qualification_notes');
  }

  const firstName = updates.first_name ?? contact.first_name;
  const lastName = updates.last_name ?? contact.last_name;
  if (updates.first_name !== undefined || updates.last_name !== undefined) {
    payload.full_name = `${firstName || ''} ${lastName || ''}`.trim();
    changed.push('full_name');
  }

  if (changed.length === 0) {
    return { success: false, message: 'No valid fields to update.' };
  }

  const { error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('id', contact.id)
    .eq('organization_id', organizationId);

  if (error) {
    return { success: false, message: `Failed to update the contact: ${error.message}` };
  }

  const displayName = payload.full_name || contact.full_name || `${firstName || ''} ${lastName || ''}`.trim() || 'Contact';

  return {
    id: contact.id,
    success: true,
    entity: 'contact',
    name: displayName,
    changes: changed,
    message: `✅ **${displayName}** updated (${changed.length} fields).`,
  };
}

export async function executeUpdateAccount(
  supabase: any,
  args: any,
  organizationId: string,
): Promise<any> {
  const { account_id, account_name, updates } = args || {};

  if (!updates || Object.keys(updates).length === 0) {
    return { success: false, message: 'No updates specified. What would you like to change?' };
  }

  const resolved = await resolveAccountByIdOrName(supabase, organizationId, {
    accountId: account_id,
    accountName: account_name,
  });

  if (resolved.multiple) {
    const list = resolved.multiple.map((a: any, i: number) =>
      `${i + 1}. **${a.name}** - ${a.industry || a.website || 'No details'}`
    ).join('\n');
    return { success: false, message: `I found multiple accounts:\n\n${list}\n\nWhich one should I update?` };
  }
  if (!resolved.account) {
    return { success: false, message: resolved.error || 'I could not resolve that account.' };
  }

  const account = resolved.account;
  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  const changed: string[] = [];

  for (const field of ['name', 'website', 'industry', 'phone']) {
    if (updates[field] !== undefined) {
      payload[field] = updates[field];
      changed.push(field);
    }
  }

  if (updates.description !== undefined) {
    payload.description = appendText(account.description, updates.description);
    changed.push('description');
  }

  if (changed.length === 0) {
    return { success: false, message: 'No valid fields to update.' };
  }

  const { error } = await supabase
    .from('accounts')
    .update(payload)
    .eq('id', account.id)
    .eq('organization_id', organizationId);

  if (error) {
    return { success: false, message: `Failed to update the account: ${error.message}` };
  }

  return {
    id: account.id,
    success: true,
    entity: 'account',
    name: payload.name || account.name,
    changes: changed,
    message: `✅ **${payload.name || account.name}** updated (${changed.length} fields).`,
  };
}

export async function executeUpdateStakeholderRole(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string,
): Promise<any> {
  const { deal_id, deal_name, contact_id, contact_name, role } = args || {};

  if (!role) {
    return { success: false, message: 'Please provide the stakeholder role to assign.' };
  }

  const dealResolved = await resolveDealByIdOrName(supabase, organizationId, {
    dealId: deal_id,
    dealName: deal_name,
  });

  if (dealResolved.multiple) {
    const list = dealResolved.multiple.map((d: any, i: number) => `${i + 1}. **${d.name}**`).join('\n');
    return { success: false, message: `I found multiple deals:\n\n${list}\n\nWhich deal should I use?` };
  }
  if (!dealResolved.deal) {
    return { success: false, message: dealResolved.error || 'I could not resolve that deal.' };
  }

  const deal = dealResolved.deal;

  const contactResolved = await resolveContactByIdOrName(supabase, organizationId, {
    contactId: contact_id,
    contactName: contact_name,
    accountId: deal.account_id,
  });

  if (contactResolved.multiple) {
    const list = contactResolved.multiple.map((c: any, i: number) => `${i + 1}. **${c.full_name || 'Unknown Contact'}**`).join('\n');
    return { success: false, message: `I found multiple contacts:\n\n${list}\n\nWhich contact should I use?` };
  }
  if (!contactResolved.contact) {
    return { success: false, message: contactResolved.error || 'I could not resolve that contact.' };
  }

  const contact = contactResolved.contact;

  const { data: existingLink } = await supabase
    .from('deal_contacts')
    .select('id')
    .eq('deal_id', deal.id)
    .eq('contact_id', contact.id)
    .maybeSingle();

  if (existingLink?.id) {
    const { error } = await supabase
      .from('deal_contacts')
      .update({ role_in_deal: role, updated_at: new Date().toISOString() })
      .eq('id', existingLink.id);
    if (error) return { success: false, message: `Failed to update role: ${error.message}` };
  } else {
    const { error } = await supabase
      .from('deal_contacts')
      .insert({
        deal_id: deal.id,
        contact_id: contact.id,
        organization_id: organizationId,
        role_in_deal: role,
        created_by: userId,
      });
    if (error) return { success: false, message: `Failed to link contact to deal: ${error.message}` };
  }

  const dealName = cleanEntityDisplayName(deal.name) || deal.name;
  const contactName = contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Contact';

  return {
    success: true,
    deal_id: deal.id,
    contact_id: contact.id,
    role,
    message: `Updated **${contactName}** as **${String(role).replace(/_/g, ' ')}** on **${dealName}**.`,
  };
}
