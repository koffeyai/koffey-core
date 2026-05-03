/**
 * Generate Daily Briefing - Command Center
 * 
 * Creates a psychology-informed daily brief that focuses on:
 * - Momentum (what's working)
 * - Plays available (where user has leverage)
 * - In motion (acknowledged, off their plate)
 * 
 * Philosophy: Build confidence, not anxiety.
 */

import { serve } from 'https://deno.land/std@0.190.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.50.0';
import { callWithFallback } from '../_shared/ai-provider.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

// ============================================================================
// SYSTEM PROMPT - Psychology-Informed Briefing Generation
// ============================================================================

const BRIEFING_SYSTEM_PROMPT = `You are a supportive sales partner preparing a morning briefing. Your role is to build confidence and strategic clarity, not create anxiety.

## CORE PRINCIPLES

1. **Lead with momentum** — Always start with what's going well. Progress motivates action.

2. **Reframe challenges as "plays available"** — Focus on what they CAN do, not what's wrong.

3. **Provide context for silence** — Buyers have their own timelines. Silence ≠ rejection.

4. **Separate controllable from uncontrollable** — Reduce misplaced guilt. Acknowledge external factors.

5. **One priority action** — Don't overwhelm with a fire list. Clear focus = momentum.

6. **Celebrate intermediate wins** — Not just closed deals. Moving to proposal IS a win.

## LANGUAGE RULES

NEVER use these words:
- "risk", "at-risk", "risky"
- "warning", "alert", "urgent" 
- "failed", "failing", "failure"
- "problem", "issue", "concern"
- "stuck", "stalled", "blocked"
- "overdue", "late", "behind"
- "red", "yellow" (as status)

INSTEAD use:
- "play available" — there's an action they can take
- "opportunity" — positive framing
- "patience window" — on track, just needs time
- "in progress" — external process happening
- "in motion" — out of their hands, being handled
- "ready for a touch" — time to re-engage
- "context" — explain WHY something is happening

## CONTEXT PATTERNS

When explaining buyer silence, ALWAYS provide context:
- Month-end/quarter-end = "typical budget review period"
- No response to proposal = "decision window is usually 5-7 days, you're on track"
- Champion quiet = "likely internal alignment happening"
- Legal review taking time = "thorough review, typical for deals this size"

## TONE

- Confident, not anxious
- Strategic, not reactive
- Supportive, not judgmental
- Realistic optimism — honest but constructive
- Partner language — "we" and "your play" not "you should"

## OUTPUT FORMAT

Return valid JSON matching this exact structure:

{
  "greeting": "Good morning, [Name]. You've got momentum. Let's build on it.",
  
  "momentum": {
    "summary": "This week: X deals moved forward, pipeline up $Xk",
    "wins": [
      {
        "deal_name": "Target",
        "deal_id": "uuid-if-available",
        "achievement": "Moved to Proposal",
        "context": "3 months of relationship building paid off"
      }
    ],
    "quota_status": {
      "percentage": 70,
      "message": "You're at 70% with 3 weeks left. Two deals in proposal can get you there."
    }
  },
  
  "priority_play": {
    "headline": "Prep for your 10am Target call",
    "deal_name": "Target",
    "deal_id": "uuid",
    "why_this_matters": "CFO attending — rare access. $120k deal, 40% of your remaining gap.",
    "context": [
      "Their Q3 earnings show cost-cutting mode",
      "Your champion Mike just got promoted",
      "Competitor renewed last month — you're the alternative"
    ],
    "action": {
      "label": "Start Prep",
      "type": "meeting_prep"
    }
  },
  
  "available_plays": [
    {
      "deal_name": "Pepsi",
      "deal_id": "uuid",
      "status": "play_available",
      "headline": "Sarah's been quiet — play available",
      "context": "Month-end crunch is typical. Thursday is a good window.",
      "suggested_action": {
        "label": "Send Case Study",
        "type": "send_content"
      }
    },
    {
      "deal_name": "Coca-Cola",
      "deal_id": "uuid",
      "status": "patience_window",
      "headline": "Proposal in decision window",
      "context": "4 days since send. Typical decision time is 5-7 days. You're on track.",
      "suggested_action": {
        "label": "Set Thursday Reminder",
        "type": "create_task"
      }
    }
  ],
  
  "in_motion": [
    {
      "deal_name": "Home Depot",
      "deal_id": "uuid",
      "what": "Legal review in progress",
      "context": "Day 10 of typical 14-day review. Thorough, not slow.",
      "your_part_done": true
    }
  ],
  
  "todays_meetings": [
    {
      "time": "10:00 AM",
      "title": "Target Corp: Quarterly Review",
      "deal_id": "uuid-if-linked",
      "prep_ready": false,
      "key_insight": "CFO attending — prepare ROI talking points"
    }
  ]
}

## ACTION TYPES (STRICT)

When generating action objects, you MUST use ONLY these exact type values:

- "meeting_prep" — Prepare for an upcoming meeting (talking points, research)
- "call" — Prep for a phone/video call with a contact
- "email" — Draft an email to a contact
- "send_content" — Send a case study, deck, or document
- "create_task" — Set a reminder or follow-up task
- "schedule" — Schedule a new meeting or discovery call

NEVER invent new action types. If the suggested action is about scheduling a call or meeting, use "schedule". If it's about preparing for an existing meeting, use "meeting_prep". Pick the closest match from the list above.

Remember: You are the partner at their side, helping them see clearly and act wisely. Build confidence, not anxiety.`;

