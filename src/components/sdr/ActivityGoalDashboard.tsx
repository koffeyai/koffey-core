import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import {
  Phone,
  Mail,
  Calendar,
  Target,
  TrendingUp,
  Award,
  Flame,
  RefreshCw,
  Settings,
  Users,
} from 'lucide-react';
import { EmptyState } from '@/components/common/EmptyState';

interface ActivityGoals {
  calls: number;
  emails: number;
  meetings: number;
}

interface ActivityCounts {
  calls: number;
  emails: number;
  meetings: number;
  total: number;
}

const DEFAULT_GOALS: ActivityGoals = { calls: 60, emails: 40, meetings: 5 };

const ActivityGoalDashboard: React.FC = () => {
  const { user } = useAuth();
  const { currentOrganization } = useOrganizationAccess();
  const organizationId = currentOrganization?.organization_id;

  const [todayCounts, setTodayCounts] = useState<ActivityCounts>({ calls: 0, emails: 0, meetings: 0, total: 0 });
  const [weekCounts, setWeekCounts] = useState<ActivityCounts>({ calls: 0, emails: 0, meetings: 0, total: 0 });
  const [goals, setGoals] = useState<ActivityGoals>(DEFAULT_GOALS);
  const [editingGoals, setEditingGoals] = useState(false);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<{ name: string; count: number }[]>([]);

  useEffect(() => {
    if (organizationId && user) loadData();
  }, [organizationId, user]);

  const loadData = async () => {
    if (!organizationId || !user) return;
    setLoading(true);
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 7);

      // Today's activities
      const { data: todayData } = await supabase
        .from('activities')
        .select('type')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .gte('created_at', today.toISOString());

      const tc: ActivityCounts = { calls: 0, emails: 0, meetings: 0, total: 0 };
      (todayData || []).forEach(a => {
        if (a.type === 'call' || a.type === 'voicemail') tc.calls++;
        else if (a.type === 'email') tc.emails++;
        else if (a.type === 'meeting') tc.meetings++;
        tc.total++;
      });
      setTodayCounts(tc);

      // Week activities
      const { data: weekData } = await supabase
        .from('activities')
        .select('type')
        .eq('organization_id', organizationId)
        .eq('user_id', user.id)
        .gte('created_at', weekAgo.toISOString());

      const wc: ActivityCounts = { calls: 0, emails: 0, meetings: 0, total: 0 };
      (weekData || []).forEach(a => {
        if (a.type === 'call' || a.type === 'voicemail') wc.calls++;
        else if (a.type === 'email') wc.emails++;
        else if (a.type === 'meeting') wc.meetings++;
        wc.total++;
      });
      setWeekCounts(wc);

      // Calculate streak (consecutive days with activity)
      let streakCount = 0;
      for (let d = 0; d < 30; d++) {
        const checkDate = new Date(today);
        checkDate.setDate(checkDate.getDate() - d);
        const nextDay = new Date(checkDate);
        nextDay.setDate(nextDay.getDate() + 1);
        const { count } = await supabase
          .from('activities')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId)
          .eq('user_id', user.id)
          .gte('created_at', checkDate.toISOString())
          .lt('created_at', nextDay.toISOString());
        if ((count || 0) > 0) streakCount++;
        else break;
      }
      setStreak(streakCount);

      // Leaderboard (top 5 by activity count this week)
      const { data: allWeek } = await supabase
        .from('activities')
        .select('user_id')
        .eq('organization_id', organizationId)
        .gte('created_at', weekAgo.toISOString());

      if (allWeek) {
        const counts: Record<string, number> = {};
        allWeek.forEach(a => {
          counts[a.user_id] = (counts[a.user_id] || 0) + 1;
        });
        const sorted = Object.entries(counts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        const userIds = sorted.map(([id]) => id);
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        const nameMap: Record<string, string> = {};
        (profiles || []).forEach(p => { nameMap[p.id] = p.full_name || p.email || 'Unknown'; });

        setLeaderboard(sorted.map(([id, count]) => ({ name: nameMap[id] || 'Unknown', count })));
      }

      // Load saved goals from localStorage
      const savedGoals = localStorage.getItem(`koffey_goals_${user.id}`);
      if (savedGoals) setGoals(JSON.parse(savedGoals));
    } catch (err) {
      console.error('Failed to load activity data:', err);
    } finally {
      setLoading(false);
    }
  };

  const saveGoals = () => {
    if (user) {
      localStorage.setItem(`koffey_goals_${user.id}`, JSON.stringify(goals));
    }
    setEditingGoals(false);
  };

  const getProgressColor = (current: number, goal: number) => {
    const pct = goal > 0 ? (current / goal) * 100 : 0;
    if (pct >= 100) return 'text-green-600';
    if (pct >= 75) return 'text-blue-600';
    if (pct >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getMotivation = () => {
    const pct = goals.calls > 0 ? (todayCounts.calls / goals.calls) * 100 : 0;
    if (pct >= 100) return "You crushed your call target today!";
    if (pct >= 75) return "Almost there! Keep pushing!";
    if (pct >= 50) return "Solid progress. Let's keep the momentum!";
    if (pct >= 25) return "Good start! Time to ramp it up.";
    return "Let's get those calls rolling!";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading activity data...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Activity Goals</h1>
          <p className="text-muted-foreground">{getMotivation()}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setEditingGoals(!editingGoals)}>
            <Settings className="h-4 w-4 mr-2" />
            {editingGoals ? 'Cancel' : 'Set Goals'}
          </Button>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Goal Editor */}
      {editingGoals && (
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium">Daily Call Goal</label>
                <Input
                  type="number"
                  value={goals.calls}
                  onChange={(e) => setGoals({ ...goals, calls: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Daily Email Goal</label>
                <Input
                  type="number"
                  value={goals.emails}
                  onChange={(e) => setGoals({ ...goals, emails: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div>
                <label className="text-sm font-medium">Daily Meeting Goal</label>
                <Input
                  type="number"
                  value={goals.meetings}
                  onChange={(e) => setGoals({ ...goals, meetings: parseInt(e.target.value) || 0 })}
                />
              </div>
            </div>
            <Button onClick={saveGoals} className="mt-4">Save Goals</Button>
          </CardContent>
        </Card>
      )}

      {/* Streak + Overall */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Streak</CardTitle>
            <Flame className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{streak} days</div>
            <p className="text-xs text-muted-foreground">Consecutive active days</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Today's Total</CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{todayCounts.total}</div>
            <p className="text-xs text-muted-foreground">activities logged</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">This Week</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{weekCounts.total}</div>
            <p className="text-xs text-muted-foreground">activities this week</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Daily Avg</CardTitle>
            <Award className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{Math.round(weekCounts.total / 7)}</div>
            <p className="text-xs text-muted-foreground">per day (7-day avg)</p>
          </CardContent>
        </Card>
      </div>

      {/* Progress Bars */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Calls</CardTitle>
            <Phone className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getProgressColor(todayCounts.calls, goals.calls)}`}>
              {todayCounts.calls} / {goals.calls}
            </div>
            <Progress value={Math.min((todayCounts.calls / goals.calls) * 100, 100)} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.max(0, goals.calls - todayCounts.calls)} remaining today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Emails</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getProgressColor(todayCounts.emails, goals.emails)}`}>
              {todayCounts.emails} / {goals.emails}
            </div>
            <Progress value={Math.min((todayCounts.emails / goals.emails) * 100, 100)} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.max(0, goals.emails - todayCounts.emails)} remaining today
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Meetings</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${getProgressColor(todayCounts.meetings, goals.meetings)}`}>
              {todayCounts.meetings} / {goals.meetings}
            </div>
            <Progress value={Math.min((todayCounts.meetings / goals.meetings) * 100, 100)} className="mt-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {Math.max(0, goals.meetings - todayCounts.meetings)} remaining today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Leaderboard */}
      {leaderboard.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Team Leaderboard (This Week)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {leaderboard.map((entry, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge variant={i === 0 ? 'default' : 'secondary'} className="w-8 h-8 flex items-center justify-center rounded-full">
                      {i + 1}
                    </Badge>
                    <span className="font-medium">{entry.name}</span>
                  </div>
                  <span className="text-lg font-bold">{entry.count} activities</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default ActivityGoalDashboard;
