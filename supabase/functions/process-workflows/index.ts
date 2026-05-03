import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { getServiceRoleClient, isInternalServiceCall } from '../_shared/auth.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

type WorkflowRule = {
  id: string;
  organization_id: string;
  name: string;
  trigger_entity: string;
  trigger_event: string;
  trigger_condition?: string | null;
  trigger_value?: string | null;
  action_type: string;
  action_config?: Record<string, any> | null;
  run_count?: number | null;
  last_run_at?: string | null;
};

type TriggerEvent = {
  entityId: string;
  organizationId: string;
  userId?: string | null;
  assignedTo?: string | null;
  accountId?: string | null;
  contactId?: string | null;
  dealId?: string | null;
  entityName?: string;
  triggerValue?: string | number | null;
};

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
    const ruleLimit = Math.min(Math.max(Number(body.limit) || 200, 1), 1000);

    const { data: rules, error: rulesError } = await supabase
      .from('workflow_rules')
      .select('*')
      .eq('is_active', true)
      .order('updated_at', { ascending: true })
      .limit(ruleLimit);

    if (rulesError) throw rulesError;

    if (!rules || rules.length === 0) {
      return new Response(
        JSON.stringify({ success: true, rules_processed: 0, triggers_matched: 0, actions_executed: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let triggersMatched = 0;
    let actionsExecuted = 0;

    for (const rule of rules as WorkflowRule[]) {
      const now = new Date();
      const since = rule.last_run_at
        ? new Date(rule.last_run_at)
        : new Date(now.getTime() - 15 * 60 * 1000);

      let events = await loadTriggerEvents(supabase, rule, since);
      events = events.filter((event) => matchesCondition(rule, event.triggerValue));

      triggersMatched += events.length;

      for (const event of events) {
        const ok = await executeAction(supabase, rule, event);
        if (ok) actionsExecuted++;
      }

      await supabase
        .from('workflow_rules')
        .update({
          run_count: (rule.run_count || 0) + events.length,
          last_run_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', rule.id);
    }

    return new Response(
      JSON.stringify({
        success: true,
        rules_processed: rules.length,
        triggers_matched: triggersMatched,
        actions_executed: actionsExecuted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: any) {
    console.error('[process-workflows] fatal error:', e);
    return new Response(
      JSON.stringify({ success: false, error: e?.message || 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

async function loadTriggerEvents(supabase: any, rule: WorkflowRule, since: Date): Promise<TriggerEvent[]> {
  const sinceIso = since.toISOString();
  const entity = (rule.trigger_entity || '').toLowerCase();
  const triggerEvent = (rule.trigger_event || '').toLowerCase();

  if (entity === 'deals' && triggerEvent === 'created') {
    const { data } = await supabase
      .from('deals')
      .select('id, organization_id, user_id, assigned_to, account_id, contact_id, name, stage, amount, created_at')
      .gte('created_at', sinceIso)
      .limit(500);

    return (data || []).map((d: any) => ({
      entityId: d.id,
      organizationId: d.organization_id,
      userId: d.user_id,
      assignedTo: d.assigned_to,
      accountId: d.account_id,
      contactId: d.contact_id,
      dealId: d.id,
      entityName: d.name,
      triggerValue: triggerEvent === 'created' ? d.stage : null,
    }));
  }

  if (entity === 'deals' && (triggerEvent === 'stage_change' || triggerEvent === 'amount_change')) {
    const field = triggerEvent === 'stage_change' ? 'stage' : 'amount';

    const { data } = await supabase
      .from('audit_log')
      .select('record_id, organization_id, user_id, old_values, new_values, operation, created_at')
      .eq('table_name', 'deals')
      .eq('operation', 'UPDATE')
      .gte('created_at', sinceIso)
      .limit(500);

    const filtered = (data || []).filter((r: any) => (r.old_values?.[field] ?? null) !== (r.new_values?.[field] ?? null));

    const ids = [...new Set(filtered.map((r: any) => r.record_id))];
    const dealMap = new Map<string, any>();
    if (ids.length > 0) {
      const { data: deals } = await supabase
        .from('deals')
        .select('id, organization_id, user_id, assigned_to, account_id, contact_id, name')
        .in('id', ids);
      for (const d of deals || []) dealMap.set(d.id, d);
    }

    return filtered.map((r: any) => {
      const d = dealMap.get(r.record_id) || {};
      return {
        entityId: r.record_id,
        organizationId: r.organization_id || d.organization_id,
        userId: r.user_id || d.user_id,
        assignedTo: d.assigned_to,
        accountId: d.account_id,
        contactId: d.contact_id,
        dealId: r.record_id,
        entityName: d.name,
        triggerValue: r.new_values?.[field] ?? null,
      };
    });
  }

  if (entity === 'contacts' && triggerEvent === 'created') {
    const { data } = await supabase
      .from('contacts')
      .select('id, organization_id, user_id, assigned_to, account_id, full_name, status, created_at')
      .gte('created_at', sinceIso)
      .limit(500);

    return (data || []).map((c: any) => ({
      entityId: c.id,
      organizationId: c.organization_id,
      userId: c.user_id,
      assignedTo: c.assigned_to,
      accountId: c.account_id,
      contactId: c.id,
      entityName: c.full_name,
      triggerValue: c.status,
    }));
  }

  if (entity === 'contacts' && triggerEvent === 'status_change') {
    const { data } = await supabase
      .from('audit_log')
      .select('record_id, organization_id, user_id, old_values, new_values, operation, created_at')
      .eq('table_name', 'contacts')
      .eq('operation', 'UPDATE')
      .gte('created_at', sinceIso)
      .limit(500);

    const filtered = (data || []).filter((r: any) => (r.old_values?.status ?? null) !== (r.new_values?.status ?? null));

    return filtered.map((r: any) => ({
      entityId: r.record_id,
      organizationId: r.organization_id,
      userId: r.user_id,
      contactId: r.record_id,
      triggerValue: r.new_values?.status ?? null,
    }));
  }

  if (entity === 'activities' && triggerEvent === 'created') {
    const { data } = await supabase
      .from('activities')
      .select('id, organization_id, user_id, assigned_to, account_id, contact_id, deal_id, title, type, created_at')
      .gte('created_at', sinceIso)
      .limit(500);

    return (data || []).map((a: any) => ({
      entityId: a.id,
      organizationId: a.organization_id,
      userId: a.user_id,
      assignedTo: a.assigned_to,
      accountId: a.account_id,
      contactId: a.contact_id,
      dealId: a.deal_id,
      entityName: a.title,
      triggerValue: a.type,
    }));
  }

  if (entity === 'tasks' && triggerEvent === 'completed') {
    const { data } = await supabase
      .from('tasks')
      .select('id, organization_id, user_id, assigned_to, account_id, contact_id, deal_id, title, status, completed, updated_at')
      .gte('updated_at', sinceIso)
      .limit(500);

    return (data || [])
      .filter((t: any) => t.completed === true || ['completed', 'done'].includes(String(t.status || '').toLowerCase()))
      .map((t: any) => ({
        entityId: t.id,
        organizationId: t.organization_id,
        userId: t.user_id,
        assignedTo: t.assigned_to,
        accountId: t.account_id,
        contactId: t.contact_id,
        dealId: t.deal_id,
        entityName: t.title,
        triggerValue: t.status,
      }));
  }

  if (entity === 'tasks' && triggerEvent === 'overdue') {
    const nowDate = new Date().toISOString().split('T')[0];
    const { data } = await supabase
      .from('tasks')
      .select('id, organization_id, user_id, assigned_to, account_id, contact_id, deal_id, title, status, completed, due_date, updated_at')
      .lt('due_date', nowDate)
      .limit(500);

    return (data || [])
      .filter((t: any) => !(t.completed === true || ['completed', 'done'].includes(String(t.status || '').toLowerCase())))
      .map((t: any) => ({
        entityId: t.id,
        organizationId: t.organization_id,
        userId: t.user_id,
        assignedTo: t.assigned_to,
        accountId: t.account_id,
        contactId: t.contact_id,
        dealId: t.deal_id,
        entityName: t.title,
        triggerValue: t.due_date,
      }));
  }

  return [];
}

function matchesCondition(rule: WorkflowRule, triggerValue: string | number | null | undefined): boolean {
  const condition = (rule.trigger_condition || 'equals').toLowerCase();
  const expected = rule.trigger_value;

  if (!expected || expected.trim() === '') return true;

  if (triggerValue == null) return false;

  const triggerText = String(triggerValue).toLowerCase();
  const expectedText = expected.toLowerCase();

  if (condition === 'contains') {
    return triggerText.includes(expectedText);
  }

  if (condition === 'greater_than' || condition === 'gt') {
    return Number(triggerValue) > Number(expected);
  }

  if (condition === 'less_than' || condition === 'lt') {
    return Number(triggerValue) < Number(expected);
  }

  if (condition === 'not_equals' || condition === 'ne') {
    return triggerText !== expectedText;
  }

  return triggerText === expectedText;
}

function interpolate(template: string, event: TriggerEvent): string {
  return template
    .replaceAll('{entity_id}', event.entityId)
    .replaceAll('{entity_name}', event.entityName || 'record')
    .replaceAll('{deal_id}', event.dealId || '')
    .replaceAll('{contact_id}', event.contactId || '')
    .replaceAll('{account_id}', event.accountId || '');
}

async function executeAction(supabase: any, rule: WorkflowRule, event: TriggerEvent): Promise<boolean> {
  try {
    const cfg = rule.action_config || {};
    const ownerId = event.assignedTo || event.userId;

    switch ((rule.action_type || '').toLowerCase()) {
      case 'create_task': {
        if (!ownerId) return false;

        const titleTpl = String(cfg.task_title || cfg.title || `Workflow: ${rule.name}`);
        const descTpl = String(cfg.description || `Triggered by workflow rule \"${rule.name}\".`);

        const { error } = await supabase
          .from('tasks')
          .insert({
            organization_id: event.organizationId,
            user_id: ownerId,
            assigned_to: ownerId,
            account_id: event.accountId || null,
            contact_id: event.contactId || null,
            deal_id: event.dealId || null,
            title: interpolate(titleTpl, event),
            description: interpolate(descTpl, event),
            priority: cfg.priority || 'medium',
            status: 'open',
          });
        return !error;
      }

      case 'send_notification': {
        const title = interpolate(String(cfg.title || `Workflow Alert: ${rule.name}`), event);
        const message = interpolate(String(cfg.message || cfg.description || 'Workflow condition met.'), event);
        const assignedTo = ownerId || null;

        const { error } = await supabase
          .from('suggested_actions')
          .insert({
            organization_id: event.organizationId,
            action_type: 'workflow_alert',
            title,
            description: message,
            priority: 'medium',
            status: 'active',
            assigned_to: assignedTo,
            dedup_key: `workflow:${rule.id}:${event.entityId}:${new Date().toISOString().slice(0, 13)}`,
            confidence: 1,
          });
        return !error;
      }

      case 'update_field': {
        const field = String(cfg.field || '').trim();
        if (!field) return false;

        const value = cfg.value;
        const table = String(rule.trigger_entity || '').toLowerCase();

        if (!['deals', 'contacts', 'accounts', 'tasks', 'activities'].includes(table)) {
          return false;
        }

        const { error } = await supabase
          .from(table)
          .update({ [field]: value, updated_at: new Date().toISOString() })
          .eq('id', event.entityId)
          .eq('organization_id', event.organizationId);

        return !error;
      }

      case 'create_activity': {
        if (!ownerId) return false;

        const title = interpolate(String(cfg.title || `Workflow action: ${rule.name}`), event);
        const description = interpolate(String(cfg.description || 'Automated workflow activity.'), event);

        const { error } = await supabase
          .from('activities')
          .insert({
            organization_id: event.organizationId,
            user_id: ownerId,
            assigned_to: ownerId,
            account_id: event.accountId || null,
            contact_id: event.contactId || null,
            deal_id: event.dealId || null,
            title,
            description,
            type: cfg.type || 'task',
            activity_date: new Date().toISOString().split('T')[0],
            completed: true,
          });

        return !error;
      }

      case 'assign_to': {
        const assignee = String(cfg.user_id || cfg.assigned_to || '').trim();
        if (!assignee) return false;

        const table = String(rule.trigger_entity || '').toLowerCase();
        if (!['deals', 'contacts', 'accounts', 'tasks', 'activities'].includes(table)) {
          return false;
        }

        const { error } = await supabase
          .from(table)
          .update({ assigned_to: assignee, updated_at: new Date().toISOString() })
          .eq('id', event.entityId)
          .eq('organization_id', event.organizationId);

        return !error;
      }

      default:
        return false;
    }
  } catch (e) {
    console.warn('[process-workflows] action failed:', rule.id, event.entityId, e);
    return false;
  }
}
