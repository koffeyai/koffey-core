import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Coffee, Building, Users, CheckCircle, AlertCircle, ArrowLeft } from 'lucide-react';
import PasswordInput from '@/components/auth/PasswordInput';
import { logger } from '@/lib/logger';
import { clearPendingOrgSetup, savePendingOrgSetup } from '@/lib/pendingOrgSetup';
import { invalidateOrganizationAccessCache } from '@/hooks/useOrganizationAccess';


interface AuthData {
  action: 'invited_signup' | 'domain_discovery' | 'create_org' | 'signin_allowed';
  message?: string;
  orgName?: string;
  organizationId?: string;
  role?: string;
  inviteCode?: string;
  isNewDomain?: boolean;
}

interface OrgSetupFormProps {
  onSubmit: (orgData: { name: string; domain?: string }) => void;
  userEmail: string;
  loading: boolean;
}

const PERSONAL_EMAIL_DOMAINS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'icloud.com',
  'me.com',
  'mac.com',
  'aol.com',
  'proton.me',
  'protonmail.com',
  'pm.me',
  'hey.com',
  'zoho.com',
  'fastmail.com',
]);

function inferOrganizationDomain(email: string): string {
  const domain = email.split('@')[1]?.trim().toLowerCase() || '';
  return domain && !PERSONAL_EMAIL_DOMAINS.has(domain) ? domain : '';
}

function OrgSetupForm({ onSubmit, userEmail, loading }: OrgSetupFormProps) {
  const [orgName, setOrgName] = useState('')
  const [orgDomain, setOrgDomain] = useState(() => inferOrganizationDomain(userEmail))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (orgName.trim()) {
      const domain = orgDomain.trim()
      onSubmit({ name: orgName.trim(), ...(domain ? { domain } : {}) })
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
      <div className="space-y-2">
        <Label htmlFor="orgDomain">Company domain or website</Label>
        <Input
          id="orgDomain"
          value={orgDomain}
          onChange={(e) => setOrgDomain(e.target.value)}
          placeholder="acme.com (optional)"
          autoComplete="url"
          disabled={loading}
        />
        <p className="text-xs text-muted-foreground">
          Leave this blank for personal email domains or unverified workspaces.
        </p>
      </div>
      <Button 
        type="submit" 
        disabled={loading || !orgName.trim()}
        className="w-full"
      >
        {loading ? (
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
            Creating...
          </div>
        ) : (
          <>
            <Building className="w-4 h-4 mr-2" />
            Create Organization
          </>
        )}
      </Button>
    </form>
  )
}

