import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Building2, Users, Crown, Shield, User } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/hooks/use-toast';
import { OrganizationMembership } from '@/hooks/useOrganizationAccess';

interface OrganizationSelectorModalProps {
  open: boolean;
  onSelect: (organizationId: string) => void;
  onClose?: () => void;
  memberships: OrganizationMembership[];
}

const getRoleIcon = (role: string) => {
  switch (role) {
    case 'admin': return Crown;
    case 'manager': return Shield;
    default: return User;
  }
};

const getRoleColor = (role: string) => {
  switch (role) {
    case 'admin': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    case 'manager': return 'bg-blue-100 text-blue-800 border-blue-200';
    default: return 'bg-gray-100 text-gray-800 border-gray-200';
  }
};

export const OrganizationSelectorModal: React.FC<OrganizationSelectorModalProps> = ({
  open,
  onSelect,
  onClose,
  memberships
}) => {
  const [loading, setLoading] = useState(false);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    if (open && memberships.length > 0) {
      loadMemberCounts();
    }
  }, [open, memberships]);

  const loadMemberCounts = async () => {
    try {
      const orgIds = memberships.map(m => m.organization_id);
      const { data, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .in('organization_id', orgIds)
        .eq('is_active', true);

      if (error) throw error;

      const counts: Record<string, number> = {};
      data?.forEach(item => {
        counts[item.organization_id] = (counts[item.organization_id] || 0) + 1;
      });

      setMemberCounts(counts);
    } catch (error) {
      console.error('Failed to load member counts:', error);
    }
  };

  const handleSelect = async (organizationId: string) => {
    setLoading(true);
    try {
      // Store the selected organization in localStorage for future sessions
      localStorage.setItem('selectedOrganizationId', organizationId);
      
      onSelect(organizationId);
      
      toast({
        title: 'Organization selected',
        description: 'Loading your workspace...'
      });
    } catch (error) {
      console.error('Failed to select organization:', error);
      toast({
        title: 'Error',
        description: 'Failed to select organization. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Select Your Organization
          </DialogTitle>
          <p className="text-sm text-muted-foreground">
            You're a member of multiple organizations. Choose which one to access.
          </p>
        </DialogHeader>

        <div className="space-y-4 max-h-96 overflow-y-auto">
          {memberships.map((membership) => {
            const organization = membership.organization;
            const RoleIcon = getRoleIcon(membership.role);
            const memberCount = memberCounts[organization.id] || 0;

            return (
              <Card 
                key={organization.id} 
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleSelect(organization.id)}
              >
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Building2 className="h-5 w-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-lg">{organization.name}</h3>
                        {organization.domain && (
                          <p className="text-sm text-muted-foreground">
                            {organization.domain}
                          </p>
                        )}
                        <div className="flex items-center gap-2 mt-1">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${getRoleColor(membership.role)}`}
                          >
                            <RoleIcon className="h-3 w-3 mr-1" />
                            {membership.role}
                          </Badge>
                          {memberCount > 0 && (
                            <Badge variant="secondary" className="text-xs">
                              <Users className="h-3 w-3 mr-1" />
                              {memberCount} members
                            </Badge>
                          )}
                        </div>
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      disabled={loading}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelect(organization.id);
                      }}
                    >
                      Enter
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <p className="text-xs text-muted-foreground">
            Your selection will be remembered for future sessions
          </p>
          {onClose && (
            <Button variant="ghost" onClick={onClose} disabled={loading}>
              Cancel
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};