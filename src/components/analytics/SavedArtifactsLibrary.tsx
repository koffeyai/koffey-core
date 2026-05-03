import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BookmarkCheck,
  Loader2,
  MessageSquare,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Share2,
  Trash2,
  Wand2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ArtifactCard } from '@/components/chat/ArtifactCard';
import { useAuth } from '@/components/auth/AuthProvider';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { useArtifactGeneration } from '@/hooks/useArtifactGeneration';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { launchChatWith } from '@/stores/unifiedChatStore';
import type {
  AnalyticsDataPoint,
  AnalyticsEntity,
  AnalyticsQueryConfig,
  ArtifactPayload,
  ChartType,
  MetricOperation,
} from '@/types/analytics';

type SavedArtifactRow = Database['public']['Tables']['saved_artifacts']['Row'];

const SAVED_ARTIFACT_SELECT = `
  id,
  user_id,
  organization_id,
  title,
  original_prompt,
  query_config,
  chart_config,
  last_result,
  is_pinned,
  is_shared,
  created_at,
  updated_at,
  last_refreshed_at
`;

const CHART_TYPES: ChartType[] = ['line', 'bar', 'area', 'pie', 'table', 'metric'];
const ENTITIES: AnalyticsEntity[] = ['deals', 'contacts', 'accounts', 'activities', 'tasks'];
const METRICS: MetricOperation[] = ['count', 'sum', 'avg', 'min', 'max'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value ?? null)) as Json;
}

function normalizeChartType(value: unknown): ChartType {
  return typeof value === 'string' && CHART_TYPES.includes(value as ChartType)
    ? value as ChartType
    : 'bar';
}

function normalizeEntity(value: unknown): AnalyticsEntity {
  return typeof value === 'string' && ENTITIES.includes(value as AnalyticsEntity)
    ? value as AnalyticsEntity
    : 'deals';
}

function normalizeMetrics(value: unknown): MetricOperation[] {
  if (!Array.isArray(value)) return ['count'];
  const metrics = value.filter(metric => METRICS.includes(metric as MetricOperation)) as MetricOperation[];
  return metrics.length ? metrics : ['count'];
}

function normalizeDataPoints(value: unknown): AnalyticsDataPoint[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((point, index): AnalyticsDataPoint | null => {
      const record = isRecord(point) ? point : {};
      const numericValue = Number(record.value ?? 0);

      if (!Number.isFinite(numericValue)) return null;

      const dataPoint: AnalyticsDataPoint = {
        label: String(record.label ?? `Row ${index + 1}`),
        value: numericValue,
      };

      if (Number.isFinite(Number(record.secondaryValue))) {
        dataPoint.secondaryValue = Number(record.secondaryValue);
      }

      if (isRecord(record.metadata)) {
        dataPoint.metadata = record.metadata;
      }

      return dataPoint;
    })
    .filter((point): point is AnalyticsDataPoint => point !== null);
}

