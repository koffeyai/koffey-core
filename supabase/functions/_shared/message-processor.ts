import { StandardInboundMessage, ProcessedResponse, ChannelType, UnifiedChatAction } from "./messaging-types.ts";
import {
  getSupabaseClient,
  lookupUserByChannel,
  updateLastInbound,
  getOrCreateSession,
  updateSessionContext,
  logMessage,
  FALLBACK_RESPONSE,
} from "./messaging-utils.ts";
import { formatCitationForChannel } from "../unified-chat/citations-utils.mjs";

export interface ProcessMessageResult {
  response: string;
  sessionId: string;
  userId?: string;
  success: boolean;
  error?: string;
}

function getAppBaseUrl(): string {
  return String(
    Deno.env.get('APP_BASE_URL')
    || Deno.env.get('APP_URL')
    || 'http://localhost:5173'
  ).replace(/\/+$/, '');
}

function getAppUrl(path = '/app'): string {
  const base = getAppBaseUrl();
  if (!base) return path;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

export async function processMessage(message: StandardInboundMessage): Promise<ProcessMessageResult> {
  const supabase = getSupabaseClient();

  try {
    // 1. Authenticate user by channel identity
    const user = await lookupUserByChannel(supabase, message.channel, message.channelUserId);

    if (!user) {
      return {
        response: getRegistrationMessage(message.channel),
        sessionId: "",
        success: true,
      };
    }

    if (!user.verified) {
      return {
        response: "Your phone is registered but not verified. Complete verification in the Koffey app under Settings → Messaging.",
        sessionId: "",
        userId: user.userId,
        success: true,
      };
    }

    // 2. Update last inbound timestamp (for 24hr window tracking)
    await updateLastInbound(supabase, message.channel, message.channelUserId);

    // 3. Get or create session
    const session = await getOrCreateSession(
      supabase,
      user.userId,
      user.organizationId,
      message.channel,
      message.channelUserId
    );

    // 4. Log inbound message
    await logMessage(supabase, {
      sessionId: session.id,
      userId: user.userId,
      organizationId: user.organizationId,
      channel: message.channel,
      channelMessageId: message.channelMessageId,
      direction: 'inbound',
      content: message.content,
      status: 'received',
    });

    // 5. Process through unified-chat
    const aiResponse = await callUnifiedChat(
      user.userId,
      user.organizationId,
      message.content,
      session.conversationHistory,
      session.contextEntityType,
      session.contextEntityId,
      message.channel,
      session.entityContext,
      session.id
    );

    // 6. Resolve UI-only actions for non-web channels
    if (aiResponse.action && message.channel !== 'web') {
      const resolved = await resolveActionForChannel(
        aiResponse.action,
        user.userId,
        user.organizationId,
        message.channel
      );
      if (resolved) {
        aiResponse.content = resolved;
        aiResponse.action = undefined;
      }
    }

    if (message.channel !== 'web') {
      aiResponse.content = appendVerificationForChannel(aiResponse.content, aiResponse, message.channel);
    }

    // 7. Update session context (including entity context for cross-message resolution)
    await updateSessionContext(supabase, session.id, message.content, aiResponse.content, aiResponse.newContext, aiResponse.entityContext);

    // 8. Log outbound message
    await logMessage(supabase, {
      sessionId: session.id,
      userId: user.userId,
      organizationId: user.organizationId,
      channel: message.channel,
      direction: 'outbound',
      content: aiResponse.content,
      status: 'pending',
      intent: aiResponse.intent,
      entities: aiResponse.entities,
      toolCalls: aiResponse.toolCalls,
      processingTimeMs: aiResponse.processingTimeMs,
    });

    return {
      response: aiResponse.content,
      sessionId: session.id,
      userId: user.userId,
      success: true,
    };

  } catch (error) {
    console.error("Message processing error:", error);
    return { response: FALLBACK_RESPONSE, sessionId: "", success: false, error: (error as Error).message };
  }
}

// ============================================================================
// Unified-Chat Integration
// ============================================================================

const MAX_CHANNEL_HISTORY_TURNS = 8;
const MAX_CHANNEL_HISTORY_USER_CHARS = 900;
const MAX_CHANNEL_HISTORY_ASSISTANT_CHARS = 1300;

function compactHistoryContent(input: string, maxChars: number): string {
  const text = String(input || '').trim();
  if (!text) return '';
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}...`;
}

async function callUnifiedChat(
  userId: string,
  organizationId: string,
  userMessage: string,
  conversationHistory: Array<{ user: string; assistant: string }>,
  contextEntityType?: string,
  contextEntityId?: string,
  channel?: ChannelType,
  entityContext?: Record<string, unknown>,
  sessionId?: string
): Promise<ProcessedResponse> {
  const startTime = Date.now();

  try {
    // Transform history to the format unified-chat expects: { role, content }[]
    const formattedHistory: Array<{ role: string; content: string }> = [];
    for (const turn of conversationHistory.slice(-MAX_CHANNEL_HISTORY_TURNS)) {
      const userTurn = compactHistoryContent(turn.user || '', MAX_CHANNEL_HISTORY_USER_CHARS);
      const assistantTurn = compactHistoryContent(turn.assistant || '', MAX_CHANNEL_HISTORY_ASSISTANT_CHARS);

      if (userTurn) {
        formattedHistory.push({ role: 'user', content: userTurn });
      }
      if (assistantTurn) {
        formattedHistory.push({ role: 'assistant', content: assistantTurn });
      }
    }

    const response = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/unified-chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          message: userMessage,
          organizationId,
          userId,
          conversationHistory: formattedHistory,
          entityContext: entityContext || undefined,
          channel: channel || 'web',
          sessionId: sessionId || undefined,
        }),
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`unified-chat error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();

    return {
      content: result.response || result.message || "I processed your request.",
      intent: result.intent,
      entities: result.entities,
      toolCalls: result.toolCalls,
      newContext: result.newContext,
      processingTimeMs: Date.now() - startTime,
      action: result.action || undefined,
      entityContext: result.meta?.entityContext || undefined,
      verification: result.verification || undefined,
      citations: Array.isArray(result.citations) ? result.citations : undefined,
    };

  } catch (error) {
    console.error("unified-chat call failed:", error);
    return { content: FALLBACK_RESPONSE, processingTimeMs: Date.now() - startTime };
  }
}