// ============================================================================
// DATA GATHERING
// ============================================================================

interface BriefingData {
  user: { id: string; full_name: string; email: string };
  deals: any[];
  tasks: any[];
  activities: any[];
  meetings: any[];
  quota: { target: number; closed: number; percentage: number };
  recentWins: any[];
}

function inferFirstNameFromEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes('@')) return null;
  const local = email.split('@')[0]?.toLowerCase().trim();
  if (!local) return null;
  const firstChunk = local.split(/[._-]+/)[0] || local;
  const hasDigits = /\d/.test(firstChunk);
  let token = firstChunk.split(/\d/)[0] || firstChunk;
  if (hasDigits && token.length >= 6 && /^[a-z]+$/.test(token)) {
    token = token.slice(0, -1);
  }
  token = token.replace(/[^a-z]/g, '');
  if (token.length < 2) return null;
  return token.charAt(0).toUpperCase() + token.slice(1);
}

function getSafeFirstName(fullName: string | null | undefined, email?: string | null): string {
  const normalized = (fullName || '').trim();
  if (!normalized || normalized.includes('@')) {
    return inferFirstNameFromEmail(email) || 'there';
  }
  return normalized.split(/\s+/)[0] || 'there';
}

function buildFallbackBriefing(data: BriefingData) {
  const topDeal = [...(data.deals || [])]
    .filter((d: any) => d?.id && d?.name)
    .sort((a: any, b: any) => (b.amount || 0) - (a.amount || 0))[0];

  const momentumSummary = data.recentWins.length > 0
    ? `You have ${data.recentWins.length} deal movement update${data.recentWins.length > 1 ? 's' : ''} this week.`
    : `No major stage movement yet this week, but there are clear plays available today.`;

  return {
    greeting: `Good morning, ${getSafeFirstName(data.user.full_name, data.user.email)}!`,
    momentum: {
      summary: momentumSummary,
      wins: data.recentWins.slice(0, 3).map((d: any) => ({
        deal_name: d.name,
        deal_id: d.id,
        achievement: `Moved to ${d.stage}`,
        context: `Updated ${new Date(d.updated_at).toLocaleDateString()}`,
      })),
      quota_status: {
        percentage: data.quota.percentage,
        message: `${data.quota.percentage}% of quarterly target closed so far.`,
      },
    },
    priority_play: topDeal ? {
      headline: `Advance ${topDeal.name} this week`,
      deal_name: topDeal.name,
      deal_id: topDeal.id,
      why_this_matters: `Highest value opportunity in your active pipeline.`,
      context: [
        `Amount: $${(topDeal.amount || 0).toLocaleString()}`,
        `Stage: ${topDeal.stage || 'unknown'}`,
        `Close date: ${topDeal.expected_close_date || 'not set'}`,
      ],
      action: {
        label: 'Draft next-step email',
        type: 'email',
      },
    } : null,
    available_plays: (data.deals || []).slice(0, 3).map((d: any) => ({
      deal_name: d.name,
      deal_id: d.id,
      status: 'play_available',
      headline: `Progress ${d.name}`,
      context: `${d.stage || 'unknown'} • $${(d.amount || 0).toLocaleString()}`,
      suggested_action: {
        label: 'Create follow-up task',
        type: 'create_task',
      },
    })),
    in_motion: [],
    todays_meetings: [],
  };
}

