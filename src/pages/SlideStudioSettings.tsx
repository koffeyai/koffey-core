import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Save, Upload, Loader2, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useNavigate } from 'react-router-dom';
import { SlideGenerationPreferences, BrandColors, FontPreferences } from '@/types/slides';

const FONT_OPTIONS = [
  'Arial',
  'Helvetica',
  'Inter',
  'Roboto',
  'Open Sans',
  'Lato',
  'Montserrat',
  'Poppins',
  'Playfair Display',
  'Georgia',
  'Times New Roman'
];

const DEFAULT_PREFERENCES: Partial<SlideGenerationPreferences> = {
  brand_colors: { primary: '#1a1a2e', secondary: '#16213e', accent: '#0f3460' },
  font_preferences: { heading: 'Inter', body: 'Inter', size_scale: 'default' },
  default_ai_model: 'gemini',
  style_keywords: ['modern', 'professional', 'clean']
};

export const SlideStudioSettings: React.FC = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { organizationId, isAdmin: orgIsAdmin, isManager, loading: orgLoading } = useOrganizationAccess();

  const isAdmin = orgIsAdmin || isManager;

  // Form state
  const [brandColors, setBrandColors] = useState<BrandColors>(DEFAULT_PREFERENCES.brand_colors!);
  const [fontPreferences, setFontPreferences] = useState<FontPreferences>(DEFAULT_PREFERENCES.font_preferences!);
  const [defaultAiModel, setDefaultAiModel] = useState<string>(DEFAULT_PREFERENCES.default_ai_model!);
  const [styleKeywords, setStyleKeywords] = useState<string[]>(DEFAULT_PREFERENCES.style_keywords!);
  const [newKeyword, setNewKeyword] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  // Fetch existing preferences
  const { data: preferences, isLoading } = useQuery({
    queryKey: ['slide-generation-preferences', organizationId],
    queryFn: async () => {
      if (!organizationId) return null;
      
      const { data, error } = await supabase
        .from('slide_generation_preferences')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle();
      
      if (error) throw error;
      return data as unknown as SlideGenerationPreferences | null;
    },
    enabled: !!organizationId
  });

  // Initialize form with fetched data
  useEffect(() => {
    if (preferences) {
      if (preferences.brand_colors) setBrandColors(preferences.brand_colors);
      if (preferences.font_preferences) setFontPreferences(preferences.font_preferences);
      if (preferences.default_ai_model) setDefaultAiModel(preferences.default_ai_model);
      if (preferences.style_keywords) setStyleKeywords(preferences.style_keywords);
      if (preferences.logo_storage_path) setLogoUrl(preferences.logo_storage_path);
    }
  }, [preferences]);

  // Save mutation
  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!organizationId) throw new Error('No organization');

      // Use any to bypass strict type checking for JSONB columns
      const payload: any = {
        organization_id: organizationId,
        brand_colors: brandColors,
        font_preferences: fontPreferences,
        default_ai_model: defaultAiModel,
        style_keywords: styleKeywords,
        logo_storage_path: logoUrl
      };

      if (preferences?.id) {
        const { error } = await supabase
          .from('slide_generation_preferences')
          .update(payload)
          .eq('id', preferences.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('slide_generation_preferences')
          .insert([payload]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast({ title: 'Settings saved', description: 'Your slide preferences have been updated.' });
      queryClient.invalidateQueries({ queryKey: ['slide-generation-preferences', organizationId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Save failed', description: error.message, variant: 'destructive' });
    }
  });

  const handleAddKeyword = () => {
    if (newKeyword.trim() && !styleKeywords.includes(newKeyword.trim())) {
      setStyleKeywords([...styleKeywords, newKeyword.trim()]);
      setNewKeyword('');
    }
  };

  const handleRemoveKeyword = (keyword: string) => {
    setStyleKeywords(styleKeywords.filter(k => k !== keyword));
  };

  if (!organizationId) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Please select an organization.</p>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="flex items-center justify-center h-96">
        <p className="text-muted-foreground">Admin access required.</p>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl mx-auto py-8 px-4">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <Button variant="ghost" size="icon" onClick={() => navigate('/slides')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Slide Studio Settings</h1>
          <p className="text-muted-foreground">Configure brand preferences for AI-generated slides</p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Brand Colors */}
          <Card>
            <CardHeader>
              <CardTitle>Brand Colors</CardTitle>
              <CardDescription>Colors used in AI-generated presentations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div className="space-y-2">
                  <Label>Primary</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={brandColors.primary}
                      onChange={(e) => setBrandColors({ ...brandColors, primary: e.target.value })}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={brandColors.primary}
                      onChange={(e) => setBrandColors({ ...brandColors, primary: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Secondary</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={brandColors.secondary}
                      onChange={(e) => setBrandColors({ ...brandColors, secondary: e.target.value })}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={brandColors.secondary}
                      onChange={(e) => setBrandColors({ ...brandColors, secondary: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Accent</Label>
                  <div className="flex gap-2">
                    <Input
                      type="color"
                      value={brandColors.accent}
                      onChange={(e) => setBrandColors({ ...brandColors, accent: e.target.value })}
                      className="w-12 h-10 p-1 cursor-pointer"
                    />
                    <Input
                      value={brandColors.accent}
                      onChange={(e) => setBrandColors({ ...brandColors, accent: e.target.value })}
                      className="font-mono"
                    />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Typography */}
          <Card>
            <CardHeader>
              <CardTitle>Typography</CardTitle>
              <CardDescription>Fonts used in generated slides</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Heading Font</Label>
                  <select
                    value={fontPreferences.heading}
                    onChange={(e) => setFontPreferences({ ...fontPreferences, heading: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {FONT_OPTIONS.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Body Font</Label>
                  <select
                    value={fontPreferences.body}
                    onChange={(e) => setFontPreferences({ ...fontPreferences, body: e.target.value })}
                    className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  >
                    {FONT_OPTIONS.map(font => (
                      <option key={font} value={font}>{font}</option>
                    ))}
                  </select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Company Logo */}
          <Card>
            <CardHeader>
              <CardTitle>Company Logo</CardTitle>
              <CardDescription>Logo used in generated presentations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="w-24 h-24 border-2 border-dashed rounded-lg flex items-center justify-center bg-muted/50">
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
                  ) : (
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  )}
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Enter logo URL..."
                    value={logoUrl || ''}
                    onChange={(e) => setLogoUrl(e.target.value || null)}
                  />
                  <p className="text-xs text-muted-foreground">
                    Enter a URL to your company logo, or upload to Supabase Storage
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Default AI Model */}
          <Card>
            <CardHeader>
              <CardTitle>Default AI Model</CardTitle>
              <CardDescription>Model used for generating slide content</CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup value={defaultAiModel} onValueChange={setDefaultAiModel}>
                <div className="flex items-start space-x-3 space-y-0">
                  <RadioGroupItem value="gemini" id="gemini" />
                  <div>
                    <Label htmlFor="gemini" className="font-normal cursor-pointer">Gemini</Label>
                    <p className="text-sm text-muted-foreground">Fast, good for structured content</p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 space-y-0 mt-3">
                  <RadioGroupItem value="claude" id="claude" />
                  <div>
                    <Label htmlFor="claude" className="font-normal cursor-pointer">Claude</Label>
                    <p className="text-sm text-muted-foreground">Best for nuanced business writing</p>
                  </div>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>

          {/* Style Keywords */}
          <Card>
            <CardHeader>
              <CardTitle>Style Keywords</CardTitle>
              <CardDescription>Words that describe your brand's presentation style</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2 mb-4">
                {styleKeywords.map(keyword => (
                  <Badge key={keyword} variant="secondary" className="pr-1">
                    {keyword}
                    <button
                      onClick={() => handleRemoveKeyword(keyword)}
                      className="ml-2 hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add keyword..."
                  value={newKeyword}
                  onChange={(e) => setNewKeyword(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleAddKeyword()}
                />
                <Button variant="outline" size="icon" onClick={handleAddKeyword}>
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Save Button */}
          <div className="flex justify-end">
            <Button 
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Save Preferences
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SlideStudioSettings;
