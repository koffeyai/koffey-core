/**
 * Generative BI / Dynamic Artifact System Types
 * 
 * These types define the structured query configuration that the LLM outputs,
 * ensuring all analytics requests go through a safe, parameterized pathway.
 */

// Allowed entities for analytics queries (whitelist)
export type AnalyticsEntity = 'deals' | 'contacts' | 'accounts' | 'activities' | 'tasks';

// Allowed metric operations
export type MetricOperation = 'count' | 'sum' | 'avg' | 'min' | 'max';

// Allowed time groupings
export type TimeGrouping = 'day' | 'week' | 'month' | 'quarter' | 'year';

// Allowed categorical groupings per entity
export type CategoricalGrouping = 'stage' | 'industry' | 'status' | 'type' | 'priority' | 'assigned_to';

// Combined grouping type
export type GroupBy = TimeGrouping | CategoricalGrouping;

// Allowed time fields for filtering
export type TimeField = 'created_at' | 'updated_at' | 'close_date' | 'due_date' | 'activity_date';

// Filter operators
export type FilterOperator = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'contains';

// Calculation types for derived metrics
export type CalculationType = 'raw' | 'growth_rate' | 'cumulative' | 'moving_average' | 'percentage';

// Chart types for visualization
export type ChartType = 'line' | 'bar' | 'area' | 'pie' | 'table' | 'metric';

/**
 * Filter configuration for analytics queries
 */
export interface AnalyticsFilter {
  field: string;
  operator: FilterOperator;
  value: string | number | boolean | string[] | number[];
}

/**
 * Time range configuration
 */
export interface TimeRange {
  start: string; // ISO 8601 date string
  end: string;   // ISO 8601 date string
  field: TimeField;
}

/**
 * The structured query configuration that the LLM generates
 * This is validated before being passed to the safe RPC function
 */
export interface AnalyticsQueryConfig {
  // Core query parameters
  entity: AnalyticsEntity;
  metrics: MetricOperation[];
  metricField?: string; // e.g., 'amount' for deals, defaults based on entity
  
  // Grouping
  groupBy?: GroupBy;
  
  // Time constraints
  timeRange?: TimeRange;
  
  // Additional filters
  filters?: AnalyticsFilter[];
  
  // Derived calculations
  calculation?: CalculationType;
  
  // Visualization
  chartType: ChartType;
  
  // Pagination
  limit?: number;
  
  // Sorting
  orderBy?: 'asc' | 'desc';
}

/**
 * A single data point in the analytics result
 */
export interface AnalyticsDataPoint {
  label: string;        // X-axis label or category
  value: number;        // Primary metric value
  secondaryValue?: number; // Optional secondary metric
  metadata?: Record<string, unknown>;
}

/**
 * The complete artifact payload returned from the edge function
 */
export interface ArtifactPayload {
  type: 'artifact';
  
  // Query information
  config: AnalyticsQueryConfig;
  originalPrompt: string;
  
  // Results
  data: AnalyticsDataPoint[];
  
  // Presentation
  title: string;
  summary: string;
  chartType: ChartType;
  
  // Chart-specific configuration
  chartConfig?: {
    xAxisLabel?: string;
    yAxisLabel?: string;
    colors?: string[];
    showLegend?: boolean;
    stacked?: boolean;
  };
  
  // Metadata
  generatedAt: string;
  executionTimeMs?: number;
  rowCount: number;
  
  // Provenance
  provider?: string;
  model?: string;
}

/**
 * Request payload for the generate-analytics-artifact edge function
 */
export interface GenerateArtifactRequest {
  prompt: string;
  sessionId?: string;
  organizationId?: string;
  preferences?: {
    defaultChartType?: ChartType;
    colorScheme?: 'default' | 'monochrome' | 'colorful';
  };
}

/**
 * Response from the generate-analytics-artifact edge function
 */
export interface GenerateArtifactResponse {
  success: boolean;
  artifact?: ArtifactPayload;
  error?: string;
  validationErrors?: string[];
}

/**
 * Schema context provided to the LLM for query generation
 */
