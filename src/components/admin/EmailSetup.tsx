import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Mail, CheckCircle, AlertCircle, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export const EmailSetup: React.FC = () => {
  const [isTestingEmail, setIsTestingEmail] = useState(false);
  const { toast } = useToast();

  const testEmailConfiguration = async () => {
    setIsTestingEmail(true);
    try {
      // Test email sending
      const response = await fetch('/api/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: 'test@example.com',
          subject: 'Email Configuration Test',
          html: '<p>This is a test email to verify email configuration.</p>'
        })
      });

      if (response.ok) {
        toast({
          title: 'Email Test Successful',
          description: 'Email configuration is working properly',
        });
      } else {
        throw new Error('Email test failed');
      }
    } catch (error) {
      toast({
        title: 'Email Test Failed',
        description: 'Please check your email configuration',
        variant: 'destructive'
      });
    } finally {
      setIsTestingEmail(false);
    }
  };

  const emailFeatures = [
    {
      name: 'User Invitations',
      status: 'configured',
      description: 'Send invitation emails to new users'
    },
    {
      name: 'Password Reset',
      status: 'configured', 
      description: 'Send password reset emails'
    },
    {
      name: 'Account Verification',
      status: 'configured',
      description: 'Send email verification links'
    }
  ];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'configured':
        return <Badge variant="outline" className="text-green-600 border-green-600"><CheckCircle className="w-3 h-3 mr-1" />Active</Badge>;
      case 'pending':
        return <Badge variant="outline" className="text-yellow-600 border-yellow-600"><AlertCircle className="w-3 h-3 mr-1" />Pending</Badge>;
      default:
        return <Badge variant="outline" className="text-red-600 border-red-600"><AlertCircle className="w-3 h-3 mr-1" />Not Set</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Mail className="h-5 w-5 text-blue-600" />
            <CardTitle>Email Configuration</CardTitle>
          </div>
          <Button 
            onClick={testEmailConfiguration}
            disabled={isTestingEmail}
            variant="outline"
            size="sm"
          >
            {isTestingEmail ? 'Testing...' : 'Test Email'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 bg-green-50 border border-green-200 rounded-lg">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <span className="text-sm font-medium text-green-800">Supabase Auth Email</span>
          </div>
          <Badge variant="outline" className="text-green-600 border-green-600">
            Configured
          </Badge>
        </div>

        <div className="space-y-2">
          <h4 className="font-medium text-sm">Email Features</h4>
          {emailFeatures.map((feature) => (
            <div key={feature.name} className="flex items-center justify-between p-2 border rounded">
              <div>
                <p className="text-sm font-medium">{feature.name}</p>
                <p className="text-xs text-muted-foreground">{feature.description}</p>
              </div>
              {getStatusBadge(feature.status)}
            </div>
          ))}
        </div>

        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start space-x-2">
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-800">Email Configuration</p>
              <p className="text-xs text-blue-600 mt-1">
                Emails are configured through Supabase Auth. 
                Check your Supabase dashboard for email settings.
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.open('https://supabase.com/dashboard', '_blank')}
            >
              <ExternalLink className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};