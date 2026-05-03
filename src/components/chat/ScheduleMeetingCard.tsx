import React from 'react';
import { Calendar, Clock, Mail, Send, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { SchedulePreviewPayload } from '@/hooks/useChat';

interface ScheduleMeetingCardProps {
  preview: SchedulePreviewPayload;
  onConfirm: () => void;
  onSelectSlot: (slotIndex: number) => void;
  onCancel: () => void;
  disabled?: boolean;
}

export const ScheduleMeetingCard: React.FC<ScheduleMeetingCardProps> = ({
  preview,
  onConfirm,
  onSelectSlot,
  onCancel,
  disabled = false,
}) => {
  const contactName = preview.contact?.name || 'Selected contact';
  const contactEmail = preview.contact?.email || '';
  const emailDraft = preview.email_draft;
  const availableSlots = Array.isArray(preview.available_slots) ? preview.available_slots : [];

  return (
    <Card className={cn(
      'max-w-[90%] border-2 border-l-4 border-l-amber-500 border-amber-200/70 bg-amber-50/30 dark:bg-amber-950/10',
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-amber-100 p-1.5 dark:bg-amber-900/30">
              <Calendar className="h-4 w-4 text-amber-700 dark:text-amber-300" />
            </div>
            <CardTitle className="text-sm font-semibold">Scheduling Preview</CardTitle>
          </div>
          <Badge variant="outline" className="text-[10px]">
            {preview.meeting_type || 'Meeting'}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        <div className="space-y-1 text-sm">
          <p>
            <span className="font-medium text-muted-foreground">To: </span>
            {contactName}{contactEmail ? ` <${contactEmail}>` : ''}
          </p>
          <p>
            <span className="font-medium text-muted-foreground">Proposed time: </span>
            {preview.suggested_time || 'Flexible timing'}
          </p>
          {preview.duration_minutes ? (
            <p>
              <span className="font-medium text-muted-foreground">Duration: </span>
              {preview.duration_minutes} minutes
            </p>
          ) : null}
        </div>

        {availableSlots.length > 1 ? (
          <div className="space-y-2 rounded-md border bg-background/60 p-2">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Clock className="h-3.5 w-3.5" />
              Available slots
            </p>
            <div className="grid gap-1.5">
              {availableSlots.slice(0, 3).map((slot, index) => (
                <Button
                  key={`${slot.start || slot.label || index}`}
                  variant="outline"
                  size="sm"
                  className="h-auto justify-start py-2 text-left text-xs"
                  disabled={disabled}
                  onClick={() => onSelectSlot(index + 1)}
                >
                  {index + 1}. {slot.label || slot.start}
                </Button>
              ))}
            </div>
          </div>
        ) : null}

        {emailDraft ? (
          <div className="space-y-2 rounded-md border bg-background/60 p-3 text-sm">
            <p className="flex items-center gap-1.5 font-medium">
              <Mail className="h-3.5 w-3.5" />
              Email draft
            </p>
            <p>
              <span className="font-medium text-muted-foreground">Subject: </span>
              {emailDraft.subject}
            </p>
            <div className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-xs">
              {emailDraft.body}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button onClick={onConfirm} disabled={disabled || !contactEmail} className="flex-1 min-w-[120px]">
            <Send className="mr-2 h-4 w-4" />
            Confirm and send
          </Button>
          <Button variant="ghost" size="sm" onClick={onCancel} disabled={disabled}>
            <X className="mr-1.5 h-4 w-4" />
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
