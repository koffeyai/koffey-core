/**
 * Task and activity operations for unified-chat skills.
 */

import {
  cleanEntityDisplayName,
  formatDateForDisplay,
  parseNaturalDate,
  resolveAccountByIdOrName,
  resolveContactByIdOrName,
  resolveDealByIdOrName,
  resolveOpenDealsForAccount,
} from './entity-utils.ts';

function formatTaskList(tasks: any[], contextName: string, overdueCount: number): string {
  let response = `**Next Steps for ${contextName}**\n\n`;
  if (overdueCount > 0) response += `⚠️ ${overdueCount} overdue\n\n`;
  if (tasks.length === 0) return `${response}No tasks found.`;

  tasks.forEach((task, i) => {
    const due = task.dueDate ? ` - due ${formatDateForDisplay(task.dueDate)}` : '';
    const overdue = task.isOverdue ? ' 🔴' : '';
    const priority = task.priority === 'high' ? ' ⚡' : '';
    response += `${i + 1}. ${task.title}${due}${overdue}${priority}\n`;
  });

  return response;
}

function getContextDealRef(entityContext?: any): { id?: string; name?: string } | null {
  const primary = entityContext?.primaryEntity;
  if (primary?.type === 'deal' || primary?.type === 'deals') {
    const id = String(primary.id || '').trim();
    const name = String(primary.name || '').trim();
    if (id || name) return { id: id || undefined, name: name || undefined };
  }

  const deals = Array.isArray(entityContext?.referencedEntities?.deals)
    ? entityContext.referencedEntities.deals
    : [];
  if (deals.length === 1) {
    const id = String(deals[0]?.id || '').trim();
    const name = String(deals[0]?.name || '').trim();
    if (id || name) return { id: id || undefined, name: name || undefined };
  }

  return null;
}

export async function executeCreateTask(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string,
  entityContext?: any,
): Promise<any> {
  const { title, account_name, deal_name, deal_id, due_date, priority = 'medium', contact_name } = args || {};

  if (!title || !String(title).trim()) {
    return { success: false, message: 'I need to know what the task should be. What is the next step?' };
  }

  const parsedDueDate = parseNaturalDate(due_date);

  let deal: any | null = null;
  if (deal_id || deal_name) {
    const resolved = await resolveDealByIdOrName(supabase, organizationId, {
      dealId: deal_id,
      dealName: deal_name,
    });
    if (resolved.multiple) {
      const list = resolved.multiple.map((d: any, i: number) => `${i + 1}. **${d.name}**`).join('\n');
      return { success: false, message: `I found multiple deals:\n\n${list}\n\nWhich one should I use?` };
    }
    deal = resolved.deal;
  }

  const contextDealRef = getContextDealRef(entityContext);
  if (!deal && contextDealRef) {
    const resolved = await resolveDealByIdOrName(supabase, organizationId, {
      dealId: contextDealRef.id,
      dealName: contextDealRef.name,
    });
    if (resolved.multiple) {
      const list = resolved.multiple.map((d: any, i: number) => `${i + 1}. **${d.name}**`).join('\n');
      return { success: false, message: `I found multiple deals:\n\n${list}\n\nWhich one should I use?` };
    }
    deal = resolved.deal;
  }

  if (!deal && account_name) {
    const accountResolved = await resolveAccountByIdOrName(supabase, organizationId, { accountName: account_name });
    if (accountResolved.multiple) {
      const list = accountResolved.multiple.map((a: any, i: number) => `${i + 1}. **${a.name}**`).join('\n');
      return { success: false, message: `I found multiple accounts:\n\n${list}\n\nWhich account should I use?` };
    }
    if (!accountResolved.account) {
      return { success: false, message: accountResolved.error || 'I could not resolve that account.' };
    }

    const openDeals = await resolveOpenDealsForAccount(supabase, organizationId, accountResolved.account.id);
    if (openDeals.length === 0) {
      return {
        success: false,
        message: `${accountResolved.account.name} has no open deals. Tell me which deal this task should be linked to.`,
      };
    }
    if (openDeals.length > 1) {
      const list = openDeals.slice(0, 5).map((d: any, i: number) => `${i + 1}. **${d.name}**`).join('\n');
      return { success: false, message: `${accountResolved.account.name} has multiple open deals:\n\n${list}\n\nWhich one should I use?` };
    }
    deal = openDeals[0];
  }

  if (!deal) {
    return {
      success: false,
      message: 'I need to know which deal this task is for. Please provide the deal or account name.',
    };
  }

  let contact: any | null = null;
  if (contact_name) {
    const resolved = await resolveContactByIdOrName(supabase, organizationId, {
      contactName: contact_name,
      accountId: deal.account_id || null,
    });
    if (!resolved.multiple && resolved.contact) {
      contact = resolved.contact;
    }
  }
  if (!contact && deal.contact_id) {
    const resolved = await resolveContactByIdOrName(supabase, organizationId, {
      contactId: deal.contact_id,
      accountId: deal.account_id || null,
    });
    if (!resolved.multiple && resolved.contact) {
      contact = resolved.contact;
    }
  }

  const payload: Record<string, any> = {
    title: String(title).trim(),
    description: null,
    due_date: parsedDueDate,
    priority,
    status: 'open',
    completed: false,
    deal_id: deal.id,
    account_id: deal.account_id || null,
    contact_id: contact?.id || null,
    user_id: userId,
    assigned_to: userId,
    organization_id: organizationId,
  };

  const { data: task, error } = await supabase
    .from('tasks')
    .insert(payload)
    .select('id, title, due_date')
    .single();

  if (error || !task) {
    return { success: false, message: `I couldn't create the task: ${error?.message || 'unknown error'}` };
  }

  const dueText = task.due_date ? ` due ${formatDateForDisplay(task.due_date)}` : '';
  const accountName = deal.accounts?.name ? `${deal.accounts.name} -> ` : '';

  return {
    id: task.id,
    task_id: task.id,
    success: true,
    entity: 'task',
    name: task.title,
    title: task.title,
    due_date: task.due_date,
    priority,
    deal_id: deal.id,
    deal_name: deal.name,
    account_id: deal.account_id || null,
    account_name: deal.accounts?.name || null,
    contact_id: contact?.id || null,
    contact_name: contact?.full_name || null,
    follow_up_prompt: 'If you have call notes, contacts, or context for this next step, share it and I’ll attach the useful parts to the right CRM records.',
    message: `✅ Created next step for **${accountName}${deal.name}**${contact?.full_name ? ` (contact: ${contact.full_name})` : ''}:\n"${task.title}"${dueText}`,
  };
}

