/**
 * Skills Registry — Static imports + selective loading
 *
 * All skill imports MUST be static (Deno sandbox can't do dynamic FS reads).
 * Exposes functions for:
 *   - getToolSchemas(filter)  → tool schemas filtered by tier/domain
 *   - getSkillInstructions(filter) → behavioral instructions for loaded tools
 *   - getSkill(name)          → look up a skill by name for execution dispatch
 *   - getRegisteredToolNames() → names of skills managed by registry (for dedup)
 */

import type { SkillDefinition, ToolFilter, ToolSchema } from './types.ts';

// ============================================================================
// Static Skill Imports
// ============================================================================

// Search
import searchCrm from './search/search-crm.ts';
import semanticSearch from './search/semantic-search.ts';

// Create
import createDeal from './create/create-deal.ts';
import createContact from './create/create-contact.ts';
import createAccount from './create/create-account.ts';
import createTask from './create/create-task.ts';
import createActivity from './create/create-activity.ts';
import getTasks from './create/get-tasks.ts';

// Update
import updateDeal from './update/update-deal.ts';
import deleteDeal from './update/delete-deal.ts';
import updateContact from './update/update-contact.ts';
import updateAccount from './update/update-account.ts';
import completeTask from './update/complete-task.ts';
import updateStakeholderRole from './update/update-stakeholder-role.ts';

// Analytics
import getPipelineStats from './analytics/get-pipeline-stats.ts';
import getSalesCycleAnalytics from './analytics/get-sales-cycle-analytics.ts';
import getActivityStats from './analytics/get-activity-stats.ts';
import getPipelineVelocity from './analytics/get-pipeline-velocity.ts';

// Coaching
import analyzeDeal from './coaching/analyze-deal.ts';

// Scheduling
import checkAvailability from './scheduling/check-availability.ts';
import sendSchedulingEmail from './scheduling/send-scheduling-email.ts';
import scheduleMeeting from './scheduling/schedule-meeting.ts';
import createCalendarEvent from './scheduling/create-calendar-event.ts';

// Intelligence
import draftEmail from './intelligence/draft-email.ts';
import generateReport from './intelligence/generate-report.ts';
import suggestNextBestAction from './intelligence/suggest-next-best-action.ts';

// Product
import queryProductIntelligence from './product/query-product-intelligence.ts';
import generateProductReport from './product/generate-product-report.ts';
import suggestProductsForAccount from './product/suggest-products-for-account.ts';

// Leads
import enrichContacts from './leads/enrich-contacts.ts';
import getLeadScores from './leads/get-lead-scores.ts';
import getLeadFunnel from './leads/get-lead-funnel.ts';

// Sequences
import manageSequence from './sequences/manage-sequence.ts';

// Admin
import manageCustomFields from './admin/manage-custom-fields.ts';
import getAttribution from './admin/get-attribution.ts';
import getAuditTrail from './admin/get-audit-trail.ts';
import queryWebEvents from './admin/query-web-events.ts';
import manageTags from './admin/manage-tags.ts';

// Presentation
import generatePresentation from './presentation/generate-presentation.ts';

// Email
import searchEmails from './email/search-emails.ts';
import getEmailEngagement from './email/get-email-engagement.ts';
import linkEmailToCrm from './email/link-email-to-crm.ts';

// Context (LLM-optimized entity retrieval)
import getDealContext from './context/get-deal-context.ts';
import getContactContext from './context/get-contact-context.ts';
import getEntityMessages from './context/get-entity-messages.ts';
import getPipelineContext from './context/get-pipeline-context.ts';

// ============================================================================
// Skill Registry
// ============================================================================

const ALL_SKILLS: SkillDefinition[] = [
  // Search
  searchCrm,
  semanticSearch,
  // Create
  createDeal,
  createContact,
  createAccount,
  createTask,
  createActivity,
  getTasks,
  // Update
  updateDeal,
  deleteDeal,
  updateContact,
  updateAccount,
  completeTask,
  updateStakeholderRole,
  // Analytics
  getPipelineStats,
  getSalesCycleAnalytics,
  getActivityStats,
  getPipelineVelocity,
  // Coaching
  analyzeDeal,
  // Scheduling
  checkAvailability,
  sendSchedulingEmail,
  scheduleMeeting,
  createCalendarEvent,
  // Intelligence
  draftEmail,
  generateReport,
  suggestNextBestAction,
  // Product
  queryProductIntelligence,
  generateProductReport,
  suggestProductsForAccount,
  // Leads
  enrichContacts,
  getLeadScores,
  getLeadFunnel,
  // Sequences
  manageSequence,
  // Admin
  manageCustomFields,
  getAttribution,
  getAuditTrail,
  queryWebEvents,
  manageTags,
  // Presentation
  generatePresentation,
  // Email
  searchEmails,
  getEmailEngagement,
  linkEmailToCrm,
  // Context
  getDealContext,
  getContactContext,
  getEntityMessages,
  getPipelineContext,
];

/** Map for O(1) lookup by tool function name */
const SKILL_MAP = new Map<string, SkillDefinition>(
  ALL_SKILLS.map(s => [s.name, s])
);

// ============================================================================
// Public API
// ============================================================================

/**
 * Get tool schemas filtered by routing tier and optional domain.
 *
 * - lite   → [] (no tools — direct LLM response)
 * - standard → core skills only
 * - pro    → all skills
 *
 * Only returns schemas for skills managed by the registry.
 * Legacy inline tools are merged separately in index.ts.
 */
export function getRegistryToolSchemas(filter?: ToolFilter): ToolSchema[] {
  if (filter?.tier === 'lite') return [];

  let skills = ALL_SKILLS;

  // Filter by tier
  if (filter?.tier === 'standard') {
    skills = skills.filter(s => s.loadTier === 'core');
  }
  // pro tier: all skills pass through

  // Filter by domain
  if (filter?.domains && filter.domains.length > 0) {
    const domainSet = new Set(filter.domains);
    skills = skills.filter(s => domainSet.has(s.domain));
  }

  return skills.map(s => s.schema);
}

/**
 * Get behavioral instructions for the skills that will be loaded.
 * Returns a formatted string to inject into the system prompt.
 */
export function getSkillInstructions(filter?: ToolFilter): string {
  if (filter?.tier === 'lite') return '';

  let skills = ALL_SKILLS;

  if (filter?.tier === 'standard') {
    skills = skills.filter(s => s.loadTier === 'core');
  }

  if (filter?.domains && filter.domains.length > 0) {
    const domainSet = new Set(filter.domains);
    skills = skills.filter(s => domainSet.has(s.domain));
  }

  const sections = skills
    .filter(s => s.instructions.trim().length > 0)
    .map(s => s.instructions);

  return sections.join('\n\n');
}

/**
 * Look up a skill by its tool function name.
 * Returns undefined for tools still handled by legacy switch.
 */
export function getSkill(name: string): SkillDefinition | undefined {
  return SKILL_MAP.get(name);
}

/**
 * Get the set of tool names managed by the registry.
 * Used by index.ts to exclude these from the legacy CRM_TOOLS array
 * so they aren't sent twice.
 */
export function getRegisteredToolNames(): Set<string> {
  return new Set(ALL_SKILLS.map(s => s.name));
}
