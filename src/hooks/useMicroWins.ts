/**
 * Micro-Wins System - Track and celebrate small user victories
 * Gamification to drive engagement without being intrusive
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import { useAuth } from '@/components/auth/AuthProvider';
import { useUnifiedCRMStore } from '@/stores/unifiedCRMStore';

export type WinType = 
  | 'first_action_today'
  | 'contact_added'
  | 'deal_created'
  | 'deal_moved'
  | 'deal_closed_won'
  | 'activity_logged'
  | 'task_completed'
  | 'streak_daily'
  | 'streak_weekly'
  | 'batch_operation'
  | 'milestone_5'
  | 'milestone_10'
  | 'milestone_25'
  | 'milestone_50'
  | 'milestone_100';

export interface MicroWin {
  id: string;
  type: WinType;
  title: string;
  description: string;
  points: number;
  celebrationType: 'subtle' | 'normal' | 'big';
  timestamp: number;
}

interface DailyStats {
  date: string;
  contactsAdded: number;
  dealsCreated: number;
  dealsClosed: number;
  activitiesLogged: number;
  tasksCompleted: number;
  totalActions: number;
}

const WIN_DEFINITIONS: Record<WinType, Omit<MicroWin, 'id' | 'timestamp'>> = {
  first_action_today: {
    type: 'first_action_today',
    title: "Fresh Start!",
    description: "Your first action of the day",
    points: 5,
    celebrationType: 'subtle'
  },
  contact_added: {
    type: 'contact_added',
    title: "Network Growing",
    description: "Added a new contact",
    points: 10,
    celebrationType: 'subtle'
  },
  deal_created: {
    type: 'deal_created',
    title: "Opportunity Found",
    description: "Created a new deal",
    points: 15,
    celebrationType: 'normal'
  },
  deal_moved: {
    type: 'deal_moved',
    title: "Progress Made",
    description: "Moved a deal forward",
    points: 10,
    celebrationType: 'subtle'
  },
  deal_closed_won: {
    type: 'deal_closed_won',
    title: "DEAL WON! 🎉",
    description: "Congratulations on closing the deal!",
    points: 100,
    celebrationType: 'big'
  },
  activity_logged: {
    type: 'activity_logged',
    title: "Activity Tracked",
    description: "Logged an activity",
    points: 5,
    celebrationType: 'subtle'
  },
  task_completed: {
    type: 'task_completed',
    title: "Task Done",
    description: "Completed a task",
    points: 10,
    celebrationType: 'subtle'
  },
  streak_daily: {
    type: 'streak_daily',
    title: "Daily Streak!",
    description: "Active for consecutive days",
    points: 25,
    celebrationType: 'normal'
  },
  streak_weekly: {
    type: 'streak_weekly',
    title: "Week Warrior",
    description: "Active all week!",
    points: 100,
    celebrationType: 'big'
  },
  batch_operation: {
    type: 'batch_operation',
    title: "Power User",
    description: "Completed a bulk operation",
    points: 20,
    celebrationType: 'normal'
  },
  milestone_5: {
    type: 'milestone_5',
    title: "Getting Started",
    description: "5 actions today",
    points: 15,
    celebrationType: 'subtle'
  },
  milestone_10: {
    type: 'milestone_10',
    title: "Building Momentum",
    description: "10 actions today",
    points: 25,
    celebrationType: 'normal'
  },
  milestone_25: {
    type: 'milestone_25',
    title: "On Fire!",
    description: "25 actions today",
    points: 50,
    celebrationType: 'normal'
  },
  milestone_50: {
    type: 'milestone_50',
    title: "Productivity Champion",
    description: "50 actions today",
    points: 100,
    celebrationType: 'big'
  },
  milestone_100: {
    type: 'milestone_100',
    title: "Legendary Performance",
    description: "100 actions today!",
    points: 200,
    celebrationType: 'big'
  }
};

// Storage key for persistence
const STORAGE_KEY = 'koffey_micro_wins';

interface StoredData {
  dailyStats: DailyStats;
  totalPoints: number;
  consecutiveDays: number;
  lastActiveDate: string;
  achievedMilestones: WinType[];
}

export function useMicroWins() {
  const { user } = useAuth();
  const [recentWins, setRecentWins] = useState<MicroWin[]>([]);
  const [pendingWin, setPendingWin] = useState<MicroWin | null>(null);
  const [totalPoints, setTotalPoints] = useState(0);
  const [dailyStats, setDailyStats] = useState<DailyStats>({
    date: new Date().toDateString(),
    contactsAdded: 0,
    dealsCreated: 0,
    dealsClosed: 0,
    activitiesLogged: 0,
    tasksCompleted: 0,
    totalActions: 0
  });
  const achievedToday = useRef<Set<WinType>>(new Set());

  // Load persisted data
  useEffect(() => {
    if (!user?.id) return;

    const stored = localStorage.getItem(`${STORAGE_KEY}_${user.id}`);
    if (stored) {
      try {
        const data: StoredData = JSON.parse(stored);
        const today = new Date().toDateString();
        
        // Reset daily stats if it's a new day
        if (data.dailyStats.date !== today) {
          setDailyStats({
            date: today,
            contactsAdded: 0,
            dealsCreated: 0,
            dealsClosed: 0,
            activitiesLogged: 0,
            tasksCompleted: 0,
            totalActions: 0
          });
          achievedToday.current.clear();
          
          // Check for streak
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          if (data.lastActiveDate === yesterday.toDateString()) {
            // Continue streak - will trigger streak win on first action
          }
        } else {
          setDailyStats(data.dailyStats);
          data.achievedMilestones.forEach(m => achievedToday.current.add(m));
        }
        
        setTotalPoints(data.totalPoints);
      } catch (e) {
        console.error('Failed to parse stored micro wins data');
      }
    }
  }, [user?.id]);

  // Persist data
  const persistData = useCallback(() => {
    if (!user?.id) return;

    const data: StoredData = {
      dailyStats,
      totalPoints,
      consecutiveDays: 0, // TODO: track properly
      lastActiveDate: new Date().toDateString(),
      achievedMilestones: Array.from(achievedToday.current)
    };

    localStorage.setItem(`${STORAGE_KEY}_${user.id}`, JSON.stringify(data));
  }, [user?.id, dailyStats, totalPoints]);

  useEffect(() => {
    persistData();
  }, [dailyStats, totalPoints, persistData]);

  // Trigger a win
  const triggerWin = useCallback((type: WinType) => {
    // Don't repeat milestone wins in same day
    if (achievedToday.current.has(type)) return;

    const definition = WIN_DEFINITIONS[type];
    if (!definition) return;

    const win: MicroWin = {
      id: `${type}_${Date.now()}`,
      ...definition,
      timestamp: Date.now()
    };

    achievedToday.current.add(type);
    setRecentWins(prev => [win, ...prev].slice(0, 10));
    setTotalPoints(prev => prev + win.points);
    setPendingWin(win);

    // Auto-clear pending win after animation
    setTimeout(() => {
      setPendingWin(current => current?.id === win.id ? null : current);
    }, 3000);

    return win;
  }, []);

  // Track actions and check for wins
  const trackWinAction = useCallback((action: string, metadata?: Record<string, any>) => {
    const newStats = { ...dailyStats };
    const today = new Date().toDateString();
    
    // Reset if new day
    if (newStats.date !== today) {
      newStats.date = today;
      newStats.contactsAdded = 0;
      newStats.dealsCreated = 0;
      newStats.dealsClosed = 0;
      newStats.activitiesLogged = 0;
      newStats.tasksCompleted = 0;
      newStats.totalActions = 0;
      achievedToday.current.clear();
    }

    // First action of the day
    if (newStats.totalActions === 0) {
      triggerWin('first_action_today');
    }

    newStats.totalActions++;

    // Track specific actions
    switch (action) {
      case 'contact_created':
        newStats.contactsAdded++;
        triggerWin('contact_added');
        break;
      case 'deal_created':
        newStats.dealsCreated++;
        triggerWin('deal_created');
        break;
      case 'deal_updated':
        if (metadata?.stage === 'closed_won' || metadata?.stage === 'closed-won') {
          newStats.dealsClosed++;
          triggerWin('deal_closed_won');
        } else if (metadata?.stageChanged) {
          triggerWin('deal_moved');
        }
        break;
      case 'activity_created':
        newStats.activitiesLogged++;
        triggerWin('activity_logged');
        break;
      case 'task_completed':
        newStats.tasksCompleted++;
        triggerWin('task_completed');
        break;
      case 'bulk_operation':
        triggerWin('batch_operation');
        break;
    }

    // Check milestones
    if (newStats.totalActions === 5) triggerWin('milestone_5');
    if (newStats.totalActions === 10) triggerWin('milestone_10');
    if (newStats.totalActions === 25) triggerWin('milestone_25');
    if (newStats.totalActions === 50) triggerWin('milestone_50');
    if (newStats.totalActions === 100) triggerWin('milestone_100');

    setDailyStats(newStats);
  }, [dailyStats, triggerWin]);

  // Dismiss the pending win
  const dismissPendingWin = useCallback(() => {
    setPendingWin(null);
  }, []);

  return {
    // Current state
    pendingWin,
    recentWins,
    totalPoints,
    dailyStats,
    
    // Actions
    trackWinAction,
    triggerWin,
    dismissPendingWin
  };
}