export async function executeGetTasks(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string,
): Promise<any> {
  const { account_name, deal_name, deal_id, status = 'open' } = args || {};

  let targetDealIds: string[] = [];
  let contextName = 'all your deals';

  if (deal_id || deal_name) {
    const resolved = await resolveDealByIdOrName(supabase, organizationId, {
      dealId: deal_id,
      dealName: deal_name,
    });

    if (resolved.multiple) {
      const list = resolved.multiple.map((d: any, i: number) => `${i + 1}. **${d.name}**`).join('\n');
      return { success: false, message: `I found multiple deals:\n\n${list}\n\nWhich one should I use?` };
    }
    if (!resolved.deal) {
      return { success: false, message: resolved.error || 'I could not resolve that deal.' };
    }

    targetDealIds = [resolved.deal.id];
    contextName = resolved.deal.accounts?.name ? `${resolved.deal.accounts.name} -> ${resolved.deal.name}` : resolved.deal.name;
  }

  if (targetDealIds.length === 0 && account_name) {
    const accountResolved = await resolveAccountByIdOrName(supabase, organizationId, { accountName: account_name });
    if (accountResolved.multiple) {
      const list = accountResolved.multiple.map((a: any, i: number) => `${i + 1}. **${a.name}**`).join('\n');
      return { success: false, message: `I found multiple accounts:\n\n${list}\n\nWhich account should I use?` };
    }
    if (!accountResolved.account) {
      return { success: false, message: accountResolved.error || 'I could not resolve that account.' };
    }

    const openDeals = await resolveOpenDealsForAccount(supabase, organizationId, accountResolved.account.id);
    targetDealIds = openDeals.map((d: any) => d.id);
    contextName = accountResolved.account.name;
  }

  let query = supabase
    .from('tasks')
    .select('id, title, due_date, priority, status, completed, deal_id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(25);

  if (targetDealIds.length > 0) {
    query = query.in('deal_id', targetDealIds);
  }

  if (status === 'open') query = query.eq('completed', false);
  if (status === 'completed') query = query.eq('completed', true);

  const { data: tasks, error } = await query;
  if (error) {
    return { success: false, message: `I couldn't fetch tasks: ${error.message}` };
  }

  const taskRows = tasks || [];
  if (taskRows.length === 0) {
    const label = status === 'open' ? 'open ' : status === 'completed' ? 'completed ' : '';
    return { success: true, tasks: [], count: 0, message: `No ${label}tasks found for ${contextName}.` };
  }

  const today = new Date().toISOString().split('T')[0];
  const formatted = taskRows.map((t: any) => ({
    id: t.id,
    title: t.title,
    dueDate: t.due_date,
    priority: t.priority,
    completed: t.completed,
    isOverdue: !!(t.due_date && t.due_date < today && !t.completed),
  }));

  formatted.sort((a: any, b: any) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    if (!a.dueDate && !b.dueDate) return 0;
    if (!a.dueDate) return 1;
    if (!b.dueDate) return -1;
    return a.dueDate.localeCompare(b.dueDate);
  });

  const overdueCount = formatted.filter((t: any) => t.isOverdue).length;

  return {
    success: true,
    tasks: formatted,
    count: formatted.length,
    overdueCount,
    contextName,
    message: formatTaskList(formatted, contextName, overdueCount),
  };
}

