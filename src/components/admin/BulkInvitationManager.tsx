import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Mail, 
  Upload, 
  Download, 
  Users, 
  Clock, 
  CheckCircle, 
  XCircle,
  AlertTriangle,
  FileText,
  Send
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { safeSingle } from '@/lib/database';

interface InvitationResult {
  email: string;
  status: 'success' | 'error' | 'duplicate';
  message: string;
}

interface BulkInvitationResponse {
  success: boolean;
  summary: {
    total_processed: number;
    successful: number;
    failed: number;
    skipped: number;
  };
  details: Array<{
    email: string;
    action: string;
    invitation_id?: string;
  }>;
  errors: Array<{
    email: string;
    error: string;
  }>;
  timestamp: string;
  error?: string;
}

interface PendingInvitation {
  id: string;
  email: string;
  role: string;
  invited_by: string;
  expires_at: string;
  created_at: string;
  used_at: string | null;
}

interface InvitationStats {
  total_sent: number;
  total_used: number;
  total_expired: number;
  usage_rate: number;
}

const BulkInvitationManager: React.FC = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [organizationId, setOrganizationId] = useState<string | null>(null);
  
  // Bulk invitation state
  const [emailList, setEmailList] = useState('');
  const [selectedRole, setSelectedRole] = useState('member');
  const [invitationResults, setInvitationResults] = useState<InvitationResult[]>([]);
  const [progress, setProgress] = useState(0);
  
  // Pending invitations state
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);
  const [invitationStats, setInvitationStats] = useState<InvitationStats | null>(null);

  useEffect(() => {
    loadOrganizationData();
  }, []);

  useEffect(() => {
    if (organizationId) {
      loadPendingInvitations();
      loadInvitationStats();
    }
  }, [organizationId]);

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
          logContext: 'bulk_invitation_admin_check'
        }
      );

      if (membership) {
        setOrganizationId((membership as any).organization_id);
      }
    } catch (error) {
      console.error('Error loading organization data:', error);
    }
  };

  const loadPendingInvitations = async () => {
    try {
      if (!organizationId) return;

      const { data, error } = await supabase
        .from('organization_invitations')
        .select('*')
        .eq('organization_id', organizationId)
        .is('used_at', null)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setPendingInvitations(data || []);
    } catch (error) {
      console.error('Error loading pending invitations:', error);
    }
  };

  const loadInvitationStats = async () => {
    try {
      if (!organizationId) return;

      const { data, error } = await supabase
        .from('organization_invitations')
        .select('used_at, expires_at')
        .eq('organization_id', organizationId);

      if (error) throw error;

      const now = new Date();
      const total_sent = data.length;
      const total_used = data.filter(inv => inv.used_at).length;
      const total_expired = data.filter(inv => !inv.used_at && new Date(inv.expires_at) < now).length;
      const usage_rate = total_sent > 0 ? Math.round((total_used / total_sent) * 100) : 0;

      setInvitationStats({
        total_sent,
        total_used,
        total_expired,
        usage_rate
      });
    } catch (error) {
      console.error('Error loading invitation stats:', error);
    }
  };

  const validateEmails = (emailText: string): string[] => {
    const emails = emailText
      .split(/[,\n\r]/)
      .map(email => email.trim())
      .filter(email => email.length > 0);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emails.filter(email => emailRegex.test(email));
  };

  const sendBulkInvitations = async () => {
    if (!organizationId) {
      toast({
        title: "Error",
        description: "Organization not found",
        variant: "destructive"
      });
      return;
    }

    const emails = validateEmails(emailList);
    
    if (emails.length === 0) {
      toast({
        title: "No valid emails",
        description: "Please enter valid email addresses",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setProgress(0);
    setInvitationResults([]);

    try {
      // Check rate limits and admin privileges, then send invitations
      const { data, error } = await supabase.rpc('create_bulk_invitations', {
        org_id: organizationId,
        email_list: emails,
        default_role: selectedRole,
        invited_by_user: (await supabase.auth.getUser()).data.user?.id
      });

      if (error) throw error;

      const response = data as unknown as BulkInvitationResponse;
      
      if (!response.success) {
        throw new Error(response.error || 'Failed to send invitations');
      }

      // Convert to our result format
      const results: InvitationResult[] = [
        ...response.details.map(detail => ({
          email: detail.email,
          status: 'success' as const,
          message: detail.action === 'created' ? 'Invitation sent successfully' : 'Existing invitation updated'
        })),
        ...response.errors.map(error => ({
          email: error.email,
          status: 'error' as const,
          message: error.error
        }))
      ];

      setInvitationResults(results);
      setProgress(100);

      const successCount = response.summary.successful;
      const failedCount = response.summary.failed;
      const skippedCount = response.summary.skipped;

      toast({
        title: "Invitations sent",
        description: `Successfully sent ${successCount} out of ${emails.length} invitations${failedCount > 0 ? `, ${failedCount} failed` : ''}${skippedCount > 0 ? `, ${skippedCount} skipped` : ''}`,
      });

      // Refresh data
      loadPendingInvitations();
      loadInvitationStats();
      
    } catch (error: any) {
      toast({
        title: "Bulk invitation failed",
        description: error.message,
        variant: "destructive"
      });
      
      // Mark all as failed
      const results: InvitationResult[] = emails.map(email => ({
        email,
        status: 'error',
        message: error.message
      }));
      setInvitationResults(results);
    } finally {
      setLoading(false);
    }
  };

  const resendInvitation = async (invitationId: string, email: string) => {
    try {
      // Delete old invitation and create new one
      await supabase
        .from('organization_invitations')
        .delete()
        .eq('id', invitationId);

      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('organization_invitations')
        .insert({
          organization_id: organizationId,
          email: email,
          role: selectedRole,
          invited_by: user?.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });

      if (error) throw error;

      toast({
        title: "Invitation resent",
        description: `New invitation sent to ${email}`,
      });

      loadPendingInvitations();
    } catch (error: any) {
      toast({
        title: "Failed to resend",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const cancelInvitation = async (invitationId: string, email: string) => {
    try {
      const { error } = await supabase
        .from('organization_invitations')
        .delete()
        .eq('id', invitationId);

      if (error) throw error;

      toast({
        title: "Invitation cancelled",
        description: `Invitation for ${email} has been cancelled`,
      });

      loadPendingInvitations();
      loadInvitationStats();
    } catch (error: any) {
      toast({
        title: "Failed to cancel",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const downloadTemplate = () => {
    const csvContent = "email,role\nexample1@company.com,member\nexample2@company.com,admin\nexample3@company.com,sales_rep";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invitation_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!organizationId) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center">
            <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <h3 className="text-lg font-semibold mb-2">Access Denied</h3>
            <p className="text-muted-foreground">
              You need admin privileges to manage invitations.
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
          <h1 className="text-3xl font-bold">Bulk Invitations</h1>
          <p className="text-muted-foreground">
            Send invitations to multiple users at once
          </p>
        </div>
        <Button variant="outline" onClick={downloadTemplate}>
          <Download className="h-4 w-4 mr-2" />
          Download Template
        </Button>
      </div>

      {invitationStats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Send className="h-4 w-4 text-blue-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Total Sent</p>
                  <p className="text-2xl font-bold">{invitationStats.total_sent}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Used</p>
                  <p className="text-2xl font-bold">{invitationStats.total_used}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-yellow-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Expired</p>
                  <p className="text-2xl font-bold">{invitationStats.total_expired}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-purple-500" />
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Usage Rate</p>
                  <p className="text-2xl font-bold">{invitationStats.usage_rate}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      <Tabs defaultValue="send" className="space-y-6">
        <TabsList>
          <TabsTrigger value="send">Send Invitations</TabsTrigger>
          <TabsTrigger value="pending">Pending Invitations</TabsTrigger>
        </TabsList>

        <TabsContent value="send" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Send Bulk Invitations</CardTitle>
              <CardDescription>
                Enter email addresses (one per line or comma-separated) to send invitations
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="emails">Email Addresses</Label>
                <Textarea
                  id="emails"
                  placeholder="user1@company.com&#10;user2@company.com&#10;user3@company.com"
                  value={emailList}
                  onChange={(e) => setEmailList(e.target.value)}
                  rows={8}
                />
                <p className="text-sm text-muted-foreground">
                  {validateEmails(emailList).length} valid emails detected
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Default Role</Label>
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="sales_rep">Sales Representative</SelectItem>
                    <SelectItem value="marketing">Marketing</SelectItem>
                    <SelectItem value="operations">Operations</SelectItem>
                    <SelectItem value="admin">Admin</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  Rate limits apply: Maximum 50 invitations per hour per admin user.
                  Duplicate invitations will be skipped automatically.
                </AlertDescription>
              </Alert>

              {loading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span>Sending invitations...</span>
                    <span>{progress}%</span>
                  </div>
                  <Progress value={progress} />
                </div>
              )}

              <Button
                onClick={sendBulkInvitations}
                disabled={loading || validateEmails(emailList).length === 0}
                className="w-full"
              >
                {loading ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Sending Invitations...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Send {validateEmails(emailList).length} Invitations
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {invitationResults.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Invitation Results</CardTitle>
                <CardDescription>
                  Results from the last bulk invitation operation
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {invitationResults.map((result, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex items-center gap-3">
                        {result.status === 'success' ? (
                          <CheckCircle className="h-4 w-4 text-green-500" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-500" />
                        )}
                        <span className="font-medium">{result.email}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={result.status === 'success' ? 'default' : 'destructive'}>
                          {result.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground">{result.message}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="pending" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Pending Invitations</CardTitle>
              <CardDescription>
                Manage invitations that haven't been accepted yet
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {pendingInvitations.length === 0 ? (
                  <div className="text-center py-8">
                    <Mail className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No pending invitations.</p>
                  </div>
                ) : (
                  pendingInvitations.map((invitation) => {
                    const isExpired = new Date(invitation.expires_at) < new Date();
                    return (
                      <div key={invitation.id} className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{invitation.email}</span>
                            <Badge variant="outline">{invitation.role}</Badge>
                            {isExpired && <Badge variant="destructive">Expired</Badge>}
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Sent: {new Date(invitation.created_at).toLocaleDateString()} • 
                            Expires: {new Date(invitation.expires_at).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => resendInvitation(invitation.id, invitation.email)}
                          >
                            Resend
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => cancelInvitation(invitation.id, invitation.email)}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default BulkInvitationManager;