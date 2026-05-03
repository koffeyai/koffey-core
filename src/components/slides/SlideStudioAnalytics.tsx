import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import { 
  Presentation, 
  LayoutTemplate, 
  Sparkles, 
  TrendingUp,
  Trophy
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { SlideTemplate, TEMPLATE_TYPE_LABELS } from '@/types/slides';

interface TemplateUsage {
  template_id: string;
  template_name: string;
  usage_count: number;
}

interface TemplatePerformance {
  template_id: string;
  template_name: string;
  total_used: number;
  won_deals: number;
  win_rate: number;
}

interface AnalyticsData {
  totalPresentations: number;
  templatesUsed: number;
  aiEnhancedPercentage: number;
  templateUsage: TemplateUsage[];
  templatePerformance: TemplatePerformance[];
}

export const SlideStudioAnalytics: React.FC = () => {
  const { organizationId } = useOrganizationAccess();

  const { data: analytics, isLoading } = useQuery({
    queryKey: ['slide-studio-analytics', organizationId],
    queryFn: async (): Promise<AnalyticsData> => {
      if (!organizationId) {
        return {
          totalPresentations: 0,
          templatesUsed: 0,
          aiEnhancedPercentage: 0,
          templateUsage: [],
          templatePerformance: []
        };
      }

      // Fetch generated presentations
      const { data: presentations } = await supabase
        .from('generated_presentations')
        .select('id, template_id, generation_mode, deal_id, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false });

      // Fetch templates
      const { data: templates } = await supabase
        .from('slide_templates')
        .select('id, name, template_type')
        .eq('organization_id', organizationId)
        .eq('is_active', true);

      // Fetch deals to check win status
      const dealIds = presentations?.filter(p => p.deal_id).map(p => p.deal_id) || [];
      let wonDealIds: string[] = [];
      
      if (dealIds.length > 0) {
        const { data: deals } = await supabase
          .from('deals')
          .select('id, stage')
          .in('id', dealIds);
        
        wonDealIds = deals?.filter(d => d.stage === 'closed-won').map(d => d.id) || [];
      }

      const totalPresentations = presentations?.length || 0;
      
      // Count unique templates used
      const uniqueTemplates = new Set(
        presentations?.filter(p => p.template_id).map(p => p.template_id)
      );
      const templatesUsed = uniqueTemplates.size;
      
      // Calculate AI-enhanced percentage (includes AI creative and template with AI slots)
      const aiPresentations = presentations?.filter(
        p => p.generation_mode === 'ai_creative' || p.generation_mode === 'template_based'
      ).length || 0;
      const aiEnhancedPercentage = totalPresentations > 0 
        ? Math.round((aiPresentations / totalPresentations) * 100)
        : 0;

      // Calculate template usage
      const usageMap = new Map<string, { count: number; name: string }>();
      presentations?.forEach(p => {
        if (p.template_id) {
          const template = templates?.find(t => t.id === p.template_id);
          const existing = usageMap.get(p.template_id) || { count: 0, name: template?.name || 'Unknown' };
          usageMap.set(p.template_id, { count: existing.count + 1, name: existing.name });
        }
      });

      const templateUsage: TemplateUsage[] = Array.from(usageMap.entries())
        .map(([id, data]) => ({
          template_id: id,
          template_name: data.name,
          usage_count: data.count
        }))
        .sort((a, b) => b.usage_count - a.usage_count)
        .slice(0, 5);

      // Calculate template performance (win rate)
      const performanceMap = new Map<string, { used: number; won: number; name: string }>();
      presentations?.forEach(p => {
        if (p.template_id && p.deal_id) {
          const template = templates?.find(t => t.id === p.template_id);
          const existing = performanceMap.get(p.template_id) || { used: 0, won: 0, name: template?.name || 'Unknown' };
          performanceMap.set(p.template_id, {
            used: existing.used + 1,
            won: existing.won + (wonDealIds.includes(p.deal_id) ? 1 : 0),
            name: existing.name
          });
        }
      });

      const templatePerformance: TemplatePerformance[] = Array.from(performanceMap.entries())
        .map(([id, data]) => ({
          template_id: id,
          template_name: data.name,
          total_used: data.used,
          won_deals: data.won,
          win_rate: data.used > 0 ? Math.round((data.won / data.used) * 100) : 0
        }))
        .filter(p => p.total_used >= 3) // Only show templates with enough data
        .sort((a, b) => b.win_rate - a.win_rate)
        .slice(0, 5);

      return {
        totalPresentations,
        templatesUsed,
        aiEnhancedPercentage,
        templateUsage,
        templatePerformance
      };
    },
    enabled: !!organizationId,
    staleTime: 5 * 60 * 1000 // 5 minutes
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!analytics) return null;

  const maxUsage = Math.max(...(analytics.templateUsage.map(t => t.usage_count) || [1]));

  return (
    <div className="space-y-6">
      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Presentations Generated
            </CardTitle>
            <Presentation className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalPresentations}</div>
            <p className="text-xs text-muted-foreground mt-1">Last 30 days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Templates Used
            </CardTitle>
            <LayoutTemplate className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.templatesUsed}</div>
            <p className="text-xs text-muted-foreground mt-1">Unique templates</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              AI-Enhanced
            </CardTitle>
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.aiEnhancedPercentage}%</div>
            <p className="text-xs text-muted-foreground mt-1">With AI content</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage & Performance */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Most Used Templates */}
        {analytics.templateUsage.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Most Used Templates
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {analytics.templateUsage.map((template, idx) => (
                <div key={template.template_id} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2">
                      <span className="text-muted-foreground">{idx + 1}.</span>
                      <span className="font-medium truncate max-w-[200px]">
                        {template.template_name}
                      </span>
                    </span>
                    <span className="text-muted-foreground">{template.usage_count} uses</span>
                  </div>
                  <Progress 
                    value={(template.usage_count / maxUsage) * 100} 
                    className="h-2"
                  />
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Template Performance */}
        {analytics.templatePerformance.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Trophy className="h-4 w-4" />
                Template Performance
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="grid grid-cols-4 gap-2 text-xs text-muted-foreground border-b pb-2">
                  <span>Template</span>
                  <span className="text-center">Used</span>
                  <span className="text-center">Won</span>
                  <span className="text-right">Win Rate</span>
                </div>
                {analytics.templatePerformance.map((template) => (
                  <div 
                    key={template.template_id} 
                    className="grid grid-cols-4 gap-2 py-2 text-sm border-b last:border-0"
                  >
                    <span className="font-medium truncate" title={template.template_name}>
                      {template.template_name}
                    </span>
                    <span className="text-center text-muted-foreground">
                      {template.total_used}
                    </span>
                    <span className="text-center text-muted-foreground">
                      {template.won_deals}
                    </span>
                    <span className="text-right font-medium text-primary">
                      {template.win_rate}%
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Empty state */}
      {analytics.totalPresentations === 0 && (
        <Card className="border-dashed">
          <CardContent className="py-8 text-center">
            <Presentation className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              No presentations generated yet. Create your first deck to see analytics.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};
