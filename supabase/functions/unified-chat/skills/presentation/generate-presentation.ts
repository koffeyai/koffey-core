/**
 * Skill: generate_presentation
 *
 * Generate a personalized sales presentation for a deal or account.
 * Calls the generate-ai-slides edge function.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const generatePresentation: SkillDefinition = {
  name: 'generate_presentation',
  displayName: 'Generate Presentation',
  domain: 'presentation',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'generate_presentation',
      description: "Generate a personalized sales presentation for a deal or account. Creates professional slide decks tailored to the sales context. Use when user asks to 'create a deck', 'generate slides', 'make a proposal presentation', etc.",
      parameters: {
        type: 'object',
        properties: {
          template_type: {
            type: 'string',
            enum: ['discovery', 'proposal', 'qbr', 'executive_summary', 'auto'],
            description: "Type of presentation. 'auto' will recommend based on deal stage.",
          },
          account_name: {
            type: 'string',
            description: 'Name of the account/company for the presentation',
          },
          deal_name: {
            type: 'string',
            description: 'Optional: specific deal to contextualize the presentation',
          },
          contact_name: {
            type: 'string',
            description: 'Optional: primary contact to personalize for',
          },
          special_instructions: {
            type: 'string',
            description: "Optional: specific instructions like 'focus on ROI' or 'include competitor comparison'",
          },
        },
        required: ['account_name'],
      },
    },
  },

  instructions: `**For "create a deck", "generate slides", "proposal presentation"** → Use generate_presentation
  - Creates professional slide decks tailored to the sales context
  - Supports discovery, proposal, QBR, and executive summary templates`,

  execute: async (ctx: ToolExecutionContext) => {
    const { supabase, userId, organizationId, args } = ctx;
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Resolve account name to account ID
    const accountName = args.account_name as string;
    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('organization_id', organizationId)
      .ilike('name', `%${accountName}%`)
      .limit(1)
      .maybeSingle();

    if (accountError || !account) {
      return { success: false, message: `Could not find account matching "${accountName}"` };
    }

    // Resolve deal name to deal ID if provided
    let dealId: string | undefined;
    if (args.deal_name) {
      const { data: deal } = await supabase
        .from('deals')
        .select('id')
        .eq('account_id', account.id)
        .ilike('name', `%${args.deal_name as string}%`)
        .limit(1)
        .maybeSingle();
      dealId = deal?.id;
    }

    // Resolve contact name to contact ID if provided
    let contactId: string | undefined;
    if (args.contact_name) {
      const { data: contact } = await supabase
        .from('contacts')
        .select('id')
        .eq('account_id', account.id)
        .ilike('full_name', `%${args.contact_name as string}%`)
        .limit(1)
        .maybeSingle();
      contactId = contact?.id;
    }

    // Map template_type to the edge function's presentationType
    let presentationType = (args.template_type as string) || 'proposal';
    if (presentationType === 'auto') {
      presentationType = 'proposal';
    }

    const payload: Record<string, unknown> = {
      organizationId,
      userId,
      presentationType,
      accountId: account.id,
      dealId: dealId || undefined,
      contactId: contactId || undefined,
      customInstructions: args.special_instructions || undefined,
      personalizationLevel: dealId ? 'deal' : 'account',
    };

    const response = await fetch(`${supabaseUrl}/functions/v1/generate-ai-slides`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      return { success: false, message: err.error || 'Failed to generate presentation' };
    }

    return await response.json();
  },

  triggerExamples: [
    'create a proposal deck for Home Depot',
    'generate slides for the Pepsi QBR',
    'make a discovery presentation for Acme',
  ],
};

export default generatePresentation;
