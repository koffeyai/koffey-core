/**
 * Core Sales Terminology Patterns
 * Always loaded - used for fast-path detection and entity normalization
 * v2.1.0
 */

export const PATTERNS_VERSION = "2.1.0";

// Pattern flags for all regexes
export const PATTERN_FLAGS = "gi";

// Category patterns for detecting sales terminology
export const CATEGORY_PATTERNS = {
  opp: {
    pattern: /\b(oppt(y|ies)|opps?|opportunit(y|ies)|deals?|pipeline|forecast(ed)?|fcst|accounts?|accts?)\b/gi,
    typoPattern: /\bop+[o]?r?t(y|unit(y|ies)|ies)\b/gi
  },
  partner: {
    pattern: /\b(VARs?|resellers?|SIs?|system\s+integrators?|channel\s+partners?|ISVs?|referral|partner[\s-]+(lead|sourced)|(AWS|Azure|GCP|Google|Cloud)\s+(Marketplace|co[\s-]?sell)|co[\s-]?sell(ing)?|CPPO|private\s+offer|deal\s+reg(istration)?|SPIFF?|MDF|partner\s+tier)s?\b/gi
  },
  procurement: {
    pattern: /\b(RF[PIQ]s?|request\s+for\s+(proposal|information|quote)|(security|vendor)\s+(review|questionnaire|assessment)|VSQ|infosec|SOC\s*2|pen(etration)?[\s-]?test|DPA|GDPR|HIPAA|FedRAMP|PCI|ISO\s*27001|red[\s-]?lin(es|ing)|legal\s+(review|hold)|procurement|contracting)s?\b/gi
  },
  urgency: {
    pattern: /\b(EO[QYM]|end[\s-]?of[\s-]?(quarter|year|month)|budget\s+(expir(ing|es)|deadline)|use[\s-]?it[\s-]?or[\s-]?lose[\s-]?it|fiscal\s+(deadline|year[\s-]?end)|(must|need(s)?\s+to|ha(s|ve)\s+to)\s+close|(hard\s+)?deadline|drop[\s-]?dead\s+date|time[\s-]?(sensitive|critical)|urgent|ASAP|go[\s-]?live|board\s+(meeting|approval)|pricing\s+expir)\b/gi
  },
  competitor: {
    pattern: /\b(competitor|competition|competitive|incumbent|existing\s+(vendor|solution)|legacy|bake[\s-]?off|shoot[\s-]?out|head[\s-]?to[\s-]?head|H2H|side[\s-]?by[\s-]?side|evaluat(ion|ing)|shortlist(ed)?|finalist|displac(e|ing|ement)|rip[\s-]?(and|&|n)[\s-]?replace|green[\s-]?field|net[\s-]?new|status\s+quo|do[\s-]?nothing|battle[\s-]?card|win[/\-]loss)s?\b/gi
  },
  method: {
    pattern: /\b(MEDD(I|PI)?CC?|BANT|SPIN(\s+[Ss]elling)?|GPCTBA(\/C&I)?|Challenger(\s+[Ss]ale)?|Sandler|Command\s+of\s+the\s+Message|CoM|Force\s+Management|[Ss]olution\s+[Ss]elling|[Vv]alue[\s-]?[Ss]elling)\b/gi
  },
  metrics: {
    pattern: /\b([AMNG]RR|[AT]CV|ROI|C?LTV|CAC|CLV|ASP|[QYMW]o[QYMW]|[FQH][1-4Y]|[12]H|quota|attainment|win[\s-]?rate|sales\s+cycle|book(ings|ed))\b/gi,
    extractRevenue: /\b([AMNG]RR)\s*:?\s*[~$€£]?\s*([\d,.]+\s*[kKmMbB]?)\b/gi,
    extractContractValue: /\b([AT]CV)\s*:?\s*[~$€£]?\s*([\d,.]+\s*[kKmMbB]?)\b/gi
  },
  lead: {
    pattern: /\b([MSP]QL|SAL|ICP|ideal\s+customer\s+profile|TAM|SAM|SOM|inbound|outbound|IB|OB|lead\s+source|attribution)s?\b/gi
  },
  stage: {
    pattern: /\b(disco(very)?|qual(ification|ifying)?|demo(nstration)?|Po[CV]|POC|POV|proof[\s-]?of[\s-]?(concept|value)|pilot|trial|proposal|quote|pricing|closed[\s-]?(won|lost)|nego(tiat(ion|ing))?|contracting|paper\s+process)s?\b/gi
  },
  role: {
    pattern: /(?<![A-Za-z])AEs?(?![A-Za-z])|\b([SB]DRs?|CSMs?|CRO|Rev[\s-]?Ops|Sales[\s-]?Ops|VP\s+(of\s+)?Sales|[Aa]ccount\s+[Ee]xec(utive)?|[Ss]ales\s+(Engineer|Manager|Director|Leader)|[Cc]ustomer\s+[Ss]uccess|[Pp]re[\s-]?[Ss]ales|[Aa]ccount\s+[Mm]anager)s?\b/gi
  },
  stakeholder: {
    pattern: /\b((internal\s+)?champ(ion)?|advocate|economic\s+buyer|budget\s+holder|decision[\s-]?maker|tech(nical)?\s+(buyer|evaluator)|blocker|detractor|naysayer|influencer|end[\s-]?user|(buying|evaluation|selection)\s+(committee|group|team)|(exec(utive)?\s+)?sponsor|gate[\s-]?keeper)s?\b/gi
  },
  tools: {
    pattern: /\b(Salesforce|SFDC|Sales\s+Cloud|HubSpot|Outreach|Sales[Ll]oft|Gong|Chorus|Clari|ZoomInfo|Apollo|Clearbit|6[Ss]ense|Demandbase|Sales\s?Nav(igator)?|Drift|Intercom)\b/gi
  },
  commercial: {
    pattern: /\b(pric(e|ing)|discount(ing)?|MSA|master\s+service\s+agreement|SOW|statement\s+of\s+work|NDA|non[\s-]?disclosure|order\s+form|net\s+(terms|[0-9]+)|SKUs?|list\s+price|MSRP|margin)s?\b/gi
  },
  activity: {
    pattern: /\b((phone\s+)?calls?|(outreach\s+)?emails?|meetings?|syncs?|check[\s-]?ins?|(outreach\s+)?(cadence|sequence)|touch[\s-]?points?|follow[\s-]?ups?|cold\s+(call|email|outreach)|warm\s+(intro|handoff)|QBR|EBR|quarterly\s+business\s+review)s?\b/gi
  }
};

