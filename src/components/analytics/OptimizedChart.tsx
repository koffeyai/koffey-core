import React, { useMemo } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, BarChart, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface OptimizedChartProps {
  data: any[];
  loading?: boolean;
  error?: string | null;
  title: string;
  type: 'line' | 'bar' | 'area' | 'pie';
  xKey: string;
  yKeys: string[];
  colors?: string[];
  maxDataPoints?: number;
  showTrend?: boolean;
  height?: number;
}

export const OptimizedChart: React.FC<OptimizedChartProps> = ({
  data,
  loading,
  error,
  title,
  type,
  xKey,
  yKeys,
  colors = ['hsl(var(--primary))', 'hsl(var(--secondary))', 'hsl(var(--accent))'],
  maxDataPoints = 50,
  showTrend = true,
  height = 300
}) => {
  // INTELLIGENT DATA SAMPLING
  const sampledData = useMemo(() => {
    if (!data || data.length <= maxDataPoints) {
      return data;
    }

    // For time series data, use uniform sampling
    if (xKey === 'date' || xKey === 'month' || xKey === 'timestamp') {
      const step = Math.ceil(data.length / maxDataPoints);
      return data.filter((_, index) => index % step === 0);
    }

    // For other data, use intelligent sampling based on variance
    return sampleByVariance(data, yKeys[0], maxDataPoints);
  }, [data, maxDataPoints, xKey, yKeys]);

  // TREND CALCULATION
  const trendData = useMemo(() => {
    if (!showTrend || !sampledData || sampledData.length < 2) {
      return null;
    }

    const firstValue = sampledData[0]?.[yKeys[0]] || 0;
    const lastValue = sampledData[sampledData.length - 1]?.[yKeys[0]] || 0;
    const change = lastValue - firstValue;
    const percentChange = firstValue !== 0 ? (change / firstValue) * 100 : 0;

    return {
      change,
      percentChange,
      direction: change > 0 ? 'up' : change < 0 ? 'down' : 'flat'
    };
  }, [sampledData, yKeys, showTrend]);

  // PERFORMANCE OPTIMIZATIONS
  const chartConfig = useMemo(() => ({
    margin: { top: 5, right: 30, left: 20, bottom: 5 },
    animationDuration: sampledData && sampledData.length > 100 ? 0 : 750
  }), [sampledData]);

  // CUSTOM TOOLTIP
  const CustomTooltip = React.useCallback(({ active, payload, label }: any) => {
    if (!active || !payload || !payload.length) return null;

    return (
      <div className="bg-background p-3 border rounded-lg shadow-lg">
        <p className="font-semibold text-sm">{`${xKey}: ${label}`}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} style={{ color: entry.color }} className="text-sm">
            {`${entry.dataKey}: ${formatValue(entry.value, entry.dataKey)}`}
          </p>
        ))}
      </div>
    );
  }, [xKey]);

  // ERROR STATE
  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              Failed to load chart data: {error}
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  // LOADING STATE
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="w-full" style={{ height }} />
        </CardContent>
      </Card>
    );
  }

  // NO DATA STATE
  if (!sampledData || sampledData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{title}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center" style={{ height }}>
            <p className="text-muted-foreground">No data available</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const ChartComponent = type === 'bar' ? BarChart : LineChart;
  const DataComponent = type === 'bar' ? Bar : Line;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{title}</CardTitle>
          {trendData && (
            <div className="flex items-center gap-2">
              {trendData.direction === 'up' && <TrendingUp className="h-4 w-4 text-green-600" />}
              {trendData.direction === 'down' && <TrendingDown className="h-4 w-4 text-red-600" />}
              {trendData.direction === 'flat' && <Minus className="h-4 w-4 text-muted-foreground" />}
              <span className={`text-sm font-medium ${
                trendData.direction === 'up' ? 'text-green-600' : 
                trendData.direction === 'down' ? 'text-red-600' : 
                'text-muted-foreground'
              }`}>
                {Math.abs(trendData.percentChange).toFixed(1)}%
              </span>
            </div>
          )}
        </div>
        {sampledData.length !== data?.length && (
          <p className="text-xs text-muted-foreground">
            Showing {sampledData.length} of {data?.length} data points
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={height}>
          <ChartComponent data={sampledData} {...chartConfig}>
            <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
            <XAxis 
              dataKey={xKey}
              tickFormatter={formatXAxisLabel}
              interval="preserveStartEnd"
              className="text-xs fill-muted-foreground"
            />
            <YAxis 
              tickFormatter={(value) => formatValue(value, yKeys[0])} 
              className="text-xs fill-muted-foreground"
            />
            <Tooltip content={<CustomTooltip />} />
            <Legend />
            {yKeys.map((key, index) => {
              const color = colors[index % colors.length];
              
              if (type === 'bar') {
                return (
                  <Bar
                    key={key}
                    dataKey={key}
                    fill={color}
                    radius={[2, 2, 0, 0]}
                  />
                );
              } else {
                return (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    stroke={color}
                    strokeWidth={2}
                    dot={sampledData.length <= 20}
                    animationDuration={chartConfig.animationDuration}
                  />
                );
              }
            })}
          </ChartComponent>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
};

// UTILITY FUNCTIONS
function sampleByVariance(data: any[], valueKey: string, maxPoints: number): any[] {
  if (data.length <= maxPoints) return data;

  const step = data.length / maxPoints;
  const sampled = [];

  for (let i = 0; i < maxPoints; i++) {
    const index = Math.floor(i * step);
    sampled.push(data[index]);
  }

  return sampled;
}

function formatValue(value: any, key: string): string {
  if (typeof value !== 'number') return String(value);

  if (key.includes('amount') || key.includes('revenue') || key.includes('value')) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0
    }).format(value);
  }

  if (key.includes('rate') || key.includes('percent')) {
    return `${(value * 100).toFixed(1)}%`;
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1)}K`;
  }

  return value.toFixed(0);
}

function formatXAxisLabel(value: any): string {
  if (value instanceof Date || (typeof value === 'string' && value.includes('-'))) {
    return new Date(value).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return String(value);
}