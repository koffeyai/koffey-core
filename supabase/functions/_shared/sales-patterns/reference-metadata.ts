/**
 * Reference Metadata for Sales Terminology
 * Lazy-loaded on demand - NOT included in main context
 * v2.1.0
 */

export const REFERENCE_VERSION = "2.1.0";

// Acronym expansions - loaded when user asks "what does X mean?"
export const ACRONYMS: Record<string, string> = {
  // Revenue metrics
  ARR: "Annual Recurring Revenue",
  MRR: "Monthly Recurring Revenue",
  NRR: "Net Revenue Retention",
  GRR: "Gross Revenue Retention",
  ACV: "Annual Contract Value",
  TCV: "Total Contract Value",
  ROI: "Return on Investment",
  CAC: "Customer Acquisition Cost",
  LTV: "Lifetime Value",
  CLV: "Customer Lifetime Value",
  ASP: "Average Selling Price",
  
  // Time comparisons
  QoQ: "Quarter over Quarter",
  YoY: "Year over Year",
  MoM: "Month over Month",
  
  // Lead types
  MQL: "Marketing Qualified Lead",
  SQL: "Sales Qualified Lead",
  SAL: "Sales Accepted Lead",
  PQL: "Product Qualified Lead",
  
  // Market sizing
  ICP: "Ideal Customer Profile",
  TAM: "Total Addressable Market",
  SAM: "Serviceable Addressable Market",
  SOM: "Serviceable Obtainable Market",
  
  // Roles
  AE: "Account Executive",
  SDR: "Sales Development Representative",
  BDR: "Business Development Representative",
  CSM: "Customer Success Manager",
  SE: "Sales Engineer",
  CRO: "Chief Revenue Officer",
  
  // Deal stages
  POC: "Proof of Concept",
  POV: "Proof of Value",
  
  // Procurement
  RFP: "Request for Proposal",
  RFI: "Request for Information",
  RFQ: "Request for Quote",
  MSA: "Master Service Agreement",
  SOW: "Statement of Work",
  NDA: "Non-Disclosure Agreement",
  DPA: "Data Processing Agreement",
  SLA: "Service Level Agreement",
  
  // Time periods
  EOQ: "End of Quarter",
  EOY: "End of Year",
  EOM: "End of Month",
  
  // Reviews
  QBR: "Quarterly Business Review",
  EBR: "Executive Business Review",
  
  // Partners
  VAR: "Value Added Reseller",
  SI: "System Integrator",
  ISV: "Independent Software Vendor",
  CPPO: "Channel Partner Private Offer",
  MDF: "Market Development Funds",
  SPIF: "Sales Performance Incentive Fund",
  
  // Tools
  SFDC: "Salesforce.com",
  H2H: "Head to Head"
};

// Sales methodology frameworks
export const FRAMEWORKS: Record<string, { fields: string[]; scoring: string }> = {
  MEDDIC: {
    fields: ["Metrics", "Economic Buyer", "Decision Criteria", "Decision Process", "Identify Pain", "Champion"],
    scoring: "Each field 0-2: 0=unknown, 1=partial, 2=confirmed. Total 12 = fully qualified."
  },
  MEDDICC: {
    fields: ["Metrics", "Economic Buyer", "Decision Criteria", "Decision Process", "Identify Pain", "Champion", "Competition"],
    scoring: "Total 14 = fully qualified."
  },
  MEDDPICC: {
    fields: ["Metrics", "Economic Buyer", "Decision Criteria", "Decision Process", "Paper Process", "Identify Pain", "Champion", "Competition"],
    scoring: "Total 16 = fully qualified."
  },
  BANT: {
    fields: ["Budget", "Authority", "Need", "Timeline"],
    scoring: "Binary per field. 4/4 = qualified."
  },
  GPCTBA: {
    fields: ["Goals", "Plans", "Challenges", "Timeline", "Budget", "Authority"],
    scoring: "Total 6 fields for full qualification."
  },
  SPIN: {
    fields: ["Situation", "Problem", "Implication", "Need-Payoff"],
    scoring: "Question-based discovery framework, not scoring."
  }
};

// Pipeline stage mapping with probabilities
export const STAGE_MAPPING: Record<string, { stage: number; probability: number; aliases: string[] }> = {
  discovery: { stage: 1, probability: 10, aliases: ["disco", "disco call", "initial call"] },
  qualification: { stage: 2, probability: 20, aliases: ["qual", "qualifying"] },
  demo: { stage: 3, probability: 30, aliases: ["demonstration", "product demo"] },
  poc: { stage: 4, probability: 50, aliases: ["POC", "POV", "proof of concept", "pilot", "trial"] },
  proposal: { stage: 5, probability: 60, aliases: ["quote", "pricing", "commercial"] },
  negotiation: { stage: 6, probability: 75, aliases: ["nego", "contracting", "legal", "redlines"] },
  closed_won: { stage: 7, probability: 100, aliases: ["won", "booked"] },
  closed_lost: { stage: 0, probability: 0, aliases: ["lost", "dead"] }
};

