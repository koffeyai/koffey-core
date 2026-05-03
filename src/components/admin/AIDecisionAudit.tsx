import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import {
  Brain,
  RefreshCw,
  Eye,
  ArrowRight,
  MessageSquare,
  Sparkles,
  FileText,
  AlertTriangle,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

interface AIDecision {
  id: string;
  created_at: string;
  message_content: string;
  tool_calls: any[];
  provenance: any;
  confidence: number | null;
  user_name: string;
}

const AIDecisionAudit: React.FC = () => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [decisions, setDecisions] = useState<AIDecision[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDecision, setSelectedDecision] = useState<AIDecision | null>(null);
  const [dateRange, setDateRange] = useState('7');

  useEffect(() => {
    if (organizationId) loadDecisions();
  }, [organizationId, dateRange]);

  const loadDecisions = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const daysAgo = parseInt(dateRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // Get chat messages with tool calls (AI decisions)
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('id, created_at, content, metadata, user_id')
        .eq('organization_id', organizationId)
        .eq('role', 'assistant')
        .gte('created_at', startDate.toISOString())
        .not('metadata', 'is', null)
        .order('created_at', { ascending: false })
        .limit(200);

      // Also get extraction records (AI extraction decisions)
      const { data: extractions } = await supabase
        .from('extraction_records')
        .select('id, created_at, raw_input, extracted_data, confidence_score, user_id')
        .eq('organization_id', organizationId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(100);

      const allDecisions: AIDecision[] = [];

      // Map chat messages with tool calls
      (messages || []).forEach(m => {
        const metadata = m.metadata as any;
        if (metadata?.tool_calls || metadata?.tools_used) {
          allDecisions.push({
            id: m.id,
            created_at: m.created_at,
            message_content: (m.content || '').substring(0, 200),
            tool_calls: metadata.tool_calls || metadata.tools_used || [],
            provenance: metadata.provenance || null,
            confidence: metadata.confidence || null,
            user_name: 'AI Assistant',
          });
        }
      });

      // Map extraction records
      (extractions || []).forEach(e => {
        allDecisions.push({
          id: e.id,
          created_at: e.created_at,
          message_content: `Extracted data from: "${(e.raw_input || '').substring(0, 100)}..."`,
          tool_calls: [{ type: 'extraction', data: e.extracted_data }],
          provenance: { source: 'extraction-agent', raw_input: e.raw_input },
          confidence: e.confidence_score,
          user_name: 'Extraction Agent',
        });
      });

      // Sort by date
      allDecisions.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setDecisions(allDecisions);
    } catch (err) {
      console.error('Failed to load AI decisions:', err);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceBadge = (confidence: number | null) => {
    if (confidence === null) return null;
    const pct = Math.round(confidence * 100);
    if (pct >= 80) return <Badge variant="default">{pct}% confident</Badge>;
    if (pct >= 50) return <Badge variant="secondary">{pct}% confident</Badge>;
    return <Badge variant="destructive">{pct}% confident</Badge>;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading AI decisions...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">AI Decision Audit</h1>
          <p className="text-muted-foreground">
            See what the AI extracted, classified, and changed
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={loadDecisions}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Decisions</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{decisions.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Extractions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {decisions.filter(d => d.tool_calls.some((t: any) => t.type === 'extraction')).length}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Low Confidence</CardTitle>
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {decisions.filter(d => d.confidence !== null && d.confidence < 0.5).length}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Decision List */}
      <Card>
        <CardHeader>
          <CardTitle>Decision Log</CardTitle>
          <CardDescription>Every AI action with provenance chain</CardDescription>
        </CardHeader>
        <CardContent>
          {decisions.length === 0 ? (
            <EmptyState
              icon={Brain}
              title="No AI decisions recorded"
              description="AI decisions will appear here when the assistant processes notes and makes CRM changes."
            />
          ) : (
            <ScrollArea className="h-[calc(100vh-420px)]">
              <div className="space-y-2">
                {decisions.map(decision => (
                  <div
                    key={decision.id}
                    className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors"
                    onClick={() => setSelectedDecision(decision)}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {decision.tool_calls.some((t: any) => t.type === 'extraction') ? (
                        <Sparkles className="h-4 w-4 text-purple-500 flex-shrink-0" />
                      ) : (
                        <MessageSquare className="h-4 w-4 text-blue-500 flex-shrink-0" />
                      )}
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{decision.message_content}</p>
                        <p className="text-xs text-muted-foreground">
                          {new Date(decision.created_at).toLocaleString()} | {decision.user_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {getConfidenceBadge(decision.confidence)}
                      <Badge variant="outline">
                        {Array.isArray(decision.tool_calls) ? decision.tool_calls.length : 0} actions
                      </Badge>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </CardContent>
      </Card>

      {/* Detail Dialog */}
      <Dialog open={!!selectedDecision} onOpenChange={() => setSelectedDecision(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              AI Decision Details
            </DialogTitle>
          </DialogHeader>
          {selectedDecision && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">When</p>
                  <p className="font-medium">{new Date(selectedDecision.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Confidence</p>
                  {selectedDecision.confidence !== null
                    ? getConfidenceBadge(selectedDecision.confidence)
                    : <span className="text-muted-foreground">Not scored</span>
                  }
                </div>
              </div>

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Output</p>
                <p className="text-sm bg-muted p-3 rounded-lg">{selectedDecision.message_content}</p>
              </div>

              {selectedDecision.provenance && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-2">Provenance Chain</p>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="outline">Source Note</Badge>
                    <ArrowRight className="h-3 w-3" />
                    <Badge variant="outline">AI Extraction</Badge>
                    <ArrowRight className="h-3 w-3" />
                    <Badge variant="outline">CRM Record</Badge>
                  </div>
                  <pre className="text-xs bg-muted p-3 rounded-lg mt-2 overflow-auto max-h-40">
                    {JSON.stringify(selectedDecision.provenance, null, 2)}
                  </pre>
                </div>
              )}

              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-2">Tool Calls / Actions</p>
                <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-60">
                  {JSON.stringify(selectedDecision.tool_calls, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AIDecisionAudit;
