import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react';

const SetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });

  const organizationName = searchParams.get('org') || 'your organization';

  // Handle recovery tokens from URL (for password reset flow)
  useEffect(() => {
    const setupSession = async () => {
      // Parse tokens from hash fragment (Supabase sends them as #access_token=...&refresh_token=...)
      const hash = window.location.hash.substring(1);
      const hashParams = new URLSearchParams(hash);
      
      // Also check query params (for PKCE flow)
      const queryParams = new URLSearchParams(window.location.search);
      
      const accessToken = hashParams.get('access_token') || queryParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token') || queryParams.get('refresh_token');
      const type = hashParams.get('type') || queryParams.get('type');
      const code = queryParams.get('code'); // PKCE flow
      
      console.log('Set password - parsing URL:', { 
        hash: window.location.hash ? 'present' : 'empty',
        search: window.location.search ? 'present' : 'empty',
        hasAccessToken: !!accessToken, 
        hasRefreshToken: !!refreshToken,
        hasCode: !!code,
        type 
      });
      
      // Handle PKCE code exchange first (newer Supabase flow)
      if (code) {
        try {
          console.log('Exchanging PKCE code for session...');
          const { data, error } = await supabase.auth.exchangeCodeForSession(code);
          
          if (error) {
            console.error('Code exchange error:', error);
            toast({
              title: "Link expired",
              description: "Please request a new password reset.",
              variant: "destructive",
            });
            navigate('/forgot-password');
            return;
          }
          
          if (data.session) {
            console.log('Session established via code exchange');
            // Check if this is a recovery flow via type param
            setIsRecoveryMode(type === 'recovery');
            setSessionReady(true);
            // Clear URL params for cleaner appearance
            window.history.replaceState(null, '', window.location.pathname);
            return;
          }
        } catch (error) {
          console.error('Code exchange exception:', error);
          toast({
            title: "Link expired",
            description: "Please request a new password reset.",
            variant: "destructive",
          });
          navigate('/forgot-password');
          return;
        }
      }
      
      // Handle direct token flow (older Supabase implicit grant)
      if (accessToken && refreshToken) {
        if (type !== 'recovery') {
          toast({
            title: "Invalid reset link",
            description: "This link is not for password reset.",
            variant: "destructive",
          });
          navigate('/login');
          return;
        }

        try {
          // Set the session with the tokens from the URL
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });

          if (error) {
            console.error('Session setup error:', error);
            toast({
              title: "Session error",
              description: "Unable to verify your reset link. Please request a new password reset.",
              variant: "destructive",
            });
            navigate('/forgot-password');
            return;
          }

          console.log('Session established successfully for password reset');
          setIsRecoveryMode(true);
          setSessionReady(true);
          
          // Clear the hash from URL for cleaner appearance
          window.history.replaceState(null, '', window.location.pathname);
        } catch (error: any) {
          console.error('Error setting up session:', error);
          toast({
            title: "Reset link error",
            description: "There was an error processing your reset link. Please try again.",
            variant: "destructive",
          });
          navigate('/forgot-password');
        }
      } else {
        // No tokens - check if user already has a session (invite flow)
        const { data: { session } } = await supabase.auth.getSession();
        if (session) {
          setSessionReady(true);
        } else {
          // No session and no tokens - redirect to login
          toast({
            title: "Session expired",
            description: "Please sign in or request a new password reset link.",
            variant: "destructive",
          });
          navigate('/login');
        }
      }
    };

    setupSession();
  }, [navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
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

      const { error } = await supabase.auth.updateUser({
        password: formData.password
      });

      if (error) {
        toast({
          title: "Error",
          description: error.message,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Password Updated",
        description: isRecoveryMode 
          ? "Your password has been reset. Please sign in with your new password."
          : "Your password has been set successfully!",
      });

      if (isRecoveryMode) {
        // Sign out and redirect to login for recovery flow
        await supabase.auth.signOut();
        navigate('/login');
      } else {
        // Redirect to app for invite flow
        navigate('/app');
      }
    } catch (error) {
      console.error('Error updating password:', error);
      toast({
        title: "Error",
        description: "Failed to update password. Please try again.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  // Show loading while setting up session
  if (!sessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Verifying your link...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {isRecoveryMode && (
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <img 
                src="/placeholder.svg" 
                alt="koffey.ai" 
                className="w-10 h-10"
              />
              <div>
                <h1 className="text-2xl font-bold text-foreground">Reset Password</h1>
                <p className="text-sm text-muted-foreground">Enter your new password</p>
              </div>
            </div>
          </div>
        )}
        
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="w-5 h-5" />
              {isRecoveryMode ? 'Set New Password' : 'Set Your Password'}
            </CardTitle>
            <CardDescription>
              {isRecoveryMode 
                ? 'Choose a strong password for your account.'
                : `Welcome to ${organizationName}! Please set your password to complete your account setup.`
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    required
                    disabled={loading}
                    minLength={6}
                    placeholder="Enter your new password"
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
                  type={showPassword ? "text" : "password"}
                  value={formData.confirmPassword}
                  onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                  required
                  disabled={loading}
                  minLength={6}
                  placeholder="Confirm your new password"
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {isRecoveryMode ? 'Updating Password...' : 'Setting Password...'}
                  </>
                ) : (
                  isRecoveryMode ? 'Update Password' : 'Set Password & Continue'
                )}
              </Button>
            </form>

            {isRecoveryMode && (
              <div className="mt-4 text-center">
                <Button 
                  variant="ghost" 
                  onClick={() => navigate('/login')}
                  className="text-sm"
                >
                  Back to Sign In
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default SetPassword;
