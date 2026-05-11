/**
 * Skill: get_account_context
 *
 * Fetch comprehensive, pre-joined account context from the
 * get_account_context_for_llm Postgres RPC. Returns account info,
 * related contacts, deals, activities, tasks, email snippets, engagement
 * stats, and contact memory in a single call for LLM synthesis.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

function cleanEntityDisplayName(displayName: string): string {
  if (!displayName) return '';

  let cleaned = displayName;
  cleaned = cleaned.replace(/\*\*/g, '').replace(/\*/g, '');
  cleaned = cleaned.replace(/^\d+\.\s*/, '');
  cleaned = cleaned.replace(/\s*\([^)]+\)\s*$/, '');
  cleaned = cleaned.replace(/[\u2013\u2014\u2015]/g, '-');

  const suffixPattern =
    /\s+-\s+(\d{1,2}\/\d{1,2}\/\d{2,4}|\d{4}-\d{2}-\d{2}|\w{3,9}\s+\d{4}|\$[\d,.]+[KMB]?|prospecting|qualification|proposal|negotiation|closed[_\s]?(won|lost)?|\d+%?).*$/i;

  let prev = '';
  while (cleaned !== prev) {
    prev = cleaned;
    cleaned = cleaned.replace(suffixPattern, '');
  }
  return cleaned.trim();
}

function stripArticles(name: string): string {
  return name.replace(/^(the|a|an)\s+/i, '').trim();
}

function isUuid(value?: string | null): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

function resolveAccountFromContext(
  entityContext: ToolExecutionContext['entityContext'],
  nameHint?: string,
): string | null {
  if (!entityContext?.referencedEntities) return null;

  const accounts = entityContext.referencedEntities.accounts;
  if (!accounts || accounts.length === 0) return null;

  if (entityContext.primaryEntity?.type === 'account') {
    if (!nameHint) return entityContext.primaryEntity.id ?? null;
    const hintClean = stripArticles(cleanEntityDisplayName(nameHint)).toLowerCase();
    const primaryClean = stripArticles(entityContext.primaryEntity.name ?? '').toLowerCase();
    if (primaryClean.includes(hintClean) || hintClean.includes(primaryClean)) {
      return entityContext.primaryEntity.id ?? null;
    }
  }

  if (nameHint) {
    const cleanedHint = cleanEntityDisplayName(nameHint).toLowerCase();
    const cleanedHintNoArticle = stripArticles(cleanedHint).toLowerCase();
    const match = accounts.find((e: { id: string; name: string }) => {
      const cleanedName = (e.name || '').toLowerCase();
      const cleanedNameNoArticle = stripArticles(e.name || '').toLowerCase();
      return (
        cleanedName.includes(cleanedHint) ||
        cleanedHint.includes(cleanedName) ||
        cleanedNameNoArticle.includes(cleanedHintNoArticle) ||
        cleanedHintNoArticle.includes(cleanedNameNoArticle)
      );
    });
    if (match) return match.id;
    return null;
  }

  return accounts[0]?.id || null;
}

function buildMultipleAccountPrompt(accounts: any[], label: string) {
  const optionLines = accounts.slice(0, 5).map((account: any, index: number) => {
    const facts = [
      account.industry ? `industry ${account.industry}` : '',
      account.domain ? `domain ${account.domain}` : '',
      account.website ? `website ${account.website}` : '',
    ].filter(Boolean);
    return `${index + 1}. ${account.name || account.id}${facts.length ? ` (${facts.join(', ')})` : ''}`;
  });

  return {
    success: false,
    _needsInput: true,
    clarification_type: 'multiple_accounts',
    multiple_accounts: true,
    label,
    accounts,
    message: `I found ${accounts.length} matching accounts for "${label}". Which one should I use?\n${optionLines.join('\n')}`,
    follow_up_prompt: 'Reply with the account name or number.',
  };
}

