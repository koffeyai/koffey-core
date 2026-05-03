import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Building2, Target, DollarSign, Users, TrendingUp, MessageSquare } from 'lucide-react';
import { EnrichedWebsiteData } from '@/services/websiteEnrichmentService';

interface SalesIntelligenceCardProps {
  data: EnrichedWebsiteData;
  onApplyData: () => void;
  onDismiss: () => void;
  isVisible: boolean;
}

export const SalesIntelligenceCard: React.FC<SalesIntelligenceCardProps> = ({
  data,
  onApplyData,
  onDismiss,
  isVisible
}) => {
  if (!isVisible) return null;

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'bg-green-500';
    if (confidence >= 0.6) return 'bg-yellow-500';
    return 'bg-red-500';
  };

  const confidenceScore = data.enrichmentConfidence || 0.7;

  return (
    <Card className="mb-4 border-primary/20 bg-gradient-to-r from-primary/5 to-secondary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-primary" />
            <CardTitle className="text-lg">Sales Intelligence Preview</CardTitle>
            <Badge 
              variant="secondary" 
              className={`${getConfidenceColor(confidenceScore)} text-white`}
            >
              {Math.round(confidenceScore * 100)}% confidence
            </Badge>
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant="outline" 
              onClick={onDismiss}
            >
              Dismiss
            </Button>
            <Button 
              size="sm" 
              onClick={onApplyData}
              className="bg-primary hover:bg-primary/90"
            >
              Apply Data
            </Button>
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {/* Company Overview */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <h4 className="text-sm font-semibold text-foreground/80 mb-2">Company Profile</h4>
            <div className="space-y-1 text-sm">
              {data.companyName && (
                <p><span className="font-medium">Name:</span> {data.companyName}</p>
              )}
              {data.industry && (
                <p><span className="font-medium">Industry:</span> {data.industry}</p>
              )}
              {data.vertical && (
                <p><span className="font-medium">Vertical:</span> {data.vertical}</p>
              )}
              {data.companyStage && (
                <p><span className="font-medium">Stage:</span> {data.companyStage}</p>
              )}
            </div>
          </div>
          
          <div>
            <h4 className="text-sm font-semibold text-foreground/80 mb-2">Business Model</h4>
            <div className="space-y-1 text-sm">
              {data.businessModel && (
                <p><span className="font-medium">Model:</span> {data.businessModel}</p>
              )}
              {data.revenueModel && (
                <p><span className="font-medium">Revenue:</span> {data.revenueModel}</p>
              )}
              {data.targetMarket && (
                <p><span className="font-medium">Target:</span> {data.targetMarket}</p>
              )}
            </div>
          </div>
        </div>

        {/* Value Proposition */}
        {data.valueProposition && (
          <div>
            <h4 className="text-sm font-semibold text-foreground/80 mb-2 flex items-center gap-1">
              <Target className="w-4 h-4" />
              Value Proposition
            </h4>
            <p className="text-sm text-foreground/70 bg-secondary/30 p-2 rounded">
              {data.valueProposition}
            </p>
          </div>
        )}

        {/* Pain Points & Conversation Starters */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.painPoints && data.painPoints.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground/80 mb-2">Pain Points</h4>
              <div className="flex flex-wrap gap-1">
                {data.painPoints.slice(0, 3).map((pain, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {pain}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {data.conversationStarters && data.conversationStarters.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground/80 mb-2 flex items-center gap-1">
                <MessageSquare className="w-4 h-4" />
                Conversation Starters
              </h4>
              <div className="space-y-1">
                {data.conversationStarters.slice(0, 2).map((starter, index) => (
                  <p key={index} className="text-xs text-foreground/60 bg-secondary/20 p-1 rounded">
                    {starter}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Technology & Personnel */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.techStack && data.techStack.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground/80 mb-2">Tech Stack</h4>
              <div className="flex flex-wrap gap-1">
                {data.techStack.slice(0, 4).map((tech, index) => (
                  <Badge key={index} variant="secondary" className="text-xs">
                    {tech}
                  </Badge>
                ))}
              </div>
            </div>
          )}
          
          {data.keyPersonnel && data.keyPersonnel.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-foreground/80 mb-2 flex items-center gap-1">
                <Users className="w-4 h-4" />
                Key Personnel
              </h4>
              <div className="space-y-1">
                {data.keyPersonnel.slice(0, 2).map((person, index) => (
                  <div key={index} className="text-xs">
                    <span className="font-medium">{person.name}</span> - {person.title}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* News & Funding */}
        {(data.newsHighlights?.length || data.fundingInfo) && (
          <div className="border-t pt-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.newsHighlights && data.newsHighlights.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground/80 mb-2 flex items-center gap-1">
                    <TrendingUp className="w-4 h-4" />
                    Recent News
                  </h4>
                  <div className="space-y-1">
                    {data.newsHighlights.slice(0, 2).map((news, index) => (
                      <p key={index} className="text-xs text-foreground/60 bg-secondary/20 p-1 rounded">
                        {news}
                      </p>
                    ))}
                  </div>
                </div>
              )}
              
              {data.fundingInfo && (
                <div>
                  <h4 className="text-sm font-semibold text-foreground/80 mb-2 flex items-center gap-1">
                    <DollarSign className="w-4 h-4" />
                    Funding Info
                  </h4>
                  <p className="text-xs text-foreground/60 bg-secondary/20 p-1 rounded">
                    {data.fundingInfo}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};