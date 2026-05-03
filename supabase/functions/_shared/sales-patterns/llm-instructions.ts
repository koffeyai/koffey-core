/**
 * LLM Instructions for Sales Context
 * Loaded when specific patterns are detected - injected into system prompt
 * v2.1.0
 */

export const INSTRUCTIONS_VERSION = "2.1.0";

// Category-specific instructions to inject into LLM system prompt
export const CATEGORY_INSTRUCTIONS: Record<string, { label: string; prompt: string }> = {
  opp: {
    label: "Opportunity Identification",
    prompt: "Context contains a specific sales opportunity. Extract: deal name, account, stage, estimated value, and close date if mentioned."
  },
  partner: {
    label: "Partner Ecosystem",
    prompt: "Third-party partner involvement detected. Identify: partner type (VAR/SI/reseller), deal registration status, marketplace involvement, and revenue split if mentioned."
  },
  procurement: {
    label: "Procurement & Legal",
    prompt: "Late-stage procurement indicators detected. These typically add 2-4 weeks to close. Flag: security reviews, legal redlines, compliance requirements."
  },
  health: {
    label: "Deal Sentiment",
    prompt: "Analyze deal health using detected sentiment terms. Aggregate scores: negative (<-0.3) = at risk, positive (>0.3) = healthy momentum. Recommend actions based on risk level."
  },
  urgency: {
    label: "Deal Urgency",
    prompt: "Time pressure detected. Identify: fiscal deadlines (EOQ/EOY), budget expiration, go-live requirements. Distinguish real urgency from sales tactics."
  },
  competitor: {
    label: "Competitive Intelligence",
    prompt: "Competitive situation detected. Identify: incumbent vendor, evaluation type (bake-off/head-to-head), displacement vs greenfield. Note competitive positioning."
  },
  method: {
    label: "Sales Methodology",
    prompt: "Sales framework reference detected. Structure output to align with methodology fields. MEDDIC: Metrics, Economic Buyer, Decision Criteria, Decision Process, Identify Pain, Champion. BANT: Budget, Authority, Need, Timeline."
  },
  metrics: {
    label: "Financial Metrics",
    prompt: "Revenue/contract metrics detected. Extract numerical values with units (k/M/B). Associate metrics with time periods (Q1, FY25, etc.) when present."
  },
  lead: {
    label: "Lead Status",
    prompt: "Lead qualification terms detected. Categorize maturity: MQL (marketing) → SAL (accepted) → SQL (sales qualified) → PQL (product). Note ICP fit and source attribution."
  },
  stage: {
    label: "Pipeline Stage",
    prompt: "Sales stage indicators detected. Map to pipeline: Discovery → Qualification → Demo → POC → Proposal → Negotiation → Closed. Track stage progression."
  },
  role: {
    label: "Role Identification",
    prompt: "Sales roles detected. Identify persona: AE (closer), SDR/BDR (prospecting), CSM (retention), SE (technical). Use for routing and personalization."
  },
  stakeholder: {
    label: "Buying Committee",
    prompt: "Stakeholder roles detected. Map to buying committee: Champion (internal advocate), Economic Buyer (budget), Decision Maker, Technical Evaluator, Blocker (risk). Assess multi-threading."
  },
  tools: {
    label: "Tech Stack",
    prompt: "Sales technology mentioned. Note CRM (Salesforce/HubSpot), engagement (Outreach/SalesLoft), intelligence (Gong/Clari/ZoomInfo). Use for integration context."
  },
  commercial: {
    label: "Commercial Terms",
    prompt: "Pricing/contract terms detected. Indicates late-stage activity. Track: discount requests, contract type (MSA/SOW), payment terms, SKU selection."
  },
  activity: {
    label: "Activity Tracking",
    prompt: "Sales activities detected. Categorize: calls, emails, meetings, cadence steps. Track engagement patterns and follow-up requirements."
  }
};

// Composite prompts for specific scenarios
export const COMPOSITE_PROMPTS: Record<string, string> = {
  deal_review: "Analyze this as a deal review. Extract: account, opportunity value, stage, health indicators, key stakeholders, next steps, and risks.",
  forecast_call: "Context is a forecast discussion. Identify: commit vs upside deals, coverage gaps, at-risk opportunities, and pipeline movement.",
  competitive_deal: "Competitive situation detected. Analyze: incumbent displacement potential, evaluation criteria, competitive strengths/weaknesses, win themes.",
  risk_assessment: "Deal risk indicators present. Assess: sentiment score, single-threading risk, budget status, stakeholder gaps, timeline pressure."
};

// Output format templates
export const OUTPUT_FORMATS = {
  deal_summary: {
    fields: ["account", "opportunity", "value", "stage", "health_score", "close_date", "risks", "next_steps"]
  },
  meddic_scorecard: {
    fields: ["metrics", "economic_buyer", "decision_criteria", "decision_process", "identified_pain", "champion"]
  },
  risk_report: {
    fields: ["deal", "risk_level", "risk_factors", "mitigation_actions", "escalation_needed"]
  }
};

/**
 * Build context-aware instructions based on detected patterns
 */
export function buildContextInstructions(detectedCategories: string[]): string {
  if (detectedCategories.length === 0) return "";
  
  const instructions = detectedCategories
    .filter(cat => CATEGORY_INSTRUCTIONS[cat])
    .map(cat => `[${CATEGORY_INSTRUCTIONS[cat].label}] ${CATEGORY_INSTRUCTIONS[cat].prompt}`)
    .join("\n");
  
  return instructions ? `\n\n## Detected Sales Context\n${instructions}` : "";
}

/**
 * Get composite prompt if multiple relevant categories detected
 */
export function getCompositePrompt(detectedCategories: string[]): string | null {
  const cats = new Set(detectedCategories);
  
  // Check for specific composite scenarios
  if (cats.has("health") && cats.has("risk")) {
    return COMPOSITE_PROMPTS.risk_assessment;
  }
  if (cats.has("competitor") && (cats.has("opp") || cats.has("stage"))) {
    return COMPOSITE_PROMPTS.competitive_deal;
  }
  if (cats.has("metrics") && cats.has("urgency")) {
    return COMPOSITE_PROMPTS.forecast_call;
  }
  if (cats.has("opp") && cats.has("stakeholder")) {
    return COMPOSITE_PROMPTS.deal_review;
  }
  
  return null;
}
