import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getServiceRoleClient, isInternalServiceCall } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

interface SequenceStep {
  step_number?: number;
  channel?: string;
  delay_days?: number;
  template?: string;
  subject?: string;
  task_title?: string;
  task_description?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
try {
    if (!isInternalServiceCall(req)) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: internal service call required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = getServiceRoleClient();
    const body = await req.json().catch(() => ({}));
    const limit = Math.min(Math.max(Number(body.limit) || 100, 1), 500);

    const nowIso = new Date().toISOString();

    const { data: enrollments, error } = await supabase
      .from('sequence_enrollments')
      .select(`
        id,
        organization_id,
        sequence_id,
        contact_id,
        current_step,
        status,
        enrolled_by,
        next_step_at,
        sequence:sequences(id, name, steps, exit_criteria, is_active),
        contact:contacts(id, full_name, first_name, last_name, user_id, assigned_to, account_id)
      `)
      .eq('status', 'active')
      .lte('next_step_at', nowIso)
      .order('next_step_at', { ascending: true })
      .limit(limit);

    if (error) throw error;

    if (!enrollments || enrollments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, due: 0, executed: 0, completed: 0, failed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let executed = 0;
    let completed = 0;
    let failed = 0;

    for (const enrollment of enrollments as any[]) {
      try {
        const sequence = enrollment.sequence;
        const contact = enrollment.contact;

        if (!sequence || sequence.is_active === false) {
          await supabase
            .from('sequence_enrollments')
            .update({ status: 'paused', exit_reason: 'sequence_inactive' })
            .eq('id', enrollment.id);
          continue;
        }

        const steps: SequenceStep[] = Array.isArray(sequence.steps) ? sequence.steps : [];
        const currentStep = Math.max(Number(enrollment.current_step) || 1, 1);
        const currentStepIndex = currentStep - 1;

        if (steps.length === 0 || !steps[currentStepIndex]) {
          await supabase
            .from('sequence_enrollments')
            .update({
              status: 'completed',
              exit_reason: 'no_remaining_steps',
              next_step_at: null,
              last_step_at: nowIso,
            })
            .eq('id', enrollment.id)
            .eq('status', 'active');
          completed++;
          continue;
        }

        const step = steps[currentStepIndex];
        const ownerId = contact?.assigned_to || contact?.user_id || enrollment.enrolled_by;

        if (!ownerId) {
          await supabase
            .from('sequence_enrollments')
            .update({ status: 'paused', exit_reason: 'missing_owner' })
            .eq('id', enrollment.id)
            .eq('status', 'active');
          failed++;
          continue;
        }

        const contactName = contact?.full_name || [contact?.first_name, contact?.last_name].filter(Boolean).join(' ') || 'Contact';
        const sequenceName = sequence.name || 'Sequence';
        const channel = String(step.channel || 'task').toLowerCase();

        const taskTitle =
          step.task_title ||
          step.subject ||
          `Sequence Step ${currentStep}: ${channel.toUpperCase()} ${contactName}`;

        const taskDescription =
          step.task_description ||
          step.template ||
          `Execute ${channel} step for ${contactName} in ${sequenceName} (step ${currentStep}/${steps.length}).`;

        const { error: taskError } = await supabase
          .from('tasks')
          .insert({
            organization_id: enrollment.organization_id,
            user_id: ownerId,
            assigned_to: ownerId,
            contact_id: enrollment.contact_id,
            account_id: contact?.account_id || null,
            title: taskTitle,
            description: taskDescription,
            priority: 'medium',
            status: 'open',
          });

        if (taskError) {
          throw taskError;
        }

        const { error: activityError } = await supabase
          .from('activities')
          .insert({
            organization_id: enrollment.organization_id,
            user_id: ownerId,
            assigned_to: ownerId,
            contact_id: enrollment.contact_id,
            account_id: contact?.account_id || null,
            title: `Sequence step executed: ${sequenceName}`,
            type: 'task',
            description: `Step ${currentStep}/${steps.length} (${channel}) queued for ${contactName}.`,
            activity_date: new Date().toISOString().split('T')[0],
            completed: true,
          });

        if (activityError) {
          console.warn('[process-sequences] Failed to write activity:', activityError.message);
        }

        const nextStep = steps[currentStepIndex + 1];
        if (!nextStep) {
          await supabase
            .from('sequence_enrollments')
            .update({
              current_step: currentStep,
              status: 'completed',
              exit_reason: 'finished',
              last_step_at: nowIso,
              next_step_at: null,
            })
            .eq('id', enrollment.id)
            .eq('status', 'active');
          completed++;
        } else {
          const delayDays = Math.max(Number(nextStep.delay_days) || 0, 0);
          const nextAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000).toISOString();

          await supabase
            .from('sequence_enrollments')
            .update({
              current_step: currentStep + 1,
              last_step_at: nowIso,
              next_step_at: nextAt,
            })
            .eq('id', enrollment.id)
            .eq('status', 'active');
          executed++;
        }
      } catch (e: any) {
        failed++;
        console.error('[process-sequences] enrollment failure:', enrollment.id, e?.message || e);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        due: enrollments.length,
        executed,
        completed,
        failed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[process-sequences] fatal error:', e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
