import { useState, type FormEvent } from 'react';
import { Navigate, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/components/auth/AuthProvider';
import LoadingFallback from '@/components/LoadingFallback';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Building, Mail, Users } from 'lucide-react';
import { clearPendingOrgSetup, loadPendingOrgSetup } from '@/lib/pendingOrgSetup';

const OrganizationSetup = () => {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const { toast } = useToast();
  const [orgName, setOrgName] = useState(() => loadPendingOrgSetup()?.orgName || '');
  const [orgDomain, setOrgDomain] = useState(() => loadPendingOrgSetup()?.domain || '');
  const [submitting, setSubmitting] = useState(false);

  // Show loading while checking auth
  if (loading) {
    return <LoadingFallback />;
  }

  // Redirect if not authenticated
  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const handleCreateOrganization = async (event: FormEvent) => {
    event.preventDefault();
    if (!orgName.trim()) return;

    setSubmitting(true);
    try {
      const normalizedDomain = orgDomain.trim();
      const { error } = await supabase.functions.invoke('create-org-with-user', {
        body: {
          userId: user.id,
          orgName: orgName.trim(),
          ...(normalizedDomain ? { domain: normalizedDomain } : {}),
        },
      });

      if (error) throw error;

      toast({
        title: 'Organization created',
        description: `${orgName.trim()} is ready. Redirecting to your CRM.`,
      });
      clearPendingOrgSetup();
      navigate('/onboarding', { replace: true });
    } catch (error) {
      toast({
        title: 'Organization setup failed',
        description: error instanceof Error ? error.message : 'Could not create the organization. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-amber-50/30">
      <div className="container mx-auto px-4 py-12">
        <div className="max-w-lg mx-auto space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-center mb-4">
                <div className="p-3 bg-primary/10 rounded-full">
                  <Building className="w-8 h-8 text-primary" />
                </div>
              </div>
              <CardTitle className="text-center">Create Your Organization</CardTitle>
              <CardDescription className="text-center">
                Set up a workspace for your team, or join an existing workspace with an invite.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-5">
              <form onSubmit={handleCreateOrganization} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="organization-name">Organization Name</Label>
                  <Input
                    id="organization-name"
                    value={orgName}
                    onChange={(event) => setOrgName(event.target.value)}
                    placeholder="Acme Corporation"
                    disabled={submitting}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="organization-domain">Company domain or website</Label>
                  <Input
                    id="organization-domain"
                    value={orgDomain}
                    onChange={(event) => setOrgDomain(event.target.value)}
                    placeholder="acme.com (optional)"
                    autoComplete="url"
                    disabled={submitting}
                  />
                  <p className="text-xs text-muted-foreground">
                    Only enter a domain your organization controls. Leave this blank for personal email domains or unverified workspaces.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={submitting || !orgName.trim()}>
                  <Building className="w-4 h-4 mr-2" />
                  {submitting ? 'Creating organization...' : 'Create organization'}
                </Button>
              </form>

              <div className="rounded-lg border bg-muted/40 p-4">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-5 w-5 text-muted-foreground" />
                  <div className="space-y-1">
                    <h4 className="font-medium">Joining an existing organization?</h4>
                    <p className="text-sm text-muted-foreground">
                      Use the invite link from your admin, or ask them to resend it.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-2 pt-2">
                <Link to="/invite">
                  <Button variant="outline" className="w-full">
                    <Users className="w-4 h-4 mr-2" />
                    Redeem invite
                  </Button>
                </Link>
                <Link to="/app">
                  <Button variant="ghost" className="w-full">
                    Return to app
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default OrganizationSetup;
