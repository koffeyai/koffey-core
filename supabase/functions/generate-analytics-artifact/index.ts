import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.50.0";
import { callWithFallback } from '../_shared/ai-provider.ts';
import { getCorsHeaders, handleCorsOptions } from '../_shared/cors.ts';

let corsHeaders = getCorsHeaders();

/**
 * Schema context provided to the LLM for query generation
 */
const ANALYTICS_SCHEMA_CONTEXT = `You are an analytics query generator for a CRM system. Your job is to translate natural language requests into structured query configurations.

AVAILABLE ENTITIES AND THEIR QUERYABLE FIELDS:

DEALS:
- Metrics: amount (currency), probability (percentage), or just count
- Groupings: stage, assigned_to, or time groupings (day, week, month, quarter, year)
- Time fields: created_at, updated_at, close_date
- Common stages: prospecting, qualification, proposal, negotiation, closed_won, closed_lost

CONTACTS:
- Metrics: count only
- Groupings: status, company, assigned_to, or time groupings
- Time fields: created_at, updated_at

ACCOUNTS:
- Metrics: count only
- Groupings: industry, assigned_to, or time groupings
- Time fields: created_at, updated_at

ACTIVITIES:
- Metrics: count only
- Groupings: type, completed (boolean), or time groupings
- Time fields: created_at, activity_date

TASKS:
- Metrics: count only
- Groupings: priority, completed (boolean), assigned_to, or time groupings
- Time fields: created_at, due_date

VISUALIZATION GUIDELINES:
- LINE: Best for time-series trends (weekly, monthly data over time)
- BAR: Best for categorical comparisons (by stage, by rep, by industry)
- PIE: Best for distribution/proportion analysis (percentage breakdown)
- AREA: Best for cumulative metrics over time
- METRIC: Best for single KPI values

CALCULATION TYPES:
- raw: Simple aggregation (default, use for most cases)
- growth_rate: Period-over-period percentage change (use for "growth" or "trend" requests)
- cumulative: Running total (use for "cumulative" or "total over time" requests)
- percentage: As percentage of total (use for "distribution" or "breakdown" requests)

OUTPUT FORMAT:
You must output a valid JSON object with these fields:
{
  "entity": one of "deals", "contacts", "accounts", "activities", "tasks",
  "metrics": array of "count", "sum", "avg", "min", "max",
  "metricField": "amount" or "probability" (only for deals with sum/avg/min/max),
  "groupBy": one of "day", "week", "month", "quarter", "year", "stage", "industry", "status", "type", "priority", "completed", "assigned_to" or null,
  "timeRange": { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "field": "created_at" or other valid time field } or null,
  "calculation": one of "raw", "growth_rate", "cumulative", "percentage",
  "chartType": one of "line", "bar", "area", "pie", "metric",
  "limit": number (default 100),
  "orderBy": "asc" or "desc",
  "title": short descriptive title for the chart,
  "summary": one sentence explaining what this visualization shows
}`;

/**
 * LLM tool definition for function calling
 */
const ANALYTICS_QUERY_TOOL = {
  type: "function",
  function: {
    name: "generate_analytics_query",
    description: "Generate a structured analytics query configuration from a natural language request",
    parameters: {
      type: "object",
      properties: {
        entity: {
          type: "string",
          enum: ["deals", "contacts", "accounts", "activities", "tasks"],
          description: "The CRM entity to query"
        },
        metrics: {
          type: "array",
          items: { type: "string", enum: ["count", "sum", "avg", "min", "max"] },
          description: "Metrics to calculate"
        },
        metricField: {
          type: "string",
          enum: ["amount", "probability"],
          description: "Field to apply metrics to (only for deals)"
        },
        groupBy: {
          type: "string",
          enum: ["day", "week", "month", "quarter", "year", "stage", "industry", "status", "type", "priority", "completed", "assigned_to"],
          description: "How to group the results"
        },
        timeRange: {
          type: "object",
          properties: {
            start: { type: "string", description: "Start date in YYYY-MM-DD format" },
            end: { type: "string", description: "End date in YYYY-MM-DD format" },
            field: { type: "string", enum: ["created_at", "updated_at", "close_date", "due_date", "activity_date"] }
          },
          required: ["start", "end", "field"]
        },
        calculation: {
          type: "string",
          enum: ["raw", "growth_rate", "cumulative", "percentage"],
          description: "Type of calculation to apply"
        },
        chartType: {
          type: "string",
          enum: ["line", "bar", "area", "pie", "metric"],
          description: "Visualization type"
        },
        limit: {
          type: "number",
          description: "Maximum number of results"
        },
        orderBy: {
          type: "string",
          enum: ["asc", "desc"],
          description: "Sort order"
        },
        title: {
          type: "string",
          description: "Short descriptive title for the visualization"
        },
        summary: {
          type: "string",
          description: "One sentence explanation of what this visualization shows"
        }
      },
      required: ["entity", "metrics", "chartType", "title", "summary"]
    }
  }
};

