import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Shield, 
  AlertTriangle, 
  Users, 
  Activity, 
  Search,
  Filter,
  Download,
  Eye,
  Clock,
  Globe,
  Mail
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { safeSingle } from '@/lib/database';

interface SecurityEvent {
  id: string;
  organization_id: string;
  event_type: string;
  user_email: string;
  user_domain: string;
  admin_user_id: string | null;
  metadata: any;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

interface SecuritySummary {
  total_events: number;
  auto_approvals: number;
  manual_approvals: number;
  rejections: number;
  security_alerts: number;
  unique_domains: number;
  recent_events: number;
}

interface DomainActivity {
  domain: string;
  event_count: number;
  success_rate: number;
  latest_activity: string;
}

const SecurityLogsDashboard: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  
  // Security events state
  const [securityEvents, setSecurityEvents] = useState<SecurityEvent[]>([]);
  const [filteredEvents, setFilteredEvents] = useState<SecurityEvent[]>([]);
  const [securitySummary, setSecuritySummary] = useState<SecuritySummary | null>(null);
  const [domainActivity, setDomainActivity] = useState<DomainActivity[]>([]);
  
  // Filter state
  const [searchTerm, setSearchTerm] = useState('');
  const [eventTypeFilter, setEventTypeFilter] = useState('all');
  const [dateRange, setDateRange] = useState('7'); // days
  const [selectedEvent, setSelectedEvent] = useState<SecurityEvent | null>(null);

  useEffect(() => {
    loadOrganizationData();
  }, []);

  useEffect(() => {
    if (organizationId) {
      loadSecurityData();
    }
  }, [organizationId, dateRange]);

  useEffect(() => {
    filterEvents();
  }, [securityEvents, searchTerm, eventTypeFilter]);

  const loadOrganizationData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's organization where they are admin
      const membership = await safeSingle(
        supabase
          .from('organization_members')
          .select('organization_id')
          .eq('user_id', user.id)
          .eq('role', 'admin')
          .eq('is_active', true),
        {
          errorMessage: 'Failed to verify organization admin access',
          logContext: 'security_dashboard_admin_check'
        }
      );