// Health indicator patterns with sentiment scores
export const HEALTH_INDICATORS = [
  { term: "ghosted", pattern: /\b(ghosted|went\s+dark|radio\s+silence|no\s+response)\b/gi, score: -1.0, risk: "high" },
  { term: "stalled", pattern: /\b(stalled|stuck|on\s+hold|paused|frozen)\b/gi, score: -0.7, risk: "med" },
  { term: "deprioritized", pattern: /\b(deprioritized|back[\s-]?burnered|pushed\s+back|delayed)\b/gi, score: -0.6, risk: "med" },
  { term: "at_risk", pattern: /\b(at[\s-]?risk|risk\s+flag(ged)?|flagged)\b/gi, score: -0.8, risk: "high" },
  { term: "slipping", pattern: /\b(slipp(ing|ed)|slid(ing)?|push(ing)?\s+out)\b/gi, score: -0.5, risk: "med" },
  { term: "cold", pattern: /\b(gone\s+)?cold|cooling\s+off\b/gi, score: -0.6, risk: "med" },
  { term: "lukewarm", pattern: /\blukewarm|tepid\b/gi, score: -0.2, risk: "low" },
  { term: "warm", pattern: /\b(warm(ing\s+up)?|engaged)\b/gi, score: 0.4, risk: "low" },
  { term: "hot", pattern: /\b(hot(\s+deal)?|heating\s+up|on\s+fire)\b/gi, score: 0.9, risk: "low" },
  { term: "momentum", pattern: /\b(picking\s+up\s+steam|accelerat(ing|ed)|moving\s+fast|fast[\s-]?track(ed)?)\b/gi, score: 1.0, risk: "low" },
  { term: "verbal", pattern: /\b(verbal(\s+(commit|yes))?|handshake(\s+deal)?)\b/gi, score: 0.8, risk: "low" },
  { term: "strong_champ", pattern: /\b(strong|solid)\s+(champion|advocate)|internal\s+advocate\b/gi, score: 0.7, risk: "low" },
  { term: "exec_engaged", pattern: /\b(exec(utive)?\s+engaged|C[\s-]?level\s+involved|executive\s+sponsorship)\b/gi, score: 0.8, risk: "low" },
  { term: "budget_yes", pattern: /\b(budget\s+(confirmed|approved|secured)|funded)\b/gi, score: 0.9, risk: "low" },
  { term: "budget_no", pattern: /\b(no\s+budget|unfunded|budget\s+(cut|freeze|frozen))\b/gi, score: -0.9, risk: "high" },
  { term: "single_thread", pattern: /\b(single[\s-]?threaded?|one\s+contact)\b/gi, score: -0.4, risk: "med" },
  { term: "multi_thread", pattern: /\b(multi[\s-]?threaded?|multiple\s+contacts)\b/gi, score: 0.5, risk: "low" }
];

