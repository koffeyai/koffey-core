import React from 'react';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Building, Users, AlertCircle, Loader2, Mail } from 'lucide-react';

interface OrganizationGuardProps {
  children: React.ReactNode;
  onCreateOrganization: () => void;
  onJoinOrganization: () => void;
}

export const OrganizationGuard: React.FC<OrganizationGuardProps> = ({
  children,
  onJoinOrganization
}) => {
  const { loading, hasOrganization, currentOrganization, error } = useOrganizationAccess();

  // Enhanced loading state with better UX
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <Loader2 className="h-12 w-12 text-blue-500 mx-auto mb-4 animate-spin" />
            <CardTitle className="text-xl">Loading Organization</CardTitle>
          </CardHeader>
          <CardContent className="text-center">
            <p className="text-gray-600">
              Checking your organization membership...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Handle organization access errors gracefully
  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <Card>
            <CardHeader className="text-center">
              <AlertCircle className="h-12 w-12 text-orange-500 mx-auto mb-4" />
              <CardTitle className="text-xl text-orange-600">Organization Access Issue</CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-gray-600">
                We're having trouble accessing your organization information. This might be temporary.
              </p>
              <div className="space-y-3">
                <Button onClick={() => window.location.reload()} className="w-full">
                  Try Again
                </Button>
                <div className="text-sm text-gray-500">
                  <p>If this continues, you can:</p>
                  <div className="mt-2 space-y-2">
                    <Button 
                      onClick={onJoinOrganization}
                      variant="outline"
                      className="w-full"
                    >
                      <Users className="w-4 h-4 mr-2" />
                      Join Existing Organization
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Show organization selection if user has no organization
  if (!hasOrganization) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          <Card>
            <CardHeader className="text-center">
              <Building className="h-12 w-12 text-blue-500 mx-auto mb-4" />
              <CardTitle className="text-xl">Organization Required</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-gray-600 text-center">
                To access CRM features, you need to be part of an organization.
              </p>
              
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-800">
                  You can create a new organization from the signup flow, or join an existing one via invitation.
                </p>
              </div>
              
              <div className="space-y-3">
                <Button 
                  onClick={onJoinOrganization}
                  className="w-full justify-start"
                >
                  <Users className="w-4 h-4 mr-2" />
                  Join via Invitation
                </Button>
              </div>

              <div className="pt-4 border-t text-center">
                <p className="text-xs text-gray-500 flex items-center justify-center gap-1">
                  <Mail className="w-3 h-3" />
                  Check your email for organization invites
                </p>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No organization access. Contact your administrator or check your email for an invitation.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // User has organization access, show the protected content
  return (
    <div>
      {/* Organization context bar */}
      <div className="bg-blue-50 border-b border-blue-200 px-6 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Building className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-medium text-blue-900">
              {currentOrganization?.organization.name}
            </span>
            <span className="text-xs text-blue-600 bg-blue-100 px-2 py-1 rounded">
              {currentOrganization?.role}
            </span>
          </div>
        </div>
      </div>
      {children}
    </div>
  );
};