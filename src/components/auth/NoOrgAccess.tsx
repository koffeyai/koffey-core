import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Building2, Mail } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '@/components/auth/AuthProvider'

export function NoOrgAccess() {
  const navigate = useNavigate();
  const { signOut } = useAuth();
  
  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md space-y-6">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="flex items-center justify-center gap-2">
              <Building2 className="w-5 h-5" />
              Organization Access Required
            </CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              You need to be part of an organization to access Koffey CRM.
            </p>
            
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800">
                You can create your organization now, or join an existing one from an invitation email.
              </p>
            </div>

            <div className="space-y-2 pt-2">
              <h3 className="font-medium text-sm">What you can do:</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Create your own organization</li>
                <li>• Ask your admin for an invitation</li>
                <li>• Check your email for existing invites</li>
              </ul>
            </div>

            <Button
              onClick={() => navigate('/organization-setup')}
              className="w-full"
            >
              Create Organization
            </Button>

            <Button
              variant="outline"
              onClick={handleSignOut}
              className="w-full"
            >
              Sign Out
            </Button>

            <div className="pt-4 border-t">
              <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                <Mail className="w-3 h-3" />
                Need help? Contact support
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6 text-center">
            <p className="text-sm text-muted-foreground">
              You don't have access to an organization yet. Create one now or check your email for an invitation.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
