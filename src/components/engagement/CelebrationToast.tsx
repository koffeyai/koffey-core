/**
 * CelebrationToast - Subtle celebration moments for micro-wins
 * Uses Sonner toast with enhanced styling for wins
 */

import React, { useEffect } from 'react';
import { toast } from 'sonner';
import { useMicroWins, MicroWin } from '@/hooks/useMicroWins';
import { Sparkles, Trophy, Star, Zap, Award } from 'lucide-react';

const celebrationIcons = {
  subtle: <Sparkles className="h-4 w-4 text-yellow-500" />,
  normal: <Star className="h-5 w-5 text-yellow-500" />,
  big: <Trophy className="h-6 w-6 text-yellow-500" />
};

interface CelebrationContentProps {
  win: MicroWin;
}

function CelebrationContent({ win }: CelebrationContentProps) {
  return (
    <div className="flex items-center gap-3">
      <div className={`flex-shrink-0 p-2 rounded-full ${
        win.celebrationType === 'big' 
          ? 'bg-yellow-500/20 animate-pulse' 
          : 'bg-yellow-500/10'
      }`}>
        {celebrationIcons[win.celebrationType]}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${
          win.celebrationType === 'big' ? 'text-base' : 'text-sm'
        }`}>
          {win.title}
        </p>
        <p className="text-xs text-muted-foreground">{win.description}</p>
      </div>
      <div className="flex-shrink-0 flex items-center gap-1 text-yellow-600 dark:text-yellow-400">
        <Zap className="h-3 w-3" />
        <span className="text-xs font-medium">+{win.points}</span>
      </div>
    </div>
  );
}

// Provider component that listens for wins and shows toasts
export function CelebrationProvider({ children }: { children: React.ReactNode }) {
  const { pendingWin, dismissPendingWin } = useMicroWins();

  useEffect(() => {
    if (!pendingWin) return;

    const duration = pendingWin.celebrationType === 'big' ? 5000 : 
                     pendingWin.celebrationType === 'normal' ? 3000 : 2000;

    toast.custom(
      (t) => (
        <div 
          className={`
            bg-card border rounded-lg shadow-lg p-4 min-w-[300px] max-w-[400px]
            ${pendingWin.celebrationType === 'big' ? 'border-yellow-500/50 shadow-yellow-500/20' : 'border-border'}
          `}
        >
          <CelebrationContent win={pendingWin} />
        </div>
      ),
      {
        duration,
        position: 'bottom-right',
        id: pendingWin.id,
        onDismiss: dismissPendingWin,
        onAutoClose: dismissPendingWin
      }
    );
  }, [pendingWin, dismissPendingWin]);

  return <>{children}</>;
}

// Manual celebration trigger for specific moments
export function showCelebration(win: Omit<MicroWin, 'id' | 'timestamp'>) {
  const fullWin: MicroWin = {
    ...win,
    id: `manual_${Date.now()}`,
    timestamp: Date.now()
  };

  const duration = win.celebrationType === 'big' ? 5000 : 
                   win.celebrationType === 'normal' ? 3000 : 2000;

  toast.custom(
    () => (
      <div 
        className={`
          bg-card border rounded-lg shadow-lg p-4 min-w-[300px] max-w-[400px]
          ${win.celebrationType === 'big' ? 'border-yellow-500/50 shadow-yellow-500/20' : 'border-border'}
        `}
      >
        <CelebrationContent win={fullWin} />
      </div>
    ),
    {
      duration,
      position: 'bottom-right'
    }
  );
}

// Points display component for use in UI
export function PointsDisplay() {
  const { totalPoints, dailyStats } = useMicroWins();

  return (
    <div className="flex items-center gap-2 text-sm">
      <Award className="h-4 w-4 text-yellow-500" />
      <span className="font-medium">{totalPoints}</span>
      <span className="text-muted-foreground">pts</span>
      {dailyStats.totalActions > 0 && (
        <span className="text-xs text-muted-foreground">
          ({dailyStats.totalActions} today)
        </span>
      )}
    </div>
  );
}
