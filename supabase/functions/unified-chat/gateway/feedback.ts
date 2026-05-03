import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { shouldTaskClassRequireTools } from './routing.ts';

export function buildSystemPrompt(): string {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return `You are Scout, a CRM copilot.\nToday is ${now.toISOString().split('T')[0]}. Current quarter is Q${q} ${now.getFullYear()}.\nWhen user asks about periods (week/month/quarter), use today's date and standard calendar year unless explicitly told otherwise.\nIf a message is a follow-up fragment ("what about this quarter?", "and the same for top deals"), resolve references using recent conversation context before answering.\nFor compound asks, break into sub-questions and answer all of them in one response. If CRM data is needed, call all required tools in the same turn.\nNever answer with generic deflection if context is available.\nQuality mode: prioritize complete, evidence-based responses. Always mention assumptions and missing data explicitly.\n\nCRITICAL RULES:\n- NEVER invent, fabricate, or hallucinate CRM data. If a tool returns empty results or an error, say "I couldn't find any data" — do NOT make up deal names, contacts, amounts, or dates.\n- For "show all deals", "list my deals", "how many deals" → use search_crm with entity_type="deals" and list_all=true. Do NOT use get_pipeline_context for listing.\n- Only present data that came from tool results. If you have no tool results, say so.\n- Every deal, contact, account, and amount you mention MUST come from a tool result. If it didn't come from a tool, don't say it.`;
}

export type FeedbackSignal = {
  rating: 'up' | 'down' | null;
  comment: string | null;
  submittedAt: string | null;
  provenanceSource?: string | null;
  verificationPolicy?: string | null;
  groundingState?: string | null;
  taskClass?: string | null;
  retrievalPath?: string | null;
  needsTools?: boolean | null;
  schemaCount?: number | null;
};