// ============================================================================
// Action Resolution for Non-Web Channels
// ============================================================================

/**
 * Resolves UI-only actions (dialogs, navigation) into text content
 * for channels that don't support the web UI.
 * Returns the resolved text, or null to keep the original message.
 */
async function resolveActionForChannel(
  action: UnifiedChatAction,
  userId: string,
  organizationId: string,
  channel: ChannelType
): Promise<string | null> {
  switch (action.type) {
    case 'open_coaching_dialog': {
      if (!action.deal) return null;
      return await resolveCoachingAction(action.deal, userId, organizationId, channel);
    }

    case 'navigate_to':
      return `That view is available in the web app at ${getAppUrl('/app')}. You can ask me anything here though!`;

    case 'open_deal_form':
      return `The deal form is available in the web app. You can also tell me the deal details and I'll create it for you!`;

    case 'open_activity_logger':
      return `The activity logger is in the web app. Tell me about the activity and I'll log it for you!`;

    case 'entity_selection':
      // Disambiguation prompts already work as text — the message content has the list
      return null;

    default:
      return null;
  }
}

/**
 * Calls the deal-coaching edge function server-side and formats the result as text.
 */
async function resolveCoachingAction(
  deal: Record<string, unknown>,
  userId: string,
  organizationId: string,
  channel: ChannelType
): Promise<string> {
  try {
    const response = await fetch(
      `${Deno.env.get("SUPABASE_URL")}/functions/v1/deal-coaching`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
        },
        body: JSON.stringify({
          dealData: {
            name: deal.name,
            dealSize: deal.amount || 0,
            closeDate: deal.expected_close_date || deal.close_date || '',
            stage: deal.stage || '',
            probability: deal.probability,
            stakeholders: deal.stakeholders,
            lastActivity: deal.last_activity,
            notes: deal.notes || deal.description || '',
            competitorInfo: deal.competitor_info,
            timeline: deal.timeline,
            description: deal.description,
            stakeholderRankings: deal.stakeholderRankings,
          },
          organizationId,
          userId,
          zoomLevel: deal.zoomLevel || 'tactical',
          accountContext: deal.accountContext,
        }),
      }
    );

    if (!response.ok) {
      console.error(`[message-processor] deal-coaching returned ${response.status}`);
      return `I found the deal "${deal.name}" but couldn't complete the analysis right now. Please try again shortly.`;
    }

    const coaching = await response.json();
    return formatCoachingAsText(
      coaching,
      String(deal.name || 'Unknown Deal'),
      channel === 'telegram' ? 'full' : 'summary'
    );

  } catch (error) {
    console.error("[message-processor] deal-coaching call failed:", error);
    return `I found the deal "${deal.name}" but encountered an error during analysis. Please try again.`;
  }
}

