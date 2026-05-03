import React from 'react';
import { Meeting } from '@/hooks/useBriefing';
import { Calendar, Sparkles, CheckCircle2, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useChatPanelStore } from '@/stores/chatPanelStore';

interface Props {
  meetings: Meeting[];
}

export function MeetingsSection({ meetings }: Props) {
  const { openPanel } = useChatPanelStore();

  const handlePrepClick = (meeting: Meeting) => {
    openPanel(
      `Help me prepare for my ${meeting.time} meeting: ${meeting.title}`,
      { dealId: meeting.deal_id, type: 'meeting_prep' }
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Calendar className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">Today's Meetings</h3>
      </div>

      <div className="space-y-2">
        {meetings.map((meeting, index) => (
          <div 
            key={index}
            className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg border border-border/50"
          >
            <div className="text-center min-w-[60px]">
              <span className="text-sm font-medium text-foreground">{meeting.time}</span>
            </div>
            
            <div className="flex-1 min-w-0">
              <p className="font-medium text-foreground truncate">{meeting.title}</p>
              {meeting.key_insight && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Sparkles className="h-3 w-3 text-amber-500" />
                  {meeting.key_insight}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              {meeting.prep_ready ? (
                <span className="flex items-center gap-1 text-xs text-emerald-600">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Prepped
                </span>
              ) : (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => handlePrepClick(meeting)}
                >
                  Prep
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
