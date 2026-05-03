import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { toast } from 'sonner';
import {
  Zap,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  ArrowRight,
  Play,
  Pause,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

interface WorkflowRule {
  id: string;
  name: string;
  trigger_entity: string;
  trigger_event: string;
  trigger_condition: string;
  trigger_value: string;
  action_type: string;
  action_config: Record<string, string>;
  is_active: boolean;
}

const TRIGGERS = [
  { entity: 'deals', event: 'stage_change', label: 'Deal stage changes' },
  { entity: 'deals', event: 'created', label: 'Deal created' },
  { entity: 'deals', event: 'amount_change', label: 'Deal amount changes' },
  { entity: 'contacts', event: 'created', label: 'Contact created' },
  { entity: 'contacts', event: 'status_change', label: 'Contact status changes' },
  { entity: 'activities', event: 'created', label: 'Activity logged' },
  { entity: 'tasks', event: 'completed', label: 'Task completed' },
  { entity: 'tasks', event: 'overdue', label: 'Task becomes overdue' },
];

const ACTIONS = [
  { type: 'create_task', label: 'Create a task' },
  { type: 'send_notification', label: 'Send notification' },
  { type: 'update_field', label: 'Update a field' },
  { type: 'create_activity', label: 'Log an activity' },
  { type: 'assign_to', label: 'Assign to user' },
];

const WorkflowBuilder: React.FC = () => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [rules, setRules] = useState<WorkflowRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<WorkflowRule | null>(null);

  useEffect(() => {
    if (organizationId) loadRules();
  }, [organizationId]);

  const loadRules = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('workflow_rules')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      setRules((data as WorkflowRule[]) || []);
    } catch (err) {
      // Table might not exist yet - that's fine, show empty state
      setRules([]);
    } finally {
      setLoading(false);
    }
  };

  const createNew = () => {
    setEditing({
      id: '',
      name: '',
      trigger_entity: 'deals',
      trigger_event: 'stage_change',
      trigger_condition: 'equals',
      trigger_value: '',
      action_type: 'create_task',
      action_config: {},
      is_active: true,
    });
  };

  const saveRule = async () => {
    if (!editing || !organizationId) return;
    try {
      if (editing.id) {
        await supabase
          .from('workflow_rules')
          .update({
            name: editing.name,
            trigger_entity: editing.trigger_entity,
            trigger_event: editing.trigger_event,
            trigger_condition: editing.trigger_condition,
            trigger_value: editing.trigger_value,
            action_type: editing.action_type,
            action_config: editing.action_config,
            is_active: editing.is_active,
          })
          .eq('id', editing.id);
      } else {
        await supabase
          .from('workflow_rules')
          .insert({
            organization_id: organizationId,
            name: editing.name,
            trigger_entity: editing.trigger_entity,
            trigger_event: editing.trigger_event,
            trigger_condition: editing.trigger_condition,
            trigger_value: editing.trigger_value,
            action_type: editing.action_type,
            action_config: editing.action_config,
            is_active: editing.is_active,
          });
      }
      toast.success('Workflow saved');
      setEditing(null);
      loadRules();
    } catch (err) {
      toast.error('Failed to save workflow. The workflow engine will be available after the next database migration.');
    }
  };

  const deleteRule = async (id: string) => {
    try {
      await supabase.from('workflow_rules').delete().eq('id', id);
      toast.success('Workflow deleted');
      loadRules();
    } catch {
      toast.error('Failed to delete');
    }
  };

  const toggleRule = async (id: string, isActive: boolean) => {
    try {
      await supabase.from('workflow_rules').update({ is_active: isActive }).eq('id', id);
      loadRules();
    } catch {
      toast.error('Failed to toggle');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Workflow Automation</h1>
          <p className="text-muted-foreground">Create rules: If X happens, then do Y</p>
        </div>
        <Button onClick={createNew}>
          <Plus className="h-4 w-4 mr-2" />
          New Workflow
        </Button>
      </div>

      {/* Editor */}
      {editing && (
        <Card>
          <CardHeader>
            <CardTitle>{editing.id ? 'Edit Workflow' : 'New Workflow'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Workflow name"
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
            />
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">When (trigger)</label>
                <Select
                  value={`${editing.trigger_entity}:${editing.trigger_event}`}
                  onValueChange={(v) => {
                    const [entity, event] = v.split(':');
                    setEditing({ ...editing, trigger_entity: entity, trigger_event: event });
                  }}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TRIGGERS.map(t => (
                      <SelectItem key={`${t.entity}:${t.event}`} value={`${t.entity}:${t.event}`}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="Condition value (e.g., stage name)"
                  value={editing.trigger_value}
                  onChange={(e) => setEditing({ ...editing, trigger_value: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Then (action)</label>
                <Select
                  value={editing.action_type}
                  onValueChange={(v) => setEditing({ ...editing, action_type: v })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ACTIONS.map(a => (
                      <SelectItem key={a.type} value={a.type}>{a.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editing.action_type === 'create_task' && (
                  <Input
                    placeholder="Task title"
                    value={editing.action_config.task_title || ''}
                    onChange={(e) => setEditing({
                      ...editing,
                      action_config: { ...editing.action_config, task_title: e.target.value }
                    })}
                  />
                )}
                {editing.action_type === 'send_notification' && (
                  <Input
                    placeholder="Notification message"
                    value={editing.action_config.message || ''}
                    onChange={(e) => setEditing({
                      ...editing,
                      action_config: { ...editing.action_config, message: e.target.value }
                    })}
                  />
                )}
              </div>
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button>
              <Button onClick={saveRule} disabled={!editing.name}>
                <Save className="h-4 w-4 mr-2" />
                Save Workflow
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Rules List */}
      {rules.length === 0 && !editing ? (
        <EmptyState
          icon={Zap}
          title="No workflows yet"
          description="Create your first automation rule to streamline your sales process."
          actionLabel="Create Workflow"
          onAction={createNew}
        />
      ) : (
        <div className="space-y-3">
          {rules.map(rule => (
            <Card key={rule.id}>
              <CardContent className="py-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={rule.is_active}
                      onCheckedChange={(v) => toggleRule(rule.id, v)}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{rule.name}</span>
                        {rule.is_active ? (
                          <Badge variant="default" className="text-xs">Active</Badge>
                        ) : (
                          <Badge variant="secondary" className="text-xs">Paused</Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        <span>When {rule.trigger_entity} {rule.trigger_event}</span>
                        <ArrowRight className="h-3 w-3" />
                        <span>{ACTIONS.find(a => a.type === rule.action_type)?.label || rule.action_type}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(rule)}>Edit</Button>
                    <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteRule(rule.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
};

export default WorkflowBuilder;