function getQuarterStart(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3);
  return new Date(now.getFullYear(), quarter * 3, 1).toISOString();
}

function getCurrentQuarter(): string {
  const now = new Date();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  return `${now.getFullYear()}-Q${quarter}`;
}

async function gatherBriefingData(
  supabase: any,
  userId: string,
  organizationId: string
): Promise<BriefingData> {
  const today = new Date().toISOString().split('T')[0];
  const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const quarterStart = getQuarterStart();

  console.log('[generate-briefing] Gathering data for user:', userId);

  // Parallel fetch all data
  const [
    userResult,
    dealsResult,
    tasksResult,
    activitiesResult,
    closedWonResult,
    quotaResult,
    emailEngagementResult
  ] = await Promise.all([
    // User info
    supabase
      .from('profiles')
      .select('id, full_name, email')
      .eq('id', userId)
      .single(),
    
    // Active deals with account info
    supabase
      .from('deals')
      .select(`
        id, name, amount, stage, probability, expected_close_date,
        description, created_at, updated_at, account_id,
        accounts(id, name)
      `)
      .eq('organization_id', organizationId)
      .not('stage', 'in', '("closed_won","closed_lost")'),
    
    // Tasks due soon or incomplete
    supabase
      .from('tasks')
      .select('id, title, due_date, completed, priority, deal_id')
      .eq('organization_id', organizationId)
      .eq('user_id', userId)
      .eq('completed', false)
      .lte('due_date', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()),
    
    // Recent activities (to calculate last touch)
    supabase
      .from('activities')
      .select('id, deal_id, activity_date, type, subject')
      .eq('organization_id', organizationId)
      .gte('activity_date', weekAgo)
      .order('activity_date', { ascending: false }),
    
    // Closed won this quarter (for quota calc)
    supabase
      .from('deals')
      .select('id, amount, updated_at')
      .eq('organization_id', organizationId)
      .eq('stage', 'closed_won')
      .gte('updated_at', quarterStart),
    
    // User quota
    supabase
      .from('sales_quotas')
      .select('target_amount')
      .eq('user_id', userId)
      .eq('organization_id', organizationId)
      .eq('period_type', 'quarterly')
      .single(),

    // Email engagement stats for active deal contacts
    supabase
      .from('email_engagement_stats')
      .select('contact_id, total_emails_sent, total_emails_received, last_email_sent_at, last_email_received_at, engagement_score, contacts(full_name, company)')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(20)
  ]);

  // Calculate quota status
  const closedAmount = closedWonResult.data?.reduce((sum: number, d: any) => sum + (d.amount || 0), 0) || 0;
  const quotaTarget = quotaResult.data?.target_amount || 500000; // Default $500k
  const quotaPercentage = Math.round((closedAmount / quotaTarget) * 100);

  // Find deals that moved forward this week (stage changes)
  const recentWins = dealsResult.data?.filter((d: any) => {
    const updated = new Date(d.updated_at);
    const weekAgoDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    return updated > weekAgoDate && ['qualified', 'proposal', 'negotiation'].includes(d.stage);
  }) || [];

  console.log('[generate-briefing] Data gathered:', {
    deals: dealsResult.data?.length || 0,
    tasks: tasksResult.data?.length || 0,
    activities: activitiesResult.data?.length || 0,
    closedWon: closedWonResult.data?.length || 0,
    recentWins: recentWins.length
  });

  // Process email engagement data
  const emailEngagement = (emailEngagementResult.data || []).map((e: any) => ({
    contact: e.contacts?.full_name || 'Unknown',
    company: e.contacts?.company || '',
    sent: e.total_emails_sent || 0,
    received: e.total_emails_received || 0,
    lastEmail: e.last_email_sent_at || e.last_email_received_at,
    score: e.engagement_score,
  }));

  return {
    user: userResult.data || { id: userId, full_name: 'there', email: '' },
    deals: dealsResult.data || [],
    tasks: tasksResult.data || [],
    activities: activitiesResult.data || [],
    meetings: [],
    emailEngagement,
    quota: {
      target: quotaTarget,
      closed: closedAmount,
      percentage: quotaPercentage
    },
    recentWins
  };
}

