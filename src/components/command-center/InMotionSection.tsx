import React from 'react';
import { InMotionItem } from '@/hooks/useBriefing';
import { Clock, CheckCircle2 } from 'lucide-react';

interface Props {
  items: InMotionItem[];
}

export function InMotionSection({ items }: Props) {
  const handleDealClick = (dealId?: string, dealName?: string) => {
    if (dealId || dealName) {
      window.dispatchEvent(new CustomEvent('open-deal-dialog', { detail: { dealId, dealName } }));
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-muted-foreground" />
        <h3 className="text-lg font-semibold text-foreground">In Motion</h3>
        <span className="text-sm text-muted-foreground">(off your plate right now)</span>
      </div>

      <div className="space-y-2">
        {items.map((item) => (
          <div 
            key={item.deal_id}
            className={`flex items-start gap-3 p-3 bg-muted/30 rounded-lg border border-border/50 ${item.deal_id ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
            onClick={() => handleDealClick(item.deal_id, item.deal_name)}
          >
            {item.your_part_done && (
              <CheckCircle2 className="h-4 w-4 text-emerald-500 mt-0.5 flex-shrink-0" />
            )}
            <div>
              <p className="text-sm text-foreground">
                <span className="font-medium">{item.deal_name}</span>
                <span className="text-muted-foreground"> — {item.what}</span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {item.context}
              </p>
            </div>
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground italic px-1">
        These aren't stalled — they're in process. You've done your part.
        Focus your energy where you have leverage today.
      </p>
    </div>
  );
}