export function AuthFlow() {
  const [step, setStep] = useState<'email' | 'create_org' | 'waiting' | 'success'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [existingUser, setExistingUser] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const passwordRef = useRef<HTMLInputElement>(null);

  // SEO: set title, description, canonical
  useEffect(() => {
    document.title = 'Create your Koffey account';
    const desc = 'Create your Koffey account to get started. Next: Organization setup.';
    let meta = document.querySelector('meta[name="description"]') as HTMLMetaElement | null;
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'description';
      document.head.appendChild(meta);
    }
    meta.content = desc;
    let link = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      document.head.appendChild(link);
    }
    link.href = window.location.href;
  }, []);

  // Check for invite code in URL on mount, but allow normal signups without one.
  useEffect(() => {
    const code = searchParams.get('code') || searchParams.get('invite') || searchParams.get('inviteCode');
    if (code) {
      setInviteCode(code);
      logger.info('Detected invite code', { code });
    }
  }, [searchParams]);

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      // First check if the email already exists
      const { data: existingProfile, error: existingCheckError } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (existingCheckError && existingCheckError.code !== 'PGRST116') {
        // PGRST116 means no rows found, which is expected for new users
        logger.warn('Existing account check error', { error: existingCheckError });
      }

      if (existingProfile) {
        // User exists - show message and don't proceed
        setExistingUser(true);
        toast({
          title: 'Account already exists',
          description: 'This email is already registered. Please use the sign in link below.',
          variant: 'default',
          duration: 10000, // Show for 10 seconds
        });
        setLoading(false);
        return; // Stop here, don't call edge function
      }

      // Only call edge function for new users
      const response = await supabase.functions.invoke('handle-auth', {
        body: { email, type: 'signup', inviteCode }
      });

      if (response.error) {
        // Try to extract the real error from the response body
        let errorMessage = response.error.message;
        try {
          const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          if (body?.error) errorMessage = body.error;
        } catch { /* use original message */ }

        if (errorMessage?.toLowerCase().includes('already exists')) {
          toast({
            title: 'Sign in required',
            description: 'This email already has an account. Please sign in instead.',
            variant: 'destructive',
          });
          return;
        }
        throw new Error(errorMessage);
      }

      const data = response.data as AuthData;
      setAuthData(data);

      // Handle different auth flows
      switch (data.action) {
        case 'invited_signup':
          await handleInvitedSignup();
          break;
        case 'domain_discovery':
          setStep('create_org');
          break;
        case 'create_org':
          setStep('create_org');
          break;
        default:
          // Fallback: stay on current step and require explicit user action
          break;
      }
  } catch (error: any) {
    logger.error('Auth flow error', { error });
    toast({
      title: 'Error',
      description: error.message || 'Failed to process request',
      variant: 'destructive',
    });
    } finally {
      setLoading(false);
    }
  };

  const handleInvitedSignup = async () => {
    try {
      // Create user account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: [firstName, lastName].map(part => part.trim()).filter(Boolean).join(' '),
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        // Redeem the invite
        if (inviteCode) {
          const inviteResponse = await supabase.functions.invoke('validate-invite', {
            body: { 
              inviteCode, 
              userEmail: email, 
              userId: data.user.id 
            }
          });

          if (inviteResponse.error) {
            logger.error('Failed to redeem invite', { error: inviteResponse.error });
          }
        }

        if (!data.user.email_confirmed_at) {
          setStep('waiting');
          toast({
            title: "Check your email",
            description: "We've sent you a confirmation link. Please check your email to complete setup.",
          });
        } else {
          setStep('success');
        }
      }
    } catch (error: any) {
      console.error('Invited signup error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to create account",
        variant: "destructive",
      });
    }
  };

  const handleOrgCreation = async (orgData: { name: string; domain?: string }) => {
    try {
      setLoading(true);

      // First create the user account
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/`,
          data: {
            first_name: firstName,
            last_name: lastName,
            full_name: [firstName, lastName].map(part => part.trim()).filter(Boolean).join(' '),
          }
        }
      });

      if (error) throw error;

      if (data.user) {
        savePendingOrgSetup({ orgName: orgData.name, domain: orgData.domain });

        if (!data.session) {
          setAuthData({
            action: 'create_org',
            orgName: orgData.name,
          });
          setStep('waiting');
          toast({
            title: 'Check your email',
            description: `Confirm your email, then sign in to finish creating ${orgData.name}.`,
          });
          return;
        }

        const orgResponse = await supabase.functions.invoke('create-org-with-user', {
          body: {
            userId: data.user.id,
            orgName: orgData.name,
            ...(orgData.domain ? { domain: orgData.domain } : {}),
          }
        });

        if (orgResponse.error) {
          let errMsg = orgResponse.error.message;
          try {
            const body = typeof orgResponse.data === 'string' ? JSON.parse(orgResponse.data) : orgResponse.data;
            if (body?.error) errMsg = body.error;
          } catch { /* use original */ }
          throw new Error(errMsg);
        }

        clearPendingOrgSetup();
        invalidateOrganizationAccessCache();
        setStep('success');
        toast({
          title: "Welcome to Koffey!",
          description: "Your organization has been created successfully.",
        });
      }
  } catch (error: any) {
    logger.error('Organization creation error', { error });
      toast({
        title: "Error",
        description: error.message || "Failed to create organization",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleJoinRequest = async () => {
    try {
      setLoading(true);

      if (!authData?.organizationId) {
        throw new Error('Organization information not available');
      }

      const response = await supabase.functions.invoke('request-to-join', {
        body: {
          organizationId: authData.organizationId,
          userEmail: email,
          userName: 'User',
          requestedRole: 'member',
          message: `Hi! I'd like to join ${authData.orgName}. My email domain suggests I might be part of your organization.`,
          ipAddress: null, // Could be added with additional client info
          userAgent: navigator.userAgent
        }
      });

      if (response.error) {
        let errMsg = response.error.message;
        try {
          const body = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
          if (body?.error) errMsg = body.error;
        } catch { /* use original */ }
        throw new Error(errMsg);
      }

      setStep('waiting');
      toast({
        title: "Request Sent",
        description: `Your request to join ${authData.orgName} has been sent to their administrators.`,
      });
    } catch (error: any) {
      console.error('Join request error:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to send join request",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };


  return (
    <main className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <Card className="w-full max-w-md">
        {step === 'email' && (
          <>
            <CardHeader className="">
              <div className="flex items-center justify-center mb-4">
                <Coffee className="h-8 w-8 text-primary mr-2" />
                <CardTitle className="text-2xl">Create your Koffey account</CardTitle>
              </div>
              <CardDescription className="text-center">
                {inviteCode ? "Complete your invitation" : "Enter your details to get started"}
              </CardDescription>
              <div className="text-center text-sm mt-2">
                <span className="text-muted-foreground">Already have an account? </span>
                <Link to="/login" className="text-primary underline underline-offset-4">Sign in</Link>
              </div>
            </CardHeader>
            <CardContent>
              {existingUser && (
                <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <div className="flex items-center gap-2 text-blue-800">
                    <AlertCircle className="h-5 w-5" />
                    <div>
                      <p className="font-medium">This email already has an account</p>
                      <p className="text-sm mt-1">
                        Please <Link to={`/login?email=${encodeURIComponent(email)}`} className="underline font-semibold">sign in here</Link> instead, or try a different email.
                      </p>
                    </div>
                  </div>
                </div>
              )}
              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      type="text"
                      autoComplete="given-name"
                      placeholder="First name"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      type="text"
                      autoComplete="family-name"
                      placeholder="Last name"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setExistingUser(false); // Reset when email changes
                    }}
                    required
                  />
                </div>
                <div>
                  <PasswordInput
                    ref={passwordRef}
                    currentPassword={password}
                    onChange={() => setPassword(passwordRef.current?.value || '')}
                    onInput={() => setPassword(passwordRef.current?.value || '')}
                  />
                  <div className="flex justify-end">
                    <Link to="/forgot-password" className="text-xs text-primary underline underline-offset-4 mt-1">
                      Forgot password?
                    </Link>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={loading}>
                  {loading ? (
                    <div className="flex items-center">
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing...
                    </div>
                  ) : (
                    <>
                      <Users className="w-4 h-4 mr-2" />
                      Create account
                    </>
                  )}
                </Button>
                <p className="text-xs text-muted-foreground text-center">
                  Next: Organization setup <Building className="inline-block w-4 h-4 ml-1" />
                </p>
              </form>
            </CardContent>
          </>
        )}

        {step === 'create_org' && (
          <>
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <div className="p-3 bg-blue-100 rounded-full">
                  <Building className="h-8 w-8 text-blue-600" />
                </div>
              </div>
              <CardTitle>Create Your Organization</CardTitle>
              <CardDescription>
                Set up your workspace to get started.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <OrgSetupForm
                onSubmit={handleOrgCreation}
                userEmail={email}
                loading={loading}
              />

              <Button
                onClick={() => setStep('email')}
                variant="outline"
                className="w-full"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
            </CardContent>
          </>
        )}


        {step === 'waiting' && (
          <>
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                {authData?.action === 'invited_signup' ? (
                  <Coffee className="h-12 w-12 text-blue-600" />
                ) : (
                  <CheckCircle className="h-12 w-12 text-green-600" />
                )}
              </div>
              <CardTitle>
                {authData?.action === 'invited_signup' 
                  ? "Looks like you've been invited for some koffey ☕" 
                  : authData?.action === 'create_org'
                    ? 'Check your email'
                    : "Request Sent"}
              </CardTitle>
              <CardDescription>
                {authData?.action === 'invited_signup'
                  ? "Please check your email to complete your invitation setup."
                  : authData?.action === 'create_org'
                    ? `We've sent a confirmation link to ${email}. After you verify it, sign in to finish creating ${authData?.orgName || 'your organization'}.`
                    : "Your request has been sent to the organization administrators. Please check your email for updates."
                }
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button 
                onClick={() => navigate('/login')} 
                variant="outline" 
                className="w-full"
              >
                Go to sign in
              </Button>
            </CardContent>
          </>
        )}

        {step === 'success' && (
          <>
            <CardHeader className="text-center">
              <div className="flex items-center justify-center mb-4">
                <Coffee className="h-12 w-12 text-green-600" />
              </div>
              <CardTitle>Welcome to Koffey!</CardTitle>
              <CardDescription>
                Your account has been created successfully.
                {authData?.orgName && ` You're now part of ${authData.orgName}.`}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                onClick={() => navigate('/onboarding')}
                className="w-full"
              >
                Connect Calendar & Get Started
              </Button>
              <Button
                onClick={() => navigate('/app')}
                variant="ghost"
                className="w-full text-gray-500"
              >
                Skip for now
              </Button>
            </CardContent>
          </>
        )}
      </Card>
    </main>
  );
}