/**
 * Converts a DealCoachingResult JSON into a concise text summary
 * suitable for messaging channels (WhatsApp, Telegram, SMS).
 */
function formatCoachingAsText(
  coaching: any,
  dealName: string,
  detailLevel: 'summary' | 'full' = 'summary'
): string {
  const isFull = detailLevel === 'full';
  const sections: string[] = [];

  sections.push(`*SCOUTPAD Analysis: ${dealName}*`);

  // Deal score summary
  if (coaching.dealScore) {
    const ds = coaching.dealScore;
    sections.push(
      `\nDeal Score: ${ds.currentProbability}% (${ds.confidenceLevel} confidence)` +
      `\nTrend: ${ds.trendDirection} | Risk: ${ds.riskLevel}`
    );
  }

  // SCOUTPAD dimension scores
  if (coaching.scoutpadAnalysis) {
    const sa = coaching.scoutpadAnalysis;
    const dimensions: Array<[string, any]> = [
      ['S - Stakeholders', sa.stakeholders],
      ['C - Champion', sa.champion],
      ['O - Opportunity', sa.opportunity],
      ['U - User Agreements', sa.userAgreements],
      ['T - Timeline', sa.timeline],
      ['P - Problem', sa.problem],
      ['A - Approval Chain', sa.approvalChain],
      ['D - Decision Criteria', sa.decisionCriteria],
    ];

    sections.push('\n*SCOUTPAD Scores:*');
    for (const [label, dim] of dimensions) {
      if (dim?.score != null) {
        const indicator = dim.score >= 7 ? '+++' : dim.score >= 4 ? '++' : '+';
        sections.push(`${indicator} ${label}: ${dim.score}/10`);
        if (Array.isArray(dim?.evidence) && dim.evidence.length > 0) {
          const evidence = isFull ? dim.evidence : dim.evidence.slice(0, 1);
          sections.push(`   Evidence: ${evidence.join(' | ')}`);
        }
        if (Array.isArray(dim?.gaps) && dim.gaps.length > 0) {
          const gaps = isFull ? dim.gaps : dim.gaps.slice(0, 1);
          sections.push(`   Gaps: ${gaps.join(' | ')}`);
        }
        if (dim?.impact) {
          sections.push(`   Impact: ${dim.impact}`);
        }
      }
    }
  }

  // Recommended next steps
  if (coaching.coaching?.recommendedNextSteps?.length > 0) {
    const steps = isFull
      ? coaching.coaching.recommendedNextSteps
      : coaching.coaching.recommendedNextSteps.slice(0, 3);
    sections.push('\n*Next Steps:*');
    for (const [index, step] of steps.entries()) {
      const priority = step.priority === 'critical' ? '!!!' :
                       step.priority === 'high' ? '!!' : '!';
      const impact = step.probabilityImpact ? ` (${step.probabilityImpact})` : '';
      sections.push(`${index + 1}. ${priority} ${step.action}${impact}`);
      if (isFull && step.timeframe) {
        sections.push(`   Timeframe: ${step.timeframe}`);
      }
      if (isFull && step.reasoning) {
        sections.push(`   Why: ${step.reasoning}`);
      }
    }
  }

  // Key risks
  if (coaching.coaching?.risks?.length > 0) {
    const risks = isFull ? coaching.coaching.risks : coaching.coaching.risks.slice(0, 2);
    sections.push('\n*Key Risks:*');
    for (const risk of risks) {
      sections.push(`- ${risk.risk}`);
      if (isFull && risk.probability) {
        sections.push(`  Probability: ${risk.probability}`);
      }
      if (isFull && risk.mitigation) {
        sections.push(`  Mitigation: ${risk.mitigation}`);
      }
    }
  }

  // Opportunities
  if (Array.isArray(coaching.coaching?.opportunities) && coaching.coaching.opportunities.length > 0) {
    const opportunities = isFull ? coaching.coaching.opportunities : coaching.coaching.opportunities.slice(0, 2);
    sections.push('\n*Opportunities:*');
    for (const item of opportunities) {
      sections.push(`- ${item.opportunity}`);
      if (isFull && item.probability) {
        sections.push(`  Probability: ${item.probability}`);
      }
      if (isFull && item.action) {
        sections.push(`  Action: ${item.action}`);
      }
    }
  }

  // Quarterly forecast
  if (coaching.quarterlyForecast) {
    const forecast = coaching.quarterlyForecast;
    sections.push('\n*Quarter Forecast:*');
    if (typeof forecast.closeThisQuarter !== 'undefined') {
      sections.push(`- Close This Quarter: ${forecast.closeThisQuarter}%`);
    }
    if (typeof forecast.atRisk !== 'undefined') {
      sections.push(`- At Risk: ${forecast.atRisk ? 'Yes' : 'No'}`);
    }
    if (Array.isArray(forecast.keyMilestones) && forecast.keyMilestones.length > 0) {
      const milestones = isFull ? forecast.keyMilestones : forecast.keyMilestones.slice(0, 3);
      sections.push('- Key Milestones:');
      for (const milestone of milestones) {
        sections.push(`  • ${milestone}`);
      }
    }
    if (forecast.coaching) {
      sections.push(`- Coaching: ${forecast.coaching}`);
    }
  }

  // Quality analytics (full mode only)
  if (isFull && coaching.qualityAnalytics) {
    const qa = coaching.qualityAnalytics;
    sections.push('\n*Quality Analytics:*');
    if (typeof qa.overallScore !== 'undefined') {
      sections.push(`- Overall Score: ${qa.overallScore}/10`);
    }
    if (qa.confidence) {
      sections.push(`- Confidence: ${qa.confidence}`);
    }
    if (qa.summary) {
      sections.push(`- Summary: ${qa.summary}`);
    }
    if (Array.isArray(qa.highRiskFindings) && qa.highRiskFindings.length > 0) {
      sections.push('- High-Risk Findings:');
      qa.highRiskFindings.forEach((finding: string) => sections.push(`  • ${finding}`));
    }
    if (qa.rubric) {
      sections.push('- Rubric:');
      Object.entries(qa.rubric).forEach(([key, value]) => {
        sections.push(`  • ${key}: ${value}`);
      });
    }
  }

  sections.push(`\nFor the full interactive analysis, visit ${getAppUrl('/app')}`);

  return sections.join('\n');
}