export async function executeCompleteTask(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string,
  entityContext?: any,
): Promise<any> {
  const { task_id, task_description, account_name, deal_name, deal_id, action = 'complete', updates } = args || {};

  let task: any | null = null;

  if (task_id) {
    const { data: byId } = await supabase
      .from('tasks')
      .select('id, title, due_date, priority, completed, deal_id')
      .eq('id', task_id)
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .maybeSingle();
    if (byId) task = byId;
  }

  const possibleDealIds: string[] = [];
  if (!task && (deal_id || deal_name)) {
    const dealResolved = await resolveDealByIdOrName(supabase, organizationId, { dealId: deal_id, dealName: deal_name });
    if (dealResolved.deal) possibleDealIds.push(dealResolved.deal.id);
  }
  if (!task && account_name) {
    const accountResolved = await resolveAccountByIdOrName(supabase, organizationId, { accountName: account_name });
    if (accountResolved.account) {
      const openDeals = await resolveOpenDealsForAccount(supabase, organizationId, accountResolved.account.id);
      possibleDealIds.push(...openDeals.map((d: any) => d.id));
    }
  }
  if (!task && possibleDealIds.length === 0 && entityContext?.primaryEntity?.type === 'deal') {
    possibleDealIds.push(entityContext.primaryEntity.id);
  }

  if (!task) {
    let query = supabase
      .from('tasks')
      .select('id, title, due_date, priority, completed, deal_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false })
      .limit(15);

    if (action === 'complete') query = query.eq('completed', false);
    if (possibleDealIds.length > 0) query = query.in('deal_id', possibleDealIds);

    const { data: candidates } = await query;
    const rows = candidates || [];

    if (task_description && rows.length > 0) {
      const q = cleanEntityDisplayName(task_description).toLowerCase();
      task = rows.find((r: any) => String(r.title || '').toLowerCase().includes(q)) || null;

      if (!task) {
        const words = q.split(/\s+/).filter((w) => w.length > 2);
        task = rows.find((r: any) => words.some((w) => String(r.title || '').toLowerCase().includes(w))) || null;
      }
    }

    if (!task && rows.length === 1) task = rows[0];

    if (!task && rows.length > 1) {
      const list = rows.slice(0, 5).map((t: any, i: number) =>
        `${i + 1}. **${t.title}**${t.due_date ? ` (due ${t.due_date})` : ''}`
      ).join('\n');
      return { success: false, message: `I found these tasks:\n\n${list}\n\nWhich one?` };
    }
  }

  if (!task) {
    return { success: false, message: 'I could not find that task. Please share the task name or deal context.' };
  }

  if (action === 'complete') {
    const { error } = await supabase
      .from('tasks')
      .update({ completed: true, status: 'completed', updated_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('organization_id', organizationId);

    if (error) return { success: false, message: `Failed to complete task: ${error.message}` };

    return {
      id: task.id,
      task_id: task.id,
      success: true,
      entity: 'task',
      action: 'completed',
      name: task.title,
      title: task.title,
      deal_id: task.deal_id || null,
      message: `✅ Task completed: **${task.title}**`,
    };
  }

  if (!updates || Object.keys(updates).length === 0) {
    return { success: false, message: 'What would you like to change on this task?' };
  }

  const payload: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.title !== undefined) payload.title = updates.title;
  if (updates.priority !== undefined) payload.priority = updates.priority;
  if (updates.due_date !== undefined) payload.due_date = parseNaturalDate(updates.due_date) || updates.due_date;

  const { error } = await supabase
    .from('tasks')
    .update(payload)
    .eq('id', task.id)
    .eq('organization_id', organizationId);

  if (error) return { success: false, message: `Failed to update task: ${error.message}` };

  return {
    id: task.id,
    task_id: task.id,
    success: true,
    entity: 'task',
    action: 'updated',
    name: payload.title || task.title,
    title: payload.title || task.title,
    due_date: payload.due_date || task.due_date || null,
    deal_id: task.deal_id || null,
    message: `✅ Task updated: **${payload.title || task.title}**`,
  };
}

export async function executeCreateActivity(
  supabase: any,
  args: any,
  organizationId: string,
  userId: string,
  entityContext?: any,
): Promise<any> {
  const {
    title,
    type = 'note',
    description,
    account_name,
    deal_name,
    deal_id,
    contact_name,
    contact_id,
    activity_date,
    call_outcome,
    attempt_number,
    disqualify,
    sentiment,
  } = args || {};

  if (!title || !String(title).trim()) {
    return { success: false, message: 'I need to know what activity to log. What happened?' };
  }

  let deal: any | null = null;
  let account: any | null = null;
  let contact: any | null = null;

  if (deal_id || deal_name) {
    const resolved = await resolveDealByIdOrName(supabase, organizationId, { dealId: deal_id, dealName: deal_name });
    if (resolved.multiple) {
      const list = resolved.multiple.map((d: any, i: number) => `${i + 1}. **${d.name}**`).join('\n');
      return { success: false, message: `I found multiple deals:\n\n${list}\n\nWhich one should I use?` };
    }
    deal = resolved.deal;
  }

  if (!deal && account_name) {
    const resolved = await resolveAccountByIdOrName(supabase, organizationId, { accountName: account_name });
    if (!resolved.multiple && resolved.account) account = resolved.account;
  }

  if (!deal && !account && entityContext?.primaryEntity?.type === 'deal') {
    const resolved = await resolveDealByIdOrName(supabase, organizationId, { dealId: entityContext.primaryEntity.id });
    deal = resolved.deal;
  }

  if (!account && deal?.account_id) {
    const resolved = await resolveAccountByIdOrName(supabase, organizationId, { accountId: deal.account_id });
    account = resolved.account;
  }

  if (contact_id || contact_name) {
    const resolved = await resolveContactByIdOrName(supabase, organizationId, {
      contactId: contact_id,
      contactName: contact_name,
      accountId: account?.id || deal?.account_id || null,
    });
    if (!resolved.multiple && resolved.contact) {
      contact = resolved.contact;
      if (!account && contact.account_id) {
        const accountResolved = await resolveAccountByIdOrName(supabase, organizationId, { accountId: contact.account_id });
        account = accountResolved.account;
      }
    }
  }

  const parsedDate = activity_date ? (parseNaturalDate(activity_date) || activity_date) : new Date().toISOString();

  let enrichedDescription = description || '';
  if (call_outcome) {
    enrichedDescription = `[Outcome: ${call_outcome}]${attempt_number ? ` [Attempt: ${attempt_number}]` : ''}${sentiment ? ` [Sentiment: ${sentiment}]` : ''}${enrichedDescription ? `\n${enrichedDescription}` : ''}`;
  }

  const payload: Record<string, any> = {
    organization_id: organizationId,
    user_id: userId,
    title: String(title).trim(),
    subject: String(title).trim(),
    type: call_outcome === 'voicemail' ? 'voicemail' : type,
    description: enrichedDescription || null,
    activity_date: parsedDate,
    completed: true,
  };

  if (deal?.id) payload.deal_id = deal.id;
  if (account?.id) payload.account_id = account.id;
  if (contact?.id) payload.contact_id = contact.id;

  const { data: activity, error } = await supabase
    .from('activities')
    .insert(payload)
    .select('id')
    .single();

  if (error || !activity) {
    return { success: false, message: `Failed to log activity: ${error?.message || 'unknown error'}` };
  }

  let dqMessage = '';
  if (disqualify && contact?.id) {
    const { error: dqErr } = await supabase
      .from('contacts')
      .update({
        nurture_stage: 'disqualified',
        qualification_stage: 'disqualified',
        qualification_notes: `Disqualified on ${new Date().toISOString().split('T')[0]}: ${description || title}`,
        updated_at: new Date().toISOString(),
      })
      .eq('id', contact.id)
      .eq('organization_id', organizationId);

    if (!dqErr) dqMessage = '\n\n🚫 Contact marked as **disqualified**.';
  }

  const details: string[] = [];
  details.push(`Type: ${payload.type}`);
  if (call_outcome) details.push(`Outcome: ${call_outcome}`);
  if (attempt_number) details.push(`Attempt: #${attempt_number}`);
  if (sentiment) details.push(`Sentiment: ${sentiment}`);
  if (deal?.name) details.push(`Deal: ${deal.name}`);
  if (account?.name) details.push(`Account: ${account.name}`);

  return {
    id: activity.id,
    activity_id: activity.id,
    success: true,
    entity: 'activity',
    name: title,
    title,
    deal_id: deal?.id || null,
    deal_name: deal?.name || null,
    account_id: account?.id || null,
    account_name: account?.name || null,
    contact_id: contact?.id || null,
    contact_name: contact?.full_name || null,
    message: `✅ **Activity logged:** ${title}\n\n${details.map((d) => `• ${d}`).join('\n')}${dqMessage}`,
  };
}
