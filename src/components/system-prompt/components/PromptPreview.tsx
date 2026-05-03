import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { SystemPromptSection } from '../types';
import { HARDCODED_BASE_PROMPT, SECTION_TYPES } from '../constants';

interface PromptPreviewProps {
  sections: SystemPromptSection[];
  editingSections: Record<string, string>;
}

export const PromptPreview = ({ sections, editingSections }: PromptPreviewProps) => {
  const getSectionContent = (sectionType: string) => {
    const section = sections.find(s => s.section_type === sectionType);
    return section?.content || '';
  };

  const buildFullPreview = () => {
    let preview = HARDCODED_BASE_PROMPT;
    
    const activeSections = SECTION_TYPES
      .map(type => ({
        ...type,
        content: editingSections[type.value] || getSectionContent(type.value)
      }))
      .filter(section => section.content.trim());

    if (activeSections.length > 0) {
      preview += '\n\nCustomization:';
      activeSections.forEach(section => {
        preview += `\n\n${section.label}:\n${section.content}`;
      });
    }

    return preview;
  };

  const fullPreview = buildFullPreview();

  return (
    <Card>
      <CardHeader>
        <CardTitle>Complete System Prompt Preview</CardTitle>
        <CardDescription>
          This shows how the final prompt will look with hardcoded base + your customizations
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Textarea
          value={fullPreview}
          readOnly
          className="min-h-[500px] text-sm bg-slate-50 text-slate-700 border-slate-200 prompt-text-fix"
        />
        <div className="mt-4 text-sm text-muted-foreground">
          {fullPreview.length} total characters
        </div>
      </CardContent>
    </Card>
  );
};