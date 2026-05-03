import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Loader2, Search, Globe, BarChart3 } from 'lucide-react';

interface EnrichmentProgressIndicatorProps {
  isVisible: boolean;
  stage: 'analyzing' | 'extracting' | 'processing' | 'complete';
  companyName?: string;
}

export const EnrichmentProgressIndicator: React.FC<EnrichmentProgressIndicatorProps> = ({
  isVisible,
  stage,
  companyName
}) => {
  if (!isVisible) return null;

  const stages = {
    analyzing: { 
      progress: 25, 
      icon: Search, 
      message: `Analyzing ${companyName || 'company'} website...` 
    },
    extracting: { 
      progress: 50, 
      icon: Globe, 
      message: 'Extracting business intelligence...' 
    },
    processing: { 
      progress: 75, 
      icon: BarChart3, 
      message: 'Processing sales insights...' 
    },
    complete: { 
      progress: 100, 
      icon: BarChart3, 
      message: 'Enrichment complete!' 
    }
  };

  const currentStage = stages[stage];
  const Icon = currentStage.icon;

  return (
    <Card className="mb-4 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
      <CardContent className="pt-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="relative">
            <Icon className="w-5 h-5 text-primary" />
            {stage !== 'complete' && (
              <Loader2 className="w-3 h-3 absolute -top-1 -right-1 animate-spin text-primary" />
            )}
          </div>
          <span className="text-sm font-medium text-foreground">
            {currentStage.message}
          </span>
        </div>
        <Progress value={currentStage.progress} className="w-full" />
        <p className="text-xs text-foreground/60 mt-2">
          Gathering industry insights, business model, and targeting intelligence...
        </p>
      </CardContent>
    </Card>
  );
};