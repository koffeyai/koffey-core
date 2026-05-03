import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Save, Lock, Unlock } from 'lucide-react';
import { SectionType, SystemPromptSection } from '../types';

interface PromptSectionCardProps {
  sectionType: SectionType;
  sections: SystemPromptSection[];
  editingSections: Record<string, string>;
  justification: string;
  loading: boolean;
  onUpdateContent: (sectionType: string, content: string) => void;
  onJustificationChange: (justification: string) => void;
  onSubmitRequest: (sectionType: string) => void;
}

export const PromptSectionCard = ({
  sectionType,
  sections,
  editingSections,
  justification,
  loading,
  onUpdateContent,
  onJustificationChange,
  onSubmitRequest
}: PromptSectionCardProps) => {
  const getSectionContent = (sectionTypeValue: string) => {
    const section = sections.find(s => s.section_type === sectionTypeValue);
    return section?.content || '';
  };

  const currentContent = getSectionContent(sectionType.value);
  const editingContent = editingSections[sectionType.value] || '';
  const hasChanges = editingContent !== currentContent;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Unlock className="w-4 h-4 text-green-600" />
            <div>
              <CardTitle>{sectionType.label}</CardTitle>
              <CardDescription>{sectionType.description}</CardDescription>
            </div>
          </div>
          {hasChanges && (
            <Badge variant="outline" className="text-orange-600 border-orange-600">
              Modified
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Textarea
          value={editingContent}
          onChange={(e) => onUpdateContent(sectionType.value, e.target.value)}
          placeholder={`Enter ${sectionType.label.toLowerCase()}...`}
          className="min-h-[120px] resize-y"
        />
        
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{editingContent.length} characters</span>
          {currentContent && (
            <span>Current version: {sections.find(s => s.section_type === sectionType.value)?.version || 1}</span>
          )}
        </div>

        {hasChanges && (
          <div className="space-y-4 pt-4 border-t">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                Justification for Change
              </label>
              <Textarea
                value={justification}
                onChange={(e) => onJustificationChange(e.target.value)}
                placeholder="Explain why this change is needed..."
                className="min-h-[80px] resize-y"
              />
            </div>
            
            <Button 
              onClick={() => onSubmitRequest(sectionType.value)} 
              disabled={loading || !justification.trim()} 
              className="w-full"
            >
              <Save className="w-4 h-4 mr-2" />
              Submit {sectionType.label} Change for Approval
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
};