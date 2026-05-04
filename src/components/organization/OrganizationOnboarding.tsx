import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { clearPendingOrgSetup } from '@/lib/pendingOrgSetup';
import { invalidateOrganizationAccessCache } from '@/hooks/useOrganizationAccess';

interface OrganizationOnboardingProps {
  onComplete: () => void;
  initialOrgName?: string;
}

export const OrganizationOnboarding: React.FC<OrganizationOnboardingProps> = ({ onComplete, initialOrgName = '' }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [orgName, setOrgName] = useState(initialOrgName);
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgName.trim() || !user) return;

    setLoading(true);
    try {
      const response = await supabase.functions.invoke('create-org-with-user', {
        body: {
          userId: user.id,
          orgName: orgName.trim(),
        },
      });

      if (response.error) {
        let errMsg = response.error.message;
        try {
          const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          if (body?.error) errMsg = body.error;
        } catch { /* use original */ }
        throw new Error(errMsg);
      }

      toast({
        title: 'Organization created',
        description: `${orgName.trim()} is ready to go.`,
      });
      clearPendingOrgSetup();
      invalidateOrganizationAccessCache();
      onComplete();
    } catch (error: any) {
      toast({
        title: 'Failed to create organization',
        description: error.message || 'Something went wrong. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <div className="flex items-center justify-center mb-4">
              <div className="p-3 bg-blue-100 rounded-full">
                <Building className="w-8 h-8 text-blue-600" />
              </div>
            </div>
            <CardTitle>Create Your Organization</CardTitle>
            <CardDescription>
              Set up your workspace to get started with your CRM.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="orgName">Organization Name</Label>
                <Input
                  id="orgName"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Enter your company name"
                  required
                  disabled={loading}
                />
              </div>
              <Button
                type="submit"
                disabled={loading || !orgName.trim()}
                className="w-full"
              >
                {loading ? 'Creating...' : 'Create Organization'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
