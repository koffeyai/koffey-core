import { useState, useEffect, useCallback, useMemo } from 'react';
import { useDebounce } from './useDebounce';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import type {
  SlotMappingType,
  SlideElementType,
  SlotFormatType,
} from '@/types/slides';

interface UseSlotMappingsOptions {
  templateId: string;
  organizationId: string;
  autoSaveDelayMs?: number;
}

interface LocalMapping {
  id?: string;
  elementId: string;
  slideIndex: number;
  elementType: SlideElementType;
  placeholderText?: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  slotName: string;
  mappingType: SlotMappingType;
  dataSource?: string;
  aiPrompt?: string;
  aiModel: string;
  aiMaxTokens: number;
  aiTemperature: number;
  conditionLogic?: { if: string; show: boolean };
  maxCharacters?: number;
  formatAs?: SlotFormatType;
  fallbackValue?: string;
  displayOrder: number;
  isDirty: boolean;
}

type SaveStatus = 'saved' | 'saving' | 'unsaved' | 'error';

export function useSlotMappings({
  templateId,
  organizationId,
  autoSaveDelayMs = 500,
}: UseSlotMappingsOptions) {
  const [mappings, setMappings] = useState<LocalMapping[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [error, setError] = useState<string | null>(null);

  // Track dirty mappings for auto-save
  const dirtyMappings = useMemo(
    () => mappings.filter((m) => m.isDirty),
    [mappings]
  );

  const debouncedDirtyMappings = useDebounce(dirtyMappings, autoSaveDelayMs);

  // Load existing mappings
  useEffect(() => {
    async function loadMappings() {
      try {
        setIsLoading(true);
        setError(null);

        const { data, error: fetchError } = await supabase
          .from('template_slot_mappings')
          .select('*')
          .eq('template_id', templateId)
          .order('slide_index', { ascending: true })
          .order('display_order', { ascending: true });

        if (fetchError) throw fetchError;

        const loadedMappings: LocalMapping[] = (data || []).map((m: any) => ({
          id: m.id,
          elementId: m.element_id,
          slideIndex: m.slide_index,
          elementType: m.element_type as SlideElementType,
          placeholderText: m.placeholder_text,
          boundingBox: m.bounding_box,
          slotName: m.slot_name,
          mappingType: m.mapping_type as SlotMappingType,
          dataSource: m.data_source,
          aiPrompt: m.ai_prompt,
          aiModel: m.ai_model || 'claude',
          aiMaxTokens: m.ai_max_tokens || 150,
          aiTemperature: m.ai_temperature || 0.7,
          conditionLogic: m.condition_logic,
          maxCharacters: m.max_characters,
          formatAs: m.format_as as SlotFormatType | undefined,
          fallbackValue: m.fallback_value,
          displayOrder: m.display_order || 0,
          isDirty: false,
        }));

        setMappings(loadedMappings);
      } catch (err) {
        console.error('Error loading mappings:', err);
        setError('Failed to load mappings');
        toast.error('Failed to load slot mappings');
      } finally {
        setIsLoading(false);
      }
    }

    if (templateId) {
      loadMappings();
    }
  }, [templateId]);

  // Auto-save dirty mappings
  useEffect(() => {
    async function autoSave() {
      if (debouncedDirtyMappings.length === 0) return;

      setSaveStatus('saving');

      try {
        for (const mapping of debouncedDirtyMappings) {
          const payload: any = {
            template_id: templateId,
            slide_index: mapping.slideIndex,
            element_id: mapping.elementId,
            element_type: mapping.elementType,
            placeholder_text: mapping.placeholderText,
            bounding_box: mapping.boundingBox ? JSON.parse(JSON.stringify(mapping.boundingBox)) : null,
            slot_name: mapping.slotName,
            mapping_type: mapping.mappingType,
            data_source: mapping.dataSource,
            ai_prompt: mapping.aiPrompt,
            ai_model: mapping.aiModel,
            ai_max_tokens: mapping.aiMaxTokens,
            ai_temperature: mapping.aiTemperature,
            condition_logic: mapping.conditionLogic ? JSON.parse(JSON.stringify(mapping.conditionLogic)) : null,
            max_characters: mapping.maxCharacters,
            format_as: mapping.formatAs,
            fallback_value: mapping.fallbackValue,
            display_order: mapping.displayOrder,
          };

          if (mapping.id) {
            // Update existing
            const { error: updateError } = await supabase
              .from('template_slot_mappings')
              .update(payload)
              .eq('id', mapping.id);

            if (updateError) throw updateError;
          } else {
            // Insert new
            const { data: insertData, error: insertError } = await supabase
              .from('template_slot_mappings')
              .insert(payload)
              .select('id')
              .single();

            if (insertError) throw insertError;

            // Update local mapping with new ID
            setMappings((prev) =>
              prev.map((m) =>
                m.elementId === mapping.elementId && m.slideIndex === mapping.slideIndex
                  ? { ...m, id: insertData.id, isDirty: false }
                  : m
              )
            );
          }
        }

        // Mark all as saved
        setMappings((prev) =>
          prev.map((m) => (m.isDirty ? { ...m, isDirty: false } : m))
        );

        setSaveStatus('saved');
      } catch (err) {
        console.error('Auto-save error:', err);
        setSaveStatus('error');
        toast.error('Failed to save mapping');
      }
    }

    autoSave();
  }, [debouncedDirtyMappings, templateId]);

  // Update or create a mapping
  const upsertMapping = useCallback(
    (
      elementId: string,
      slideIndex: number,
      updates: Partial<Omit<LocalMapping, 'elementId' | 'slideIndex' | 'isDirty'>>
    ) => {
      setMappings((prev) => {
        const existingIndex = prev.findIndex(
          (m) => m.elementId === elementId && m.slideIndex === slideIndex
        );

        if (existingIndex >= 0) {
          // Update existing
          const updated = [...prev];
          updated[existingIndex] = {
            ...updated[existingIndex],
            ...updates,
            isDirty: true,
          };
          return updated;
        } else {
          // Create new
          const newMapping: LocalMapping = {
            elementId,
            slideIndex,
            elementType: updates.elementType || 'text',
            slotName: updates.slotName || `Slot ${prev.length + 1}`,
            mappingType: updates.mappingType || 'direct',
            aiModel: updates.aiModel || 'claude',
            aiMaxTokens: updates.aiMaxTokens || 150,
            aiTemperature: updates.aiTemperature || 0.7,
            displayOrder: updates.displayOrder || prev.length,
            ...updates,
            isDirty: true,
          };
          return [...prev, newMapping];
        }
      });

      setSaveStatus('unsaved');
    },
    []
  );

  // Delete a mapping
  const deleteMapping = useCallback(async (elementId: string, slideIndex: number) => {
    const mapping = mappings.find(
      (m) => m.elementId === elementId && m.slideIndex === slideIndex
    );

    if (mapping?.id) {
      try {
        const { error: deleteError } = await supabase
          .from('template_slot_mappings')
          .delete()
          .eq('id', mapping.id);

        if (deleteError) throw deleteError;
      } catch (err) {
        console.error('Delete error:', err);
        toast.error('Failed to delete mapping');
        return;
      }
    }

    setMappings((prev) =>
      prev.filter(
        (m) => !(m.elementId === elementId && m.slideIndex === slideIndex)
      )
    );
  }, [mappings]);

  // Get mapping for a specific element
  const getMappingForElement = useCallback(
    (elementId: string, slideIndex: number) => {
      return mappings.find(
        (m) => m.elementId === elementId && m.slideIndex === slideIndex
      );
    },
    [mappings]
  );

  // Check if element is mapped
  const isElementMapped = useCallback(
    (elementId: string, slideIndex: number) => {
      return mappings.some(
        (m) => m.elementId === elementId && m.slideIndex === slideIndex
      );
    },
    [mappings]
  );

  // Get mappings by slide
  const getMappingsBySlide = useCallback(
    (slideIndex: number) => {
      return mappings.filter((m) => m.slideIndex === slideIndex);
    },
    [mappings]
  );

  // Validation
  const validateMappings = useCallback(() => {
    const issues: string[] = [];

    mappings.forEach((m) => {
      if (m.mappingType === 'ai_generated' && m.aiPrompt) {
        // Check if AI prompt contains at least one variable
        const hasVariable = /\{[a-z_]+\.[a-z_]+\}/i.test(m.aiPrompt);
        if (!hasVariable) {
          issues.push(`AI prompt for "${m.slotName}" should contain at least one variable like {account.name}`);
        }
      }

      if (m.mappingType === 'direct' && !m.dataSource) {
        issues.push(`Direct mapping "${m.slotName}" is missing a data source`);
      }
    });

    return issues;
  }, [mappings]);

  // Manual save all
  const saveAll = useCallback(async () => {
    const dirtyOnes = mappings.filter((m) => m.isDirty);
    if (dirtyOnes.length === 0) return { success: true };

    setSaveStatus('saving');

    try {
      for (const mapping of dirtyOnes) {
        const payload: any = {
          template_id: templateId,
          slide_index: mapping.slideIndex,
          element_id: mapping.elementId,
          element_type: mapping.elementType,
          placeholder_text: mapping.placeholderText,
          bounding_box: mapping.boundingBox ? JSON.parse(JSON.stringify(mapping.boundingBox)) : null,
          slot_name: mapping.slotName,
          mapping_type: mapping.mappingType,
          data_source: mapping.dataSource,
          ai_prompt: mapping.aiPrompt,
          ai_model: mapping.aiModel,
          ai_max_tokens: mapping.aiMaxTokens,
          ai_temperature: mapping.aiTemperature,
          condition_logic: mapping.conditionLogic ? JSON.parse(JSON.stringify(mapping.conditionLogic)) : null,
          max_characters: mapping.maxCharacters,
          format_as: mapping.formatAs,
          fallback_value: mapping.fallbackValue,
          display_order: mapping.displayOrder,
        };

        if (mapping.id) {
          await supabase
            .from('template_slot_mappings')
            .update(payload)
            .eq('id', mapping.id);
        } else {
          const { data: insertData } = await supabase
            .from('template_slot_mappings')
            .insert(payload)
            .select('id')
            .single();

          if (insertData) {
            setMappings((prev) =>
              prev.map((m) =>
                m.elementId === mapping.elementId && m.slideIndex === mapping.slideIndex
                  ? { ...m, id: insertData.id }
                  : m
              )
            );
          }
        }
      }

      setMappings((prev) => prev.map((m) => ({ ...m, isDirty: false })));
      setSaveStatus('saved');
      return { success: true };
    } catch (err) {
      console.error('Save all error:', err);
      setSaveStatus('error');
      return { success: false, error: err };
    }
  }, [mappings, templateId]);

  return {
    mappings,
    isLoading,
    saveStatus,
    error,
    upsertMapping,
    deleteMapping,
    getMappingForElement,
    isElementMapped,
    getMappingsBySlide,
    validateMappings,
    saveAll,
  };
}