/**
 * Provider-specific API configurations
 * NOTE: Runtime model/provider routing is centralized in callWithFallback()
 * and uses the shared hosted-provider fallback chain.
 */
const PROVIDER_CONFIGS = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    getHeaders: () => ({
      'Authorization': `Bearer ${Deno.env.get('GEMINI_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    defaultModel: 'gemini-2.5-flash', // unused — callWithFallback handles model selection
    supportsTools: true,
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    getHeaders: () => ({
      'Authorization': `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    defaultModel: 'moonshotai/kimi-k2-instruct-0905',
    supportsTools: true,
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    getHeaders: () => ({
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json',
    }),
    defaultModel: 'gpt-4o-mini',
    supportsTools: true,
  },
  anthropic: {
    url: 'https://api.anthropic.com/v1/messages',
    getHeaders: () => ({
      'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') || '',
      'Content-Type': 'application/json',
      'anthropic-version': '2023-06-01',
    }),
    defaultModel: 'claude-3-5-sonnet-20241022',
    supportsTools: true,
  },
};

/**
 * Validate the query configuration against whitelist
 */
function validateQueryConfig(config: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  const validEntities = ['deals', 'contacts', 'accounts', 'activities', 'tasks'];
  if (!validEntities.includes(config.entity)) {
    errors.push(`Invalid entity: ${config.entity}`);
  }
  
  const validMetrics = ['count', 'sum', 'avg', 'min', 'max'];
  for (const metric of config.metrics || []) {
    if (!validMetrics.includes(metric)) {
      errors.push(`Invalid metric: ${metric}`);
    }
  }
  
  const validChartTypes = ['line', 'bar', 'area', 'pie', 'metric', 'table'];
  if (!validChartTypes.includes(config.chartType)) {
    errors.push(`Invalid chartType: ${config.chartType}`);
  }
  
  return { valid: errors.length === 0, errors };
}

/**
 * Call LLM to generate query config with centralized provider routing.
 */
async function generateQueryConfig(
  prompt: string,
  temperature: number
): Promise<{ queryConfig: any; provider: string; model: string }> {
  const messages = [
    { role: 'system', content: ANALYTICS_SCHEMA_CONTEXT },
    { role: 'user', content: `Generate an analytics query for: "${prompt}"` }
  ];

  console.log(`[generate-analytics-artifact] Calling AI with fallback support (tier: pro)`);

  const result = await callWithFallback({
    messages,
    tier: 'pro', // Analytics always uses PRO tier for complex reasoning
    temperature,
    maxTokens: 1024,
    tools: [ANALYTICS_QUERY_TOOL],
    tool_choice: { type: 'function', function: { name: 'generate_analytics_query' } },
  });

  console.log(`[generate-analytics-artifact] Used ${result.provider} (${result.model})`);

  // Parse the tool call response
  let queryConfig: any;
  try {
    queryConfig = JSON.parse(result.content);
  } catch {
    // Try to extract JSON from content if tool call parsing failed
    const jsonMatch = result.content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      queryConfig = JSON.parse(jsonMatch[0]);
    } else {
      throw new Error('Failed to parse LLM response as JSON');
    }
  }

  return { queryConfig, provider: result.provider, model: result.model };
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return handleCorsOptions(req);
  }

  
  corsHeaders = getCorsHeaders(req);
