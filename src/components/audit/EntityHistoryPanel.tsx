import React, { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { AuditEntry } from '@/services/AuditService';
import { useAuditLog } from '@/hooks/useAuditLog';
import { supabase } from '@/integrations/supabase/client';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  History, 
  Plus, 
  Pencil, 
  Trash2, 
  User, 
  Clock,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertCircle
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface EntityHistoryPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entityId: string;
  entityType: string;
  entityName?: string;
}

interface UserInfo {
  id: string;
  full_name: string | null;
  email: string;
}

export const EntityHistoryPanel: React.FC<EntityHistoryPanelProps> = ({
  open,
  onOpenChange,
  entityId,
  entityType,
  entityName
}) => {
  const { getEntityHistory } = useAuditLog();
  const [history, setHistory] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());
  const [userCache, setUserCache] = useState<Record<string, UserInfo>>({});

  useEffect(() => {
    if (open && entityId) {
      loadHistory();
    }
  }, [open, entityId]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const entries = await getEntityHistory(entityId);
      setHistory(entries);
      
      // Fetch user info for all unique user IDs
      const userIds = [...new Set(entries.map(e => e.user_id).filter(Boolean))];
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
      console.error('Failed to load entity history:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpanded = (id: string) => {
    setExpandedEntries(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
    const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
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

  const getApprovalBadge = (status: string) => {
    switch (status) {
      case 'auto_approved':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Auto-approved
          </Badge>
        );
      case 'approved':
        return (
          <Badge variant="outline" className="text-green-600 border-green-600/30">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        );
      case 'pending':
        return (
          <Badge variant="outline" className="text-amber-600 border-amber-600/30">
            <AlertCircle className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        );
      case 'rejected':
        return (
          <Badge variant="outline" className="text-destructive border-destructive/30">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        );
      default:
        return null;
    }
  };

  const renderChangeDiff = (changes: any) => {
    if (!changes || typeof changes !== 'object') return null;
    
    // Handle created/deleted records
    if (changes.created) {
      return (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Created with:</p>
          {Object.entries(changes.created).map(([key, value]) => (
            <div key={key} className="text-xs pl-2 border-l-2 border-green-500/30">
              <span className="font-medium text-foreground">{formatFieldName(key)}:</span>{' '}
              <span className="text-green-600">{formatValue(value)}</span>
            </div>
          ))}
        </div>
      );
    }

    if (changes.deleted) {
      return (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground font-medium">Deleted record:</p>
          {Object.entries(changes.deleted).map(([key, value]) => (
            <div key={key} className="text-xs pl-2 border-l-2 border-destructive/30">
              <span className="font-medium text-foreground">{formatFieldName(key)}:</span>{' '}
              <span className="text-destructive line-through">{formatValue(value)}</span>
            </div>
          ))}
        </div>
      );
    }

    // Handle field-level changes
    const changeEntries = Object.entries(changes);
    if (changeEntries.length === 0) {
      return <p className="text-xs text-muted-foreground">No changes recorded</p>;
    }

    return (
      <div className="space-y-2">
        {changeEntries.map(([field, change]: [string, any]) => (
          <div key={field} className="text-xs">
            <span className="font-medium text-foreground">{formatFieldName(field)}:</span>
            <div className="pl-2 mt-1 space-y-0.5">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">From:</span>
                <span className="text-destructive line-through">{formatValue(change?.from)}</span>
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground">To:</span>
                <span className="text-green-600">{formatValue(change?.to)}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  };

  const formatFieldName = (field: string): string => {
    return field
      .replace(/_/g, ' ')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const formatValue = (value: any): string => {
    if (value === null || value === undefined) return '(empty)';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const getUserName = (userId: string): string => {
    const user = userCache[userId];
    if (user) {
      return user.full_name || user.email || 'Unknown User';
    }
    return 'Unknown User';
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Change History
          </SheetTitle>
          <SheetDescription>
            {entityName ? `History for ${entityName}` : `${entityType} change history`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-120px)] mt-6 pr-4">
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-4 w-32" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ))}
            </div>
          ) : history.length === 0 ? (
            <div className="text-center py-12">
              <History className="h-12 w-12 mx-auto mb-4 text-muted-foreground/50" />
              <p className="text-muted-foreground">No history recorded for this record.</p>
            </div>
          ) : (
            <div className="relative">
              {/* Timeline line */}
              <div className="absolute left-[15px] top-6 bottom-6 w-px bg-border" />
              
              <div className="space-y-4">
                {history.map((entry, index) => (
                  <Collapsible
                    key={entry.id}
                    open={expandedEntries.has(entry.id)}
                    onOpenChange={() => toggleExpanded(entry.id)}
                  >
                    <div className="relative pl-10">
                      {/* Timeline dot */}
                      <div className="absolute left-0 top-1 w-8 h-8 rounded-full bg-background border-2 border-border flex items-center justify-center">
                        {getOperationIcon(entry.operation)}
                      </div>
                      
                      <div className="border rounded-lg p-3 bg-card hover:bg-accent/30 transition-colors">
                        <CollapsibleTrigger className="w-full text-left">
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                {getOperationBadge(entry.operation)}
                                {getApprovalBadge(entry.approval_status)}
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <User className="h-3 w-3" />
                                <span>{getUserName(entry.user_id)}</span>
                              </div>
                              
                              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                <Clock className="h-3 w-3" />
                                <span>{format(new Date(entry.created_at), 'MMM d, yyyy h:mm a')}</span>
                              </div>
                            </div>
                            
                            <div className="flex-shrink-0">
                              {expandedEntries.has(entry.id) ? (
                                <ChevronDown className="h-4 w-4 text-muted-foreground" />
                              ) : (
                                <ChevronRight className="h-4 w-4 text-muted-foreground" />
                              )}
                            </div>
                          </div>
                        </CollapsibleTrigger>
                        
                        <CollapsibleContent className="mt-3 pt-3 border-t">
                          {renderChangeDiff(entry.changes)}
                          
                          {entry.reason && (
                            <div className="mt-2 pt-2 border-t">
                              <p className="text-xs text-muted-foreground">
                                <span className="font-medium">Reason:</span> {entry.reason}
                              </p>
                            </div>
                          )}
                        </CollapsibleContent>
                      </div>
                    </div>
                  </Collapsible>
                ))}
              </div>
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
};
