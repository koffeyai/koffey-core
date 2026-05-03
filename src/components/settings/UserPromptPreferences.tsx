import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Save, Loader2, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';

interface UserPrefs {
  tone: 'professional' | 'friendly' | 'concise' | 'detailed';
  verbosity: 'minimal' | 'balanced' | 'comprehensive';
  format_preference: 'bullet_points' | 'paragraphs' | 'mixed';
  custom_instructions: string | null;
}

const DEFAULT_PREFS: UserPrefs = {
  tone: 'professional',
  verbosity: 'balanced',
  format_preference: 'mixed',
  custom_instructions: null,
};

export const UserPromptPreferences: React.FC = () => {
  const [prefs, setPrefs] = useState<UserPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    fetchPreferences();
  }, []);

  const fetchPreferences = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from('user_prompt_preferences')
        .select('tone, verbosity, format_preference, custom_instructions')
        .eq('user_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching preferences:', error);
      }

      if (data) {
        setPrefs({
          tone: data.tone as UserPrefs['tone'],
          verbosity: data.verbosity as UserPrefs['verbosity'],
          format_preference: data.format_preference as UserPrefs['format_preference'],
          custom_instructions: data.custom_instructions,
        });
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_prompt_preferences')
        .upsert({
          user_id: user.id,
          tone: prefs.tone,
          verbosity: prefs.verbosity,
          format_preference: prefs.format_preference,
          custom_instructions: prefs.custom_instructions,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setHasChanges(false);
      toast({
        title: 'Preferences saved',
        description: 'Your AI communication style has been updated.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save preferences.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const updatePref = <K extends keyof UserPrefs>(key: K, value: UserPrefs[K]) => {
    setPrefs(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle>AI Communication Style</CardTitle>
        </div>
        <CardDescription>
          Customize how the AI assistant responds to you
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Tone Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Tone</Label>
          <RadioGroup
            value={prefs.tone}
            onValueChange={(v) => updatePref('tone', v as UserPrefs['tone'])}
            className="grid grid-cols-2 gap-3"
          >
            {[
              { value: 'professional', label: 'Professional', desc: 'Formal and business-focused' },
              { value: 'friendly', label: 'Friendly', desc: 'Warm and conversational' },
              { value: 'concise', label: 'Concise', desc: 'Brief and to-the-point' },
              { value: 'detailed', label: 'Detailed', desc: 'Thorough explanations' },
            ].map((option) => (
              <Label
                key={option.value}
                className={`flex items-start gap-3 p-3 border rounded-lg cursor-pointer transition-colors ${
                  prefs.tone === option.value 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <RadioGroupItem value={option.value} className="mt-0.5" />
                <div>
                  <div className="font-medium text-sm">{option.label}</div>
                  <div className="text-xs text-muted-foreground">{option.desc}</div>
                </div>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {/* Verbosity Selection */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Response Length</Label>
          <RadioGroup
            value={prefs.verbosity}
            onValueChange={(v) => updatePref('verbosity', v as UserPrefs['verbosity'])}
            className="grid grid-cols-3 gap-3"
          >
            {[
              { value: 'minimal', label: 'Minimal', desc: 'Just the essentials' },
              { value: 'balanced', label: 'Balanced', desc: 'Right amount of detail' },
              { value: 'comprehensive', label: 'Comprehensive', desc: 'Full context' },
            ].map((option) => (
              <Label
                key={option.value}
                className={`flex flex-col items-center text-center p-3 border rounded-lg cursor-pointer transition-colors ${
                  prefs.verbosity === option.value 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <RadioGroupItem value={option.value} className="sr-only" />
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{option.desc}</div>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {/* Format Preference */}
        <div className="space-y-3">
          <Label className="text-sm font-medium">Preferred Format</Label>
          <RadioGroup
            value={prefs.format_preference}
            onValueChange={(v) => updatePref('format_preference', v as UserPrefs['format_preference'])}
            className="grid grid-cols-3 gap-3"
          >
            {[
              { value: 'bullet_points', label: 'Bullets', desc: 'Lists & points' },
              { value: 'paragraphs', label: 'Paragraphs', desc: 'Flowing text' },
              { value: 'mixed', label: 'Mixed', desc: 'Context-dependent' },
            ].map((option) => (
              <Label
                key={option.value}
                className={`flex flex-col items-center text-center p-3 border rounded-lg cursor-pointer transition-colors ${
                  prefs.format_preference === option.value 
                    ? 'border-primary bg-primary/5' 
                    : 'border-border hover:border-muted-foreground/50'
                }`}
              >
                <RadioGroupItem value={option.value} className="sr-only" />
                <div className="font-medium text-sm">{option.label}</div>
                <div className="text-xs text-muted-foreground mt-1">{option.desc}</div>
              </Label>
            ))}
          </RadioGroup>
        </div>

        {/* Custom Instructions */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Custom Instructions</Label>
          <Textarea
            value={prefs.custom_instructions || ''}
            onChange={(e) => updatePref('custom_instructions', e.target.value || null)}
            placeholder="E.g., 'Always include next steps' or 'Use metric system for numbers'"
            className="min-h-[80px] resize-none"
            maxLength={500}
          />
          <p className="text-xs text-muted-foreground">
            {(prefs.custom_instructions?.length || 0)}/500 characters
          </p>
        </div>

        {/* Save Button */}
        <Button 
          onClick={handleSave} 
          disabled={saving || !hasChanges}
          className="w-full"
        >
          {saving ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="mr-2 h-4 w-4" />
              Save Preferences
            </>
          )}
        </Button>
      </CardContent>
    </Card>
  );
};
