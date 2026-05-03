import React, { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { usePlatformAdmin } from '@/hooks/usePlatformAdmin';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { CheckCircle, XCircle, Clock, Users, Mail, Calendar } from 'lucide-react';

interface JoinRequest {
  id: string;
  user_email: string;
  user_name: string | null;
  requested_role: string;
  status: string;
  message: string | null;
  created_at: string;
  organization_id: string;
}

interface JoinRequestsManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

const JoinRequestsManager = ({ isOpen, onClose }: JoinRequestsManagerProps) => {
  const { profile } = useAuth();
  const { isPlatformAdmin, loading: adminLoading } = usePlatformAdmin();
  const { toast } = useToast();
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && isPlatformAdmin) {
      loadJoinRequests();
    }
  }, [isOpen, isPlatformAdmin]);

  const loadJoinRequests = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organization_join_requests')
        .select(`
          id,
          user_email,
          user_name,
          requested_role,
          status,
          message,
          created_at,
          organization_id
        `)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setRequests(data || []);
    } catch (error) {
      console.error('Error loading join requests:', error);
      toast({
        title: "Error",
        description: "Failed to load join requests",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleApprovalDecision = async (requestId: string, approved: boolean) => {
    setProcessingId(requestId);
    try {
      const { error } = await supabase
        .from('organization_join_requests')
        .update({
          status: approved ? 'approved' : 'rejected',
          reviewed_at: new Date().toISOString(),
          reviewed_by: profile?.id
        })
        .eq('id', requestId);

      if (error) throw error;

      toast({
        title: approved ? "Request Approved" : "Request Rejected",
        description: `Join request has been ${approved ? 'approved' : 'rejected'}`,
      });

      loadJoinRequests();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive"
      });
    } finally {
      setProcessingId(null);
    }
  };

  const getRoleDisplayName = (role: string) => {
    const roleMap: { [key: string]: string } = {
      'sales_rep': 'Sales Representative',
      'account_manager': 'Account Manager',
      'sdr': 'Sales Development Rep',
      'bdr': 'Business Development Rep',
      'sales_engineer': 'Sales Engineer',
      'manager': 'Manager',
      'member': 'Member',
      'user': 'General User'
    };
    return roleMap[role] || role;
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-300"><Clock className="w-3 h-3 mr-1" />Pending</Badge>;
      case 'approved':
        return <Badge variant="outline" className="text-green-600 border-green-300"><CheckCircle className="w-3 h-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="outline" className="text-red-600 border-red-300"><XCircle className="w-3 h-3 mr-1" />Rejected</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const pendingRequests = requests.filter(r => r.status === 'pending');
  const processedRequests = requests.filter(r => r.status !== 'pending');

  if (!isOpen) return null;

  if (adminLoading) {
    return (
      <div className="fixed inset-y-0 right-0 w-1/2 bg-background shadow-2xl border-l border-border z-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!isPlatformAdmin) {
    return null;
  }

  return (
    <div className="fixed inset-y-0 right-0 w-1/2 bg-background shadow-2xl border-l border-border z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-6 border-b border-border bg-gradient-to-r from-primary/5 to-secondary/5">
        <div>
          <h2 className="text-xl font-semibold text-foreground flex items-center gap-2">
            <Users className="w-5 h-5" />
            Organization Join Requests
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            {pendingRequests.length} pending approval{pendingRequests.length !== 1 ? 's' : ''}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={onClose}
          className="text-muted-foreground hover:text-foreground"
        >
          ✕
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
            <p className="mt-2 text-muted-foreground">Loading requests...</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pending Requests */}
            {pendingRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-foreground mb-4 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Pending Approval ({pendingRequests.length})
                </h3>
                <div className="space-y-4">
                  {pendingRequests.map((request) => (
                    <Card key={request.id} className="border-yellow-200/50">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <div className="font-medium text-foreground">{request.user_name || 'Unknown'}</div>
                            <div className="text-sm text-muted-foreground flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {request.user_email}
                            </div>
                          </div>
                          {getStatusBadge(request.status)}
                        </div>
                        
                        <div className="space-y-2 mb-4">
                          <div className="text-sm">
                            <span className="font-medium">Requested Role:</span> {getRoleDisplayName(request.requested_role)}
                          </div>
                          <div className="text-sm flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span className="font-medium">Requested:</span> {new Date(request.created_at).toLocaleDateString()}
                          </div>
                          {request.message && (
                            <div className="text-sm">
                              <span className="font-medium">Message:</span>
                              <p className="mt-1 text-muted-foreground bg-muted p-2 rounded">{request.message}</p>
                            </div>
                          )}
                        </div>

                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            onClick={() => handleApprovalDecision(request.id, true)}
                            disabled={processingId === request.id}
                            className="flex-1"
                          >
                            <CheckCircle className="w-4 h-4 mr-1" />
                            {processingId === request.id ? "Processing..." : "Approve"}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleApprovalDecision(request.id, false)}
                            disabled={processingId === request.id}
                            className="flex-1 border-destructive/30 text-destructive hover:bg-destructive/10"
                          >
                            <XCircle className="w-4 h-4 mr-1" />
                            Reject
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Processed Requests */}
            {processedRequests.length > 0 && (
              <div>
                <h3 className="text-lg font-medium text-foreground mb-4">
                  Recent Activity ({processedRequests.length})
                </h3>
                <div className="space-y-3">
                  {processedRequests.slice(0, 10).map((request) => (
                    <Card key={request.id} className="border-border">
                      <CardContent className="p-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="font-medium text-foreground">{request.user_name || 'Unknown'}</div>
                            <div className="text-sm text-muted-foreground">{request.user_email}</div>
                            <div className="text-xs text-muted-foreground mt-1">
                              {getRoleDisplayName(request.requested_role)} • {new Date(request.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          {getStatusBadge(request.status)}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Empty State */}
            {requests.length === 0 && (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Join Requests</h3>
                <p className="text-muted-foreground">
                  When users request to join organizations, they'll appear here for approval.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default JoinRequestsManager;