export const ANALYTICS_SCHEMA_CONTEXT = `
You are an analytics query generator for a CRM system. Generate structured queries based on natural language requests.

Available entities and their queryable fields:

DEALS:
- Metrics: amount (currency), probability (percentage), count
- Groupings: stage, assigned_to, account_id
- Time fields: created_at, updated_at, close_date, expected_close_date
- Stages: prospecting, qualification, proposal, negotiation, closed_won, closed_lost

CONTACTS:
- Metrics: count
- Groupings: status, company, assigned_to, account_id
- Time fields: created_at, updated_at
- Statuses: lead, active, inactive

ACCOUNTS:
- Metrics: count
- Groupings: industry, assigned_to
- Time fields: created_at, updated_at

ACTIVITIES:
- Metrics: count
- Groupings: type, completed
- Time fields: created_at, activity_date, scheduled_at
- Types: call, email, meeting, task, note

TASKS:
- Metrics: count
- Groupings: priority, completed, assigned_to
- Time fields: created_at, due_date
- Priorities: low, medium, high, urgent

VISUALIZATION GUIDELINES:
- Use LINE charts for time-series trends (weekly, monthly data)
- Use BAR charts for categorical comparisons (by stage, by rep)
- Use PIE charts for distribution/proportion analysis
- Use AREA charts for cumulative metrics
- Use TABLE for detailed listings
- Use METRIC for single KPI values

CALCULATION TYPES:
- raw: Simple aggregation (default)
- growth_rate: Period-over-period change percentage
- cumulative: Running total
- percentage: As percentage of total
`;

/**
 * Metric field mappings per entity (whitelist)
 */
export const ENTITY_METRIC_FIELDS: Record<AnalyticsEntity, string[]> = {
  deals: ['amount', 'probability'],
  contacts: [],
  accounts: [],
  activities: [],
  tasks: [],
};

/**
 * Allowed groupBy fields per entity (whitelist)
 */
export const ENTITY_GROUP_BY_FIELDS: Record<AnalyticsEntity, string[]> = {
  deals: ['stage', 'assigned_to', 'account_id', 'day', 'week', 'month', 'quarter', 'year'],
  contacts: ['status', 'company', 'assigned_to', 'account_id', 'day', 'week', 'month', 'quarter', 'year'],
  accounts: ['industry', 'assigned_to', 'day', 'week', 'month', 'quarter', 'year'],
  activities: ['type', 'completed', 'day', 'week', 'month', 'quarter', 'year'],
  tasks: ['priority', 'completed', 'assigned_to', 'day', 'week', 'month', 'quarter', 'year'],
};

/**
 * Time fields allowed per entity (whitelist)
 */
export const ENTITY_TIME_FIELDS: Record<AnalyticsEntity, TimeField[]> = {
  deals: ['created_at', 'updated_at', 'close_date'],
  contacts: ['created_at', 'updated_at'],
  accounts: ['created_at', 'updated_at'],
  activities: ['created_at', 'activity_date'],
  tasks: ['created_at', 'due_date'],
};

/**
 * Validate an AnalyticsQueryConfig against the whitelist
 */
export function validateQueryConfig(config: AnalyticsQueryConfig): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  
  // Validate entity
  const validEntities: AnalyticsEntity[] = ['deals', 'contacts', 'accounts', 'activities', 'tasks'];
  if (!validEntities.includes(config.entity)) {
    errors.push(`Invalid entity: ${config.entity}`);
  }
  
  // Validate metrics
  const validMetrics: MetricOperation[] = ['count', 'sum', 'avg', 'min', 'max'];
  for (const metric of config.metrics) {
    if (!validMetrics.includes(metric)) {
      errors.push(`Invalid metric: ${metric}`);
    }
  }
  
  // Validate metricField if provided
  if (config.metricField && config.entity) {
    const allowedFields = ENTITY_METRIC_FIELDS[config.entity];
    if (allowedFields.length > 0 && !allowedFields.includes(config.metricField)) {
      errors.push(`Invalid metric field "${config.metricField}" for entity "${config.entity}"`);
    }
  }
  
  // Validate groupBy if provided
  if (config.groupBy && config.entity) {
    const allowedGroupBy = ENTITY_GROUP_BY_FIELDS[config.entity];
    if (!allowedGroupBy.includes(config.groupBy)) {
      errors.push(`Invalid groupBy "${config.groupBy}" for entity "${config.entity}"`);
    }
  }
  
  // Validate timeRange.field if provided
  if (config.timeRange?.field && config.entity) {
    const allowedTimeFields = ENTITY_TIME_FIELDS[config.entity];
    if (!allowedTimeFields.includes(config.timeRange.field)) {
      errors.push(`Invalid time field "${config.timeRange.field}" for entity "${config.entity}"`);
    }
  }
  
  // Validate chartType
  const validChartTypes: ChartType[] = ['line', 'bar', 'area', 'pie', 'table', 'metric'];
  if (!validChartTypes.includes(config.chartType)) {
    errors.push(`Invalid chartType: ${config.chartType}`);
  }
  
  // Validate calculation if provided
  if (config.calculation) {
    const validCalculations: CalculationType[] = ['raw', 'growth_rate', 'cumulative', 'moving_average', 'percentage'];
    if (!validCalculations.includes(config.calculation)) {
      errors.push(`Invalid calculation: ${config.calculation}`);
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
  };
}
