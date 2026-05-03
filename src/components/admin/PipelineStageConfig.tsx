import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';
import {
  Plus,
  Trash2,
  GripVertical,
  Save,
  RefreshCw,
  Settings,
  ArrowUp,
  ArrowDown,
} from 'lucide-react';

interface PipelineStage {
  id: string;
  name: string;
  probability: number;
  position: number;
  is_closed: boolean;
  is_won: boolean;
}

const DEFAULT_STAGES: PipelineStage[] = [
  { id: 'prospecting', name: 'Prospecting', probability: 10, position: 0, is_closed: false, is_won: false },
  { id: 'qualification', name: 'Qualification', probability: 20, position: 1, is_closed: false, is_won: false },
  { id: 'engaged', name: 'Engaged', probability: 40, position: 2, is_closed: false, is_won: false },
  { id: 'proposal', name: 'Proposal', probability: 60, position: 3, is_closed: false, is_won: false },
  { id: 'negotiating', name: 'Negotiating', probability: 80, position: 4, is_closed: false, is_won: false },
  { id: 'closed_won', name: 'Closed Won', probability: 100, position: 5, is_closed: true, is_won: true },
  { id: 'closed_lost', name: 'Closed Lost', probability: 0, position: 6, is_closed: true, is_won: false },
];

const PipelineStageConfig: React.FC = () => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (organizationId) loadStages();
  }, [organizationId]);

  const loadStages = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('pipeline_stages')
        .select('*')
        .eq('organization_id', organizationId)
        .order('position', { ascending: true });

      if (data && data.length > 0) {
        setStages(data as PipelineStage[]);
      } else {
        // Use defaults if no custom stages
        setStages(DEFAULT_STAGES);
      }
    } catch (err) {
      console.error('Failed to load stages:', err);
      setStages(DEFAULT_STAGES);
    } finally {
      setLoading(false);
    }
  };

  const saveStages = async () => {
    if (!organizationId) return;
    setSaving(true);
    try {
      // Delete existing and re-insert
      await supabase
        .from('pipeline_stages')
        .delete()
        .eq('organization_id', organizationId);

      const { error } = await supabase
        .from('pipeline_stages')
        .insert(stages.map((s, i) => ({
          organization_id: organizationId,
          name: s.name,
          probability: s.probability,
          position: i,
          is_closed: s.is_closed,
          is_won: s.is_won,
        })));

      if (error) throw error;
      toast.success('Pipeline stages saved');
      setHasChanges(false);
      loadStages();
    } catch (err) {
      console.error('Failed to save stages:', err);
      toast.error('Failed to save pipeline stages');
    } finally {
      setSaving(false);
    }
  };

  const addStage = () => {
    const closedIdx = stages.findIndex(s => s.is_closed);
    const newStage: PipelineStage = {
      id: `stage_${Date.now()}`,
      name: 'New Stage',
      probability: 50,
      position: closedIdx >= 0 ? closedIdx : stages.length,
      is_closed: false,
      is_won: false,
    };
    const updated = [...stages];
    updated.splice(closedIdx >= 0 ? closedIdx : stages.length, 0, newStage);
    setStages(updated);
    setHasChanges(true);
  };

  const removeStage = (idx: number) => {
    if (stages[idx].is_closed) {
      toast.error('Cannot remove closed stages');
      return;
    }
    setStages(stages.filter((_, i) => i !== idx));
    setHasChanges(true);
  };

  const moveStage = (idx: number, direction: 'up' | 'down') => {
    const newIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= stages.length) return;
    if (stages[idx].is_closed || stages[newIdx].is_closed) return;
    const updated = [...stages];
    [updated[idx], updated[newIdx]] = [updated[newIdx], updated[idx]];
    setStages(updated);
    setHasChanges(true);
  };

  const updateStage = (idx: number, field: keyof PipelineStage, value: any) => {
    const updated = [...stages];
    (updated[idx] as any)[field] = value;
    setStages(updated);
    setHasChanges(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading pipeline configuration...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Pipeline Stages</h1>
          <p className="text-muted-foreground">Configure deal stages, probabilities, and order</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addStage}>
            <Plus className="h-4 w-4 mr-2" />
            Add Stage
          </Button>
          {hasChanges && (
            <Button onClick={saveStages} disabled={saving}>
              {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
              Save Changes
            </Button>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Stage Configuration
          </CardTitle>
          <CardDescription>
            Drag to reorder. Each stage has a default probability used for new deals.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {stages.map((stage, idx) => (
              <div
                key={stage.id || idx}
                className={`flex items-center gap-3 p-3 border rounded-lg ${stage.is_closed ? 'bg-muted/50' : 'bg-card'}`}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveStage(idx, 'up')}
                    disabled={idx === 0 || stage.is_closed}
                  >
                    <ArrowUp className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => moveStage(idx, 'down')}
                    disabled={idx >= stages.length - 1 || stage.is_closed}
                  >
                    <ArrowDown className="h-3 w-3" />
                  </Button>
                </div>
                <Badge variant="outline" className="w-8 text-center flex-shrink-0">{idx + 1}</Badge>
                <Input
                  value={stage.name}
                  onChange={(e) => updateStage(idx, 'name', e.target.value)}
                  className="flex-1"
                  disabled={stage.is_closed}
                />
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Input
                    type="number"
                    value={stage.probability}
                    onChange={(e) => updateStage(idx, 'probability', parseInt(e.target.value) || 0)}
                    className="w-20"
                    disabled={stage.is_closed}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
                {stage.is_closed ? (
                  <Badge variant={stage.is_won ? 'default' : 'destructive'}>
                    {stage.is_won ? 'Won' : 'Lost'}
                  </Badge>
                ) : (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => removeStage(idx)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default PipelineStageConfig;
