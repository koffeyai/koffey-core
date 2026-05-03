import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { Brain, RefreshCw, ChevronDown, Calendar, MessageSquare, Heart } from 'lucide-react';
import { useClientMemory, type MemoryFact } from '@/hooks/useClientMemory';
import { formatDistanceToNow } from 'date-fns';

interface ClientMemoryPanelProps {
  contactId: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  personal: 'bg-purple-100 text-purple-800',
  professional: 'bg-blue-100 text-blue-800',
  deal: 'bg-green-100 text-green-800',
  communication: 'bg-yellow-100 text-yellow-800',
  preference: 'bg-orange-100 text-orange-800',
};

const SENTIMENT_COLORS: Record<string, string> = {
  positive: 'bg-green-100 text-green-800',
  neutral: 'bg-gray-100 text-gray-800',
  negative: 'bg-red-100 text-red-800',
};

const ENGAGEMENT_COLORS: Record<string, string> = {
  high: 'bg-green-100 text-green-800',
  medium: 'bg-yellow-100 text-yellow-800',
  low: 'bg-red-100 text-red-800',
  unknown: 'bg-gray-100 text-gray-800',
};

function groupFactsByCategory(facts: MemoryFact[]): Record<string, MemoryFact[]> {
  const groups: Record<string, MemoryFact[]> = {};
  for (const fact of facts) {
    const cat = fact.category || 'other';
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(fact);
  }
  return groups;
}

export const ClientMemoryPanel: React.FC<ClientMemoryPanelProps> = ({ contactId }) => {
  const { memory, isLoading, refetch } = useClientMemory(contactId);
  const [factsOpen, setFactsOpen] = React.useState(false);

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Memory
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
        </CardContent>
      </Card>
    );
  }

  if (!memory) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
            <Brain className="h-4 w-4" />
            AI Memory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No memory yet. Add notes, log activities, or update deals to start building this contact's memory.
          </p>
        </CardContent>
      </Card>
    );
  }

  const { facts = [], summary, key_dates = [], communication_preferences, relationship_signals } = memory.memory || {};
  const groupedFacts = groupFactsByCategory(facts);
  const upcomingDates = key_dates.filter(d => new Date(d.date) >= new Date());

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Brain className="h-4 w-4 text-primary" />
            AI Memory
            <Badge variant="outline" className="text-xs font-normal">
              v{memory.version} · {memory.fact_count} facts
            </Badge>
          </CardTitle>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => refetch()}>
            <RefreshCw className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Summary */}
        {summary && (
          <p className="text-sm text-foreground leading-relaxed">{summary}</p>
        )}

        {/* Relationship Signals */}
        {relationship_signals && (
          <div className="flex items-center gap-2">
            <Heart className="h-3.5 w-3.5 text-muted-foreground" />
            {relationship_signals.sentiment && (
              <Badge className={`text-xs ${SENTIMENT_COLORS[relationship_signals.sentiment] || SENTIMENT_COLORS.neutral}`}>
                {relationship_signals.sentiment}
              </Badge>
            )}
            {relationship_signals.engagement_level && (
              <Badge className={`text-xs ${ENGAGEMENT_COLORS[relationship_signals.engagement_level] || ENGAGEMENT_COLORS.unknown}`}>
                {relationship_signals.engagement_level} engagement
              </Badge>
            )}
          </div>
        )}

        {/* Key Dates */}
        {upcomingDates.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" />
              Upcoming Dates
            </div>
            {upcomingDates.slice(0, 3).map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground text-xs font-mono">{d.date}</span>
                <span>{d.label}</span>
                {d.recurring && <Badge variant="outline" className="text-xs">recurring</Badge>}
              </div>
            ))}
          </div>
        )}

        {/* Communication Preferences */}
        {communication_preferences && (communication_preferences.channel || communication_preferences.tone || communication_preferences.best_time) && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              Communication
            </div>
            <div className="flex flex-wrap gap-1.5">
              {communication_preferences.channel && (
                <Badge variant="outline" className="text-xs">
                  Prefers {communication_preferences.channel}
                </Badge>
              )}
              {communication_preferences.tone && (
                <Badge variant="outline" className="text-xs">
                  {communication_preferences.tone} tone
                </Badge>
              )}
              {communication_preferences.best_time && (
                <Badge variant="outline" className="text-xs">
                  Best: {communication_preferences.best_time}
                </Badge>
              )}
            </div>
          </div>
        )}

        {/* Facts (Collapsible) */}
        {facts.length > 0 && (
          <Collapsible open={factsOpen} onOpenChange={setFactsOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between px-2 h-7">
                <span className="text-xs text-muted-foreground">
                  {facts.length} facts
                </span>
                <ChevronDown className={`h-3 w-3 transition-transform ${factsOpen ? 'rotate-180' : ''}`} />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-3 pt-2">
              {Object.entries(groupedFacts).map(([category, categoryFacts]) => (
                <div key={category} className="space-y-1">
                  <Badge className={`text-xs ${CATEGORY_COLORS[category] || 'bg-gray-100 text-gray-800'}`}>
                    {category}
                  </Badge>
                  <ul className="space-y-0.5 ml-1">
                    {categoryFacts.map((f, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/50 shrink-0" />
                        {f.fact}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Footer */}
        <div className="text-xs text-muted-foreground pt-1 border-t">
          Last updated {formatDistanceToNow(new Date(memory.last_encoded_at), { addSuffix: true })}
        </div>
      </CardContent>
    </Card>
  );
};
