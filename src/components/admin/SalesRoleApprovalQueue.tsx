import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Check, RefreshCw, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { ROLE_LABELS } from '@/config/roleConfig';
import type { SalesRole } from '@/stores/activeViewRoleStore';
import { toast } from 'sonner';

interface PendingMember {
  id: string;
  user_id: string;
  sales_role: SalesRole;
  sales_role_status: string;
  joined_at: string;
  profile: {
    full_name: string | null;
    email: string | null;
  };
}

export const SalesRoleApprovalQueue: React.FC = () => {
  const { organizationId } = useOrganizationAccess();
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([]);
  const [overrideRole, setOverrideRole] = useState<Record<string, SalesRole>>({});
  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState<string | null>(null);

  const fetchPending = async () => {
    if (!organizationId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('organization_members')
        .select(`
          id,
          user_id,
          sales_role,
          sales_role_status,
          joined_at,
          profile:profiles!organization_members_user_id_fkey (
            full_name,
            email
          )
        `)
        .eq('organization_id', organizationId)
        .eq('sales_role_status', 'pending')
        .eq('is_active', true)
        .order('joined_at', { ascending: false });

      if (error) throw error;

      const mapped = (data || []).map((m: any) => ({
        id: m.id,
        user_id: m.user_id,
        sales_role: m.sales_role as SalesRole,
        sales_role_status: m.sales_role_status,
        joined_at: m.joined_at,
        profile: {
          full_name: m.profile?.full_name ?? null,
          email: m.profile?.email ?? null,
        },
      }));
      setPendingMembers(mapped);
    } catch (err: any) {
      console.error('Failed to fetch pending members:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPending();
  }, [organizationId]);

  const handleApprove = async (memberId: string) => {
    setApproving(memberId);
    try {
      const overriddenRole = overrideRole[memberId] || null;
      const { error } = await supabase.rpc('approve_sales_role', {
        p_member_id: memberId,
        p_approved_role: overriddenRole,
      });
      if (error) throw error;

      toast.success('Role approved');
      setPendingMembers(prev => prev.filter(m => m.id !== memberId));
    } catch (err: any) {
      console.error('Failed to approve role:', err);
      toast.error(err.message || 'Failed to approve role');
    } finally {
      setApproving(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          Loading pending approvals...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Sales Role Approvals
              {pendingMembers.length > 0 && (
                <Badge variant="secondary">{pendingMembers.length}</Badge>
              )}
            </CardTitle>
            <CardDescription>
              Approve or reassign sales roles for new team members
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={fetchPending}>
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {pendingMembers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Check className="h-10 w-10 mx-auto mb-3 text-green-500" />
            <p>No pending role approvals</p>
          </div>
        ) : (
          <div className="space-y-3">
            {pendingMembers.map(member => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div>
                  <div className="font-medium text-sm">
                    {member.profile.full_name || 'Unknown'}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {member.profile.email || member.user_id}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    Requested: <Badge variant="outline" className="text-xs">{ROLE_LABELS[member.sales_role] || member.sales_role}</Badge>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Select
                    value={overrideRole[member.id] || ''}
                    onValueChange={(val) =>
                      setOverrideRole(prev => ({ ...prev, [member.id]: val as SalesRole }))
                    }
                  >
                    <SelectTrigger className="w-[160px] h-8 text-xs">
                      <SelectValue placeholder="Reassign (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {(Object.entries(ROLE_LABELS) as [SalesRole, string][]).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    onClick={() => handleApprove(member.id)}
                    disabled={approving === member.id}
                  >
                    {approving === member.id ? 'Approving...' : 'Approve'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
