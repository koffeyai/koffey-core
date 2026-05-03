/**
 * Deterministic List Recent Handler - MODE A: Broad Listing
 * 
 * Handles queries like "What's in my database?", "Show me everything", "List accounts"
 * Uses fast SQL queries instead of vector search
 * For deals, also fetches scalable statistics via RPC
 */

export async function handleListRecent(
  supabase: any,
  entity: string,
  limit: number = 20,
  organizationId: string
): Promise<any> {
  console.log(`📋 List Recent: ${entity} (limit: ${limit})`);

  const tableMap: Record<string, string> = {
    contact: 'contacts',
    account: 'accounts',
    deal: 'deals',
    activity: 'activities',
    task: 'tasks'
  };

  const tableName = tableMap[entity];
  if (!tableName) {
    throw new Error(`Invalid entity type: ${entity}`);
  }

  // Simple, fast SQL query - no vector search needed
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .eq('organization_id', organizationId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error(`❌ List error for ${entity}:`, error);
    throw new Error(`Failed to list ${entity}: ${error.message}`);
  }

  console.log(`✅ Found ${data.length} ${entity} records`);

  // For deals, fetch scalable statistics via RPC (not fetching all rows)
  if (entity === 'deal') {
    console.log('📊 Fetching pipeline stats via RPC...');
    
    const { data: pipelineStats, error: statsError } = await supabase
      .rpc('get_pipeline_stats', { p_organization_id: organizationId });

    if (statsError) {
      console.warn('⚠️ Could not fetch pipeline stats:', statsError.message);
    }

    const stats = pipelineStats || {};
    
    return {
      entity,
      count: data.length,
      records: data,
      mode: 'list_recent',
      summary: `Found ${data.length} deal records in your database.`,
      // Database-calculated statistics (scalable - no row fetching)
      statistics: {
        totalCount: stats.total_count || 0,
        totalPipelineValue: stats.total_value || 0,
        averageDealSize: stats.average_deal_size || 0,
        medianDealSize: stats.median_deal_size || 0,
        trimmedAverage: stats.trimmed_average || 0,
        byStage: stats.by_stage || [],
        wonDeals: stats.won_deals || 0,
        wonValue: stats.won_value || 0,
        lostDeals: stats.lost_deals || 0,
        openDeals: stats.open_deals || 0,
        openPipelineValue: stats.open_pipeline_value || 0,
        winRate: stats.win_rate || 0,
        currency: stats.currency || 'USD',
        calculatedAt: stats.calculated_at
      }
    };
  }

  // Return structured data for the AI to format
  return {
    entity,
    count: data.length,
    records: data,
    mode: 'list_recent',
    summary: `Found ${data.length} ${entity} records in your database.`
  };
}
