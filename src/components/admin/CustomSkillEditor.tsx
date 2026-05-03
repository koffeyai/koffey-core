import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Pencil, Trash2, Zap, X, Info } from 'lucide-react';
import { useCustomSkills, CustomSkill, CreateCustomSkillInput, CustomSkillParam } from '@/hooks/useCustomSkills';

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_')
    .substring(0, 50);
}

interface SkillFormState {
  display_name: string;
  skill_name: string;
  description: string;
  instructions: string;
  parameters: CustomSkillParam[];
  trigger_examples: string[];
  is_active: boolean;
}

const EMPTY_FORM: SkillFormState = {
  display_name: '',
  skill_name: '',
  description: '',
  instructions: '',
  parameters: [],
  trigger_examples: [],
  is_active: true,
};

export const CustomSkillEditor: React.FC = () => {
  const { skills, isLoading, isSaving, create, update, remove } = useCustomSkills();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<SkillFormState>(EMPTY_FORM);
  const [autoSlug, setAutoSlug] = useState(true);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [triggerInput, setTriggerInput] = useState('');

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setAutoSlug(true);
    setDialogOpen(true);
  };

  const openEdit = (skill: CustomSkill) => {
    setEditingId(skill.id);
    setForm({
      display_name: skill.display_name,
      skill_name: skill.skill_name,
      description: skill.description,
      instructions: skill.instructions,
      parameters: skill.parameters || [],
      trigger_examples: skill.trigger_examples || [],
      is_active: skill.is_active,
    });
    setAutoSlug(false);
    setDialogOpen(true);
  };

  const handleDisplayNameChange = (value: string) => {
    setForm(prev => ({
      ...prev,
      display_name: value,
      ...(autoSlug ? { skill_name: slugify(value) } : {}),
    }));
  };

  const handleSkillNameChange = (value: string) => {
    setAutoSlug(false);
    setForm(prev => ({ ...prev, skill_name: value.toLowerCase().replace(/[^a-z0-9_]/g, '') }));
  };

  const addParam = () => {
    setForm(prev => ({
      ...prev,
      parameters: [...prev.parameters, { name: '', type: 'string', description: '', required: false }],
    }));
  };

  const updateParam = (index: number, field: keyof CustomSkillParam, value: any) => {
    setForm(prev => ({
      ...prev,
      parameters: prev.parameters.map((p, i) => i === index ? { ...p, [field]: value } : p),
    }));
  };

  const removeParam = (index: number) => {
    setForm(prev => ({
      ...prev,
      parameters: prev.parameters.filter((_, i) => i !== index),
    }));
  };

  const addTriggerExample = () => {
    const trimmed = triggerInput.trim();
    if (trimmed && !form.trigger_examples.includes(trimmed)) {
      setForm(prev => ({
        ...prev,
        trigger_examples: [...prev.trigger_examples, trimmed],
      }));
      setTriggerInput('');
    }
  };

  const removeTriggerExample = (index: number) => {
    setForm(prev => ({
      ...prev,
      trigger_examples: prev.trigger_examples.filter((_, i) => i !== index),
    }));
  };

  const handleSave = async () => {
    if (!form.skill_name || !form.display_name || !form.description || !form.instructions) return;

    const cleanParams = form.parameters.filter(p => p.name.trim() !== '');

    if (editingId) {
      const result = await update(editingId, {
        skill_name: form.skill_name,
        display_name: form.display_name,
        description: form.description,
        instructions: form.instructions,
        parameters: cleanParams,
        trigger_examples: form.trigger_examples,
        is_active: form.is_active,
      });
      if (result) setDialogOpen(false);
    } else {
      const input: CreateCustomSkillInput = {
        skill_name: form.skill_name,
        display_name: form.display_name,
        description: form.description,
        instructions: form.instructions,
        parameters: cleanParams,
        trigger_examples: form.trigger_examples,
        is_active: form.is_active,
      };
      const result = await create(input);
      if (result) setDialogOpen(false);
    }
  };

  const handleToggleActive = async (skill: CustomSkill) => {
    await update(skill.id, { is_active: !skill.is_active });
  };

  const handleDelete = async () => {
    if (deleteId) {
      await remove(deleteId);
      setDeleteId(null);
    }
  };

  const isFormValid = form.skill_name.length >= 2 && form.display_name.trim() !== '' && form.description.trim() !== '' && form.instructions.trim() !== '';

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          Loading custom skills...
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header notice */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg px-4 py-2">
        <Info className="h-4 w-4 shrink-0" />
        Changes take up to 60 seconds to take effect in Scout conversations.
      </div>

      {skills.length === 0 ? (
        /* Empty state */
        <Card>
          <CardContent className="p-12 text-center">
            <Zap className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Create your first custom skill</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Custom skills let you teach Scout organization-specific knowledge — competitor battlecards,
              objection handling playbooks, company processes, and more.
            </p>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Custom Skill
            </Button>
          </CardContent>
        </Card>
      ) : (
        /* List view */
        <>
          <div className="flex justify-end">
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4 mr-2" />
              Create Skill
            </Button>
          </div>

          <div className="grid gap-4">
            {skills.map(skill => (
              <Card key={skill.id}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{skill.display_name}</h4>
                        <Badge variant="outline" className="font-mono text-xs">
                          custom_{skill.skill_name}
                        </Badge>
                        {!skill.is_active && (
                          <Badge variant="secondary">Inactive</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {skill.description}
                      </p>
                      {skill.parameters.length > 0 && (
                        <div className="flex gap-1 mt-2">
                          {skill.parameters.map((p, i) => (
                            <Badge key={i} variant="secondary" className="text-xs">
                              {p.name}: {p.type}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Switch
                        checked={skill.is_active}
                        onCheckedChange={() => handleToggleActive(skill)}
                      />
                      <Button variant="ghost" size="icon" onClick={() => openEdit(skill)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => setDeleteId(skill.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit Custom Skill' : 'Create Custom Skill'}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Display Name */}
            <div className="space-y-2">
              <Label htmlFor="display_name">Display Name</Label>
              <Input
                id="display_name"
                value={form.display_name}
                onChange={e => handleDisplayNameChange(e.target.value)}
                placeholder="Competitor Battlecard"
                maxLength={100}
              />
            </div>

            {/* Skill Name (slug) */}
            <div className="space-y-2">
              <Label htmlFor="skill_name">
                Skill Name <span className="text-muted-foreground font-normal">(tool slug)</span>
              </Label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground font-mono">custom_</span>
                <Input
                  id="skill_name"
                  value={form.skill_name}
                  onChange={e => handleSkillNameChange(e.target.value)}
                  placeholder="battlecard"
                  maxLength={50}
                  className="font-mono"
                />
              </div>
              {form.skill_name && !/^[a-z][a-z0-9_]*$/.test(form.skill_name) && (
                <p className="text-xs text-destructive">
                  Must start with a letter and contain only lowercase letters, numbers, and underscores.
                </p>
              )}
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">
                Description <span className="text-muted-foreground font-normal">({form.description.length}/500)</span>
              </Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={e => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Tells Scout when to use this skill. E.g., 'Use when the user asks about competitor positioning or battle cards'"
                rows={3}
                maxLength={500}
              />
              <p className="text-xs text-muted-foreground">
                This tells Scout WHEN to use this skill. Be specific about what triggers it.
              </p>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <Label htmlFor="instructions">
                Instructions <span className="text-muted-foreground font-normal">({form.instructions.length}/5000)</span>
              </Label>
              <Textarea
                id="instructions"
                value={form.instructions}
                onChange={e => setForm(prev => ({ ...prev, instructions: e.target.value }))}
                placeholder={"## Competitor Battlecard\n\n### vs Salesforce\n- We deploy 3x faster\n- No enterprise lock-in\n- Modern API-first architecture\n\n### vs HubSpot\n- Better sales intelligence\n- Native conversation extraction"}
                rows={8}
                maxLength={5000}
              />
              <p className="text-xs text-muted-foreground">
                The content Scout uses when this skill is triggered. Supports markdown formatting.
              </p>
            </div>

            {/* Parameters (optional) */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Parameters <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Button variant="outline" size="sm" onClick={addParam}>
                  <Plus className="h-3 w-3 mr-1" />
                  Add
                </Button>
              </div>
              {form.parameters.length === 0 ? (
                <p className="text-xs text-muted-foreground">
                  No parameters defined. A default "query" parameter will be used.
                </p>
              ) : (
                <div className="space-y-2">
                  {form.parameters.map((param, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <Input
                        value={param.name}
                        onChange={e => updateParam(i, 'name', e.target.value)}
                        placeholder="param_name"
                        className="flex-1 font-mono text-sm"
                      />
                      <Select
                        value={param.type}
                        onValueChange={val => updateParam(i, 'type', val)}
                      >
                        <SelectTrigger className="w-28">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="string">string</SelectItem>
                          <SelectItem value="number">number</SelectItem>
                          <SelectItem value="boolean">boolean</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        value={param.description}
                        onChange={e => updateParam(i, 'description', e.target.value)}
                        placeholder="Description"
                        className="flex-1 text-sm"
                      />
                      <div className="flex items-center gap-1">
                        <Switch
                          checked={param.required}
                          onCheckedChange={val => updateParam(i, 'required', val)}
                        />
                        <span className="text-xs text-muted-foreground w-6">Req</span>
                      </div>
                      <Button variant="ghost" size="icon" onClick={() => removeParam(i)} className="h-8 w-8">
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Trigger Examples */}
            <div className="space-y-2">
              <Label>Trigger Examples <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <div className="flex gap-2">
                <Input
                  value={triggerInput}
                  onChange={e => setTriggerInput(e.target.value)}
                  placeholder="What are our talking points against Salesforce?"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTriggerExample(); } }}
                  className="flex-1 text-sm"
                />
                <Button variant="outline" size="sm" onClick={addTriggerExample}>Add</Button>
              </div>
              {form.trigger_examples.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-1">
                  {form.trigger_examples.map((ex, i) => (
                    <Badge key={i} variant="secondary" className="text-xs pr-1">
                      {ex}
                      <button onClick={() => removeTriggerExample(i)} className="ml-1 hover:text-destructive">
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Active Toggle */}
            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={val => setForm(prev => ({ ...prev, is_active: val }))}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={isSaving || !isFormValid}>
              {isSaving ? 'Saving...' : editingId ? 'Save Changes' : 'Create Skill'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => { if (!open) setDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Custom Skill</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this custom skill. Scout will no longer be able to use it.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};