function getRegistrationMessage(channel: string): string {
  if (channel === "telegram") {
    const botUsername = String(Deno.env.get("TELEGRAM_BOT_USERNAME") || "").replace(/^@/, "");
    const botHint = botUsername ? ` in @${botUsername}` : "";
    return "Welcome to Koffey!\n\n" +
      `I don't recognize this Telegram account yet${botHint}.\n\n` +
      "To connect your account:\n" +
      `1) Open ${getAppUrl('/app/settings/messaging')}\n` +
      "2) Generate a Telegram link code\n" +
      "3) Send /verify <code> here\n\n" +
      "Then message me again!";
  }

  return "Welcome to Koffey!\n\n" +
    "I don't recognize this phone number yet.\n\n" +
    `To connect your account, visit:\n${getAppUrl('/app/settings/messaging')}\n\n` +
    "Then text me again!";
}

function getVerificationBadge(verification: NonNullable<ProcessedResponse['verification']>): string {
  if (verification.is_true) return 'VERIFIED ✅';
  if (verification.blocking_failure) return 'UNVERIFIED ❌';
  if (verification.policy === 'advisory' && verification.source_status === 'source_backed') return 'SOURCE-BACKED ✅';
  if (verification.policy === 'advisory' && verification.source_status === 'source_gap') return 'SOURCE GAP ⚠️';
  if (verification.policy === 'strict' && verification.mixed_intent && verification.is_true === false) return 'PARTIAL ⚠️';
  return 'VERIFICATION INFO';
}

