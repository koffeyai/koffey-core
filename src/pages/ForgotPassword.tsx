import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Mail, ArrowLeft, CheckCircle } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const { toast } = useToast();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    try {
      const redirectUrl = new URL('/set-password', window.location.origin).toString();

      console.log('Sending password reset to:', email, 'with redirect:', redirectUrl);

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        console.error('Password reset error:', error);
        throw error;
      }

      setEmailSent(true);
      toast({
        title: "Reset email sent",
        description: "Check your email for password reset instructions.",
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

  if (emailSent) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <img 
                src="/placeholder.svg" 
                alt="koffey.ai" 
                className="w-10 h-10"
              />
              <h1 className="text-2xl font-bold text-slate-900">koffey.ai</h1>
            </div>
          </div>

          <Card>
            <CardContent className="pt-8 text-center space-y-4">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto" />
              <h3 className="text-xl font-semibold">Check your email</h3>
              <p className="text-muted-foreground">
                We've sent password reset instructions to <strong>{email}</strong>
              </p>
              <p className="text-sm text-muted-foreground">
                The link will expire in 1 hour. If you don't see the email, check your spam folder.
              </p>
              <div className="pt-4">
                <Link to="/login" className="inline-flex items-center text-primary hover:underline">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back to Sign In
                </Link>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50/30 to-purple-50/20 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img 
              src="/placeholder.svg" 
              alt="koffey.ai" 
              className="w-10 h-10"
            />
            <div>
              <h1 className="text-2xl font-bold text-slate-900">koffey.ai</h1>
              <p className="text-sm text-slate-600">Password Reset</p>
            </div>
          </div>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-center mb-2">
              <Mail className="w-8 h-8 text-primary" />
            </div>
            <CardTitle className="text-center">Forgot your password?</CardTitle>
            <CardDescription className="text-center">
              Enter your email address and we'll send you a link to reset your password.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="reset-email">Email Address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Sending..." : "Send Reset Link"}
              </Button>
            </form>

            <div className="mt-4 text-center">
              <Link to="/login" className="inline-flex items-center text-sm text-muted-foreground hover:text-primary">
                <ArrowLeft className="w-4 h-4 mr-1" />
                Back to Sign In
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ForgotPassword;
