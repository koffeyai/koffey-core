import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { UserContentPreferences, DEFAULT_PREFERENCES } from '@/types/user-preferences';

export function useUserContentPreferences() {
  const [preferences, setPreferences] = useState<Partial<UserContentPreferences>>(DEFAULT_PREFERENCES);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const fetchPreferences = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('user_prompt_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching preferences:', error);
      }

      if (data) {
        // Cast database values to proper types
        const rawData = data as Record<string, any>;
        setPreferences({
          id: rawData.id,
          user_id: rawData.user_id,
          tone: (rawData.tone || 'professional') as UserContentPreferences['tone'],
          verbosity: (rawData.verbosity || 'balanced') as UserContentPreferences['verbosity'],
          format_preference: (rawData.format_preference || 'mixed') as UserContentPreferences['format_preference'],
          custom_instructions: rawData.custom_instructions,
          communication_style: (rawData.communication_style || 'professional') as UserContentPreferences['communication_style'],
          energy_level: (rawData.energy_level || 'balanced') as UserContentPreferences['energy_level'],
          signature_phrases: rawData.signature_phrases || [],
          avoid_phrases: rawData.avoid_phrases || [],
          rep_title: rawData.rep_title,
          rep_bio: rawData.rep_bio,
          rep_photo_path: rawData.rep_photo_path,
          rep_linkedin_url: rawData.rep_linkedin_url,
          rep_calendar_url: rawData.rep_calendar_url,
          updated_at: rawData.updated_at,
        });
      }
    } catch (err) {
      console.error('Failed to fetch preferences:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPreferences();
  }, [fetchPreferences]);

  const updatePreference = useCallback(<K extends keyof UserContentPreferences>(
    key: K, 
    value: UserContentPreferences[K]
  ) => {
    setPreferences(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  }, []);

  const save = useCallback(async () => {
    setIsSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('user_prompt_preferences')
        .upsert({
          user_id: user.id,
          tone: preferences.tone,
          verbosity: preferences.verbosity,
          format_preference: preferences.format_preference,
          custom_instructions: preferences.custom_instructions,
          communication_style: preferences.communication_style,
          energy_level: preferences.energy_level,
          signature_phrases: preferences.signature_phrases,
          avoid_phrases: preferences.avoid_phrases,
          rep_title: preferences.rep_title,
          rep_bio: preferences.rep_bio,
          rep_photo_path: preferences.rep_photo_path,
          rep_linkedin_url: preferences.rep_linkedin_url,
          rep_calendar_url: preferences.rep_calendar_url,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id' });

      if (error) throw error;

      setHasChanges(false);
      toast({
        title: 'Settings saved',
        description: 'Your preferences have been updated.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to save preferences.',
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  }, [preferences]);

  const uploadPhoto = useCallback(async (file: File): Promise<string | null> => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Validate file
      if (!file.type.startsWith('image/')) {
        throw new Error('Please upload an image file');
      }
      if (file.size > 2 * 1024 * 1024) {
        throw new Error('Image must be less than 2MB');
      }

      const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${user.id}/avatar.${fileExt}`;

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('user-photos')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('user-photos')
        .getPublicUrl(filePath);

      // Update preference
      updatePreference('rep_photo_path', filePath);

      toast({
        title: 'Photo uploaded',
        description: 'Your profile photo has been updated.',
      });

      return publicUrl;
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err.message || 'Failed to upload photo.',
        variant: 'destructive',
      });
      return null;
    }
  }, [updatePreference]);

  const deletePhoto = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      if (preferences.rep_photo_path) {
        await supabase.storage
          .from('user-photos')
          .remove([preferences.rep_photo_path]);
      }

      updatePreference('rep_photo_path', null);

      toast({
        title: 'Photo removed',
        description: 'Your profile photo has been deleted.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to remove photo.',
        variant: 'destructive',
      });
    }
  }, [preferences.rep_photo_path, updatePreference]);

  const getPhotoUrl = useCallback(() => {
    if (!preferences.rep_photo_path) return null;
    const { data: { publicUrl } } = supabase.storage
      .from('user-photos')
      .getPublicUrl(preferences.rep_photo_path);
    return publicUrl;
  }, [preferences.rep_photo_path]);

  return {
    preferences,
    isLoading,
    isSaving,
    hasChanges,
    updatePreference,
    save,
    uploadPhoto,
    deletePhoto,
    getPhotoUrl,
    refetch: fetchPreferences,
  };
}
