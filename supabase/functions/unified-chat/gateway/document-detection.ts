/**
 * Document Detection — backported from unified-chat-fullcanary
 *
 * Detects when a user message contains meeting notes, call summaries,
 * or sloppy CRM data that should trigger entity extraction rather than
 * being treated as a conversational query or drafting request.
 */

export interface DocumentDetectionResult {
  isDocument: boolean;
  confidence: number;
  signals: string[];
}

export function detectDocument(message: string): DocumentDetectionResult {
  const signals: string[] = [];
  let score = 0;

  // Length scoring
  if (message.length >= 300) { score += 1; signals.push('length_300+'); }
  if (message.length >= 1000) { score += 1; signals.push('length_1000+'); }
  if (message.length >= 2000) { score += 1; signals.push('length_2000+'); }

  const documentPatterns: Array<{ pattern: RegExp; weight: number; name: string }> = [
    // Strong signals (weight 2)
    { pattern: /meeting\s+(notes|summary|recap)/i, weight: 2, name: 'meeting_notes_header' },
    { pattern: /call\s+(notes|summary|recap)/i, weight: 2, name: 'call_notes_header' },
    { pattern: /deal\s+stage:\s*~?\d+%?/i, weight: 2, name: 'deal_stage' },
    { pattern: /internal\s+(assessment|notes)/i, weight: 2, name: 'internal_section' },
    { pattern: /(?:call|meeting|met|spoke|talked|coffee|lunch|dinner)\s+(?:with\s+)?\w+\s+(?:today|yesterday|this\s+(?:morning|afternoon)|last\s+week|earlier)/i, weight: 2, name: 'recent_meeting_ref' },
    { pattern: /(?:just\s+)?(?:had|got\s+off|finished|wrapped)\s+(?:a\s+)?(?:call|meeting|coffee|lunch|chat|sync)\s+(?:with\s+)/i, weight: 2, name: 'recent_activity_ref' },

    // Medium signals (weight 1)
    { pattern: /attendees?:/i, weight: 1, name: 'attendees' },
    { pattern: /participants?:/i, weight: 1, name: 'participants' },
    { pattern: /next\s+steps?:/i, weight: 1, name: 'next_steps' },
    { pattern: /action\s+items?:/i, weight: 1, name: 'action_items' },
    { pattern: /account:/i, weight: 1, name: 'account_field' },
    { pattern: /opportunity\s+(type|name)?:/i, weight: 1, name: 'opportunity_field' },
    { pattern: /risks?\s+(identified|flagged|noted)/i, weight: 1, name: 'risks_section' },
    { pattern: /decision\s+(process|criteria|makers?)/i, weight: 1, name: 'decision_section' },
    { pattern: /stakeholders?:/i, weight: 1, name: 'stakeholders' },
    { pattern: /buying\s+committee/i, weight: 1, name: 'buying_committee' },
    { pattern: /(our|their)\s+team:/i, weight: 1, name: 'team_section' },
    { pattern: /close\s+(window|date|timeline)/i, weight: 1, name: 'close_timeline' },
    { pattern: /commercial\s+(discussion|terms)/i, weight: 1, name: 'commercial' },

    // Structural signals (weight 1)
    { pattern: /^\s*[-•*]\s+.+$/m, weight: 1, name: 'bullet_points' },
    { pattern: /^\s*\d+[.)]\s+.+$/m, weight: 1, name: 'numbered_list' },

    // Conversational CRM signals (SDR-style short notes)
    { pattern: /\b(?:called|emailed|messaged|pinged|texted|DMed)\s+\w+/i, weight: 1, name: 'activity_verb' },
    { pattern: /\b(?:voicemail|VM|no\s+answer|no\s+pick\s*up|didn'?t\s+pick\s+up)\b/i, weight: 1, name: 'call_outcome' },
    { pattern: /\bat\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?/i, weight: 1, name: 'person_at_company' },
    { pattern: /\b(?:not\s+interested|interested|wants?\s+(?:a\s+)?demo|wants?\s+to\s+see|needs?\s+)/i, weight: 1, name: 'prospect_sentiment' },
    { pattern: /\b(?:DQ|disqualif|not\s+a\s+fit|dead|passed|ghosted|no\s+go)\b/i, weight: 1, name: 'disqualification' },
    { pattern: /\b(?:demo|follow\s*up|proposal|contract|pricing|quote)\b/i, weight: 1, name: 'sales_stage_ref' },
    { pattern: /\$\s*\d+[kKmM]?\b|\b\d+\s*(?:k|K|grand)\b/i, weight: 1, name: 'deal_amount' },
    { pattern: /\b(?:Q[1-4]|next\s+quarter|this\s+quarter|end\s+of\s+(?:month|quarter|year))\b/i, weight: 1, name: 'timeline_ref' },
    { pattern: /\b(?:competitor|competing|vs\.?|versus|also\s+(?:looking|evaluating|considering))\b/i, weight: 1, name: 'competitive_mention' },
    { pattern: /\b(?:champion|blocker|decision\s*maker|budget\s+(?:holder|authority|owner)|economic\s+buyer)\b/i, weight: 1, name: 'buying_role' },
    { pattern: /\b(?:budget|budget\s+is|budget\s+around)\b/i, weight: 1, name: 'budget_mention' },
    { pattern: /\b(?:dir|vp|cto|cio|cfo|ceo|svp|evp|head of)\b/i, weight: 1, name: 'title_abbreviations' },
  ];

  for (const { pattern, weight, name } of documentPatterns) {
    if (pattern.test(message)) {
      score += weight;
      signals.push(name);
    }
  }

  // Multiple person names heuristic
  if (message.length >= 300) {
    const namePattern = /\b[A-Z][a-z]+\s+[A-Z][a-z]+\b/g;
    const nameMatches = message.match(namePattern);
    if (nameMatches && nameMatches.length >= 3) {
      score += 2;
      signals.push(`multiple_names_${nameMatches.length}`);
    }
  }

  // Person name + company pattern for shorter messages
  if (message.length < 300 && message.length >= 30) {
    const nameAtCompany = /\b[A-Z][a-z]+\s+(?:at|from|@)\s+[A-Z]/i;
    if (nameAtCompany.test(message)) {
      score += 1;
      signals.push('short_name_at_company');
    }
  }

  // CRM-specific signals boost
  const hasCrmSignals = signals.some(s =>
    ['activity_verb', 'call_outcome', 'person_at_company', 'prospect_sentiment',
     'disqualification', 'recent_meeting_ref', 'recent_activity_ref', 'short_name_at_company',
     'meeting_notes_header', 'call_notes_header', 'deal_stage', 'attendees',
     'next_steps', 'action_items', 'account_field', 'opportunity_field',
     'stakeholders', 'buying_committee', 'budget_mention', 'deal_amount'].includes(s)
  );

  const isDocument = score >= 5 || (score >= 4 && message.length >= 500) || (score >= 4 && hasCrmSignals && message.length >= 100);
  const confidence = Math.min(score / 6, 1);

  return { isDocument, confidence, signals };
}
