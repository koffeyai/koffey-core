import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TagInput } from '@/components/settings/TagInput';
import { Trash2, UserCircle } from 'lucide-react';
import type { TargetPersona } from '@/types/company-profile';

interface TargetPersonaEditorProps {
  persona: TargetPersona;
  onChange: (persona: TargetPersona) => void;
  onRemove: () => void;
}

export const TargetPersonaEditor: React.FC<TargetPersonaEditorProps> = ({
  persona,
  onChange,
  onRemove
}) => {
  const handleChange = (field: keyof TargetPersona, value: string | string[]) => {
    onChange({ ...persona, [field]: value });
  };

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <UserCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Target Persona</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`persona-title-${persona.id}`}>Job Title</Label>
          <Input
            id={`persona-title-${persona.id}`}
            value={persona.title}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder="e.g., VP of Sales"
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`persona-desc-${persona.id}`}>Description</Label>
          <Textarea
            id={`persona-desc-${persona.id}`}
            value={persona.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Who are they? What are their priorities?"
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Pain Points</Label>
          <TagInput
            value={persona.pain_points || []}
            onChange={(painPoints) => handleChange('pain_points', painPoints)}
            placeholder="Add pain point and press Enter..."
            maxTags={6}
          />
        </div>
      </CardContent>
    </Card>
  );
};
