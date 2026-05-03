import React from 'react';
import { Momentum } from '@/hooks/useBriefing';
import { TrendingUp, Trophy, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface Props {
  momentum: Momentum;
}

export function MomentumSection({ momentum }: Props) {
  const navigate = useNavigate();

  const handleDealClick = (dealId?: string, dealName?: string) => {
    if (dealId || dealName) {
      window.dispatchEvent(new CustomEvent('open-deal-dialog', { detail: { dealId, dealName } }));
    }
  };

  return (
    <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 border border-emerald-500/20 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="h-5 w-5 text-emerald-500" />
        <h3 className="text-lg font-semibold text-foreground">Your Momentum</h3>
      </div>

      <p className="text-muted-foreground mb-4">{momentum.summary}</p>

      {/* Wins */}
      {momentum.wins?.length > 0 && (
        <div className="space-y-2 mb-4">
          {momentum.wins.map((win, i) => (
            <div 
              key={i} 
              className={`flex items-start gap-3 p-3 bg-emerald-500/10 rounded-lg ${win.deal_id ? 'cursor-pointer hover:bg-emerald-500/15 transition-colors' : ''}`}
              onClick={() => handleDealClick(win.deal_id, win.deal_name)}
            >
              <Trophy className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div>
                <span className="font-medium text-foreground">{win.deal_name}</span>
                <span className="text-muted-foreground"> — {win.achievement}</span>
                {win.context && (
                  <p className="text-sm text-muted-foreground mt-0.5">{win.context}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quota Status */}
      {momentum.quota_status && (
        <div className="bg-background/50 rounded-lg p-4 border border-border/50">
          <div className="flex items-center gap-3">
            <Target className="h-5 w-5 text-primary" />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-primary rounded-full transition-all"
                    style={{ width: `${Math.min(momentum.quota_status.percentage, 100)}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-foreground">
                  {momentum.quota_status.percentage}%
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {momentum.quota_status.message}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