// Sentiment thresholds with recommended actions
export const SENTIMENT_THRESHOLDS: Record<string, { range: [number, number]; action: string }> = {
  critical_risk: { range: [-1.0, -0.7], action: "Immediate intervention required. Escalate to leadership." },
  at_risk: { range: [-0.7, -0.3], action: "Review deal and develop mitigation plan." },
  neutral: { range: [-0.3, 0.3], action: "Monitor normally. No immediate action." },
  healthy: { range: [0.3, 0.7], action: "Continue current approach. Maintain momentum." },
  strong: { range: [0.7, 1.0], action: "Prioritize for close. Accelerate timeline if possible." }
};

// Role personas with focus areas and tools
export const ROLE_PERSONAS: Record<string, { focus: string; metrics: string[]; tools: string[] }> = {
  AE: { focus: "closing", metrics: ["quota", "ACV", "win rate"], tools: ["Salesforce", "Gong"] },
  SDR: { focus: "prospecting", metrics: ["meetings booked", "MQLs converted"], tools: ["Outreach", "SalesLoft"] },
  BDR: { focus: "outbound", metrics: ["SQLs generated", "pipeline created"], tools: ["Apollo", "ZoomInfo"] },
  CSM: { focus: "retention", metrics: ["NRR", "churn", "expansion"], tools: ["Gainsight", "ChurnZero"] },
  SE: { focus: "technical", metrics: ["POC wins", "demo-to-close"], tools: ["demo environments"] },
  RevOps: { focus: "operations", metrics: ["forecast accuracy", "cycle time"], tools: ["Clari", "Salesforce"] }
};

// Stakeholder to MEDDIC field mapping
export const STAKEHOLDER_MEDDIC_MAP: Record<string, string> = {
  champion: "Champion",
  economic_buyer: "Economic Buyer",
  decision_maker: "Decision Criteria owner",
  technical_buyer: "Decision Criteria (technical)",
  blocker: "Risk factor",
  influencer: "Decision Process participant",
  end_user: "Metrics source"
};

// Partner type details
export const PARTNER_TYPES: Record<string, { model: string; margin: string; involvement: string }> = {
  VAR: { model: "Resale", margin: "15-30%", involvement: "Full sales cycle" },
  SI: { model: "Services", margin: "Services revenue", involvement: "Implementation" },
  ISV: { model: "Integration", margin: "Referral fee", involvement: "Technical integration" },
  Agency: { model: "Referral", margin: "10-20%", involvement: "Lead generation" },
  Marketplace: { model: "Resale", margin: "3-15% to cloud", involvement: "Procurement simplification" }
};

// Common typo corrections
export const TYPO_CORRECTIONS: Record<string, string> = {
  oppty: "opportunity",
  oppties: "opportunities",
  fcst: "forecast",
  disco: "discovery",
  nego: "negotiation",
  qual: "qualification"
};

/**
 * Expand acronym to full form
 */
export function expandAcronym(acronym: string): string | null {
  const upper = acronym.toUpperCase();
  return ACRONYMS[upper] || null;
}

/**
 * Get framework details
 */
export function getFramework(name: string): typeof FRAMEWORKS[string] | null {
  const upper = name.toUpperCase();
  return FRAMEWORKS[upper] || null;
}

/**
 * Map stage alias to canonical stage
 */
export function normalizeStage(input: string): { stage: string; probability: number } | null {
  const lower = input.toLowerCase();
  
  for (const [stageName, data] of Object.entries(STAGE_MAPPING)) {
    if (stageName === lower || data.aliases.some(a => a.toLowerCase() === lower)) {
      return { stage: stageName, probability: data.probability };
    }
  }
  
  return null;
}

/**
 * Get sentiment action recommendation
 */
export function getSentimentAction(score: number): { level: string; action: string } {
  for (const [level, data] of Object.entries(SENTIMENT_THRESHOLDS)) {
    if (score >= data.range[0] && score <= data.range[1]) {
      return { level, action: data.action };
    }
  }
  return { level: "unknown", action: "Unable to assess sentiment." };
}

/**
 * Correct common typos
 */
export function correctTypo(word: string): string {
  const lower = word.toLowerCase();
  return TYPO_CORRECTIONS[lower] || word;
}