function rowToArtifact(row: SavedArtifactRow): ArtifactPayload {
  const queryConfig = isRecord(row.query_config) ? row.query_config : {};
  const chartConfig = isRecord(row.chart_config) ? row.chart_config : {};
  const lastResult = isRecord(row.last_result) ? row.last_result : {};
  const chartType = normalizeChartType(queryConfig.chartType ?? chartConfig.chartType);
  const data = normalizeDataPoints(lastResult.data);
  const rowCount = Number(lastResult.rowCount);
  const executionTimeMs = Number(lastResult.executionTimeMs);
  const originalPrompt = row.original_prompt || `Saved analytics artifact: ${row.title}`;

  return {
    type: 'artifact',
    config: {
      ...queryConfig,
      entity: normalizeEntity(queryConfig.entity),
      metrics: normalizeMetrics(queryConfig.metrics),
      chartType,
    } as AnalyticsQueryConfig,
    originalPrompt,
    data,
    title: row.title,
    summary: typeof lastResult.summary === 'string'
      ? lastResult.summary
      : `Saved from: ${originalPrompt}`,
    chartType,
    chartConfig: chartConfig as ArtifactPayload['chartConfig'],
    generatedAt: row.last_refreshed_at || row.updated_at || row.created_at,
    executionTimeMs: Number.isFinite(executionTimeMs) ? executionTimeMs : undefined,
    rowCount: Number.isFinite(rowCount) ? rowCount : data.length,
    provider: typeof lastResult.provider === 'string' ? lastResult.provider : undefined,
    model: typeof lastResult.model === 'string' ? lastResult.model : undefined,
  };
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Never refreshed';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown update time';

  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export const SavedArtifactsLibrary: React.FC = () => {
  const { user } = useAuth();
  const { currentOrganization, loading: orgLoading } = useOrganizationAccess();
  const { generateArtifact, exportArtifact, isGenerating } = useArtifactGeneration();
  const [artifacts, setArtifacts] = useState<SavedArtifactRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingId, setRefreshingId] = useState<string | null>(null);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const organizationId = currentOrganization?.organization_id ?? null;

  const loadArtifacts = useCallback(async () => {
    if (!user?.id || orgLoading) return;

    try {
      setLoading(true);

      if (!organizationId) {
        setArtifacts([]);
        return;
      }

      const scopedOwnRequest = supabase
        .from('saved_artifacts')
        .select(SAVED_ARTIFACT_SELECT)
        .eq('user_id', user.id)
        .eq('organization_id', organizationId);

      const sharedRequest = supabase
        .from('saved_artifacts')
        .select(SAVED_ARTIFACT_SELECT)
        .eq('organization_id', organizationId)
        .eq('is_shared', true)
        .neq('user_id', user.id);

      const [ownResult, sharedResult] = await Promise.all([scopedOwnRequest, sharedRequest]);

      if (ownResult.error) throw ownResult.error;
      if (sharedResult.error) throw sharedResult.error;

      const rowsById = new Map<string, SavedArtifactRow>();
      [...(ownResult.data || []), ...(sharedResult.data || [])].forEach(row => {
        rowsById.set(row.id, row as SavedArtifactRow);
      });

      const sortedRows = Array.from(rowsById.values())
        .sort((a, b) => {
          const pinnedDiff = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
          if (pinnedDiff !== 0) return pinnedDiff;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        })
        .slice(0, 24);

      setArtifacts(sortedRows);
    } catch (error) {
      console.error('[SavedArtifactsLibrary] Failed to load artifacts:', error);
      toast.error('Failed to load saved analytics');
    } finally {
      setLoading(false);
    }
  }, [orgLoading, organizationId, user?.id]);

  useEffect(() => {
    if (orgLoading) return;

    if (!user?.id) {
      setArtifacts([]);
      setLoading(false);
      return;
    }

    void loadArtifacts();
  }, [loadArtifacts, orgLoading, user?.id]);

  const artifactItems = useMemo(
    () => artifacts.map(row => ({ row, artifact: rowToArtifact(row) })),
    [artifacts]
  );

  const updateLocalRow = (updated: SavedArtifactRow) => {
    setArtifacts(current =>
      current
        .map(row => row.id === updated.id ? updated : row)
        .sort((a, b) => {
          const pinnedDiff = Number(Boolean(b.is_pinned)) - Number(Boolean(a.is_pinned));
          if (pinnedDiff !== 0) return pinnedDiff;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        })
    );
  };

  const openArtifactInChat = (row: SavedArtifactRow, artifact: ArtifactPayload) => {
    launchChatWith(
      `Analyze the saved analytics artifact "${row.title}" and tell me what action I should take next.`,
      {
        type: 'saved_analytics_artifact',
        artifactId: row.id,
        title: row.title,
        originalPrompt: artifact.originalPrompt,
        chartType: artifact.chartType,
        rowCount: artifact.rowCount,
        queryConfig: artifact.config,
        dataPreview: artifact.data.slice(0, 8),
      }
    );
  };

  const refineArtifact = (row: SavedArtifactRow, artifact: ArtifactPayload) => {
    launchChatWith(
      `Refine the saved analytics artifact "${row.title}". Ask what I want changed if my requested refinement is not already clear, then generate the updated artifact.`,
      {
        type: 'saved_analytics_artifact_refinement',
        artifactId: row.id,
        title: row.title,
        originalPrompt: artifact.originalPrompt,
        chartType: artifact.chartType,
        queryConfig: artifact.config,
        dataPreview: artifact.data.slice(0, 8),
      }
    );
  };

  const refreshSavedArtifact = async (row: SavedArtifactRow) => {
    if (!user?.id) return;

    const prompt = row.original_prompt || row.title;
    if (!prompt.trim()) {
      toast.error('This artifact does not have a prompt to rerun');
      return;
    }

    try {
      setRefreshingId(row.id);
      const refreshed = await generateArtifact(prompt, undefined, organizationId || undefined);
      if (!refreshed) return;

      const { data, error } = await supabase
        .from('saved_artifacts')
        .update({
          title: refreshed.title,
          original_prompt: refreshed.originalPrompt,
          query_config: toJson(refreshed.config),
          chart_config: toJson(refreshed.chartConfig || {}),
          last_result: toJson({
            data: refreshed.data,
            rowCount: refreshed.rowCount,
            summary: refreshed.summary,
            executionTimeMs: refreshed.executionTimeMs,
            provider: refreshed.provider,
            model: refreshed.model,
          }),
          organization_id: row.organization_id || organizationId,
          last_refreshed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('user_id', user.id)
        .select(SAVED_ARTIFACT_SELECT)
        .single();

      if (error) throw error;
      updateLocalRow(data as SavedArtifactRow);
      toast.success('Saved analytics refreshed');
    } catch (error) {
      console.error('[SavedArtifactsLibrary] Failed to refresh artifact:', error);
      toast.error('Failed to refresh saved analytics');
    } finally {
      setRefreshingId(null);
    }
  };

  const toggleSavedFlag = async (row: SavedArtifactRow, field: 'is_pinned' | 'is_shared') => {
    if (!user?.id) return;
    if (field === 'is_shared' && !row.organization_id && !organizationId) {
      toast.error('Join an organization before sharing saved analytics');
      return;
    }

    try {
      setUpdatingId(`${row.id}:${field}`);
      const { data, error } = await supabase
        .from('saved_artifacts')
        .update({
          [field]: !row[field],
          organization_id: field === 'is_shared' ? row.organization_id || organizationId : row.organization_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
        .eq('user_id', user.id)
        .select(SAVED_ARTIFACT_SELECT)
        .single();

      if (error) throw error;
      updateLocalRow(data as SavedArtifactRow);
    } catch (error) {
      console.error('[SavedArtifactsLibrary] Failed to update artifact:', error);
      toast.error('Failed to update saved analytics');
    } finally {
      setUpdatingId(null);
    }
  };

  const deleteSavedArtifact = async (row: SavedArtifactRow) => {
    if (!user?.id) return;
    if (!window.confirm(`Delete "${row.title}" from saved analytics?`)) return;

    try {
      setDeletingId(row.id);
      const { error } = await supabase
        .from('saved_artifacts')
        .delete()
        .eq('id', row.id)
        .eq('user_id', user.id);

      if (error) throw error;
      setArtifacts(current => current.filter(item => item.id !== row.id));
      toast.success('Saved analytics deleted');
    } catch (error) {
      console.error('[SavedArtifactsLibrary] Failed to delete artifact:', error);
      toast.error('Failed to delete saved analytics');
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Saved Analytics</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[0, 1].map(index => (
            <Skeleton key={index} className="h-[280px] w-full" />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <BookmarkCheck className="h-5 w-5 text-primary" />
              Saved Analytics
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Retrieve, refresh, refine, and share custom dashboards generated from CRM data.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => launchChatWith(
              'Create a custom analytics artifact from my CRM data. Ask what pipeline question I want answered, then generate the artifact so I can save and refine it later.',
              { type: 'analytics_artifact_library', organizationId }
            )}
          >
            <Plus className="h-4 w-4" />
            Generate with AI
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {artifactItems.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center">
            <BookmarkCheck className="mx-auto h-10 w-10 text-muted-foreground/60" />
            <h3 className="mt-3 text-base font-semibold">No saved analytics yet</h3>
            <p className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
              Generate a dashboard in chat, save it from the artifact card, and it will appear here for reruns and refinement.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {artifactItems.map(({ row, artifact }) => {
              const isOwner = row.user_id === user?.id;
              const isRefreshing = refreshingId === row.id || (isGenerating && refreshingId === row.id);
              const isPinUpdating = updatingId === `${row.id}:is_pinned`;
              const isShareUpdating = updatingId === `${row.id}:is_shared`;

              return (
                <div key={row.id} className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    {row.is_pinned && <Badge variant="secondary">Pinned</Badge>}
                    {row.is_shared && <Badge variant="outline">Shared with org</Badge>}
                    {!isOwner && <Badge variant="outline">Shared by teammate</Badge>}
                    <span>Updated {formatTimestamp(row.updated_at)}</span>
                  </div>

                  <ArtifactCard
                    artifact={artifact}
                    compact
                    onRefresh={isOwner && !isRefreshing ? () => void refreshSavedArtifact(row) : undefined}
                    onExport={() => exportArtifact(artifact, 'csv')}
                  />

                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openArtifactInChat(row, artifact)}
                    >
                      <MessageSquare className="h-4 w-4" />
                      Analyze
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refineArtifact(row, artifact)}
                    >
                      <Wand2 className="h-4 w-4" />
                      Refine
                    </Button>
                    {isOwner && (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isRefreshing}
                        onClick={() => void refreshSavedArtifact(row)}
                      >
                        {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                        Refresh
                      </Button>
                    )}
                    {isOwner && (organizationId || row.organization_id) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isPinUpdating}
                        onClick={() => void toggleSavedFlag(row, 'is_pinned')}
                      >
                        {row.is_pinned ? <PinOff className="h-4 w-4" /> : <Pin className="h-4 w-4" />}
                        {row.is_pinned ? 'Unpin' : 'Pin'}
                      </Button>
                    )}
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isShareUpdating}
                        onClick={() => void toggleSavedFlag(row, 'is_shared')}
                      >
                        <Share2 className="h-4 w-4" />
                        {row.is_shared ? 'Unshare' : 'Share'}
                      </Button>
                    )}
                    {isOwner && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={deletingId === row.id}
                        onClick={() => void deleteSavedArtifact(row)}
                      >
                        {deletingId === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        Delete
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default SavedArtifactsLibrary;
