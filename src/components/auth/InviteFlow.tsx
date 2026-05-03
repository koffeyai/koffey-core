import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

interface InviteData {
  organizationName: string;
  role: string;
  invitedBy: string;
}

const InviteFlow = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [validatingInvite, setValidatingInvite] = useState(true);
  const [inviteData, setInviteData] = useState<InviteData | null>(null);
  const [step, setStep] = useState<'validate' | 'signup' | 'complete'>('validate');
  const [showPassword, setShowPassword] = useState(false);
  
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    confirmPassword: ''
  });

const inviteCode = searchParams.get('invite') || searchParams.get('code') || searchParams.get('inviteCode');

  useEffect(() => {
    if (!inviteCode) {
      toast({
        title: "Invalid Invitation",
        description: "No invitation code found in the URL.",
        variant: "destructive"
      });
      navigate('/auth');
      return;
    }

    validateInvite();
  }, [inviteCode]);

  const validateInvite = async () => {
    if (!inviteCode) return;

    try {
      setValidatingInvite(true);
      
      const { data, error } = await supabase.functions.invoke('validate-invite', {
        body: { inviteCode }
      });

      if (error || (data && data.valid === false)) {
        toast({
          title: "Invalid Invitation",
          description: data?.error || "This invitation is invalid or has expired.",
          variant: "destructive"
        });
        navigate('/auth');
        return;
      }

      if (data?.valid || data?.success) {
        setInviteData({
          organizationName: data.organizationName,
          role: data.role,
          invitedBy: data.invitedBy
        });
        setStep('signup');

        // If the user is already authenticated (clicked from an invite email),
        // automatically redeem the invite and go to app
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session) {
          await redeemInvite(sessionData.session.user.id, 'app');
          return;
        }
      } else {
        toast({
          title: "Invalid Invitation",
          description: "This invitation is invalid or has expired.",
          variant: "destructive"
        });
        navigate('/auth');
      }
    } catch (error) {
      logger.error('Error validating invite', { error });
      toast({
        title: "Error",
        description: "Failed to validate invitation. Please try again.",
        variant: "destructive"
      });
      navigate('/auth');
    } finally {
      setValidatingInvite(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (formData.password !== formData.confirmPassword) {
      toast({
        title: "Password Mismatch",
        description: "Passwords do not match.",
        variant: "destructive"
      });
      return;
    }

    if (formData.password.length < 6) {
      toast({
        title: "Password Too Short",
        description: "Password must be at least 6 characters long.",
        variant: "destructive"
      });
      return;
    }

    try {
      setLoading(true);

      // Sign up the user
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: formData.email,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?invited=true&invite=${inviteCode}`
        }
      });

      if (authError) {
        toast({
          title: "Signup Error",
          description: authError.message,
          variant: "destructive"
        });
        return;
      }

      if (authData.user) {
        // If email confirmation is disabled, redeem invite immediately
        if (authData.session) {
          await redeemInvite(authData.user.id, 'set-password');
        } else {
          // Show email confirmation message
          setStep('complete');
        }
      }
    } catch (error) {
      logger.error('Signup error', { error });
      toast({
        title: "Error",
        description: "Failed to create account. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const redeemInvite = async (userId: string, redirect: 'app' | 'set-password' = 'set-password') => {
    try {
      const { data, error } = await supabase.functions.invoke('validate-invite', {
        body: { 
          inviteCode,
          userId,
          userEmail: formData.email
        }
      });

      if (error || !data.success) {
        toast({
          title: "Error",
          description: "Failed to join organization. Please contact support.",
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Welcome!",
        description: `You've successfully joined ${inviteData?.organizationName}!`,
      });

      if (redirect === 'set-password') {
        const orgParam = encodeURIComponent(inviteData?.organizationName || '');
        navigate(`/set-password?org=${orgParam}`);
      } else {
        navigate('/app');
      }
    } catch (error) {
      logger.error('Error redeeming invite', { error });
      toast({
        title: "Error",
        description: "Failed to join organization. Please try again.",
        variant: "destructive"
      });
    }
  };

  if (validatingInvite) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <div className="text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4" />
              <h2 className="text-xl font-semibold">Validating Invitation...</h2>
              <p className="text-muted-foreground mt-2">Please wait while we verify your invitation</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (step === 'complete') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Check Your Email</CardTitle>
            <CardDescription>
              We've sent a confirmation email to {formData.email}. Click the link in the email to complete your account setup and join {inviteData?.organizationName}.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => navigate('/auth')} 
              variant="outline" 
              className="w-full"
            >
              Back to Sign In
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Join {inviteData?.organizationName}</CardTitle>
          <CardDescription>
            You've been invited by {inviteData?.invitedBy} to join as a {inviteData?.role.replace('_', ' ')}. 
            Create your account to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSignup} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                required
                disabled={loading}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={formData.password}
                  onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                  required
                  disabled={loading}
                  minLength={6}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                  onClick={() => setShowPassword(!showPassword)}
                  disabled={loading}
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                required
                disabled={loading}
                minLength={6}
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating Account...
                </>
              ) : (
                'Join Organization'
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};

export default InviteFlow;