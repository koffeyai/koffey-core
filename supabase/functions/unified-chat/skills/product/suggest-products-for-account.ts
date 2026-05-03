/**
 * Skill: suggest_products_for_account
 *
 * Suggest which products are the best fit for an account.
 * Handler is still inline in index.ts.
 */

import type { SkillDefinition, ToolExecutionContext } from '../types.ts';

const suggestProductsForAccount: SkillDefinition = {
  name: 'suggest_products_for_account',
  displayName: 'Suggest Products for Account',
  domain: 'product',
  version: '1.0.0',
  loadTier: 'pro',

  schema: {
    type: 'function',
    function: {
      name: 'suggest_products_for_account',
      description: "Analyze an account's profile, industry, tech stack, compliance needs, and enriched data to suggest which products are the best fit. Use when viewing company profiles or when a rep asks what to sell to an account.",
      parameters: {
        type: 'object',
        properties: {
          account_id: {
            type: 'string',
            description: 'UUID of the account to analyze',
          },
          account_name: {
            type: 'string',
            description: 'Name of the account (used for search if account_id not provided)',
          },
        },
      },
    },
  },

  instructions: `**For "what should I sell to X", "which products fit this account"** → Use suggest_products_for_account
  - Analyzes account profile, industry, and enriched data to recommend products`,

  execute: async (ctx: ToolExecutionContext) => {
    const { account_id, account_name } = ctx.args as {
      account_id?: string;
      account_name?: string;
    };

    // Resolve account
    let account: any = null;

    if (account_id) {
      const { data, error } = await ctx.supabase
        .from('accounts')
        .select('id, name, industry, description, website, domain, scraped_data, data_sources, account_type, arr, total_revenue')
        .eq('organization_id', ctx.organizationId)
        .eq('id', account_id)
        .single();
      if (error) throw error;
      account = data;
    } else if (account_name) {
      const { data, error } = await ctx.supabase
        .from('accounts')
        .select('id, name, industry, description, website, domain, scraped_data, data_sources, account_type, arr, total_revenue')
        .eq('organization_id', ctx.organizationId)
        .ilike('name', `%${account_name}%`)
        .limit(1)
        .single();
      if (error && error.code !== 'PGRST116') throw error;
      account = data;
    }

    if (!account) {
      return { error: 'Account not found. Please provide a valid account_id or account_name.' };
    }

    // Get active products for the organization
    const { data: products, error: prodError } = await ctx.supabase
      .from('products')
      .select('id, name, description, category, pricing_model, base_price, billing_frequency, status')
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'active')
      .order('display_order', { ascending: true });

    if (prodError) throw prodError;

    if (!products || products.length === 0) {
      return {
        account: { id: account.id, name: account.name, industry: account.industry },
        suggestions: [],
        note: 'No active products found in your product catalog.',
      };
    }

    // Get existing deals for this account to see what's already positioned
    const { data: existingDeals } = await ctx.supabase
      .from('deals')
      .select('id, name, products_positioned, stage')
      .eq('organization_id', ctx.organizationId)
      .eq('account_id', account.id);

    const alreadyPositioned = new Set<string>();
    for (const deal of existingDeals || []) {
      if (Array.isArray(deal.products_positioned)) {
        for (const p of deal.products_positioned) alreadyPositioned.add(p.toLowerCase());
      }
    }

    // Build suggestions based on account profile matching
    const industry = (account.industry || '').toLowerCase();
    const description = (account.description || '').toLowerCase();
    const scrapedData = account.scraped_data || {};
    const techStack = (scrapedData.technologies || scrapedData.tech_stack || []).map((t: string) => t.toLowerCase());

    const suggestions = products.map((product: any) => {
      const reasons: string[] = [];
      let relevanceScore = 50; // Base score

      const prodName = (product.name || '').toLowerCase();
      const prodDesc = (product.description || '').toLowerCase();
      const prodCategory = (product.category || '').toLowerCase();

      // Check if already positioned
      const isPositioned = alreadyPositioned.has(prodName);
      if (isPositioned) {
        reasons.push('Already positioned in an existing deal');
        relevanceScore -= 20;
      }

      // Industry match heuristics
      if (industry && (prodDesc.includes(industry) || prodCategory.includes(industry))) {
        reasons.push(`Matches account industry: ${account.industry}`);
        relevanceScore += 20;
      }

      // Description keyword overlap
      if (description && prodDesc) {
        const descWords = description.split(/\s+/).filter((w: string) => w.length > 4);
        const matches = descWords.filter((w: string) => prodDesc.includes(w));
        if (matches.length > 0) {
          reasons.push(`Account description aligns with product focus`);
          relevanceScore += Math.min(matches.length * 5, 15);
        }
      }

      // Company size / revenue signals
      if (account.arr && account.arr > 100000 && prodCategory?.includes('enterprise')) {
        reasons.push('Enterprise account — good fit for premium offering');
        relevanceScore += 10;
      }

      if (reasons.length === 0) {
        reasons.push('General product offering — review fit based on account needs');
      }

      return {
        product_id: product.id,
        product_name: product.name,
        category: product.category,
        description: product.description,
        pricing_model: product.pricing_model,
        base_price: product.base_price,
        relevance_score: Math.max(0, Math.min(100, relevanceScore)),
        already_positioned: isPositioned,
        reasons,
      };
    });

    // Sort by relevance, non-positioned first
    suggestions.sort((a: any, b: any) => {
      if (a.already_positioned !== b.already_positioned) return a.already_positioned ? 1 : -1;
      return b.relevance_score - a.relevance_score;
    });

    return {
      account: {
        id: account.id,
        name: account.name,
        industry: account.industry,
        account_type: account.account_type,
      },
      suggestions,
      total_products: products.length,
    };
  },

  triggerExamples: [
    'what products fit Home Depot',
    'what should I sell to this account',
    'suggest products for Pepsi',
  ],
};

export default suggestProductsForAccount;
