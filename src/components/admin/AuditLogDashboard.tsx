import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { format } from 'date-fns';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  History,
  Search,
  Download,
  Eye,
  Plus,
  Pencil,
  Trash2,
  RefreshCw,
  User
} from 'lucide-react';

interface AuditLogEntry {
  id: string;
  table_name: string;
  record_id: string;
  operation: string;
  old_values: any;
  new_values: any;
  changes: any;
  user_id: string;
  created_at: string;
}

interface UserInfo {
  id: string;
  full_name: string | null;
  email: string;
}

const AuditLogDashboard: React.FC = () => {
  const { toast } = useToast();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [loading, setLoading] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<AuditLogEntry[]>([]);
  const [userCache, setUserCache] = useState<Record<string, UserInfo>>({});

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [entityFilter, setEntityFilter] = useState('all');
  const [operationFilter, setOperationFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [dateRange, setDateRange] = useState('7');

  // Detail dialog
  const [selectedEntry, setSelectedEntry] = useState<AuditLogEntry | null>(null);

  // Unique users for filter dropdown
  const uniqueUsers = useMemo(() => {
    return Object.values(userCache).sort((a, b) => 
      (a.full_name || a.email).localeCompare(b.full_name || b.email)
    );
  }, [userCache]);

  // Unique entities for filter dropdown
  const uniqueEntities = useMemo(() => {
    return [...new Set(auditLogs.map(l => l.table_name))].sort();
  }, [auditLogs]);

  useEffect(() => {
    if (organizationId) {
      loadAuditData();
    }
  }, [organizationId, dateRange]);

  useEffect(() => {
    filterLogs();
  }, [auditLogs, searchTerm, entityFilter, operationFilter, userFilter]);

  const loadAuditData = async () => {
    if (!organizationId) return;

    setLoading(true);
    try {
      const daysAgo = parseInt(dateRange);
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - daysAgo);

      const { data: logs, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('organization_id', organizationId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: false })
        .limit(500);

      if (error) throw error;

      const typedLogs = (logs || []) as AuditLogEntry[];
      setAuditLogs(typedLogs);

      // Fetch user info
      const userIds = [...new Set(typedLogs.map(l => l.user_id).filter(Boolean))];
      if (userIds.length > 0) {
        const { data: users } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        if (users) {
          const cache: Record<string, UserInfo> = {};
          users.forEach(u => { cache[u.id] = u; });
          setUserCache(cache);
        }
      }
    } catch (error) {
      console.error('Failed to load audit data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load change log',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const filterLogs = useCallback(() => {
    let filtered = auditLogs;

    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(log =>
        log.table_name.toLowerCase().includes(term) ||
        log.record_id.toLowerCase().includes(term) ||
        getUserName(log.user_id).toLowerCase().includes(term)
      );
    }

    if (entityFilter !== 'all') {
      filtered = filtered.filter(log => log.table_name === entityFilter);
    }

    if (operationFilter !== 'all') {
      filtered = filtered.filter(log => log.operation === operationFilter);
    }

    if (userFilter !== 'all') {
      filtered = filtered.filter(log => log.user_id === userFilter);
    }

    setFilteredLogs(filtered);
  }, [auditLogs, searchTerm, entityFilter, operationFilter, userFilter, userCache]);

  const exportAuditLogs = () => {
    const csvContent = [
      ['Timestamp', 'Entity', 'Operation', 'User', 'Record ID'].join(','),
      ...filteredLogs.map(log => [
        format(new Date(log.created_at), 'yyyy-MM-dd HH:mm:ss'),
        log.table_name,
        log.operation,
        getUserName(log.user_id),
        log.record_id
      ].map(field => `"${field}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `change_log_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const getUserName = (userId: string): string => {
    const user = userCache[userId];
    return user?.full_name || user?.email || 'Unknown User';
  };

  const getOperationIcon = (operation: string) => {
    switch (operation) {
      case 'create':
        return <Plus className="h-4 w-4 text-green-500" />;
      case 'update':
        return <Pencil className="h-4 w-4 text-blue-500" />;
      case 'delete':
        return <Trash2 className="h-4 w-4 text-destructive" />;
      default:
        return <History className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getOperationBadge = (operation: string) => {
    const variants: Record<string, 'default' | 'secondary' | 'destructive'> = {
      create: 'default',
      update: 'secondary',
      delete: 'destructive'
    };
    return (
      <Badge variant={variants[operation] || 'outline'} className="capitalize">
        {operation}
      </Badge>
    );
  };

  const formatEntityName = (name: string): string => {
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, ' ');
  };

  const renderChangeDiff = (entry: AuditLogEntry) => {
    const changes = entry.changes;
    if (!changes || typeof changes !== 'object') return null;

    if (changes.created) {
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">Created with values:</p>
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-60">
            {JSON.stringify(changes.created, null, 2)}
          </pre>
        </div>
      );
    }

    if (changes.deleted) {
      return (
        <div className="space-y-2">
          <p className="text-sm font-medium">Deleted record:</p>
          <pre className="text-xs bg-muted p-3 rounded-lg overflow-auto max-h-60">
            {JSON.stringify(changes.deleted, null, 2)}
          </pre>
        </div>
      );
    }

    const changeEntries = Object.entries(changes);
    if (changeEntries.length === 0) return <p className="text-sm text-muted-foreground">No changes recorded</p>;

    return (
      <div className="space-y-3">
        {changeEntries.map(([field, change]: [string, any]) => (
          <div key={field} className="border rounded-lg p-3">
            <p className="text-sm font-medium mb-2">{formatEntityName(field)}</p>
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-muted-foreground mb-1">Before:</p>
                <p className="text-destructive bg-destructive/10 p-2 rounded">
                  {JSON.stringify(change?.from) || '(empty)'}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground mb-1">After:</p>
                <p className="text-green-600 bg-green-500/10 p-2 rounded">
                  {JSON.stringify(change?.to) || '(empty)'}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  if (!organizationId) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold mb-2">No Organization</h3>
          <p className="text-muted-foreground">Please select an organization to view the change log.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 p-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <History className="h-6 w-6" />
            Change Log
          </h1>
          <p className="text-sm text-muted-foreground">Track all changes to your CRM data</p>
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
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={loadAuditData} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline" size="icon" onClick={exportAuditLogs}>
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Filters - single row */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search changes..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={entityFilter} onValueChange={setEntityFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Entities" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Entities</SelectItem>
            {uniqueEntities.map(entity => (
              <SelectItem key={entity} value={entity}>
                {formatEntityName(entity)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={operationFilter} onValueChange={setOperationFilter}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="All Operations" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Operations</SelectItem>
            <SelectItem value="create">Created</SelectItem>
            <SelectItem value="update">Updated</SelectItem>
            <SelectItem value="delete">Deleted</SelectItem>
          </SelectContent>
        </Select>
        <Select value={userFilter} onValueChange={setUserFilter}>
          <SelectTrigger className="w-44">
            <User className="h-4 w-4 mr-2 text-muted-foreground" />
            <SelectValue placeholder="All Users" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Users</SelectItem>
            {uniqueUsers.map(user => (
              <SelectItem key={user.id} value={user.id}>
                {user.full_name || user.email}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Change Log List */}
      <ScrollArea className="h-[calc(100vh-280px)]">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="text-center py-12">
            <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-muted-foreground">No changes found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredLogs.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/50 transition-colors cursor-pointer group"
                onClick={() => setSelectedEntry(entry)}
              >
                <div className="flex items-center gap-3">
                  {getOperationIcon(entry.operation)}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {getUserName(entry.user_id)}
                      </span>
                      <span className="text-muted-foreground text-sm">
                        {entry.operation}d
                      </span>
                      <span className="text-sm">
                        {formatEntityName(entry.table_name)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {format(new Date(entry.created_at), 'MMM d, yyyy · h:mm a')}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </ScrollArea>

      {/* Detail Dialog */}
      <Dialog open={!!selectedEntry} onOpenChange={() => setSelectedEntry(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedEntry && getOperationIcon(selectedEntry.operation)}
              Change Details
            </DialogTitle>
          </DialogHeader>
          {selectedEntry && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Entity</p>
                  <p className="font-medium">{formatEntityName(selectedEntry.table_name)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Operation</p>
                  {getOperationBadge(selectedEntry.operation)}
                </div>
                <div>
                  <p className="text-muted-foreground">Changed by</p>
                  <p className="font-medium">{getUserName(selectedEntry.user_id)}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">When</p>
                  <p className="font-medium">
                    {format(new Date(selectedEntry.created_at), 'MMM d, yyyy · h:mm:ss a')}
                  </p>
                </div>
              </div>
              <div className="border-t pt-4">
                <p className="text-sm font-medium mb-3">What Changed</p>
                {renderChangeDiff(selectedEntry)}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AuditLogDashboard;
