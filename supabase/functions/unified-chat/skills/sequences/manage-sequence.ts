/**
 * Skill: manage_sequence
 *
 * Manage outreach sequences and cadences.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const MAX_SEQUENCE_CANDIDATES = 5;
const MAX_CONTACT_CANDIDATES = 5;

function normalizeWhitespace(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function sanitizeSequenceName(value: unknown): string | null {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`\s]+|[)"'`.,!?;\s]+$/g, '')
    .replace(/\b(?:sequence|cadence)\b$/i, '')
    .trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 120) return null;
  return cleaned;
}

function sanitizeContactName(value: unknown): string | null {
  const cleaned = normalizeWhitespace(value)
    .replace(/^[("'`\s]+|[)"'`.,!?;\s]+$/g, '')
    .replace(/\b(?:contact|please|thanks|thank you)\b/gi, '')
    .trim();
  if (!cleaned || cleaned.length < 2 || cleaned.length > 120) return null;
  return cleaned;
}

function sanitizeEmail(value: unknown): string | null {
  const cleaned = normalizeWhitespace(value).toLowerCase();
  if (!cleaned || !/^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(cleaned)) return null;
  return cleaned;
}

function buildSequencePreview(sequence: any): string {
  const stepCount = Array.isArray(sequence?.steps) ? sequence.steps.length : 0;
  return `${sequence?.name || 'Unknown sequence'}${stepCount ? ` (${stepCount} steps)` : ''}`;
}

function buildContactPreview(contact: any): string {
  const name = contact?.full_name || contact?.email || 'Unknown contact';
  const company = contact?.accounts?.name || contact?.company || null;
  if (company) return `${name} (${company})`;
  return name;
}

async function storePendingSequenceAction(ctx: ToolExecutionContext, pending: Record<string, unknown>) {
  if (!ctx.sessionId || !ctx.sessionTable) return;

  await ctx.supabase
    .from(ctx.sessionTable)
    .update({
      pending_sequence_action: pending,
      pending_sequence_action_at: new Date().toISOString(),
    })
    .eq('id', ctx.sessionId);
}

async function clearPendingSequenceAction(ctx: ToolExecutionContext) {
  if (!ctx.sessionId || !ctx.sessionTable) return;

  await ctx.supabase
    .from(ctx.sessionTable)
    .update({
      pending_sequence_action: null,
      pending_sequence_action_at: null,
    })
    .eq('id', ctx.sessionId);
}

function buildPendingSequencePayload(params: {
  action: string;
  sequence?: any;
  sequence_name?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  confirmation_type: 'contact_resolution' | 'sequence_resolution';
}) {
  return {
    action: params.action,
    sequence_id: params.sequence?.id || null,
    sequence_name: params.sequence?.name || params.sequence_name || null,
    contact_name: params.contact_name || null,
    contact_email: params.contact_email || null,
    confirmation_type: params.confirmation_type,
  };
}

async function resolveSequence(ctx: ToolExecutionContext, params: {
  action: string;
  sequence_id?: string | null;
  sequence_name?: string | null;
}) {
  const requestedSequenceId = normalizeWhitespace(params.sequence_id);
  const requestedSequenceName = sanitizeSequenceName(params.sequence_name);

  if (requestedSequenceId) {
    const { data: sequence, error } = await ctx.supabase
      .from('sequences')
      .select('id, name, description, steps, is_active, created_at, updated_at')
      .eq('organization_id', ctx.organizationId)
      .eq('id', requestedSequenceId)
      .maybeSingle();

    if (error) throw error;
    if (sequence) return { sequence };
  }

  if (!requestedSequenceName) {
    return {
      clarification: {
        _needsInput: true,
        success: false,
        message: `Which sequence should I ${params.action}? Reply with the sequence name.`,
      },
    };
  }

  const { data: exactMatches, error: exactError } = await ctx.supabase
    .from('sequences')
    .select('id, name, description, steps, is_active, created_at, updated_at')
    .eq('organization_id', ctx.organizationId)
    .ilike('name', requestedSequenceName)
    .limit(MAX_SEQUENCE_CANDIDATES);

  if (exactError) throw exactError;
  if (exactMatches && exactMatches.length === 1) return { sequence: exactMatches[0] };
  if (exactMatches && exactMatches.length > 1) {
    const preview = exactMatches.map(buildSequencePreview).join(', ');
    const clarification = {
      _needsInput: true,
      success: false,
      message: `I found multiple sequences matching "${requestedSequenceName}": ${preview}. Which sequence should I ${params.action}?`,
    };
    await storePendingSequenceAction(ctx, buildPendingSequencePayload({
      action: params.action,
      sequence_name: requestedSequenceName,
      confirmation_type: 'sequence_resolution',
    }));
    return { clarification };
  }

  const { data: fuzzyMatches, error: fuzzyError } = await ctx.supabase
    .from('sequences')
    .select('id, name, description, steps, is_active, created_at, updated_at')
    .eq('organization_id', ctx.organizationId)
    .ilike('name', `%${requestedSequenceName}%`)
    .limit(MAX_SEQUENCE_CANDIDATES);

  if (fuzzyError) throw fuzzyError;
  if (fuzzyMatches && fuzzyMatches.length === 1) return { sequence: fuzzyMatches[0] };

  if (fuzzyMatches && fuzzyMatches.length > 1) {
    const preview = fuzzyMatches.map(buildSequencePreview).join(', ');
    const clarification = {
      _needsInput: true,
      success: false,
      message: `I found multiple sequences matching "${requestedSequenceName}": ${preview}. Which sequence should I ${params.action}?`,
    };
    await storePendingSequenceAction(ctx, buildPendingSequencePayload({
      action: params.action,
      sequence_name: requestedSequenceName,
      confirmation_type: 'sequence_resolution',
    }));
    return { clarification };
  }

  const clarification = {
    _needsInput: true,
    success: false,
    message: `I couldn't find a sequence matching "${requestedSequenceName}". Which sequence should I ${params.action}?`,
  };
  await storePendingSequenceAction(ctx, buildPendingSequencePayload({
    action: params.action,
    sequence_name: requestedSequenceName,
    confirmation_type: 'sequence_resolution',
  }));
  return { clarification };
}

async function resolveContact(ctx: ToolExecutionContext, params: {
  action: string;
  sequence: any;
  contact_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
}) {
  const requestedContactId = normalizeWhitespace(params.contact_id);
  const requestedContactName = sanitizeContactName(params.contact_name);
  const requestedContactEmail = sanitizeEmail(params.contact_email);

  if (requestedContactId) {
    const { data: contact, error } = await ctx.supabase
      .from('contacts')
      .select('id, full_name, email, company, account_id, accounts(name)')
      .eq('organization_id', ctx.organizationId)
      .eq('id', requestedContactId)
      .maybeSingle();

    if (error) throw error;
    if (contact) return { contact };
  }

  if (requestedContactEmail) {
    const { data: emailMatches, error: emailError } = await ctx.supabase
      .from('contacts')
      .select('id, full_name, email, company, account_id, accounts(name)')
      .eq('organization_id', ctx.organizationId)
      .ilike('email', requestedContactEmail)
      .limit(MAX_CONTACT_CANDIDATES);

    if (emailError) throw emailError;
    if (emailMatches && emailMatches.length === 1) return { contact: emailMatches[0] };
    if (emailMatches && emailMatches.length > 1) {
      const preview = emailMatches.map(buildContactPreview).join(', ');
      const clarification = {
        _needsInput: true,
        success: false,
        message: `I found multiple contacts using "${requestedContactEmail}": ${preview}. Which contact should I ${params.action} in ${params.sequence.name}?`,
      };
      await storePendingSequenceAction(ctx, buildPendingSequencePayload({
        action: params.action,
        sequence: params.sequence,
        contact_name: requestedContactName,
        contact_email: requestedContactEmail,
        confirmation_type: 'contact_resolution',
      }));
      return { clarification };
    }
  }

  if (!requestedContactName && !requestedContactEmail) {
    const clarification = {
      _needsInput: true,
      success: false,
      message: `Who should I ${params.action} in ${params.sequence.name}? Reply with the contact's full name or email.`,
    };
    await storePendingSequenceAction(ctx, buildPendingSequencePayload({
      action: params.action,
      sequence: params.sequence,
      confirmation_type: 'contact_resolution',
    }));
    return { clarification };
  }

  if (requestedContactName) {
    const { data: exactNameMatches, error: exactNameError } = await ctx.supabase
      .from('contacts')
      .select('id, full_name, email, company, account_id, accounts(name)')
      .eq('organization_id', ctx.organizationId)
      .ilike('full_name', requestedContactName)
      .limit(MAX_CONTACT_CANDIDATES);

    if (exactNameError) throw exactNameError;
    if (exactNameMatches && exactNameMatches.length === 1) return { contact: exactNameMatches[0] };
    if (exactNameMatches && exactNameMatches.length > 1) {
      const preview = exactNameMatches.map(buildContactPreview).join(', ');
      const clarification = {
        _needsInput: true,
        success: false,
        message: `I found multiple contacts matching "${requestedContactName}": ${preview}. Which contact should I ${params.action} in ${params.sequence.name}?`,
      };
      await storePendingSequenceAction(ctx, buildPendingSequencePayload({
        action: params.action,
        sequence: params.sequence,
        contact_name: requestedContactName,
        contact_email: requestedContactEmail,
        confirmation_type: 'contact_resolution',
      }));
      return { clarification };
    }

    const { data: fuzzyNameMatches, error: fuzzyNameError } = await ctx.supabase
      .from('contacts')
      .select('id, full_name, email, company, account_id, accounts(name)')
      .eq('organization_id', ctx.organizationId)
      .ilike('full_name', `%${requestedContactName}%`)
      .limit(MAX_CONTACT_CANDIDATES);

    if (fuzzyNameError) throw fuzzyNameError;
    if (fuzzyNameMatches && fuzzyNameMatches.length === 1) return { contact: fuzzyNameMatches[0] };
    if (fuzzyNameMatches && fuzzyNameMatches.length > 1) {
      const preview = fuzzyNameMatches.map(buildContactPreview).join(', ');
      const clarification = {
        _needsInput: true,
        success: false,
        message: `I found multiple contacts matching "${requestedContactName}": ${preview}. Which contact should I ${params.action} in ${params.sequence.name}? You can reply with the full name or email.`,
      };
      await storePendingSequenceAction(ctx, buildPendingSequencePayload({
        action: params.action,
        sequence: params.sequence,
        contact_name: requestedContactName,
        contact_email: requestedContactEmail,
        confirmation_type: 'contact_resolution',
      }));
      return { clarification };
    }
  }

  const contactLabel = requestedContactName || requestedContactEmail || 'that contact';
  const clarification = {
    _needsInput: true,
    success: false,
    message: `I couldn't match "${contactLabel}" to an existing contact. Who should I ${params.action} in ${params.sequence.name}? Reply with the contact's full name or email.`,
  };
  await storePendingSequenceAction(ctx, buildPendingSequencePayload({
    action: params.action,
    sequence: params.sequence,
    contact_name: requestedContactName,
    contact_email: requestedContactEmail,
    confirmation_type: 'contact_resolution',
  }));
  return { clarification };
}

const manageSequence: SkillDefinition = {
  name: 'manage_sequence',
  displayName: 'Manage Sequence',
  domain: 'sequences',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'manage_sequence',
      description: 'Manage outreach sequences and cadences. Can create sequences, enroll/unenroll contacts, and check sequence status.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['list', 'create', 'enroll', 'unenroll', 'status'],
            description: 'Action to perform on sequences',
          },
          sequence_name: { type: 'string', description: 'Sequence name for create/enroll/unenroll/status when the user refers to it naturally' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                channel: { type: 'string', enum: ['email', 'call', 'linkedin'] },
                delay_days: { type: 'number' },
                template: { type: 'string' },
              },
            },
            description: 'Steps for a new sequence',
          },
          sequence_id: { type: 'string', description: 'Sequence ID for enroll/unenroll/status' },
          contact_id: { type: 'string', description: 'Contact to enroll/unenroll' },
          contact_name: { type: 'string', description: 'Contact name to find for enrollment' },
          contact_email: { type: 'string', description: 'Contact email to resolve the exact person for enrollment or unenrollment' },
        },
        required: ['action'],
      },
    },
  },

  instructions: `**For "create a sequence", "enroll contact in sequence", "sequence status"** → Use manage_sequence
  - Supports list, create, enroll, unenroll, status actions.
  - For enroll/unenroll/status, you can pass either sequence_id or sequence_name.
  - For enroll/unenroll, you can pass contact_id, contact_name, or contact_email.
  - If contact resolution is ambiguous, keep the action in manage_sequence and ask which exact contact to use instead of stopping with a generic "not found."`,

  execute: async (ctx: ToolExecutionContext) => {
    const { action, sequence_name, steps, sequence_id, contact_id, contact_name, contact_email } = ctx.args as {
      action: 'list' | 'create' | 'enroll' | 'unenroll' | 'status';
      sequence_name?: string;
      steps?: Array<{ channel: string; delay_days: number; template?: string }>;
      sequence_id?: string;
      contact_id?: string;
      contact_name?: string;
      contact_email?: string;
    };

    if (action === 'list') {
      const { data, error } = await ctx.supabase
        .from('sequences')
        .select('id, name, description, steps, is_active, exit_criteria, created_at, updated_at')
        .eq('organization_id', ctx.organizationId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Get enrollment counts per sequence
      const seqIds = (data || []).map((s: any) => s.id);
      let enrollmentCounts: Record<string, number> = {};
      if (seqIds.length > 0) {
        const { data: enrollments } = await ctx.supabase
          .from('sequence_enrollments')
          .select('sequence_id, status')
          .in('sequence_id', seqIds)
          .eq('status', 'active');

        for (const e of enrollments || []) {
          enrollmentCounts[e.sequence_id] = (enrollmentCounts[e.sequence_id] || 0) + 1;
        }
      }

      const sequences = (data || []).map((s: any) => ({
        ...s,
        step_count: Array.isArray(s.steps) ? s.steps.length : 0,
        active_enrollments: enrollmentCounts[s.id] || 0,
      }));

      return { sequences, count: sequences.length };
    }

    if (action === 'create') {
      if (!sequence_name) return { error: 'sequence_name is required to create a sequence.' };

      const row = {
        organization_id: ctx.organizationId,
        name: sequence_name,
        steps: (steps || []).map((s: any, i: number) => ({
          step_number: i + 1,
          channel: s.channel || 'email',
          delay_days: s.delay_days ?? (i === 0 ? 0 : 2),
          template: s.template || '',
        })),
        is_active: true,
        created_by: ctx.userId,
      };

      const { data, error } = await ctx.supabase
        .from('sequences')
        .insert(row)
        .select()
        .single();

      if (error) throw error;

      return { action: 'created', sequence: data };
    }

    if (action === 'enroll') {
      const sequenceResolution = await resolveSequence(ctx, {
        action: 'enroll',
        sequence_id,
        sequence_name,
      });
      if (sequenceResolution?.clarification) return sequenceResolution.clarification;
      const resolvedSequence = sequenceResolution.sequence;

      const contactResolution = await resolveContact(ctx, {
        action: 'enroll',
        sequence: resolvedSequence,
        contact_id,
        contact_name,
        contact_email,
      });
      if (contactResolution?.clarification) return contactResolution.clarification;
      const resolvedContact = contactResolution.contact;
      const resolvedContactId = resolvedContact?.id;

      // Check for existing active enrollment
      const { data: existing } = await ctx.supabase
        .from('sequence_enrollments')
        .select('id, status')
        .eq('sequence_id', resolvedSequence.id)
        .eq('contact_id', resolvedContactId)
        .eq('status', 'active')
        .limit(1);

      if (existing && existing.length > 0) {
        await clearPendingSequenceAction(ctx);
        return { success: false, message: `${resolvedContact.full_name} is already actively enrolled in ${resolvedSequence.name}.` };
      }

      // Get the sequence to calculate next_step_at
      const firstStep = Array.isArray(resolvedSequence?.steps) ? resolvedSequence.steps[0] : null;
      const delayDays = firstStep?.delay_days ?? 0;
      const nextStepAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await ctx.supabase
        .from('sequence_enrollments')
        .insert({
          organization_id: ctx.organizationId,
          sequence_id: resolvedSequence.id,
          contact_id: resolvedContactId,
          current_step: 1,
          status: 'active',
          enrolled_by: ctx.userId,
          next_step_at: nextStepAt,
        })
        .select()
        .single();

      if (error) throw error;

      await clearPendingSequenceAction(ctx);
      return {
        action: 'enrolled',
        enrollment: data,
        message: `Enrolled ${resolvedContact.full_name} in ${resolvedSequence.name}.`,
      };
    }

    if (action === 'unenroll') {
      const sequenceResolution = await resolveSequence(ctx, {
        action: 'unenroll',
        sequence_id,
        sequence_name,
      });
      if (sequenceResolution?.clarification) return sequenceResolution.clarification;
      const resolvedSequence = sequenceResolution.sequence;

      const contactResolution = await resolveContact(ctx, {
        action: 'unenroll',
        sequence: resolvedSequence,
        contact_id,
        contact_name,
        contact_email,
      });
      if (contactResolution?.clarification) return contactResolution.clarification;
      const resolvedContact = contactResolution.contact;
      const resolvedContactId = resolvedContact?.id;

      const { data, error } = await ctx.supabase
        .from('sequence_enrollments')
        .update({ status: 'exited', exit_reason: 'manual_unenroll', next_step_at: null })
        .eq('sequence_id', resolvedSequence.id)
        .eq('contact_id', resolvedContactId)
        .eq('status', 'active')
        .select();

      if (error) throw error;

      if (!data || data.length === 0) {
        await clearPendingSequenceAction(ctx);
        return {
          success: false,
          message: `No active enrollment found for ${resolvedContact.full_name} in ${resolvedSequence.name}.`,
        };
      }

      await clearPendingSequenceAction(ctx);
      return {
        action: 'unenrolled',
        enrollment: data[0],
        message: `Unenrolled ${resolvedContact.full_name} from ${resolvedSequence.name}.`,
      };
    }

    if (action === 'status') {
      const sequenceResolution = await resolveSequence(ctx, {
        action: 'check status for',
        sequence_id,
        sequence_name,
      });
      if (sequenceResolution?.clarification) return sequenceResolution.clarification;
      const sequence = sequenceResolution.sequence;

      const { data: enrollments, error: enrError } = await ctx.supabase
        .from('sequence_enrollments')
        .select('id, contact_id, current_step, status, exit_reason, enrolled_at, last_step_at, next_step_at, contact:contacts(id, full_name, email)')
        .eq('sequence_id', sequence.id)
        .order('enrolled_at', { ascending: false });

      if (enrError) throw enrError;

      const statusCounts: Record<string, number> = {};
      for (const e of enrollments || []) {
        statusCounts[e.status] = (statusCounts[e.status] || 0) + 1;
      }

      return {
        sequence,
        step_count: Array.isArray(sequence?.steps) ? sequence.steps.length : 0,
        enrollments: enrollments || [],
        enrollment_count: (enrollments || []).length,
        status_breakdown: statusCounts,
      };
    }

    return { error: `Unknown action: ${action}. Use list, create, enroll, unenroll, or status.` };
  },

  triggerExamples: [
    'create a new outreach sequence',
    'enroll Pat in the follow-up sequence',
    'show my sequences',
  ],
};

export default manageSequence;