const getAccountContext: SkillDefinition = {
  name: 'get_account_context',
  displayName: 'Get Account Context',
  domain: 'context',
  version: '1.0.0',
  loadTier: 'core',

  schema: {
    type: 'function',
    function: {
      name: 'get_account_context',
      description:
        'Fetch comprehensive context for an account in a single call: account info, contacts, deals, activities, tasks, recent email snippets, engagement stats, and contact memory. Use this INSTEAD of multiple search_crm calls when you need a full picture of an account.',
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'UUID of the account. Use when available from entity context or previous tool results.',
          },
          account_name: {
            type: 'string',
            description: 'Name, website, or domain of the account to search for.',
          },
        },
        required: [],
      },
    },
  },

  instructions: `**For "tell me about [account]", "what do we know about [company]", "account summary", "brief me on [account]", "account overview"** -> Use get_account_context
- Returns complete account context in a single call: account info, contacts, deals, activities, tasks, recent email snippets, engagement stats, and contact memory
- Use this INSTEAD of multiple search_crm calls when you need comprehensive account information
- Prefer account_id over account_name when available from context`,

  execute: async (ctx: ToolExecutionContext) => {
    const args = (ctx.args || {}) as {
      account_id?: string;
      account_name?: string;
    };

    let accountName = args.account_name;
    let accountId = isUuid(args.account_id) ? args.account_id : undefined;
    if (args.account_id && !accountId && !accountName) {
      accountName = args.account_id;
    }

    if (!accountId && accountName && ctx.entityContext) {
      const resolvedId = resolveAccountFromContext(ctx.entityContext, accountName);
      if (isUuid(resolvedId)) accountId = resolvedId ?? undefined;
    }

    if (!accountId && !accountName && ctx.entityContext) {
      const resolvedId = resolveAccountFromContext(ctx.entityContext);
      if (isUuid(resolvedId)) accountId = resolvedId ?? undefined;
    }

    if (
      !accountId &&
      !accountName &&
      ctx.activeContext?.lastEntityType === 'accounts' &&
      ctx.activeContext.lastEntityIds?.length === 1
    ) {
      const activeId = ctx.activeContext.lastEntityIds[0];
      if (isUuid(activeId)) accountId = activeId;
    }

    if (!accountId && accountName) {
      const cleanedName = cleanEntityDisplayName(accountName);
      const noArticle = stripArticles(cleanedName);
      const searchTerms = Array.from(new Set([cleanedName, noArticle].filter(Boolean)));
      const orClause = searchTerms
        .flatMap((term) => [
          `name.ilike.%${term}%`,
          `domain.ilike.%${term}%`,
          `website.ilike.%${term}%`,
        ])
        .join(',');

      const { data: accounts, error } = await ctx.supabase
        .from('accounts')
        .select('id, name, industry, website, domain, account_type, updated_at')
        .eq('organization_id', ctx.organizationId)
        .or(orClause)
        .limit(5);

      if (error) {
        return { success: false, message: `Error searching for account: ${error.message}` };
      }

      if (!accounts || accounts.length === 0) {
        return {
          success: false,
          message: `I couldn't find an account matching "${cleanedName}". Try the exact account name, website, or domain.`,
        };
      }

      if (accounts.length > 1) {
        return buildMultipleAccountPrompt(accounts, cleanedName);
      }

      accountId = accounts[0].id;
    }

    if (!accountId) {
      if (
        ctx.activeContext?.lastEntityType === 'accounts' &&
        (ctx.activeContext.lastEntityNames?.length || 0) > 1
      ) {
        const accountList = (ctx.activeContext.lastEntityNames || [])
          .slice(0, 5)
          .map((name: string, i: number) => `${i + 1}. **${name}**`)
          .join('\n');
        return {
          success: false,
          message: `I see several recent accounts:\n\n${accountList}\n\nWhich one would you like context on?`,
        };
      }

      return {
        success: false,
        message:
          'Which account would you like context on? Share the account name, website, or domain.',
      };
    }

    const { data, error } = await ctx.supabase.rpc('get_account_context_for_llm', {
      p_account_id: accountId,
      p_organization_id: ctx.organizationId,
    });

    if (error) {
      return { success: false, message: `Error fetching account context: ${error.message}` };
    }

    if (!data) {
      return {
        success: false,
        message:
          'Could not retrieve account context. The account may not exist or you may not have access.',
      };
    }

    return {
      ...data,
      __trusted_context: true,
    };
  },

  triggerExamples: [
    'tell me about the Acme account',
    'what do we know about Pepsi?',
    'account summary for Microsoft',
    'brief me on this company',
    'account overview',
  ],
};

export default getAccountContext;
