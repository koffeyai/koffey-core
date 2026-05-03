/**
 * Embedding text builders for each CRM entity type.
 *
 * Each function constructs a rich text representation that captures the
 * information a salesperson would use to search conversationally — not just
 * the entity name, but the surrounding context.
 */

export function buildAccountEmbeddingText(account: {
  name: string;
  industry?: string | null;
  website?: string | null;
  phone?: string | null;
  description?: string | null;
  address?: string | null;
}): string {
  const parts = [`Account: ${account.name}`];
  if (account.industry) parts.push(`Industry: ${account.industry}`);
  if (account.website) parts.push(`Website: ${account.website}`);
  if (account.phone) parts.push(`Phone: ${account.phone}`);
  if (account.address) parts.push(`Address: ${account.address}`);
  if (account.description) parts.push(`Description: ${account.description}`);
  return parts.join(' | ');
}

export function buildContactEmbeddingText(contact: {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  title?: string | null;
  company?: string | null;
  position?: string | null;
  linkedin_url?: string | null;
  notes?: string | null;
}): string {
  const name = contact.full_name
    || [contact.first_name, contact.last_name].filter(Boolean).join(' ')
    || 'Unknown';
  const parts = [`Contact: ${name}`];
  if (contact.title || contact.position) parts.push(`Role: ${contact.title || contact.position}`);
  if (contact.company) parts.push(`Company: ${contact.company}`);
  if (contact.email) parts.push(`Email: ${contact.email}`);
  if (contact.phone) parts.push(`Phone: ${contact.phone}`);
  if (contact.linkedin_url) parts.push(`LinkedIn: ${contact.linkedin_url}`);
  if (contact.notes) parts.push(`Notes: ${contact.notes}`);
  return parts.join(' | ');
}

export function buildDealEmbeddingText(deal: {
  name: string;
  stage?: string | null;
  amount?: number | null;
  currency?: string | null;
  probability?: number | null;
  close_date?: string | null;
  expected_close_date?: string | null;
  description?: string | null;
  account_name?: string | null;
  contact_name?: string | null;
}): string {
  const parts = [`Deal: ${deal.name}`];
  if (deal.account_name) parts.push(`Account: ${deal.account_name}`);
  if (deal.contact_name) parts.push(`Contact: ${deal.contact_name}`);
  if (deal.amount != null) {
    const formatted = deal.currency
      ? `${deal.currency} ${deal.amount.toLocaleString()}`
      : `$${deal.amount.toLocaleString()}`;
    parts.push(`Amount: ${formatted}`);
  }
  if (deal.stage) parts.push(`Stage: ${deal.stage}`);
  if (deal.probability != null) parts.push(`Probability: ${deal.probability}%`);
  const closeDate = deal.close_date || deal.expected_close_date;
  if (closeDate) parts.push(`Close Date: ${closeDate}`);
  if (deal.description) parts.push(`Description: ${deal.description}`);
  return parts.join(' | ');
}

export function buildActivityEmbeddingText(activity: {
  title: string;
  type?: string | null;
  description?: string | null;
  subject?: string | null;
  activity_date?: string | null;
  scheduled_at?: string | null;
  contact_name?: string | null;
  deal_name?: string | null;
  account_name?: string | null;
}): string {
  const parts = [`Activity: ${activity.title}`];
  if (activity.type) parts.push(`Type: ${activity.type}`);
  if (activity.contact_name) parts.push(`With: ${activity.contact_name}`);
  if (activity.account_name) parts.push(`Account: ${activity.account_name}`);
  if (activity.deal_name) parts.push(`Deal: ${activity.deal_name}`);
  const date = activity.activity_date || activity.scheduled_at;
  if (date) parts.push(`Date: ${date}`);
  if (activity.subject) parts.push(`Subject: ${activity.subject}`);
  if (activity.description) parts.push(`Details: ${activity.description}`);
  return parts.join(' | ');
}

export function buildTaskEmbeddingText(task: {
  title: string;
  description?: string | null;
  status?: string | null;
  priority?: string | null;
  due_date?: string | null;
  deal_name?: string | null;
  account_name?: string | null;
  contact_name?: string | null;
}): string {
  const parts = [`Task: ${task.title}`];
  if (task.priority) parts.push(`Priority: ${task.priority}`);
  if (task.status) parts.push(`Status: ${task.status}`);
  if (task.due_date) parts.push(`Due: ${task.due_date}`);
  if (task.deal_name) parts.push(`Deal: ${task.deal_name}`);
  if (task.account_name) parts.push(`Account: ${task.account_name}`);
  if (task.contact_name) parts.push(`Contact: ${task.contact_name}`);
  if (task.description) parts.push(`Details: ${task.description}`);
  return parts.join(' | ');
}

export function buildSourceDocumentEmbeddingText(doc: {
  title?: string | null;
  raw_content: string;
  source_type?: string | null;
}): string {
  const parts: string[] = [];
  if (doc.source_type) parts.push(`${doc.source_type}:`);
  if (doc.title) parts.push(doc.title);
  // Include the raw content, truncated to stay within embedding token limits
  const content = doc.raw_content.slice(0, 6000);
  parts.push(content);
  return parts.join(' | ');
}

export function buildClientMemoryEmbeddingText(memory: {
  contact_name?: string | null;
  facts: string[] | Record<string, unknown>;
}): string {
  const parts: string[] = [];
  if (memory.contact_name) parts.push(`Contact: ${memory.contact_name}`);

  if (Array.isArray(memory.facts)) {
    parts.push(`Facts: ${memory.facts.join(', ')}`);
  } else if (memory.facts && typeof memory.facts === 'object') {
    const entries = Object.entries(memory.facts)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ');
    parts.push(`Facts: ${entries}`);
  }
  return parts.join(' | ');
}

export function buildDealNoteEmbeddingText(note: {
  content: string;
  deal_name?: string | null;
  account_name?: string | null;
}): string {
  const parts: string[] = [];
  if (note.deal_name) parts.push(`Note on ${note.deal_name}`);
  if (note.account_name) parts.push(`Account: ${note.account_name}`);
  parts.push(note.content.slice(0, 6000));
  return parts.join(' | ');
}

export function buildChatMessageEmbeddingText(message: {
  content: string;
  role?: string | null;
}): string {
  return message.content.slice(0, 6000);
}
