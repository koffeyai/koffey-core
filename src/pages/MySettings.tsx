import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUserContentPreferences } from '@/hooks/useUserContentPreferences';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PhotoUpload } from '@/components/settings/PhotoUpload';
import { TagInput } from '@/components/settings/TagInput';
import { StyleSelector } from '@/components/settings/StyleSelector';
import { 
  COMMUNICATION_STYLES, 
  ENERGY_LEVELS,
  CommunicationStyle,
  EnergyLevel
} from '@/types/user-preferences';
import {
  ArrowLeft,
  Save,
  Loader2,
  User,
  MessageSquare,
  Mic,
  Bell,
  Link2
} from 'lucide-react';
import { IntegrationsSettings } from '@/components/settings/IntegrationsSettings';
import { MessagingSetup } from '@/components/settings/MessagingSetup';

const TONE_OPTIONS = [
  { value: 'casual', label: 'Casual', description: 'Relaxed and informal' },
  { value: 'professional', label: 'Professional', description: 'Business-appropriate' },
  { value: 'friendly', label: 'Friendly', description: 'Warm and personable' },
  { value: 'concise', label: 'Concise', description: 'Brief and efficient' },
];

const VERBOSITY_OPTIONS = [
  { value: 'minimal', label: 'Minimal', description: 'Just the essentials' },
  { value: 'balanced', label: 'Balanced', description: 'Right amount of detail' },
  { value: 'comprehensive', label: 'Comprehensive', description: 'Full context included' },
];

