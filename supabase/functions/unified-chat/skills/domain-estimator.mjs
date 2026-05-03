const DOMAIN_PATTERNS = {
  search: [
    /\b(find|search|look up|lookup|show|list|where is|what's the status|status of)\b/i,
    /\b(take me to|go to|open|pull up|show me)\b/i,
    /\b(what about this|same for|that one|this one)\b/i,
  ],
  create: [
    /\b(create|add|new|log|record|capture)\b/i,
  ],
  update: [
    /\b(update|change|edit|modify|move|set|rename|close|complete|mark as|advance|delete|remove)\b/i,
  ],
  analytics: [
    /\b(analytics?|metrics?|kpi|pipeline|funnel|velocity|conversion|win rate|forecast|trend|reporting)\b/i,
    /\b(quarter|q[1-4]|month|week|year|this quarter|top deals?|stale deals?|slated to close|closing)\b/i,
  ],
  coaching: [
    /\b(coach|coaching|analy[sz]e deal|deal quality|scoutpad|deal review|next best move)\b/i,
    /\b(?:analy(?:z(?:e|ing)|s(?:e|is|ing))|evaluat(?:e|ion|ing))\s+(?:the\s+)?(?:deal|opportunity|account)\b/i,
    /\b(?:analysis|evaluation)\s+(?:of|on|for)\s+(?:the\s+)?(?:deal|opportunity|account)\b/i,
    /\b(?:analysis|evaluation)\s+(?:of|on|for)\s+(?:the\s+)?(?:.+\s+)?(?:deal|opportunity|account)\b/i,
  ],
  scheduling: [
    /\b(schedule|availability|calendar|meeting|book|reschedule|time slot|invite|send.*meeting|set up.*call)\b/i,
  ],
  intelligence: [
    /\b(draft|email|summari[sz]e|insight|next best action|recommend|narrative)\b/i,
  ],
  product: [
    /\b(product|sku|catalog|bundle|pricing|cross[- ]sell|upsell)\b/i,
  ],
  leads: [
    /\b(lead|mql|sql|bant|enrich|qualification|score leads?)\b/i,
  ],
  sequences: [
    /\b(sequence|cadence|enroll|unenroll|outreach steps?)\b/i,
  ],
  admin: [
    /\b(audit|attribution|custom field|admin|web events?|tracking)\b/i,
  ],
  presentation: [
    /\b(slides?|deck|presentation|pptx)\b/i,
  ],
  email: [
    /\b(email|emails|emailed|inbox|gmail|sent mail|correspondence|last.?email)\b/i,
    /\b(engaged|engagement|in.?touch|communic(ated?|ation)|response.?time)\b/i,
    /\b(unmatched|link|linked|attach|attached|associate|associated)\b.*\b(email|emails|inbox|gmail)\b/i,
  ],
  context: [
    /\b(tell me about|brief me on|what do we know about|give me context|overview of|summary of)\b/i,
    /\b(who is|what'?s happening with|catch me up on|status of|details? (on|for|about))\b/i,
  ],
};

export function estimateRelevantDomains(message) {
  const text = (message || '').trim();
  if (!text) return [];

  const matched = new Set();
  for (const [domain, patterns] of Object.entries(DOMAIN_PATTERNS)) {
    if (patterns.some((p) => p.test(text))) {
      matched.add(domain);
    }
  }

  return [...matched];
}