export function dedupeFeedbackSignals(signals: FeedbackSignal[]): FeedbackSignal[] {
  const seen = new Set<string>();
  const out: FeedbackSignal[] = [];
  for (const signal of signals) {
    const key = `${signal.rating || ''}|${signal.comment || ''}|${signal.submittedAt || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(signal);
    if (out.length >= 120) break;
  }
  return out;
}

export function extractFeedbackSignal(metadata: unknown): FeedbackSignal | null {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
  const container = metadata as Record<string, unknown>;
  const raw = container.feedback;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;

  const feedback = raw as Record<string, unknown>;
  const rating = feedback.rating === 'up' || feedback.rating === 'down' ? feedback.rating : null;
  const comment = typeof feedback.comment === 'string' ? feedback.comment.trim().slice(0, 280) : '';
  const submittedAt = typeof feedback.updated_at === 'string'
    ? feedback.updated_at
    : typeof feedback.created_at === 'string'
      ? feedback.created_at
      : null;
  const verification = container.verification && typeof container.verification === 'object' && !Array.isArray(container.verification)
    ? container.verification as Record<string, unknown>
    : {};
  const execution = container.execution && typeof container.execution === 'object' && !Array.isArray(container.execution)
    ? container.execution as Record<string, unknown>
    : {};
  const provenance = container.provenance && typeof container.provenance === 'object' && !Array.isArray(container.provenance)
    ? container.provenance as Record<string, unknown>
    : {};

  if (!rating && !comment) return null;
  return {
    rating,
    comment: comment || null,
    submittedAt,
    provenanceSource: typeof provenance.source === 'string' ? provenance.source : null,
    verificationPolicy: typeof verification.policy === 'string' ? verification.policy : null,
    groundingState: typeof execution.groundingState === 'string' ? execution.groundingState : null,
    taskClass: typeof execution.taskClass === 'string' ? execution.taskClass : null,
    retrievalPath: typeof execution.retrievalPath === 'string' ? execution.retrievalPath : null,
    needsTools: typeof execution.needsTools === 'boolean' ? execution.needsTools : null,
    schemaCount: Number.isFinite(Number(execution.schemaCount)) ? Number(execution.schemaCount) : null,
  };
}

export function extractClientFeedbackSignals(feedbackContext: unknown): FeedbackSignal[] {
  if (!feedbackContext || typeof feedbackContext !== 'object' || Array.isArray(feedbackContext)) return [];
  const container = feedbackContext as Record<string, unknown>;
  const items = Array.isArray(container.items) ? container.items : [];
  return items
    .map((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return null;
      const entry = item as Record<string, unknown>;
      const rating = entry.rating === 'up' || entry.rating === 'down' ? entry.rating : null;
      const comment = typeof entry.comment === 'string' ? entry.comment.trim().slice(0, 280) : '';
      if (!rating && !comment) return null;
      return {
        rating,
        comment: comment || null,
        submittedAt: typeof entry.submittedAt === 'string' ? entry.submittedAt : null,
        provenanceSource: typeof entry.provenanceSource === 'string' ? entry.provenanceSource : null,
        verificationPolicy: typeof entry.verificationPolicy === 'string' ? entry.verificationPolicy : null,
        groundingState: typeof entry.groundingState === 'string' ? entry.groundingState : null,
        taskClass: typeof entry.taskClass === 'string' ? entry.taskClass : null,
        retrievalPath: typeof entry.retrievalPath === 'string' ? entry.retrievalPath : null,
        needsTools: typeof entry.needsTools === 'boolean' ? entry.needsTools : null,
        schemaCount: Number.isFinite(Number(entry.schemaCount)) ? Number(entry.schemaCount) : null,
      } as FeedbackSignal;
    })
    .filter(Boolean) as FeedbackSignal[];
}

export async function loadRecentFeedbackSignals(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string
): Promise<FeedbackSignal[]> {
  const { data: sessionRows, error: sessionsError } = await supabase
    .from('chat_sessions')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(24);

  if (sessionsError || !sessionRows || sessionRows.length === 0) return [];
  const sessionIds = sessionRows.map((row: any) => String(row.id)).filter(Boolean);
  if (sessionIds.length === 0) return [];

  const { data: messageRows, error: messagesError } = await supabase
    .from('chat_messages')
    .select('metadata')
    .eq('user_id', userId)
    .eq('message_type', 'assistant')
    .in('session_id', sessionIds)
    .order('created_at', { ascending: false })
    .limit(120);

  if (messagesError || !messageRows) return [];

  return messageRows
    .map((row: any) => extractFeedbackSignal(row?.metadata))
    .filter(Boolean) as FeedbackSignal[];
}

export async function loadLearningFeedbackSignals(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  organizationId: string
): Promise<FeedbackSignal[]> {
  const { data, error } = await supabase
    .from('sales_learning_events')
    .select('event_key, metadata, occurred_at')
    .eq('organization_id', organizationId)
    .eq('user_id', userId)
    .eq('event_type', 'interaction')
    .like('event_key', 'assistant_feedback_%')
    .order('occurred_at', { ascending: false })
    .limit(120);

  if (error || !Array.isArray(data)) return [];

  return data.map((row: any) => {
    const eventKey = String(row?.event_key || '').trim();
    let rating: 'up' | 'down' | null = null;
    if (eventKey.endsWith('_up')) rating = 'up';
    if (eventKey.endsWith('_down')) rating = 'down';

    const metadata = row?.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {};
    const feedback = metadata.feedback && typeof metadata.feedback === 'object' && !Array.isArray(metadata.feedback)
      ? metadata.feedback as Record<string, unknown>
      : {};
    const execution = metadata.execution && typeof metadata.execution === 'object' && !Array.isArray(metadata.execution)
      ? metadata.execution as Record<string, unknown>
      : {};
    const provenance = metadata.provenance && typeof metadata.provenance === 'object' && !Array.isArray(metadata.provenance)
      ? metadata.provenance as Record<string, unknown>
      : {};
    const verification = metadata.verification && typeof metadata.verification === 'object' && !Array.isArray(metadata.verification)
      ? metadata.verification as Record<string, unknown>
      : {};
    const explicitRating = feedback.rating === 'up' || feedback.rating === 'down' ? feedback.rating : null;
    const comment = typeof feedback.comment === 'string' ? feedback.comment.trim().slice(0, 280) : '';
    const submittedAt = typeof row?.occurred_at === 'string' ? row.occurred_at : null;

    return {
      rating: explicitRating || rating,
      comment: comment || null,
      submittedAt,
      provenanceSource: typeof provenance.source === 'string' ? provenance.source : null,
      verificationPolicy: typeof verification.policy === 'string' ? verification.policy : null,
      groundingState: typeof execution.groundingState === 'string' ? execution.groundingState : null,
      taskClass: typeof execution.taskClass === 'string' ? execution.taskClass : null,
      retrievalPath: typeof execution.retrievalPath === 'string' ? execution.retrievalPath : null,
      needsTools: typeof execution.needsTools === 'boolean' ? execution.needsTools : null,
      schemaCount: Number.isFinite(Number(execution.schemaCount)) ? Number(execution.schemaCount) : null,
    } as FeedbackSignal;
  }).filter((signal) => signal.rating || signal.comment);
}

export function buildFeedbackGuidance(signals: FeedbackSignal[]): string {
  if (!signals.length) return '';

  const thumbsUp = signals.filter((s) => s.rating === 'up').length;
  const thumbsDown = signals.filter((s) => s.rating === 'down').length;
  const downSignals = signals.filter((s) => s.rating === 'down');
  const downvotedGeneralKnowledge = downSignals.some((s) => s.provenanceSource === 'llm_general');
  const downvotedNoToolExecution = downSignals.some((s) => s.taskClass && shouldTaskClassRequireTools(s.taskClass) && s.needsTools === false);
  const downvotedGroundingFailures = downSignals.some((s) => ['failure', 'no_results'].includes(String(s.groundingState || '')));
  const improvementNotes = signals
    .filter((s) => s.comment)
    .slice(0, 4)
    .map((s) => `- ${s.comment}`);

  const guidanceLines = [
    'User quality feedback to follow:',
    thumbsUp > 0 ? `- Preserve qualities from positively rated responses (${thumbsUp}).` : '',
    thumbsDown > 0 ? `- Avoid patterns seen in negatively rated responses (${thumbsDown}).` : '',
    downvotedGeneralKnowledge || downvotedNoToolExecution
      ? '- Recent negative feedback penalized answering CRM requests from general knowledge or planning prose. For CRM/analytics asks, use tools or ask a clarification question.'
      : '',
    downvotedGroundingFailures
      ? '- Recent negative feedback penalized unsupported verified-looking answers. If there are no matching records or retrieval fails, say that directly instead of implying evidence-backed support.'
      : '',
    ...improvementNotes,
  ].filter(Boolean);

  const guidance = guidanceLines.join('\n').slice(0, 900).trim();
  return guidance ? `${guidance}\nTreat this feedback as higher priority than stylistic defaults.` : '';
}
