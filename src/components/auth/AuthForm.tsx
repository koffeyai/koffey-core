import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Link } from 'react-router-dom';
import { resendVerificationEmail } from '@/components/auth/authCleanup';

export const AuthForm = () => {
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [resendingVerification, setResendingVerification] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    email: '',
    password: '',
  });

  useEffect(() => {
    const prefill = searchParams.get('email');
    if (prefill) {
      setFormData(prev => ({ ...prev, email: prefill }));
    }
  }, [searchParams]);

  const handleInputChange = (field: string, value: string) => {
    if (field === 'email') {
      setNeedsVerification(false);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setNeedsVerification(false);

    try {
      await signIn(formData.email, formData.password);
      toast({
        title: "Welcome back!",
        description: "You have successfully signed in.",
      });
      
      // Redirect to the intended destination or default to /app
      const redirectTo = searchParams.get('redirect') || '/app';
      navigate(redirectTo);
    } catch (error: any) {
      console.error('Sign in error:', error);
      
      // Check if this is an unverified email error
      if (error.message?.includes('Email not confirmed')) {
        setNeedsVerification(true);
        toast({
          title: "Email not verified",
          description: "Please verify your email address first. Check your email for a verification link, or try the signup flow to resend verification.",
          variant: "destructive",
        });
        return;
      }
      
      // Provide more helpful error messages
      let errorMessage = error.message;
      if (error.message?.includes('Invalid login credentials')) {
        errorMessage = "Invalid email or password. Please check your credentials and try again.";
      }
      
      toast({
        title: "Sign in failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleResendVerification = async () => {
    if (!formData.email) {
      toast({
        title: "Email required",
        description: "Enter your email address first so we know where to resend the verification link.",
        variant: "destructive",
      });
      return;
    }

    setResendingVerification(true);
    try {
      await resendVerificationEmail(formData.email);
      toast({
        title: "Verification email sent",
        description: "Check your inbox for a new verification link, then come back here and sign in.",
      });
    } catch (error: any) {
      toast({
        title: "Resend failed",
        description: error.message || "We couldn't resend the verification email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setResendingVerification(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!formData.email) {
      toast({
        title: "Email required",
        description: "Please enter your email address first.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const redirectUrl = new URL('/reset-password', window.location.origin).toString();

      const { error } = await supabase.auth.resetPasswordForEmail(formData.email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.error('Password reset error:', error);
        throw error;
      }

      toast({
        title: "Reset email sent",
        description: "Check your email for password reset instructions. The link will be valid for 1 hour.",
      });
    } catch (error: any) {
      console.error('Password reset failed:', error);
      toast({
        title: "Reset failed",
        description: error.message || "Failed to send reset email. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo and branding */}
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src="/placeholder.svg" 
              alt="koffey.ai" 
              className="w-10 h-10"
            />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">koffey.ai</h1>
              <p className="text-sm text-slate-600">Your intelligent sales assistant</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Welcome Back</CardTitle>
            <CardDescription>
              Sign in to your account to continue
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignIn} className="space-y-4" autoComplete="on">
              <div>
                <Label htmlFor="signin-email">Email</Label>
                <Input
                  id="signin-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="Enter your email"
                  required
                />
              </div>
              
              <div>
                <Label htmlFor="signin-password">Password</Label>
                <div className="relative">
                  <Input
                    id="signin-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    spellCheck="false"
                    data-lpignore="true"
                    data-form-type="other"
                    value={formData.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    placeholder="Enter your password"
                    required
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="absolute right-2 top-1/2 -translate-y-1/2"
                    onClick={() => setShowPassword(!showPassword)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </Button>
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={loading}
                className="w-full"
              >
                {loading ? "Signing in..." : "Sign In"}
              </Button>
            </form>

            {needsVerification ? (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <p className="font-medium">Your account still needs email verification.</p>
                <p className="mt-1">Open the verification email, or resend it below.</p>
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 w-full"
                  disabled={resendingVerification}
                  onClick={handleResendVerification}
                >
                  {resendingVerification ? "Sending verification email..." : "Resend verification email"}
                </Button>
              </div>
            ) : null}
            
            <div className="mt-4 space-y-3">
              <div className="text-center">
              <p className="text-sm text-muted-foreground">
                  Don't have an account?{" "}
                  <Link
                    to="/signup"
                    className="text-primary hover:underline font-semibold"
                  >
                    Sign up
                  </Link>
                </p>
              </div>
              
              <div className="text-center">
                <Link 
                  to="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  Forgot your password?
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  );
};