export const MySettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const userInitial = (user?.email?.charAt(0) ?? 'U').toUpperCase();
  const {
    preferences,
    isLoading,
    isSaving,
    hasChanges,
    updatePreference,
    save,
    uploadPhoto,
    deletePhoto,
    getPhotoUrl,
  } = useUserContentPreferences();

  const [isUploading, setIsUploading] = useState(false);

  const handlePhotoUpload = async (file: File) => {
    setIsUploading(true);
    await uploadPhoto(file);
    setIsUploading(false);
    return null;
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-card sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/app')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-xl font-semibold">My Settings</h1>
          </div>
          
          <Button
            onClick={save}
            disabled={isSaving || !hasChanges}
          >
            {isSaving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-4 py-8">
        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-5 lg:w-auto lg:inline-grid">
            <TabsTrigger value="profile" className="gap-2">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Profile</span>
            </TabsTrigger>
            <TabsTrigger value="integrations" className="gap-2">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Integrations</span>
            </TabsTrigger>
            <TabsTrigger value="communication" className="gap-2">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Style</span>
            </TabsTrigger>
            <TabsTrigger value="voice" className="gap-2">
              <Mic className="h-4 w-4" />
              <span className="hidden sm:inline">Voice</span>
            </TabsTrigger>
            <TabsTrigger value="notifications" className="gap-2">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Alerts</span>
            </TabsTrigger>
          </TabsList>

          {/* Integrations Tab */}
          <TabsContent value="integrations" className="space-y-6">
            <IntegrationsSettings />
            <MessagingSetup />
          </TabsContent>

          {/* Profile & Identity Tab */}
          <TabsContent value="profile" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Profile & Identity</CardTitle>
                <CardDescription>
                  Your personal information used in presentations and outreach
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Photo Upload */}
                <div className="flex flex-col sm:flex-row gap-8 items-start">
                  <PhotoUpload
                    photoUrl={getPhotoUrl()}
                    fallbackInitial={userInitial}
                    onUpload={handlePhotoUpload}
                    onDelete={deletePhoto}
                    isUploading={isUploading}
                  />
                  
                  <div className="flex-1 space-y-4 w-full">
                    {/* Title */}
                    <div className="space-y-2">
                      <Label htmlFor="rep_title">Job Title</Label>
                      <Input
                        id="rep_title"
                        value={preferences.rep_title || ''}
                        onChange={(e) => updatePreference('rep_title', e.target.value || null)}
                        placeholder="e.g., Senior Account Executive"
                      />
                    </div>

                    {/* LinkedIn */}
                    <div className="space-y-2">
                      <Label htmlFor="rep_linkedin_url">LinkedIn Profile</Label>
                      <Input
                        id="rep_linkedin_url"
                        type="url"
                        value={preferences.rep_linkedin_url || ''}
                        onChange={(e) => updatePreference('rep_linkedin_url', e.target.value || null)}
                        placeholder="https://linkedin.com/in/yourprofile"
                      />
                    </div>

                    {/* Calendar */}
                    <div className="space-y-2">
                      <Label htmlFor="rep_calendar_url">Calendar Link</Label>
                      <Input
                        id="rep_calendar_url"
                        type="url"
                        value={preferences.rep_calendar_url || ''}
                        onChange={(e) => updatePreference('rep_calendar_url', e.target.value || null)}
                        placeholder="https://calendly.com/yourlink"
                      />
                    </div>
                  </div>
                </div>

                {/* Bio */}
                <div className="space-y-2">
                  <Label htmlFor="rep_bio">Personal Bio</Label>
                  <Textarea
                    id="rep_bio"
                    value={preferences.rep_bio || ''}
                    onChange={(e) => updatePreference('rep_bio', e.target.value || null)}
                    placeholder="A brief introduction about yourself for 'About' or 'Team' slides..."
                    className="min-h-[120px] resize-none"
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {(preferences.rep_bio?.length || 0)}/500 characters
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Communication Style Tab */}
          <TabsContent value="communication" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Communication Style</CardTitle>
                <CardDescription>
                  How the AI should frame your messages and presentations
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                {/* Communication Style */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Communication Approach</Label>
                  <StyleSelector
                    options={COMMUNICATION_STYLES}
                    value={preferences.communication_style || 'professional'}
                    onChange={(v) => updatePreference('communication_style', v as CommunicationStyle)}
                    columns={2}
                  />
                </div>

                {/* Tone */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Tone</Label>
                  <StyleSelector
                    options={TONE_OPTIONS}
                    value={preferences.tone || 'professional'}
                    onChange={(v) => updatePreference('tone', v as any)}
                    columns={2}
                  />
                </div>

                {/* Energy Level */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Energy Level</Label>
                  <StyleSelector
                    options={ENERGY_LEVELS}
                    value={preferences.energy_level || 'balanced'}
                    onChange={(v) => updatePreference('energy_level', v as EnergyLevel)}
                    columns={2}
                  />
                </div>

                {/* Verbosity */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Response Length</Label>
                  <StyleSelector
                    options={VERBOSITY_OPTIONS}
                    value={preferences.verbosity || 'balanced'}
                    onChange={(v) => updatePreference('verbosity', v as any)}
                    columns={3}
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Personal Voice Tab */}
          <TabsContent value="voice" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Personal Voice</CardTitle>
                <CardDescription>
                  Phrases and patterns that define your unique communication style
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Signature Phrases */}
                <div className="space-y-2">
                  <Label>Signature Phrases</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Phrases you naturally use that the AI should incorporate
                  </p>
                  <TagInput
                    value={preferences.signature_phrases || []}
                    onChange={(tags) => updatePreference('signature_phrases', tags)}
                    placeholder="e.g., 'Here's the thing...', 'Let me be direct...'"
                    maxTags={10}
                  />
                </div>

                {/* Avoid Phrases */}
                <div className="space-y-2">
                  <Label>Phrases to Avoid</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Words or phrases the AI should never use on your behalf
                  </p>
                  <TagInput
                    value={preferences.avoid_phrases || []}
                    onChange={(tags) => updatePreference('avoid_phrases', tags)}
                    placeholder="e.g., 'synergy', 'circle back', 'per my last email'"
                    maxTags={10}
                  />
                </div>

                {/* Custom Instructions */}
                <div className="space-y-2">
                  <Label htmlFor="custom_instructions">Custom Instructions</Label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Additional guidance for the AI when generating content for you
                  </p>
                  <Textarea
                    id="custom_instructions"
                    value={preferences.custom_instructions || ''}
                    onChange={(e) => updatePreference('custom_instructions', e.target.value || null)}
                    placeholder="e.g., 'Always include next steps', 'Use metric system for numbers', 'Reference customer success stories when relevant'"
                    className="min-h-[100px] resize-none"
                    maxLength={500}
                  />
                  <p className="text-xs text-muted-foreground text-right">
                    {(preferences.custom_instructions?.length || 0)}/500 characters
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Notifications Tab (Placeholder) */}
          <TabsContent value="notifications" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Notification Preferences</CardTitle>
                <CardDescription>
                  Manage how and when you receive alerts
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  <Bell className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Notification settings coming soon</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default MySettingsPage;