// Composite patterns for common query types
export const COMPOSITE_PATTERNS = {
  all: /\b(oppt(y|ies)|opps?|deals?|pipeline|forecast|VARs?|resellers?|co[\s-]?sell|CPPO|RF[PIQ]|SOC\s*2|DPA|GDPR|ghosted|stalled|at[\s-]?risk|hot|cold|EO[QYM]|deadline|competitor|incumbent|bake[\s-]?off|MEDD(I|PI)?CC?|BANT|SPIN|[AMNG]RR|[AT]CV|ROI|[MSP]QL|ICP|TAM|demo|POC|pilot|closed[\s-]?(won|lost)|[SB]DR|CSM|CRO|champ(ion)?|blocker|Salesforce|HubSpot|Gong|pricing|discount|MSA|cadence|QBR)s?\b/gi,
  health: /\b(ghosted|went\s+dark|stalled|stuck|on\s+hold|deprioritized|at[\s-]?risk|slipp(ing|ed)|cold|warm|hot|accelerat(ing|ed)|fast[\s-]?track|verbal|budget\s+(confirmed|cut|freeze)|single[\s-]?thread|multi[\s-]?thread)\b/gi,
  urgency: /\b(EO[QYM]|end[\s-]?of[\s-]?(quarter|year)|budget\s+expir|must\s+close|deadline|urgent|ASAP|go[\s-]?live)\b/gi,
  risk: /\b(ghosted|went\s+dark|stalled|at[\s-]?risk|slipping|no\s+budget|budget\s+(cut|freeze)|single[\s-]?thread|blocker|detractor)\b/gi
};

// Validation patterns for context disambiguation
export const VALIDATION_PATTERNS = {
  commit: /\b(deal|forecast|quarter|quota|pipeline|revenue|verbal)\b/gi,
  SE: /\b(team|call|engineer|demo|pre-sales)\b/gi,
  DM: /\b(buyer|stakeholder|decision)\b/gi,
  pipe: /\b(line|coverage|forecast|gen|velocity)\b/gi,
  hot: /\b(deal|lead|prospect|opportunity)\b/gi,
  cold: /\b(call|email|outreach|lead|gone)\b/gi
};

// Sentiment score ranges
export const SENTIMENT_RANGES = {
  critical: { min: -1.0, max: -0.7 },
  risk: { min: -0.7, max: -0.3 },
  neutral: { min: -0.3, max: 0.3 },
  good: { min: 0.3, max: 0.7 },
  strong: { min: 0.7, max: 1.0 }
};
