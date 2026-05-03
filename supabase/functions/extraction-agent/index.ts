/**
 * Extraction Agent - Meeting Notes & Document Parser
 * 
 * SPECIALIST agent that extracts structured CRM data from:
 * - Meeting notes
 * - Call summaries
 * - Email threads
 * - Other unstructured documents
 * 
 * Returns structured JSON for CRM ingestion - does NOT execute operations.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { callWithFallback } from '../_shared/ai-provider.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

// ============================================================================
// CORS & HEADERS
// ============================================================================

let corsHeaders = getCorsHeaders();

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ExtractionRequest {
  content: string;
  accountHint?: string;
  opportunityHint?: string;
  organizationId: string;
}

interface ContactExtraction {
  name: string;
  title?: string;
  department?: string;
  email?: string;
  phone?: string;
  role: 'decision_maker' | 'influencer' | 'champion' | 'blocker' | 'user' | 'unknown';
  buyingCommittee?: string;
  isNewToMeeting: boolean;
  riskSignal?: string;
  notes?: string;
  // Influence and support signals for stakeholder quadrant positioning
  influenceSignal?: 'high' | 'moderate' | 'low' | null;
  influenceRationale?: string;
  supportSignal?: 'positive' | 'neutral' | 'negative' | null;
  supportRationale?: string;
}

interface TeamMember {
  name: string;
  role?: string;
}

interface Risk {
  description: string;
  severity: 'low' | 'medium' | 'high';
  source?: string;
}

interface NextStep {
  action: string;
  owner?: string;
  dueDate?: string;
}

interface Milestone {
  date: string;
  event: string;
}

interface MeetingNotesExtraction {
  anchor: {
    account: {
      name: string;
      industry?: string;
    };
    opportunity?: {
      name: string;
      stage?: 'prospecting' | 'qualification' | 'proposal' | 'negotiation' | 'closed_won' | 'closed_lost';
      probability?: number;
      amount?: number;
      closeWindow?: string;
    };
  };

  contacts: ContactExtraction[];

  ourTeam: TeamMember[];

  dealSignals: {
    stageIndicators?: string[];
    probabilityEstimate?: number;
    timeline?: {
      targetClose?: string;
      keyMilestones?: Milestone[];
    };
    requirements?: string[];
    budgetInfo?: string;
    competitors?: string[];
  };

  risks: Risk[];

  nextSteps: {
    ours: NextStep[];
    theirs: NextStep[];
  };

  internalNotes?: string;

  bantContext?: {
    budget?: string;
    authority?: string;
    need?: string;
    timeline?: string;
  };

  keyUseCase?: string;

  meetingMeta: {
    date?: string;
    location?: string;
    meetingType?: 'discovery' | 'demo' | 'proposal' | 'negotiation' | 'qbr' | 'kickoff' | 'site_visit' | 'other';
    attendeeCount?: {
      theirs: number;
      ours: number;
    };
  };

  products?: {
    positioned: string[];
    customerWorkloads: string[];
    competitorProducts: string[];
    productDetails?: {
      name: string;
      attributedAmount?: number;
      amountType?: string;
      customerRequirements?: string[];
      contextSnippet?: string;
      sentiment?: string;
    }[];
  };

  technicalRequirements?: {
    power?: {
      initial?: string;
      future?: string;
      redundancy?: string;
    };
    space?: {
      initial?: string;
      future?: string;
    };
    network?: {
      initial?: string;
      future?: string;
      routes?: string[];
    };
    compliance?: string[];
    security?: string[];
  };

  location?: {
    chosen?: string;
    alternates?: string[];
    rationale?: string;
  };

  commercialTerms?: {
    termLength?: string;
    pricingModel?: string;
  };

  confidence: {
    overall: number;
    accountIdentification: number;
    contactExtraction: number;
    roleInference: number;
  };
}

// ============================================================================
// SYSTEM PROMPT
// ============================================================================

const EXTRACTION_SYSTEM_PROMPT = `You are a CRM data extraction specialist. Your ONLY job is to parse meeting notes, call summaries, and similar documents, then return structured JSON. You are extremely precise and consistent.

## REQUIRED JSON SCHEMA

Return this EXACT structure (omit fields without data):

{
  "anchor": {
    "account": { "name": "Company Name", "industry": "Optional industry" },
    "opportunity": {
      "name": "Company Name - Short Opportunity Description",
      "stage": "prospecting|qualification|proposal|negotiation|closed_won|closed_lost",
      "probability": 50,
      "amount": 100000,
      "closeWindow": "Late Feb 2026"
    }
  },
  "contacts": [
    {
      "name": "Person Name",
      "title": "VP of Something",
      "department": "IT",
      "email": "email@example.com",
      "role": "decision_maker|influencer|champion|blocker|user|unknown",
      "buyingCommittee": "Technical",
      "isNewToMeeting": false,
      "riskSignal": "Late addition - may slow deal",
      "notes": "Any relevant observations",
      "influenceSignal": "high|moderate|low|null",
      "influenceRationale": "exact phrase from notes justifying influence level",
      "supportSignal": "positive|neutral|negative|null",
      "supportRationale": "exact phrase from notes justifying support stance"
    }
  ],
  "ourTeam": [
    { "name": "Our Person", "role": "Account Executive" }
  ],
  "dealSignals": {
    "stageIndicators": ["proposal review", "pricing discussion"],
    "probabilityEstimate": 60,
    "timeline": {
      "targetClose": "Q1 2026",
      "keyMilestones": [{ "date": "Feb 1", "event": "Security review" }]
    },
    "requirements": ["SOC2 compliance", "Integration with SAP"],
    "budgetInfo": "$2.5M annual budget approved",
    "competitors": ["Palo Alto", "CrowdStrike"]
  },
  "risks": [
    {
      "description": "Two buying committees with separate authority",
      "severity": "high|medium|low",
      "source": "Mentioned in meeting notes"
    }
  ],
  "nextSteps": {
    "ours": [
      { "action": "Send revised proposal", "owner": "John Smith", "dueDate": "Friday" }
    ],
    "theirs": [
      { "action": "Internal security review", "owner": "Jennifer Park", "dueDate": "Next week" }
    ]
  },
  "internalNotes": "Private observations marked [INTERNAL] or similar",
  "bantContext": {
    "budget": "What budget information is available — approved amount, fiscal cycle, who controls it",
    "authority": "Who has decision authority, how the approval chain works",
    "need": "The core business problem or initiative driving this deal",
    "timeline": "When they need to decide/deploy, key dates, procurement deadlines"
  },
  "keyUseCase": "1-3 sentence summary of the primary business problem the customer is trying to solve and what they want to achieve",
  "meetingMeta": {
    "date": "2026-01-27",
    "location": "PepsiCo HQ",
    "meetingType": "proposal",
    "attendeeCount": { "theirs": 5, "ours": 3 }
  },
  "products": {
    "positioned": ["Colocation", "Managed Hosting"],
    "customerWorkloads": ["AI/ML training", "GPU clusters"],
    "competitorProducts": ["AWS Outposts", "Equinix Metal"],
    "productDetails": [
      {
        "name": "Colocation",
        "attributedAmount": 2500000,
        "amountType": "annual",
        "customerRequirements": ["A+B power redundancy", "SOC2 compliance"],
        "contextSnippet": "Primary infrastructure for pharmacy distribution systems, need redundant power and SOC2",
        "sentiment": "positive"
      }
    ]
  },
  "technicalRequirements": {
    "power": {
      "initial": "100kW",
      "future": "250-300kW",
      "redundancy": "A+B"
    },
    "space": {
      "initial": "12-16 racks",
      "future": "30-40 racks"
    },
    "network": {
      "initial": "2x10G",
      "future": "2x100G",
      "routes": ["Singapore", "Hong Kong"]
    },
    "compliance": ["ISO 27001", "SOC2"],
    "security": ["biometric", "CCTV 90 days"]
  },
  "location": {
    "chosen": "Kuala Lumpur",
    "alternates": ["Singapore"],
    "rationale": "cost optimization"
  },
  "commercialTerms": {
    "termLength": "3-5 years",
    "pricingModel": "flat power pricing"
  },
  "confidence": {
    "overall": 75,
    "accountIdentification": 90,
    "contactExtraction": 80,
    "roleInference": 65
  }
}

## EXTRACTION RULES

### Account & Opportunity
- Look for company names in headers, "Account:", "Customer:", or context
- Opportunity name MUST follow the format: "[Account Name] - [Short Opportunity Description]"
  - Example: "Acme Corp - Data Center Migration" or "PepsiCo - GPU Infrastructure Expansion"
  - The account name prefix ensures the deal is identifiable at a glance
  - The description suffix should be 2-5 words summarizing the initiative
  - If no clear project name is found, use the primary product/service: "[Account] - [Product] Deployment"
- Stage inference:
  - "Discovery", "learning about needs", "initial meeting" → prospecting
  - "Qualified", "confirmed budget", "met criteria" → qualification  
  - "Proposal", "pricing", "commercial", "quote", "50%" → proposal
  - "Negotiation", "contract", "legal review", "redlines" → negotiation
  - "Closed", "won", "signed" → closed_won
  - "Lost", "went with competitor", "no decision" → closed_lost

### Contact Role Inference

DEFAULT ROLE: When no clear signals match any category below, assign "influencer" or "user". Most contacts in meeting notes are influencers or users — NOT champions.

DECISION MAKER signals:
- Titles containing: Director, VP, Vice President, Head of, Chief, President, Owner, Partner
- Context: "exec sponsor", "final approval", "signs off", "budget authority", "economic buyer"
- Departments with budget control: Finance leadership, C-suite, Business unit heads

INFLUENCER signals:
- Titles: Manager, Lead, Senior (without Director/VP), Specialist, Analyst
- Context: "technical evaluation", "will recommend", "on the committee", "reviews proposals"
- Departments: Technical, Operations, Procurement (non-senior)
- ALSO USE FOR: anyone who "led the convo", "asked questions", "presented", "demoed", or "participated actively" — participation is NOT advocacy

CHAMPION signals (REQUIRES EXPLICIT ADVOCACY LANGUAGE — do NOT assign loosely):
- Context MUST include one of these EXACT patterns: "pushing for this", "advocate", "internal sponsor", "wants this to happen", "Technical Champion" (exact phrase), "coaching us", "selling internally", "went to bat for us", "championing"
- DO NOT assign champion role based on: being a decision maker, being senior, being the main contact, having high influence, being enthusiastic in meetings, leading the conversation, asking questions, or being engaged
- "Led convo", "asked performance qs", "drove the discussion", "very engaged" = INFLUENCER, not champion
- Champion is about ACTIVE INTERNAL ADVOCACY for your solution — they are selling on your behalf inside their organization
- When in doubt, ALWAYS use "influencer" or "user" instead of "champion" — champion should be rare

BLOCKER signals:
- Context: "concerns about", "not convinced", "prefers competitor", "skeptical"
- Risk/Compliance/Security roles with veto power
- Late introductions with approval authority

### Influence & Support Signal Extraction

For EACH contact, also assess influence and support signals:

INFLUENCE SIGNAL (how much organizational power/sway they have):
- "high": Explicit ownership language ("owns this", "main guy", "final say", "budget authority", "exec sponsor"), C-suite/VP/Director titles with clear authority context
- "moderate": Manager-level with some decision input, "on the committee", "reviews proposals", "technical lead"
- "low": Individual contributor, "just joined", no authority signals, purely operational role
- null: Insufficient information to determine — DEFAULT TO NULL (leave blank)

SUPPORT SIGNAL (are they for our solution, against it, or unclear):
- "positive": ONLY if note explicitly says champion-like things: "pushing for this", "advocate", "wants this to happen", "excited about our solution", "internal sponsor", "ally"
- "negative": "prefers competitor", "skeptical", "not convinced", "pushing back", "concerns about our approach"
- "neutral": Explicitly neutral or mixed signals, no clear leaning
- null: No support information available — DEFAULT TO NULL (leave blank)

CRITICAL INFLUENCE/SUPPORT RULES:
- Default to NULL for both signals unless the note CLEARLY indicates otherwise
- Being a decision_maker does NOT automatically imply high influence — only explicit language like "owns this" or "main guy" does
- Being a decision_maker does NOT make someone a champion — champion requires explicit advocacy language
- Late arrivals ("showed up late", "new ppl") get the SAME treatment as everyone else — assess based on what the notes actually say, not assumptions
- ALWAYS include the rationale: the exact phrase from the notes that justifies the signal assignment
- If a person is merely listed by name and title with no behavioral context, leave both signals as null

### Risk Detection

HIGH severity:
- Multiple buying committees or split decision authority
- Late stakeholder introductions with approval power
- Compressed timeline with unmet prerequisites
- Explicit competitive threat with incumbent advantage
- Legal or compliance blockers identified

MEDIUM severity:
- Budget timing constraints (fiscal year, budget freeze)
- Internal alignment disagreements
- Key stakeholder not yet engaged
- Unclear decision process

LOW severity:
- Standard procurement process requirements
- Routine compliance/security requirements
- Normal timeline expectations

### Internal Notes Detection
Flag content as internal if:
- Headers like "Internal", "Not for customer", "My assessment", "Private notes"
- Sections marked with brackets like [INTERNAL] or (internal only)
- Commentary that's clearly the author's private analysis

### OUR TEAM vs THEIR TEAM
- "Our Team:", "Provider:", "Us:", "[Your Company Name]:" → ourTeam array
- Customer/prospect attendees → contacts array
- Look for sections labeled with team distinctions

### NEXT STEPS
- "Next Steps (Our Team):", "Action Items - Us:" → nextSteps.ours
- "Next Steps ([Customer]):", "Customer Actions:" → nextSteps.theirs
- Extract owner names and due dates when mentioned

### Products & Workloads
- "positioned" = what we are selling/proposing (e.g. "Colocation", "Managed Hosting", "Bare Metal")
- "customerWorkloads" = what the customer will run (e.g. "AI/ML training", "GPU clusters", "SAP HANA", "finance systems", "supply chain planning", "trading systems", "corporate apps")
- "competitorProducts" = alternatives or incumbents mentioned (e.g. "AWS", "Equinix")
- Look for shorthand: "colo" → Colocation, "MH" → Managed Hosting, "BM" → Bare Metal
- IMPORTANT: Extract ALL workloads mentioned even if listed casually (e.g. "finance systems\ninternal trading adj systems\nsupply chain planning\ncorp apps" should ALL be captured)
- Infer "positioned" from context: if discussing colocation, data center, hosting, infrastructure refresh, migration — include the relevant product
- For EACH product mentioned (positioned, workload, or competitor), extract a "productDetails" entry with:
  - "name": exact product name
  - "attributedAmount": dollar amount attributed to this product if mentioned (numeric, e.g. 2500000)
  - "amountType": "total"|"annual"|"monthly"|"one_time"
  - "customerRequirements": array of specific requirements tied to this product (e.g. ["HIPAA compliance", "99.99% SLA"])
  - "contextSnippet": 1-2 sentence excerpt from the notes about this product
  - "sentiment": "positive"|"neutral"|"negative"|"requirement" — the customer's attitude toward this product
- Example productDetails entry: { "name": "Colocation", "attributedAmount": 2500000, "amountType": "annual", "customerRequirements": ["A+B power", "SOC2"], "contextSnippet": "CVS wants colo for pharmacy systems with redundant power", "sentiment": "positive" }

### Technical Requirements
- Parse power specs: "100kW", "2MW", "A+B redundancy", "N+1"
- Parse space specs: "12 racks", "half cab", "full cage"
- Parse network specs: "2x10G", "100G", route mentions (city names for network paths)
- Compliance/certifications: ISO, SOC, PCI, HIPAA, etc.
- Security: biometric access, CCTV retention, mantrap, etc.
- Capture BOTH initial and future/expansion values when mentioned

### Location
- "chosen" = the selected or preferred location/market
- "alternates" = other locations considered
- "rationale" = why this location (cost, latency, compliance, proximity)

### Commercial Terms
- Term length: "3 year", "36 months", "5yr" → normalize to readable form
- Pricing model: "per kW", "flat rate", "blended", "tiered"

### Amount Parsing
- Parse shorthand amounts: "$2.5M" = 2500000, "500K" = 500000, "$1.2B" = 1200000000
- Look in multiple places: opportunity amount, budget info, contract value, TCV, MRR/ARR
- When amount appears as text like "$2.5M annual", extract the numeric value

### BANT Context
Extract Budget, Authority, Need, and Timeline qualification signals:
- "budget": Look for dollar amounts, budget approvals, fiscal year references, pricing discussions, TCV, MRR/ARR. Summarize in 1-2 sentences.
- "authority": Map the decision chain — who signs, who approves, what committees are involved. Summarize in 1-2 sentences.
- "need": The underlying business driver — why are they buying? What problem does this solve? Summarize in 1-2 sentences.
- "timeline": Target close date, procurement milestones, implementation deadlines, urgency signals. Summarize in 1-2 sentences.
- Each field should be a concise 1-2 sentence summary, not a bulleted list
- If a BANT dimension has no data in the notes, omit that field entirely

### Key Use Case
- Summarize the primary customer need in 1-3 sentences
- Focus on WHAT they are trying to do and WHY (business outcome, not product features)
- Example: "Deploying GPU compute infrastructure for AI/ML training workloads to support a new internal AI initiative launching Q2 2026. Customer needs 100kW initial with expansion to 300kW within 18 months."
- If the notes mention multiple use cases, prioritize the primary/largest one

### Meeting Date
- If the notes say "today", "call today", "met today" — use TODAY'S DATE (provided in the prompt) as meetingMeta.date in YYYY-MM-DD format
- If the notes say "yesterday" — use yesterday's date
- If no date is mentioned at all, default meetingMeta.date to TODAY'S DATE (the user is likely logging notes from a call that just happened)
- Only omit meetingMeta.date if the notes are clearly about a future or hypothetical meeting

## OUTPUT REQUIREMENTS
1. Return ONLY valid JSON matching the schema above
2. Do not include any text before or after the JSON
3. If information is not present, omit the field (don't set to null)
4. For confidence scores, be conservative - uncertainty should lower scores
5. Extract ALL contacts from the buyer side, not just decision makers
6. ALWAYS extract ourTeam from "Our Team:" sections
7. ALWAYS extract nextSteps from "Next Steps" sections`;

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function buildExtractionPrompt(
  content: string,
  accountHint?: string,
  opportunityHint?: string
): string {
  let prompt = '';

  // Always include today's date so relative references ("today", "yesterday", "this week") resolve correctly
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  prompt += `TODAY'S DATE: ${today}\n\n`;

  if (accountHint || opportunityHint) {
    prompt += 'CONTEXT:\n';
    if (accountHint) prompt += `- Known account: ${accountHint}\n`;
    if (opportunityHint) prompt += `- Known opportunity: ${opportunityHint}\n`;
    prompt += '\n';
  }

  prompt += `DOCUMENT TO EXTRACT:\n\n${content}`;

  return prompt;
}

function parseAndValidateExtraction(responseText: string): MeetingNotesExtraction {
  // Strip any markdown code fences if present
  let jsonStr = responseText.trim();
  
  if (jsonStr.startsWith('```json')) {
    jsonStr = jsonStr.slice(7);
  }
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.slice(3);
  }
  if (jsonStr.endsWith('```')) {
    jsonStr = jsonStr.slice(0, -3);
  }

  const parsed = JSON.parse(jsonStr.trim());
  
  // Normalize different possible structures from LLM
  // The LLM might return { account: {...} } instead of { anchor: { account: {...} } }
  let normalized: any = {};
  
  // Handle anchor/account normalization
  if (parsed.anchor?.account?.name) {
    // Already in expected format
    normalized.anchor = parsed.anchor;
  } else if (parsed.account?.name) {
    // LLM returned flat structure: { account: { name, opportunity } }
    normalized.anchor = {
      account: {
        name: parsed.account.name,
        industry: parsed.account.industry
      }
    };
    // Move opportunity if nested under account
    if (parsed.account.opportunity) {
      normalized.anchor.opportunity = {
        name: parsed.account.opportunity.name,
        stage: parsed.account.opportunity.stage,
        probability: parsed.account.opportunity.probability,
        amount: parsed.account.opportunity.value || parsed.account.opportunity.amount,
        closeWindow: parsed.account.opportunity.close_date || parsed.account.opportunity.closeWindow
      };
    }
  } else if (parsed.company?.name || parsed.organization?.name) {
    // Handle other common variations
    normalized.anchor = {
      account: {
        name: parsed.company?.name || parsed.organization?.name,
        industry: parsed.company?.industry || parsed.organization?.industry
      }
    };
  } else {
    throw new Error('Extraction missing required field: anchor.account.name (or account.name)');
  }

  // Handle opportunity if at top level
  if (!normalized.anchor.opportunity && parsed.opportunity) {
    normalized.anchor.opportunity = {
      name: parsed.opportunity.name,
      stage: parsed.opportunity.stage,
      probability: parsed.opportunity.probability,
      amount: parsed.opportunity.value || parsed.opportunity.amount,
      closeWindow: parsed.opportunity.close_date || parsed.opportunity.closeWindow
    };
  }

  // Normalize contacts array
  normalized.contacts = [];
  const rawContacts = parsed.contacts || parsed.stakeholders || [];
  for (const contact of rawContacts) {
    normalized.contacts.push({
      name: contact.name,
      title: contact.title || contact.position,
      department: contact.department,
      email: contact.email,
      phone: contact.phone,
      role: normalizeContactRole(contact.role),
      buyingCommittee: contact.buyingCommittee || contact.buying_committee,
      isNewToMeeting: !!contact.isNewToMeeting || !!contact.is_new_to_meeting,
      riskSignal: contact.riskSignal || contact.risk_signal,
      notes: contact.notes,
      influenceSignal: normalizeSignalLevel(contact.influenceSignal || contact.influence_signal),
      influenceRationale: contact.influenceRationale || contact.influence_rationale,
      supportSignal: normalizeSupportSignal(contact.supportSignal || contact.support_signal),
      supportRationale: contact.supportRationale || contact.support_rationale,
    });
  }

  // Normalize ourTeam array
  normalized.ourTeam = [];
  const rawTeam = parsed.ourTeam || parsed.our_team || parsed.provider_team || [];
  for (const member of rawTeam) {
    normalized.ourTeam.push({
      name: member.name,
      role: member.role || member.title
    });
  }

  // Normalize risks array
  normalized.risks = [];
  const rawRisks = parsed.risks || [];
  for (const risk of rawRisks) {
    normalized.risks.push({
      description: risk.description || risk.risk,
      severity: normalizeSeverity(risk.severity || risk.level),
      source: risk.source
    });
  }

  // Normalize nextSteps
  normalized.nextSteps = {
    ours: [],
    theirs: []
  };
  
  // Handle various next steps formats
  const rawOurs = parsed.nextSteps?.ours || parsed.next_steps?.ours || parsed.our_next_steps || [];
  const rawTheirs = parsed.nextSteps?.theirs || parsed.next_steps?.theirs || parsed.their_next_steps || [];
  
  for (const step of rawOurs) {
    normalized.nextSteps.ours.push({
      action: step.action || step.description || step.task,
      owner: step.owner,
      dueDate: step.dueDate || step.due_date
    });
  }
  
  for (const step of rawTheirs) {
    normalized.nextSteps.theirs.push({
      action: step.action || step.description || step.task,
      owner: step.owner,
      dueDate: step.dueDate || step.due_date
    });
  }

  // Normalize dealSignals
  normalized.dealSignals = parsed.dealSignals || parsed.deal_signals || {};

  // Normalize meetingMeta
  normalized.meetingMeta = parsed.meetingMeta || parsed.meeting_meta || parsed.meeting || {};
  
  // Validate meeting type if present
  if (normalized.meetingMeta?.meetingType) {
    const validTypes = ['discovery', 'demo', 'proposal', 'negotiation', 'qbr', 'kickoff', 'site_visit', 'other'];
    if (!validTypes.includes(normalized.meetingMeta.meetingType)) {
      normalized.meetingMeta.meetingType = 'other';
    }
  }

  // Internal notes
  normalized.internalNotes = parsed.internalNotes || parsed.internal_notes;

  // Normalize BANT context
  const rawBant = parsed.bantContext || parsed.bant_context || parsed.bant;
  if (rawBant && typeof rawBant === 'object') {
    const bantContext: any = {};
    if (rawBant.budget) bantContext.budget = rawBant.budget;
    if (rawBant.authority) bantContext.authority = rawBant.authority;
    if (rawBant.need) bantContext.need = rawBant.need;
    if (rawBant.timeline) bantContext.timeline = rawBant.timeline;
    if (Object.keys(bantContext).length > 0) {
      normalized.bantContext = bantContext;
    }
  }

  // Normalize key use case
  normalized.keyUseCase = parsed.keyUseCase || parsed.key_use_case || parsed.useCase || parsed.use_case || undefined;

  // Normalize products
  if (parsed.products) {
    normalized.products = {
      positioned: parsed.products.positioned || [],
      customerWorkloads: parsed.products.customerWorkloads || parsed.products.customer_workloads || [],
      competitorProducts: parsed.products.competitorProducts || parsed.products.competitor_products || []
    };

    // Normalize productDetails
    const rawDetails = parsed.products.productDetails || parsed.products.product_details || [];
    if (rawDetails.length > 0) {
      normalized.products.productDetails = rawDetails.map((d: any) => ({
        name: d.name,
        attributedAmount: d.attributedAmount || d.attributed_amount || undefined,
        amountType: d.amountType || d.amount_type || undefined,
        customerRequirements: d.customerRequirements || d.customer_requirements || undefined,
        contextSnippet: d.contextSnippet || d.context_snippet || undefined,
        sentiment: d.sentiment || undefined,
      }));
    }
  }

  // Normalize technical requirements
  if (parsed.technicalRequirements || parsed.technical_requirements) {
    const raw = parsed.technicalRequirements || parsed.technical_requirements;
    normalized.technicalRequirements = {
      power: raw.power || undefined,
      space: raw.space || undefined,
      network: raw.network || undefined,
      compliance: raw.compliance || [],
      security: raw.security || []
    };
  }

  // Normalize location
  if (parsed.location) {
    normalized.location = {
      chosen: parsed.location.chosen || parsed.location.primary,
      alternates: parsed.location.alternates || parsed.location.alternatives || [],
      rationale: parsed.location.rationale || parsed.location.reason
    };
  }

  // Normalize commercial terms
  if (parsed.commercialTerms || parsed.commercial_terms) {
    const raw = parsed.commercialTerms || parsed.commercial_terms;
    normalized.commercialTerms = {
      termLength: raw.termLength || raw.term_length || raw.term,
      pricingModel: raw.pricingModel || raw.pricing_model || raw.pricing
    };
  }

  // Ensure confidence object exists with defaults
  normalized.confidence = parsed.confidence || {
    overall: 70,
    accountIdentification: 80,
    contactExtraction: 70,
    roleInference: 60
  };

  return normalized as MeetingNotesExtraction;
}

// Helper to normalize influence signal level
function normalizeSignalLevel(signal: string | undefined | null): 'high' | 'moderate' | 'low' | null {
  if (!signal) return null;
  const s = signal.toLowerCase().trim();
  if (['high', 'critical', 'strong'].includes(s)) return 'high';
  if (['moderate', 'medium', 'mid'].includes(s)) return 'moderate';
  if (['low', 'minor', 'minimal'].includes(s)) return 'low';
  return null;
}

// Helper to normalize support signal
function normalizeSupportSignal(signal: string | undefined | null): 'positive' | 'neutral' | 'negative' | null {
  if (!signal) return null;
  const s = signal.toLowerCase().trim();
  if (['positive', 'supportive', 'champion', 'advocate', 'for'].includes(s)) return 'positive';
  if (['negative', 'against', 'blocker', 'skeptic', 'opposed'].includes(s)) return 'negative';
  if (['neutral', 'mixed', 'unclear'].includes(s)) return 'neutral';
  return null;
}

// Helper to normalize contact roles
function normalizeContactRole(role: string | undefined): ContactExtraction['role'] {
  if (!role) return 'unknown';
  
  const roleMap: Record<string, ContactExtraction['role']> = {
    'decision_maker': 'decision_maker',
    'decisionmaker': 'decision_maker',
    'decision maker': 'decision_maker',
    'exec': 'decision_maker',
    'executive': 'decision_maker',
    'influencer': 'influencer',
    'technical': 'influencer',
    'champion': 'champion',
    'advocate': 'champion',
    'sponsor': 'champion',
    'blocker': 'blocker',
    'skeptic': 'blocker',
    'user': 'user',
    'end_user': 'user',
    'end user': 'user'
  };
  
  const normalized = role.toLowerCase().trim();
  return roleMap[normalized] || 'unknown';
}

// Helper to normalize severity
function normalizeSeverity(severity: string | undefined): Risk['severity'] {
  if (!severity) return 'medium';
  
  const normalized = severity.toLowerCase().trim();
  if (['high', 'critical', 'severe'].includes(normalized)) return 'high';
  if (['low', 'minor'].includes(normalized)) return 'low';
  return 'medium';
}

// ============================================================================
// REQUEST HANDLER
// ============================================================================

serve(async (req: Request): Promise<Response> => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
const startTime = Date.now();

  try {
    const body = await req.json() as ExtractionRequest;
    const { content, accountHint, opportunityHint, organizationId } = body;

    // Validate required fields
    if (!organizationId) {
      return new Response(
        JSON.stringify({ success: false, error: 'organizationId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!content || content.length < 50) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Content too short for extraction. Minimum 50 characters required.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Truncate very long content to avoid token limits
    const maxContentLength = 15000;
    const truncatedContent = content.length > maxContentLength 
      ? content.slice(0, maxContentLength) + '\n\n[...content truncated for processing]'
      : content;

    console.log('[extraction-agent] Processing document:', {
      contentLength: content.length,
      truncated: content.length > maxContentLength,
      accountHint,
      opportunityHint,
      organizationId
    });

    // Build extraction prompt
    const userPrompt = buildExtractionPrompt(truncatedContent, accountHint, opportunityHint);

    // Call LLM with low temperature for consistent extraction
    const response = await callWithFallback({
      messages: [
        { role: 'system', content: EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      tier: 'pro', // Use pro tier for complex extraction
      temperature: 0.1, // Low temperature for consistency
      maxTokens: 4096,
      jsonMode: true
    });

    console.log('[extraction-agent] LLM response received:', {
      provider: response.provider,
      model: response.model,
      contentLength: response.content.length
    });

    // Parse and validate extraction
    let extraction: MeetingNotesExtraction;
    try {
      extraction = parseAndValidateExtraction(response.content);
    } catch (parseError: any) {
      console.error('[extraction-agent] Parse error:', parseError.message);
      console.error('[extraction-agent] Raw response:', response.content.slice(0, 500));
      
      return new Response(
        JSON.stringify({
          success: false,
          error: `Failed to parse extraction: ${parseError.message}`,
          rawResponse: response.content.slice(0, 1000)
        }),
        { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const processingTime = Date.now() - startTime;

    console.log('[extraction-agent] Extraction complete:', {
      accountName: extraction.anchor.account.name,
      opportunityName: extraction.anchor.opportunity?.name,
      contactCount: extraction.contacts.length,
      riskCount: extraction.risks.length,
      ourNextSteps: extraction.nextSteps.ours.length,
      theirNextSteps: extraction.nextSteps.theirs.length,
      confidence: extraction.confidence.overall,
      processingTimeMs: processingTime
    });

    return new Response(
      JSON.stringify({
        success: true,
        extraction,
        meta: {
          processingTimeMs: processingTime,
          contentLength: content.length,
          truncated: content.length > maxContentLength,
          provider: response.provider,
          model: response.model
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: any) {
    const processingTime = Date.now() - startTime;
    
    console.error('[extraction-agent] Error:', {
      message: error.message,
      stack: error.stack?.slice(0, 500),
      processingTimeMs: processingTime
    });

    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Extraction failed',
        meta: { processingTimeMs: processingTime }
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
