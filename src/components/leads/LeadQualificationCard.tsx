/**
 * LeadQualificationCard
 * 
 * Displays lead qualification data with BANT breakdown
 * for use in leads table row expansion
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Sparkles, 
  DollarSign, 
  Users, 
  Target, 
  Clock,
  TrendingUp,
  Zap,
  RefreshCw
} from 'lucide-react';
import { useEnrichment, useLeadScoreDisplay } from '@/hooks/useEnrichment';
import { cn } from '@/lib/utils';

interface LeadQualificationCardProps {
  contact: Record<string, unknown>;
  showEnrichButton?: boolean;
  compact?: boolean;
}

export const LeadQualificationCard: React.FC<LeadQualificationCardProps> = ({
  contact,
  showEnrichButton = true,
  compact = false
}) => {
  const { enrichContact, isEnriching } = useEnrichment();
  const scoreDisplay = useLeadScoreDisplay(contact);

  if (!scoreDisplay) return null;

  const handleEnrich = async () => {
    await enrichContact(contact.id as string, false);
  };

  const handleForceEnrich = async () => {
    await enrichContact(contact.id as string, true);
  };

  if (compact) {
    return (
      <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
        <Badge className={cn('text-xs', scoreDisplay.stageColor)}>
          {scoreDisplay.stageLabel}
        </Badge>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Fit:</span>
          <span className={scoreDisplay.fitScoreColor}>{scoreDisplay.fitScore}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">BANT:</span>
          <span className={scoreDisplay.bantScoreColor}>{scoreDisplay.bantScore}</span>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Overall:</span>
          <span className={cn('font-medium', scoreDisplay.overallScoreColor)}>
            {scoreDisplay.overallScore}
          </span>
        </div>
        {showEnrichButton && (
          <Button 
            size="sm" 
            variant="ghost" 
            onClick={handleEnrich}
            disabled={isEnriching}
            className="ml-auto"
          >
            {isEnriching ? (
              <RefreshCw className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
          </Button>
        )}
      </div>
    );
  }

  return (
    <Card className="bg-card/50 border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-medium flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            Lead Qualification
          </CardTitle>
          <Badge className={cn('text-xs', scoreDisplay.stageColor)}>
            {scoreDisplay.stageLabel}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Score Overview */}
        <div className="grid grid-cols-4 gap-3">
          <ScoreCard 
            label="Fit" 
            value={scoreDisplay.fitScore} 
            color={scoreDisplay.fitScoreColor}
            icon={<Target className="h-3.5 w-3.5" />}
          />
          <ScoreCard 
            label="Intent" 
            value={scoreDisplay.intentScore} 
            color={getScoreColor(scoreDisplay.intentScore)}
            icon={<Zap className="h-3.5 w-3.5" />}
          />
          <ScoreCard 
            label="Engage" 
            value={scoreDisplay.engagementScore} 
            color={getScoreColor(scoreDisplay.engagementScore)}
            icon={<Users className="h-3.5 w-3.5" />}
          />
          <ScoreCard 
            label="Overall" 
            value={scoreDisplay.overallScore} 
            color={scoreDisplay.overallScoreColor}
            icon={<TrendingUp className="h-3.5 w-3.5" />}
            highlighted
          />
        </div>

        <Separator />

        {/* BANT Breakdown */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium text-foreground">BANT Score</h4>
            <span className={cn('text-lg font-bold', scoreDisplay.bantScoreColor)}>
              {scoreDisplay.bantScore}/100
            </span>
          </div>

          <div className="space-y-2.5">
            <BANTRow 
              icon={<DollarSign className="h-3.5 w-3.5" />}
              label="Budget"
              value={scoreDisplay.budgetLabel}
              progress={scoreDisplay.bantProgress.budget}
              maxPoints={30}
            />
            <BANTRow 
              icon={<Users className="h-3.5 w-3.5" />}
              label="Authority"
              value={scoreDisplay.authorityLabel}
              progress={scoreDisplay.bantProgress.authority}
              maxPoints={25}
            />
            <BANTRow 
              icon={<Target className="h-3.5 w-3.5" />}
              label="Need"
              value={scoreDisplay.needLabel}
              progress={scoreDisplay.bantProgress.need}
              maxPoints={25}
            />
            <BANTRow 
              icon={<Clock className="h-3.5 w-3.5" />}
              label="Timeline"
              value={scoreDisplay.timelineLabel}
              progress={scoreDisplay.bantProgress.timeline}
              maxPoints={20}
            />
          </div>
        </div>

        {/* Enrichment Actions */}
        {showEnrichButton && (
          <>
            <Separator />
            <div className="flex items-center gap-2">
              <Button 
                size="sm" 
                variant="secondary"
                onClick={handleEnrich}
                disabled={isEnriching}
                className="flex-1"
              >
                {isEnriching ? (
                  <>
                    <RefreshCw className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                    Enriching...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                    Enrich Lead
                  </>
                )}
              </Button>
              {contact.enriched_at && (
                <Button 
                  size="sm" 
                  variant="ghost"
                  onClick={handleForceEnrich}
                  disabled={isEnriching}
                  title="Force refresh enrichment data"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            {contact.enriched_at && (
              <p className="text-xs text-muted-foreground text-center">
                Last enriched: {new Date(contact.enriched_at as string).toLocaleDateString()}
                {contact.enrichment_provider && (
                  <span> via {String(contact.enrichment_provider)}</span>
                )}
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
};

// Helper Components

interface ScoreCardProps {
  label: string;
  value: number;
  color: string;
  icon: React.ReactNode;
  highlighted?: boolean;
}

const ScoreCard: React.FC<ScoreCardProps> = ({ label, value, color, icon, highlighted }) => (
  <div className={cn(
    'text-center p-2 rounded-lg',
    highlighted ? 'bg-primary/10 border border-primary/20' : 'bg-muted/50'
  )}>
    <div className="flex items-center justify-center gap-1 text-muted-foreground mb-1">
      {icon}
      <span className="text-xs">{label}</span>
    </div>
    <div className={cn('text-lg font-bold', color)}>{value}</div>
  </div>
);

interface BANTRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  progress: number;
  maxPoints: number;
}

const BANTRow: React.FC<BANTRowProps> = ({ icon, label, value, progress, maxPoints }) => (
  <div className="space-y-1">
    <div className="flex items-center justify-between text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span>{label}</span>
        <span className="text-foreground/40">({maxPoints}pts)</span>
      </div>
      <span className="text-foreground">{value}</span>
    </div>
    <Progress value={progress} className="h-1.5" />
  </div>
);

// Score color helper
function getScoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-amber-400';
  return 'text-muted-foreground';
}