      if (membership) {
        setOrganizationId((membership as any).organization_id);
      }
    } catch (error) {
      console.error('Error loading organization data:', error);
    }
  };

  const loadSecurityData = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const daysAgo = parseInt(dateRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      // Load security events
      const { data: events, error: eventsError } = await supabase
        .from('organization_security_logs')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (eventsError) throw eventsError;
      
      const typedEvents = (events || []).map(event => ({
        ...event,
        ip_address: event.ip_address as string | null,
        metadata: event.metadata || {}
      })) as SecurityEvent[];
      
      setSecurityEvents(typedEvents);

      // Calculate security summary
      const summary = calculateSecuritySummary(typedEvents);
      setSecuritySummary(summary);

      // Calculate domain activity
      const domainStats = calculateDomainActivity(typedEvents);
      setDomainActivity(domainStats);

    } catch (error) {
      console.error('Error loading security data:', error);
      toast({
        title: "Error loading data",
        description: "Failed to load security logs",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const calculateSecuritySummary = (events: SecurityEvent[]): SecuritySummary => {
    const now = new Date();
    const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    return {
      total_events: events.length,
      auto_approvals: events.filter(e => e.event_type === 'auto_approval').length,
      manual_approvals: events.filter(e => e.event_type === 'manual_approval').length,
      rejections: events.filter(e => e.event_type === 'rejection').length,
      security_alerts: events.filter(e => e.event_type === 'security_alert').length,
      unique_domains: new Set(events.map(e => e.user_domain)).size,
      recent_events: events.filter(e => new Date(e.created_at) > last24Hours).length
    };
  };

  const calculateDomainActivity = (events: SecurityEvent[]): DomainActivity[] => {
    const domainMap = new Map<string, {
      total: number;
      successful: number;
      latest: string;
    }>();

    events.forEach(event => {
      const domain = event.user_domain;
      const current = domainMap.get(domain) || { total: 0, successful: 0, latest: event.created_at };
      
      current.total += 1;
      if (['auto_approval', 'manual_approval'].includes(event.event_type)) {
        current.successful += 1;
      }
      if (new Date(event.created_at) > new Date(current.latest)) {
        current.latest = event.created_at;
      }
      
      domainMap.set(domain, current);
    });

    return Array.from(domainMap.entries())
      .map(([domain, stats]) => ({
        domain,
        event_count: stats.total,
        success_rate: stats.total > 0 ? Math.round((stats.successful / stats.total) * 100) : 0,
        latest_activity: stats.latest
      }))
      .sort((a, b) => b.event_count - a.event_count)
      .slice(0, 10);
  };

  const filterEvents = () => {
    let filtered = securityEvents;

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(event =>
        event.user_email.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.user_domain.toLowerCase().includes(searchTerm.toLowerCase()) ||
        event.event_type.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Event type filter
    if (eventTypeFilter !== 'all') {
      filtered = filtered.filter(event => event.event_type === eventTypeFilter);
    }

    setFilteredEvents(filtered);
  };

  const exportSecurityLogs = () => {
    const csvContent = [
      ['Timestamp', 'Event Type', 'User Email', 'Domain', 'IP Address', 'Details'].join(','),
      ...filteredEvents.map(event => [
        new Date(event.created_at).toISOString(),
        event.event_type,
        event.user_email,
        event.user_domain,
        event.ip_address || 'N/A',
        JSON.stringify(event.metadata).replace(/"/g, '""')
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `security_logs_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getEventTypeIcon = (eventType: string) => {
    switch (eventType) {
      case 'auto_approval':
        return <Shield className="h-4 w-4 text-green-500" />;
      case 'manual_approval':
        return <Users className="h-4 w-4 text-blue-500" />;
      case 'rejection':
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case 'security_alert':
        return <AlertTriangle className="h-4 w-4 text-orange-500" />;
      case 'join_request':
        return <Mail className="h-4 w-4 text-purple-500" />;
      default:
        return <Activity className="h-4 w-4 text-gray-500" />;
    }
  };

  const getEventTypeBadge = (eventType: string) => {
    const variants: { [key: string]: 'default' | 'secondary' | 'destructive' | 'outline' } = {
      'auto_approval': 'default',
      'manual_approval': 'secondary',
      'rejection': 'destructive',
      'security_alert': 'destructive',
      'join_request': 'outline'
    };

    return (
      <Badge variant={variants[eventType] || 'outline'}>
        {eventType.replace('_', ' ').toUpperCase()}
      </Badge>
    );
  };

  if (!organizationId) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              You need admin privileges to view security logs.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Security Dashboard</h1>
          <p className="text-muted-foreground">
            Monitor security events and signup activities
          </p>
        </div>
        <div className="flex gap-2">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last 24 hours</SelectItem>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={exportSecurityLogs}>
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Security Summary */}
      {securitySummary && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Activity className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Events</p>
                  <p className="text-2xl font-bold">{securitySummary.total_events}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Auto Approvals</p>
                  <p className="text-2xl font-bold">{securitySummary.auto_approvals}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Security Alerts</p>
                  <p className="text-2xl font-bold">{securitySummary.security_alerts}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Recent (24h)</p>
                  <p className="text-2xl font-bold">{securitySummary.recent_events}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="events" className="space-y-6">
        <TabsList>
          <TabsTrigger value="events">Security Events</TabsTrigger>
          <TabsTrigger value="domains">Domain Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="space-y-6">
          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Filter className="h-5 w-5" />
                Filters
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="search">Search Events</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="search"
                      placeholder="Search by email, domain, or event type..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="eventType">Event Type</Label>
                  <Select value={eventTypeFilter} onValueChange={setEventTypeFilter}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Events</SelectItem>
                      <SelectItem value="auto_approval">Auto Approvals</SelectItem>
                      <SelectItem value="manual_approval">Manual Approvals</SelectItem>
                      <SelectItem value="rejection">Rejections</SelectItem>
                      <SelectItem value="security_alert">Security Alerts</SelectItem>
                      <SelectItem value="join_request">Join Requests</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Events List */}
          <Card>
            <CardHeader>
              <CardTitle>Security Events</CardTitle>
              <CardDescription>
                Showing {filteredEvents.length} of {securityEvents.length} events
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {loading ? (
                  <div className="text-center py-8">
                    <Activity className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground">Loading security events...</p>
                  </div>
                ) : filteredEvents.length === 0 ? (
                  <div className="text-center py-8">
                    <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No security events found.</p>
                  </div>
                ) : (
                  filteredEvents.map((event) => (
                    <div key={event.id} className="flex items-start gap-4 p-4 border rounded-lg hover:bg-accent/50 transition-colors">
                      <div className="flex-shrink-0 mt-1">
                        {getEventTypeIcon(event.event_type)}
                      </div>
                      
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            {getEventTypeBadge(event.event_type)}
                            <span className="text-sm text-muted-foreground">
                              {new Date(event.created_at).toLocaleString()}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setSelectedEvent(event)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        <div>
                          <p className="font-medium">{event.user_email}</p>
                          <p className="text-sm text-muted-foreground">
                            Domain: {event.user_domain} 
                            {event.ip_address && ` • IP: ${event.ip_address}`}
                          </p>
                        </div>
                        
                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {JSON.stringify(event.metadata, null, 2).slice(0, 100)}...
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="domains" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Globe className="h-5 w-5" />
                Domain Activity Summary
              </CardTitle>
              <CardDescription>
                Security events grouped by domain
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {domainActivity.length === 0 ? (
                  <div className="text-center py-8">
                    <Globe className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No domain activity found.</p>
                  </div>
                ) : (
                  domainActivity.map((domain) => (
                    <div key={domain.domain} className="flex items-center justify-between p-4 border rounded-lg">
                      <div className="space-y-1">
                        <p className="font-medium">{domain.domain}</p>
                        <p className="text-sm text-muted-foreground">
                          Last activity: {new Date(domain.latest_activity).toLocaleDateString()}
                        </p>
                      </div>
                      
                      <div className="flex items-center gap-4">
                        <div className="text-center">
                          <p className="text-sm font-medium">{domain.event_count}</p>
                          <p className="text-xs text-muted-foreground">Events</p>
                        </div>
                        
                        <div className="text-center">
                          <p className="text-sm font-medium">{domain.success_rate}%</p>
                          <p className="text-xs text-muted-foreground">Success</p>
                        </div>
                        
                        <Badge variant={domain.success_rate >= 80 ? 'default' : domain.success_rate >= 50 ? 'secondary' : 'destructive'}>
                          {domain.success_rate >= 80 ? 'High' : domain.success_rate >= 50 ? 'Medium' : 'Low'} Trust
                        </Badge>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Event Detail Modal */}
      {selectedEvent && (
        <Alert>
          <Shield className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <div className="font-medium">Event Details</div>
              <pre className="text-xs bg-muted p-2 rounded overflow-auto">
                {JSON.stringify(selectedEvent, null, 2)}
              </pre>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setSelectedEvent(null)}
              >
                Close
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};

export default SecurityLogsDashboard;