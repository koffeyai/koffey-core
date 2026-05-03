import React, { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Download, 
  Bookmark, 
  RefreshCw, 
  Expand, 
  TrendingUp, 
  TrendingDown,
  BarChart3,
  LineChart as LineChartIcon,
  PieChart as PieChartIcon,
  Table as TableIcon,
  Gauge
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from 'recharts';
import type { ArtifactPayload, AnalyticsDataPoint } from '@/types/analytics';

interface ArtifactCardProps {
  artifact: ArtifactPayload;
  isLoading?: boolean;
  onSave?: () => void;
  onExport?: () => void;
  onRefresh?: () => void;
  onExpand?: () => void;
  compact?: boolean;
}

// Chart colors using HSL for theming
const CHART_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--chart-1, 220 70% 50%))',
  'hsl(var(--chart-2, 160 60% 45%))',
  'hsl(var(--chart-3, 30 80% 55%))',
  'hsl(var(--chart-4, 280 65% 60%))',
  'hsl(var(--chart-5, 340 75% 55%))',
];

// Icon mapping for chart types
const CHART_ICONS = {
  line: LineChartIcon,
  bar: BarChart3,
  area: LineChartIcon,
  pie: PieChartIcon,
  table: TableIcon,
  metric: Gauge,
};

/**
 * Format values for display
 */
function formatValue(value: number, isPercentage = false, isCurrency = false): string {
  if (isPercentage) {
    return `${value.toFixed(1)}%`;
  }
  if (isCurrency) {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(1)}K`;
    return `$${value.toFixed(0)}`;
  }
  if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
  return value.toFixed(0);
}

/**
 * Format date labels
 */
function formatLabel(label: string): string {
  if (!label) return 'Unknown';
  
  // Try to parse as date
  const date = new Date(label);
  if (!isNaN(date.getTime())) {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  
  // Capitalize first letter
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Custom tooltip component
 */
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  
  return (
    <div className="rounded-lg border bg-popover p-2 shadow-md">
      <p className="text-sm font-medium text-popover-foreground">
        {formatLabel(label)}
      </p>
      {payload.map((entry: any, index: number) => (
        <p key={index} className="text-sm text-muted-foreground">
          {entry.name}: <span className="font-medium">{formatValue(entry.value)}</span>
        </p>
      ))}
    </div>
  );
}

/**
 * Render a single metric value
 */
function MetricDisplay({ data, title }: { data: AnalyticsDataPoint[]; title: string }) {
  const value = data[0]?.value ?? 0;
  const previousValue = data[1]?.value;
  
  const trend = previousValue !== undefined && previousValue !== 0
    ? ((value - previousValue) / previousValue) * 100
    : null;
  
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <p className="text-4xl font-bold text-foreground">
        {formatValue(value)}
      </p>
      {trend !== null && (
        <div className={`flex items-center gap-1 mt-2 ${trend >= 0 ? 'text-green-500' : 'text-red-500'}`}>
          {trend >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
          <span className="text-sm font-medium">{Math.abs(trend).toFixed(1)}%</span>
        </div>
      )}
    </div>
  );
}

/**
 * Render data as a table
 */
function DataTable({ data }: { data: AnalyticsDataPoint[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 px-4 text-left font-medium text-muted-foreground">Label</th>
            <th className="py-2 px-4 text-right font-medium text-muted-foreground">Value</th>
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b border-border/50 hover:bg-muted/50">
              <td className="py-2 px-4 text-foreground">{formatLabel(row.label)}</td>
              <td className="py-2 px-4 text-right font-medium">{formatValue(row.value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export const ArtifactCard: React.FC<ArtifactCardProps> = ({
  artifact,
  isLoading = false,
  onSave,
  onExport,
  onRefresh,
  onExpand,
  compact = false,
}) => {
  const { chartType, data, title, summary, provider, model, executionTimeMs, rowCount } = artifact;
  
  // Format data for Recharts
  const chartData = useMemo(() => {
    return data.map(point => ({
      ...point,
      label: formatLabel(point.label),
      value: Number(point.value) || 0,
    }));
  }, [data]);

  const ChartIcon = CHART_ICONS[chartType] || BarChart3;

  const renderChart = () => {
    if (isLoading) {
      return <Skeleton className="h-[200px] w-full" />;
    }

    if (!chartData.length) {
      return (
        <div className="flex items-center justify-center h-[200px] text-muted-foreground">
          No data available
        </div>
      );
    }

    const chartHeight = compact ? 180 : 250;

    switch (chartType) {
      case 'metric':
        return <MetricDisplay data={data} title={title} />;
      
      case 'table':
        return <DataTable data={data} />;
      
      case 'line':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="label" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(v) => formatValue(v)}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Line 
                type="monotone" 
                dataKey="value" 
                stroke={CHART_COLORS[0]} 
                strokeWidth={2}
                dot={{ fill: CHART_COLORS[0], r: 4 }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        );
      
      case 'area':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <AreaChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="label" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(v) => formatValue(v)}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area 
                type="monotone" 
                dataKey="value" 
                stroke={CHART_COLORS[0]} 
                fill={CHART_COLORS[0]}
                fillOpacity={0.3}
              />
            </AreaChart>
          </ResponsiveContainer>
        );
      
      case 'pie':
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <PieChart>
              <Pie
                data={chartData}
                dataKey="value"
                nameKey="label"
                cx="50%"
                cy="50%"
                outerRadius={compact ? 60 : 80}
                label={({ label, percent }) => `${label} (${(percent * 100).toFixed(0)}%)`}
                labelLine={false}
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
              <Legend />
            </PieChart>
          </ResponsiveContainer>
        );
      
      case 'bar':
      default:
        return (
          <ResponsiveContainer width="100%" height={chartHeight}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis 
                dataKey="label" 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickLine={false}
              />
              <YAxis 
                tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                tickFormatter={(v) => formatValue(v)}
                tickLine={false}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar 
                dataKey="value" 
                fill={CHART_COLORS[0]} 
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        );
    }
  };

  return (
    <Card className="overflow-hidden border-border/50 bg-card/50 backdrop-blur-sm">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <ChartIcon className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base font-semibold">{title}</CardTitle>
          </div>
          <div className="flex items-center gap-1">
            {onRefresh && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onRefresh}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            )}
            {onSave && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onSave}>
                <Bookmark className="h-3.5 w-3.5" />
              </Button>
            )}
            {onExport && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onExport}>
                <Download className="h-3.5 w-3.5" />
              </Button>
            )}
            {onExpand && (
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onExpand}>
                <Expand className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        </div>
        {summary && (
          <p className="text-sm text-muted-foreground mt-1">{summary}</p>
        )}
      </CardHeader>
      
      <CardContent className="pt-2">
        {renderChart()}
        
        {/* Provenance footer */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {rowCount} {rowCount === 1 ? 'row' : 'rows'}
            </Badge>
            {executionTimeMs && (
              <span className="text-xs text-muted-foreground">
                {executionTimeMs}ms
              </span>
            )}
          </div>
          {provider && (
            <span className="text-xs text-muted-foreground">
              Generated by {provider}{model ? ` (${model.split('/').pop()})` : ''}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default ArtifactCard;
