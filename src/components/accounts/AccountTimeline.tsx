import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import {
  Phone,
  Mail,
  Calendar,
  CheckSquare,
  DollarSign,
  MessageSquare,
  Clock,
  RefreshCw,
  Filter,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

interface TimelineEvent {
  id: string;
  type: 'call' | 'email' | 'meeting' | 'task' | 'deal_change' | 'note';
  title: string;
  description: string;
  date: string;
  user_name: string;
  metadata: any;
}

interface AccountTimelineProps {
  accountId: string;
  accountName?: string;
}

export const AccountTimeline: React.FC<AccountTimelineProps> = ({ accountId, accountName }) => {
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('all');

  useEffect(() => {
    if (organizationId && accountId) loadTimeline();
  }, [organizationId, accountId]);

  const loadTimeline = async () => {
    if (!organizationId || !accountId) return;
    setLoading(true);
    try {
      const allEvents: TimelineEvent[] = [];

      // Get activities for contacts under this account
      const { data: contacts } = await supabase
        .from('contacts')
        .select('id, name')
        .eq('organization_id', organizationId)
        .eq('account_id', accountId);

      const contactIds = (contacts || []).map(c => c.id);
      const contactNames: Record<string, string> = {};
      (contacts || []).forEach(c => { contactNames[c.id] = c.name || 'Unknown'; });

      if (contactIds.length > 0) {
        const { data: activities } = await supabase
          .from('activities')
          .select('id, type, description, created_at, contact_id, user_id')
          .eq('organization_id', organizationId)
          .in('contact_id', contactIds)
          .order('created_at', { ascending: false })
          .limit(100);

        (activities || []).forEach(a => {
          allEvents.push({
            id: a.id,
            type: a.type as any || 'note',
            title: `${(a.type || 'Activity').charAt(0).toUpperCase() + (a.type || 'activity').slice(1)} with ${contactNames[a.contact_id] || 'Contact'}`,
            description: a.description || '',
            date: a.created_at,
            user_name: '',
            metadata: { contact_id: a.contact_id },
          });
        });
      }

      // Get deals for this account
      const { data: deals } = await supabase
        .from('deals')
        .select('id, name, stage, amount, created_at, updated_at')
        .eq('organization_id', organizationId)
        .eq('account_id', accountId)
        .order('updated_at', { ascending: false });

      (deals || []).forEach(d => {
        allEvents.push({
          id: `deal_${d.id}`,
          type: 'deal_change',
          title: `Deal: ${d.name}`,
          description: `Stage: ${d.stage} | Amount: $${(d.amount || 0).toLocaleString()}`,
          date: d.updated_at || d.created_at,
          user_name: '',
          metadata: { deal_id: d.id },
        });
      });

      // Get tasks
      const { data: tasks } = await supabase
        .from('tasks')
        .select('id, title, status, due_date, created_at, completed_at')
        .eq('organization_id', organizationId)
        .eq('account_id', accountId)
        .order('created_at', { ascending: false })
        .limit(50);

      (tasks || []).forEach(t => {
        allEvents.push({
          id: `task_${t.id}`,
          type: 'task',
          title: t.title || 'Task',
          description: `Status: ${t.status}${t.due_date ? ` | Due: ${new Date(t.due_date).toLocaleDateString()}` : ''}`,
          date: t.completed_at || t.created_at,
          user_name: '',
          metadata: { task_id: t.id },
        });
      });

      // Sort all events by date
      allEvents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setEvents(allEvents);
    } catch (err) {
      console.error('Failed to load timeline:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4 text-blue-500" />;
      case 'email': return <Mail className="h-4 w-4 text-green-500" />;
      case 'meeting': return <Calendar className="h-4 w-4 text-purple-500" />;
      case 'task': return <CheckSquare className="h-4 w-4 text-orange-500" />;
      case 'deal_change': return <DollarSign className="h-4 w-4 text-emerald-500" />;
      default: return <MessageSquare className="h-4 w-4 text-gray-500" />;
    }
  };

  const filteredEvents = typeFilter === 'all' ? events : events.filter(e => e.type === typeFilter);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <RefreshCw className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {accountName ? `${accountName} Timeline` : 'Account Timeline'}
        </h3>
        <div className="flex gap-2">
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-32">
              <Filter className="h-3 w-3 mr-1" />
              <SelectValue placeholder="All" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="call">Calls</SelectItem>
              <SelectItem value="email">Emails</SelectItem>
              <SelectItem value="meeting">Meetings</SelectItem>
              <SelectItem value="task">Tasks</SelectItem>
              <SelectItem value="deal_change">Deals</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="icon" onClick={loadTimeline}>
            <RefreshCw className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {filteredEvents.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No activity yet"
          description="Activities, deals, and tasks will appear here as you interact with this account."
        />
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="relative pl-6 border-l-2 border-muted space-y-4">
            {filteredEvents.map(event => (
              <div key={event.id} className="relative">
                <div className="absolute -left-[25px] w-4 h-4 rounded-full bg-background border-2 border-muted flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-primary" />
                </div>
                <Card className="ml-2">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {getEventIcon(event.type)}
                        <div>
                          <p className="text-sm font-medium">{event.title}</p>
                          {event.description && (
                            <p className="text-xs text-muted-foreground mt-1">{event.description}</p>
                          )}
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground whitespace-nowrap ml-2">
                        {new Date(event.date).toLocaleDateString()} {new Date(event.date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
};