const startTime = Date.now();

  try {
    // Authenticate user
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      console.error('[generate-analytics-artifact] Auth error:', authError);
      return new Response(
        JSON.stringify({ success: false, error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request
    const { prompt, sessionId, organizationId, preferences } = await req.json();
    
    if (!prompt || typeof prompt !== 'string') {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or invalid prompt' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-analytics-artifact] Processing: "${prompt.substring(0, 100)}..." for user ${user.id}`);

    // Fetch user's AI preferences
    const { data: aiPrefs } = await supabase
      .from('user_ai_preferences')
      .select('provider, model, temperature')
      .eq('user_id', user.id)
      .single();

    const temperature = aiPrefs?.temperature || 0.3;

    // Generate query config using LLM with automatic fallback
    let queryConfig: any;
    let usedProvider: string;
    let usedModel: string;
    try {
      const result = await generateQueryConfig(prompt, temperature);
      queryConfig = result.queryConfig;
      usedProvider = result.provider;
      usedModel = result.model;
      console.log('[generate-analytics-artifact] LLM generated config:', JSON.stringify(queryConfig));
    } catch (llmError) {
      console.error('[generate-analytics-artifact] LLM error:', llmError);
      
      // Check if it's a rate limit error that exhausted all fallbacks
      const errorMessage = llmError instanceof Error ? llmError.message : 'Unknown error';
      const isRateLimit = errorMessage.includes('429') || errorMessage.toLowerCase().includes('rate limit') || errorMessage.toLowerCase().includes('quota');
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: isRateLimit 
            ? "I'm experiencing high demand right now. Please try again in a few seconds."
            : `Failed to generate query: ${errorMessage}`,
          retryable: isRateLimit
        }),
        { status: isRateLimit ? 429 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate query config
    const validation = validateQueryConfig(queryConfig);
    if (!validation.valid) {
      console.error('[generate-analytics-artifact] Validation errors:', validation.errors);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Query validation failed',
          validationErrors: validation.errors 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Execute the safe analytics query
    const { data: queryResult, error: queryError } = await supabase.rpc('execute_analytics_query', {
      p_entity: queryConfig.entity,
      p_metrics: queryConfig.metrics,
      p_metric_field: queryConfig.metricField || 'amount',
      p_group_by: queryConfig.groupBy || null,
      p_time_start: queryConfig.timeRange?.start || null,
      p_time_end: queryConfig.timeRange?.end || null,
      p_time_field: queryConfig.timeRange?.field || 'created_at',
      p_calculation: queryConfig.calculation || 'raw',
      p_limit: queryConfig.limit || 100,
      p_order_by: queryConfig.orderBy || 'desc',
    });

    if (queryError) {
      console.error('[generate-analytics-artifact] RPC error:', queryError);
      return new Response(
        JSON.stringify({ success: false, error: 'Query execution failed', details: queryError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check for errors in the result
    if (queryResult?.error) {
      console.error('[generate-analytics-artifact] Query returned error:', queryResult.error);
      return new Response(
        JSON.stringify({ success: false, error: queryResult.error }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const executionTimeMs = Date.now() - startTime;

    // Build artifact payload
    const artifact = {
      type: 'artifact',
      config: queryConfig,
      originalPrompt: prompt,
      data: queryResult?.data || [],
      title: queryConfig.title || 'Analytics Report',
      summary: queryConfig.summary || 'Generated analytics visualization',
      chartType: queryConfig.chartType,
      chartConfig: {
        xAxisLabel: queryConfig.groupBy || 'Category',
        yAxisLabel: queryConfig.metrics?.includes('sum') ? 'Amount' : 'Count',
        showLegend: false,
      },
      generatedAt: new Date().toISOString(),
      executionTimeMs,
      rowCount: queryResult?.rowCount || 0,
      provider: usedProvider,
      model: usedModel,
    };

    console.log(`[generate-analytics-artifact] Success! ${artifact.rowCount} rows in ${executionTimeMs}ms`);

    return new Response(
      JSON.stringify({ success: true, artifact }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[generate-analytics-artifact] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
