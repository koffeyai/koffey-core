import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Sparkles, Star, Presentation } from 'lucide-react';
import { SlideTemplate, TEMPLATE_TYPE_LABELS, SlideTemplateType } from '@/types/slides';

interface TemplateRecommendationsProps {
  templates: SlideTemplate[];
  dealStage?: string;
  onSelectTemplate: (template: SlideTemplate) => void;
}

// Map deal stages to recommended template types
const STAGE_TEMPLATE_MAPPING: Record<string, SlideTemplateType[]> = {
  'prospecting': ['discovery'],
  'qualified': ['discovery', 'executive_summary'],
  'qualification': ['discovery', 'executive_summary'],
  'proposal': ['proposal', 'executive_summary'],
  'negotiation': ['proposal', 'executive_summary'],
  'closed-won': ['qbr', 'case_study'],
  'closed_won': ['qbr', 'case_study'],
  'closed-lost': [],
  'closed_lost': [],
};

export const getRecommendedTemplates = (
  templates: SlideTemplate[],
  dealStage?: string
): { recommended: SlideTemplate[]; others: SlideTemplate[] } => {
  if (!dealStage) {
    return { recommended: [], others: templates };
  }

  const normalizedStage = dealStage.toLowerCase().replace(/[-_\\s]/g, '_');
  const recommendedTypes = STAGE_TEMPLATE_MAPPING[normalizedStage] || [];

  if (recommendedTypes.length === 0) {
    return { recommended: [], others: templates };
  }

  const recommended = templates.filter(t => 
    recommendedTypes.includes(t.template_type) ||
    t.stage_alignment?.some(s => recommendedTypes.includes(s as SlideTemplateType))
  );

  const others = templates.filter(t => !recommended.includes(t));

  return { recommended, others };
};

export const TemplateRecommendations: React.FC<TemplateRecommendationsProps> = ({
  templates,
  dealStage,
  onSelectTemplate
}) => {
  const { recommended, others } = getRecommendedTemplates(templates, dealStage);

  if (templates.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="py-8 text-center">
          <Presentation className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-muted-foreground">
            No templates available. Upload templates or use AI to create presentations.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Recommended Templates */}
      {recommended.length > 0 && (
        <div className="space-y-3">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <Star className="h-4 w-4 text-amber-500" />
            Recommended for {dealStage} stage
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {recommended.map(template => (
              <Card 
                key={template.id}
                className="cursor-pointer hover:border-primary transition-colors ring-2 ring-primary/20"
                onClick={() => onSelectTemplate(template)}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm truncate">
                          {template.name}
                        </span>
                        <Badge 
                          variant="secondary" 
                          className="bg-primary/10 text-primary text-xs shrink-0"
                        >
                          Recommended
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Badge variant="outline" className="text-xs">
                          {TEMPLATE_TYPE_LABELS[template.template_type]}
                        </Badge>
                        {template.slide_count && (
                          <span>{template.slide_count} slides</span>
                        )}
                      </div>
                    </div>
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* Other Templates */}
      {others.length > 0 && (
        <div className="space-y-3">
          {recommended.length > 0 && (
            <h4 className="text-sm font-medium text-muted-foreground">
              Other Templates
            </h4>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {others.map(template => (
              <Card 
                key={template.id}
                className="cursor-pointer hover:border-primary transition-colors"
                onClick={() => onSelectTemplate(template)}
              >
                <CardContent className="p-4">
                  <div className="space-y-1">
                    <span className="font-medium text-sm truncate block">
                      {template.name}
                    </span>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="outline" className="text-xs">
                        {TEMPLATE_TYPE_LABELS[template.template_type]}
                      </Badge>
                      {template.slide_count && (
                        <span>{template.slide_count} slides</span>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
