import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Clock, Presentation, Upload, Users, Settings } from 'lucide-react';
import { toast } from '@/hooks/use-toast';

interface BypassRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (reason: string, category: string) => Promise<void>;
}

const BYPASS_REASONS = [
  {
    value: 'demo',
    label: 'Showing a demo',
    icon: Presentation,
    description: 'Presenting to prospects or customers',
    duration: '2 hours'
  },
  {
    value: 'import',
    label: 'Importing customer data',
    icon: Upload,
    description: 'Bulk data migration or sync',
    duration: '30 minutes'
  },
  {
    value: 'cleanup',
    label: 'Data cleanup operations',
    icon: Settings,
    description: 'Removing duplicates or updating records',
    duration: '1 hour'
  },
  {
    value: 'team_training',
    label: 'Team training session',
    icon: Users,
    description: 'Training new team members',
    duration: '1 hour'
  },
  {
    value: 'other',
    label: 'Other urgent business need',
    icon: Clock,
    description: 'Please provide details below',
    duration: '15 minutes'
  }
];

export const BypassRequestDialog: React.FC<BypassRequestDialogProps> = ({
  open,
  onOpenChange,
  onSubmit
}) => {
  const [selectedReason, setSelectedReason] = useState('');
  const [customReason, setCustomReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!selectedReason) {
      toast({
        title: "Please select a reason",
        description: "We need to understand why you need a bypass to approve it quickly.",
        variant: "destructive"
      });
      return;
    }

    if (selectedReason === 'other' && !customReason.trim()) {
      toast({
        title: "Please provide details",
        description: "Help us understand your specific situation.",
        variant: "destructive"
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const reason = selectedReason === 'other' ? customReason : selectedReason;
      await onSubmit(reason, selectedReason);
      
      toast({
        title: "Request submitted!",
        description: "We'll review your request and get back to you quickly.",
      });
      
      onOpenChange(false);
      setSelectedReason('');
      setCustomReason('');
    } catch (error: any) {
      toast({
        title: "Failed to submit request",
        description: error.message || "Please try again",
        variant: "destructive"
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedReasonData = BYPASS_REASONS.find(r => r.value === selectedReason);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-600" />
            Request Rate Limit Bypass
          </DialogTitle>
          <DialogDescription>
            Help us understand your situation so we can approve your request quickly.
            Most requests are processed within minutes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <RadioGroup value={selectedReason} onValueChange={setSelectedReason}>
            {BYPASS_REASONS.map((reason) => {
              const Icon = reason.icon;
              return (
                <div
                  key={reason.value}
                  className="flex items-start space-x-3 p-3 rounded-lg border hover:bg-accent/50 cursor-pointer"
                  onClick={() => setSelectedReason(reason.value)}
                >
                  <RadioGroupItem value={reason.value} id={reason.value} className="mt-1" />
                  <div className="flex-1 min-w-0">
                    <Label 
                      htmlFor={reason.value} 
                      className="flex items-center gap-2 font-medium cursor-pointer"
                    >
                      <Icon className="h-4 w-4 text-blue-600" />
                      {reason.label}
                      <Badge variant="outline" className="text-xs">
                        {reason.duration}
                      </Badge>
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      {reason.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </RadioGroup>

          {selectedReason === 'other' && (
            <div className="space-y-2">
              <Label htmlFor="custom-reason">Please provide details</Label>
              <Textarea
                id="custom-reason"
                value={customReason}
                onChange={(e) => setCustomReason(e.target.value)}
                placeholder="Describe your specific situation..."
                className="min-h-[80px]"
              />
            </div>
          )}

          {selectedReasonData && selectedReasonData.value !== 'other' && (
            <div className="bg-blue-50 dark:bg-blue-950 p-3 rounded-lg">
              <p className="text-sm text-blue-800 dark:text-blue-200">
                <strong>Estimated approval time:</strong> Immediate for {selectedReasonData.label.toLowerCase()}
              </p>
              <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                Bypass duration: {selectedReasonData.duration}
              </p>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedReason || isSubmitting}
          >
            {isSubmitting ? 'Submitting...' : 'Submit Request'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};