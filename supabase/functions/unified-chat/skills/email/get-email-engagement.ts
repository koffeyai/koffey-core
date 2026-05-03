/**
 * Skill: get_email_engagement
 *
 * Get email engagement stats for a contact or account.
 * Returns frequency, recency, response time, and engagement trend.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const getEmailEngagement: SkillDefinition = {
  name: 'get_email_engagement',
  displayName: 'Get Email Engagement',
  domain: 'email',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_email_engagement',
      description: 'Get email engagement statistics for a contact or account. Shows email frequency, last contact date, response times, and engagement trend. Use when the user asks about engagement level, email activity, or communication patterns.',
      parameters: {
        type: 'object',
        properties: {
          contact_name: {
            type: 'string',
            description: 'Name of the contact to check engagement for',
          },
          account_name: {
            type: 'string',
            description: 'Company name to check engagement across all contacts',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "how engaged is X?", "email activity with X", "when did we last communicate with X?", "are we in touch with X?"** → Use get_email_engagement
  - Returns total emails sent/received, last email dates, average response time
  - Engagement score: high (score > 70), medium (40-70), low (< 40)
  - If asking about a company, aggregates across all contacts at that company
  - Mention the avg_gap_days baseline if notable (e.g. "You usually email every 5 days")`,

  execute: async (ctx: ToolExecutionContext) => {
    const { contact_name, account_name } = ctx.args;

    if (contact_name) {
      // Find contact
      const { data: contact } = await ctx.supabase
        .from('contacts')
        .select('id, full_name, company, email')
        .eq('organization_id', ctx.organizationId)
        .ilike('full_name', `%${contact_name}%`)
        .limit(1)
        .maybeSingle();

      if (!contact) {
        return { success: false, message: `No contact found matching "${contact_name}".` };
      }

      const { data: stats } = await ctx.supabase
        .from('email_engagement_stats')
        .select('*')
        .eq('contact_id', contact.id)
        .maybeSingle();

      if (!stats) {
        return {
          success: true,
          contact: contact.full_name,
          company: contact.company,
          message: `No email data synced for ${contact.full_name}. Make sure email sync is active.`,
          has_data: false,
        };
      }

      const engagementLevel = (stats.engagement_score || 0) > 70 ? 'high'
        : (stats.engagement_score || 0) > 40 ? 'medium' : 'low';

      return {
        success: true,
        has_data: true,
        contact: contact.full_name,
        company: contact.company,
        email: contact.email,
        total_sent: stats.total_emails_sent,
        total_received: stats.total_emails_received,
        last_email_sent: stats.last_email_sent_at,
        last_email_received: stats.last_email_received_at,
        avg_gap_days: stats.avg_gap_days ? Math.round(stats.avg_gap_days * 10) / 10 : null,
        avg_response_hours: stats.avg_response_hours ? Math.round(stats.avg_response_hours * 10) / 10 : null,
        engagement_score: stats.engagement_score ? Math.round(stats.engagement_score) : null,
        engagement_level: engagementLevel,
        last_30d_sent: stats.last_30d_sent,
        last_30d_received: stats.last_30d_received,
      };
    }

    if (account_name) {
      // Find account contacts and aggregate
      const { data: account } = await ctx.supabase
        .from('accounts')
        .select('id, name')
        .eq('organization_id', ctx.organizationId)
        .ilike('name', `%${account_name}%`)
        .limit(1)
        .maybeSingle();

      if (!account) {
        return { success: false, message: `No account found matching "${account_name}".` };
      }

      const { data: contacts } = await ctx.supabase
        .from('contacts')
        .select('id, full_name')
        .eq('organization_id', ctx.organizationId)
        .eq('account_id', account.id);

      const contactIds = (contacts || []).map(c => c.id);
      if (contactIds.length === 0) {
        return {
          success: true,
          account: account.name,
          message: `No contacts linked to ${account.name}.`,
          has_data: false,
        };
      }

      const { data: stats } = await ctx.supabase
        .from('email_engagement_stats')
        .select('*, contacts(full_name)')
        .in('contact_id', contactIds);

      if (!stats || stats.length === 0) {
        return {
          success: true,
          account: account.name,
          contacts_count: contactIds.length,
          message: `No email data synced for contacts at ${account.name}.`,
          has_data: false,
        };
      }

      const totalSent = stats.reduce((s: number, st: any) => s + (st.total_emails_sent || 0), 0);
      const totalReceived = stats.reduce((s: number, st: any) => s + (st.total_emails_received || 0), 0);
      const lastEmail = stats
        .map((st: any) => st.last_email_sent_at || st.last_email_received_at)
        .filter(Boolean)
        .sort()
        .pop();

      return {
        success: true,
        has_data: true,
        account: account.name,
        contacts_tracked: stats.length,
        total_contacts: contactIds.length,
        total_sent: totalSent,
        total_received: totalReceived,
        last_email: lastEmail,
        per_contact: stats.map((st: any) => ({
          name: st.contacts?.full_name,
          sent: st.total_emails_sent,
          received: st.total_emails_received,
          engagement_score: st.engagement_score ? Math.round(st.engagement_score) : null,
        })),
      };
    }

    return { success: false, message: 'Please specify a contact name or account name.' };
  },

  triggerExamples: [
    'how engaged is Sarah Chen?',
    'email activity with Netflix',
    'when did we last communicate with Datadog?',
    'are we in touch with the Oracle team?',
  ],
};

export default getEmailEngagement;