// ============================================================================
// BRIEFING GENERATION
// ============================================================================

async function generateBriefing(data: BriefingData): Promise<any> {
  // Build context for LLM
  const contextPrompt = `
Generate a daily briefing for ${data.user.full_name && !data.user.full_name.includes('@') ? data.user.full_name : 'this salesperson'}.

## CURRENT DATA

### Quota Status
- Target: $${data.quota.target.toLocaleString()}
- Closed this quarter: $${data.quota.closed.toLocaleString()}
- Percentage: ${data.quota.percentage}%

### Active Deals (${data.deals.length})
${data.deals.slice(0, 15).map(d => `
- "${d.name}" (${d.accounts?.name || 'No account'})
  ID: ${d.id}
  Stage: ${d.stage}
  Amount: $${(d.amount || 0).toLocaleString()}
  Close Date: ${d.expected_close_date || 'Not set'}
  Last Updated: ${d.updated_at}
`).join('')}
${data.deals.length > 15 ? `\n(... and ${data.deals.length - 15} more deals)` : ''}

### Recent Wins (deals that moved forward this week)
${data.recentWins.map(d => `- ${d.name} (ID: ${d.id}): moved to ${d.stage}`).join('\n') || 'None yet this week'}

### Pending Tasks
${data.tasks.slice(0, 10).map(t => `- ${t.title} (due: ${t.due_date}) - deal_id: ${t.deal_id || 'none'}`).join('\n') || 'No pending tasks'}

### Recent Activity (last 7 days)
${data.activities.slice(0, 10).map(a => `- ${a.type}: ${a.subject} (${a.activity_date})`).join('\n') || 'No recent activity logged'}

### Email Engagement (top contacts)
${(data.emailEngagement || []).slice(0, 10).map((e: any) => {
  const lastEmailDate = e.lastEmail ? new Date(e.lastEmail) : null;
  const daysSince = lastEmailDate ? Math.round((Date.now() - lastEmailDate.getTime()) / 86400000) : null;
  return `- ${e.contact} (${e.company}): ${e.sent} sent, ${e.received} received${daysSince !== null ? `, last email ${daysSince}d ago` : ''}${e.score ? ` [score: ${Math.round(e.score)}]` : ''}`;
}).join('\n') || 'No email engagement data synced yet'}

## INSTRUCTIONS

Based on this data, generate a briefing that:
1. Celebrates any momentum (deals moved, activity logged)
2. Identifies the highest-leverage play for today (pick the deal with best opportunity)
3. Lists 2-3 other plays available (with context for each)
4. Acknowledges anything "in motion" (waiting on external factors like legal, procurement)

IMPORTANT: Include the deal IDs in your response so the UI can link to them.
IMPORTANT: For all action "type" fields, you MUST use ONLY one of these exact strings: "meeting_prep", "call", "email", "send_content", "create_task", "schedule". Do NOT invent new types. For scheduling calls/meetings use "schedule". For preparing for existing meetings use "meeting_prep".
Remember: Build confidence, not anxiety. Frame everything through what they CAN control.
`;

  console.log('[generate-briefing] Calling AI provider...');

  const result = await callWithFallback({
    messages: [
      { role: 'system', content: BRIEFING_SYSTEM_PROMPT },
      { role: 'user', content: contextPrompt }
    ],
    tier: 'pro',
    temperature: 0.4,
    maxTokens: 2048,
    jsonMode: true
  });

  console.log('[generate-briefing] AI response received');

  // Parse and validate response
  let briefing;
  try {
    briefing = JSON.parse(result.content);
  } catch (e) {
    // Try to extract JSON from response
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      briefing = JSON.parse(jsonMatch[0]);
    } else {
      console.error('[generate-briefing] Failed to parse response:', result.content.substring(0, 500));
      throw new Error('Failed to parse briefing response');
    }
  }

  return {
    briefing,
    provider: result.provider,
    model: result.model
  };
}

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
    // Auth
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { organizationId, forceRegenerate } = await req.json();

    if (!organizationId) {
      return new Response(
        JSON.stringify({ error: 'organizationId required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[generate-briefing] Request:', {
      userId: user.id,
      organizationId,
      forceRegenerate
    });

    // Check for cached briefing (unless force regenerate)
    if (!forceRegenerate) {
      const { data: existing } = await supabase
        .from('daily_briefings')
        .select('*')
        .eq('user_id', user.id)
        .eq('briefing_date', new Date().toISOString().split('T')[0])
        .single();

      // If briefing exists and is less than 1 hour old, return cached
      if (existing?.generated_at && existing?.momentum) {
        const age = Date.now() - new Date(existing.generated_at).getTime();
        if (age < 60 * 60 * 1000) { // 1 hour
          console.log('[generate-briefing] Returning cached briefing');
          return new Response(
            JSON.stringify({
              briefing: {
                greeting: existing.momentum?.greeting || `Good morning!`,
                momentum: existing.momentum,
                priority_play: existing.priority_play,
                available_plays: existing.available_plays || [],
                in_motion: existing.in_motion || [],
                todays_meetings: existing.todays_meetings || []
              },
              cached: true,
              generated_at: existing.generated_at
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }
    }

    // Gather data and generate briefing
    const data = await gatherBriefingData(supabase, user.id, organizationId);
    
    // If no deals, return a simple briefing
    if (data.deals.length === 0) {
      const emptyBriefing = {
        greeting: `Good morning, ${getSafeFirstName(data.user.full_name, data.user.email)}! Ready to build your pipeline?`,
        momentum: {
          summary: "Let's get things started!",
          wins: [],
          quota_status: {
            percentage: data.quota.percentage,
            message: "Add your first deal to start tracking progress."
          }
        },
        priority_play: null,
        available_plays: [],
        in_motion: [],
        todays_meetings: []
      };

      return new Response(
        JSON.stringify({
          briefing: emptyBriefing,
          cached: false,
          generated_at: new Date().toISOString(),
          processing_time_ms: Date.now() - startTime
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let briefing: any;
    let provider = 'fallback';
    let model = 'deterministic';
    try {
      const generated = await generateBriefing(data);
      briefing = generated.briefing;
      provider = generated.provider;
      model = generated.model;
    } catch (briefErr: any) {
      console.error('[generate-briefing] LLM generation failed, using fallback briefing:', briefErr?.message || briefErr);
      briefing = buildFallbackBriefing(data);
    }

    const processingTime = Date.now() - startTime;
    console.log('[generate-briefing] Generated in', processingTime, 'ms');

    // Store briefing using service role for upsert
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error: upsertError } = await supabaseAdmin
      .from('daily_briefings')
      .upsert({
        user_id: user.id,
        organization_id: organizationId,
        briefing_date: new Date().toISOString().split('T')[0],
        momentum: { ...briefing.momentum, greeting: briefing.greeting },
        priority_play: briefing.priority_play,
        available_plays: briefing.available_plays || [],
        in_motion: briefing.in_motion || [],
        todays_meetings: briefing.todays_meetings || [],
        deals_moved_forward: briefing.momentum?.wins?.length || 0,
        quota_percentage: briefing.momentum?.quota_status?.percentage || 0,
        plays_available_count: briefing.available_plays?.length || 0,
        generated_at: new Date().toISOString(),
        generation_time_ms: processingTime,
        llm_model: model
      }, {
        onConflict: 'user_id,briefing_date'
      });

    if (upsertError) {
      console.error('[generate-briefing] Failed to store briefing:', upsertError);
    }

    return new Response(
      JSON.stringify({
        briefing,
        cached: false,
        generated_at: new Date().toISOString(),
        processing_time_ms: processingTime
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    console.error('[generate-briefing] Error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