function resolveCitationAppUrl(pathOrUrl?: string): string | null {
  const value = String(pathOrUrl || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;

  const base = getAppBaseUrl();
  if (!base) return null;

  if (value.startsWith('/')) return `${base}${value}`;
  return `${base}/${value}`;
}

function appendVerificationForChannel(content: string, aiResponse: ProcessedResponse, channel: ChannelType): string {
  const base = String(content || '').trim();
  const verification = aiResponse.verification;
  const citations = Array.isArray(aiResponse.citations) ? aiResponse.citations : [];
  const citationCount = Number.isFinite(Number(verification?.citation_count))
    ? Number(verification?.citation_count)
    : citations.length;
  const shouldShowVerification = !!verification
    && (
      verification.policy === 'strict'
      || verification.policy === 'advisory'
      || verification.blocking_failure === true
      || verification.requires_verification === true
      || citationCount > 0
    );
  if (!shouldShowVerification && citations.length === 0) return base;

  const lines: string[] = [];
  const baseHasBadge = /\b(VERIFIED ✅|UNVERIFIED ❌|SOURCE-BACKED ✅|SOURCE GAP ⚠️|PARTIAL ⚠️)\b/.test(base);

  if (verification && !baseHasBadge) {
    lines.push('');
    const badge = getVerificationBadge(verification);
    const detail = citationCount > 0
      ? `${citationCount} source reference${citationCount === 1 ? '' : 's'}`
      : null;
    lines.push(detail ? `Verification: ${badge} | ${detail}` : `Verification: ${badge}`);
  }

  if (verification?.user_summary) {
    const summary = String(verification.user_summary).trim();
    if (summary && !base.includes(summary)) {
      lines.push(summary);
    }
  }

  if (citations.length > 0) {
    const maxCitations = channel === 'telegram' ? 6 : 4;
    lines.push(`Source references (${citations.length}):`);
    citations.slice(0, maxCitations).forEach((citation, index) => {
      const formatted = formatCitationForChannel(citation, index + 1);
      if (formatted) lines.push(formatted);
      const openUrl = resolveCitationAppUrl(citation?.uiLink);
      if (openUrl) lines.push(`   Open: ${openUrl}`);
    });
    if (citations.length > maxCitations) {
      lines.push(`...and ${citations.length - maxCitations} more.`);
    }
  }

  if (verification?.blocking_failure && Array.isArray(verification.failed_checks) && verification.failed_checks.length > 0) {
    lines.push('Technical check codes are available in the Koffey web app chat panel.');
  }

  return `${base}${lines.join('\n')}`.trim();
}
