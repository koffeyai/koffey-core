import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addMonths, subMonths, addWeeks, subWeeks, addDays, subDays,
  eachDayOfInterval, eachHourOfInterval, startOfDay, endOfDay,
  isSameMonth, isToday, isSameDay, isSameHour, format, getHours
} from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { supabase } from '@/integrations/supabase/client';
import { connectCalendar, refreshCalendar, getCalendarEvents, describeGoogleOAuthError } from '@/components/auth/GoogleAuth';
import { useToast } from '@/hooks/use-toast';
import { parseISO } from 'date-fns';
import { useSearchParams } from 'react-router-dom';


// Inline Google "G" mark
const GoogleG = ({ className = "h-4 w-4" }: { className?: string }) => (
  <svg className={className} viewBox="0 0 48 48" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.4 0 6.5 1.2 8.9 3.6l6.6-6.6C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.7 6c1.8-5.9 7.3-9.7 13.7-9.7z"/>
    <path fill="#4285F4" d="M46.5 24.5c0-1.7-.2-3.4-.5-5H24v9.5h12.7c-.6 3-2.4 5.5-5.1 7.2l7.9 6.1c4.6-4.2 7-10.4 7-17.8z"/>
    <path fill="#FBBC05" d="M10.3 27.3a14.3 14.3 0 0 1 0-6.6l-7.7-6A24 24 0 0 0 0 24c0 3.9.9 7.6 2.6 10.9l7.7-6c-.5-1.4-.8-2.9-.8-4.6z"/>
    <path fill="#34A853" d="M24 48c6.5 0 12-2.1 16-5.8l-7.9-6.1c-2.2 1.5-5.1 2.4-8.1 2.4-6.4 0-11.9-3.8-13.7-9.7l-7.7 6C6.5 42.6 14.6 48 24 48z"/>
  </svg>
);

interface CalendarEvent {
  id: string;
  title: string;
  date: Date;
  time: string;
  type: 'meeting';
  description?: string;
  location?: string;
}

const getEventTypeColor = (type: CalendarEvent['type']) => {
  switch (type) {
    case 'meeting': return 'bg-blue-500';
    default: return 'bg-muted';
  }
};

function toCalendarEvents(googlePayload: any): CalendarEvent[] {
  const items = googlePayload?.items ?? googlePayload?.events?.items ?? [];
  return items.flatMap((g: any, i: number): CalendarEvent[] => {
    if (g.status === "cancelled") return [];
    const raw = g.start?.dateTime ?? g.start?.date;
    if (!raw) return [];
    const isAllDay = Boolean(g.start?.date);
    const date = isAllDay ? parseISO(raw) : new Date(raw);
    return [{
      id: g.id ?? `${i}`,
      title: g.summary ?? "No title",
      date,
      time: isAllDay ? "All day" : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "meeting",
      description: g.description ?? "",
      location: g.location ?? g.hangoutLink ?? ""
    }];
  });
}



export function CalendarManager() {
  return <CalendarLocal />;
}



function CalendarLocal() {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [currentDate, setCurrentDate] = useState<Date>(new Date());
  const [viewMode, setViewMode] = useState<'month' | 'week' | 'day'>('month');
  const [connected, setConnected] = useState<boolean>(false);
  const [checking, setChecking] = useState<boolean>(true);
  const [userId, setUserId] = useState<string | null>(null);
  const { toast } = useToast();
  const [calendarEmail, setCalendarEmail] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Cache of fetched months: "2026-04" -> CalendarEvent[]
  const eventCache = useRef<Map<string, CalendarEvent[]>>(new Map());
  // Track the latest fetch request to discard stale responses
  const activeFetchKey = useRef<string>('');

  const getMonthKey = (date: Date) => format(date, 'yyyy-MM');

  const fetchEventsForMonth = useCallback(async (date: Date, force = false) => {
    const key = getMonthKey(date);
    activeFetchKey.current = key;

    if (!force && eventCache.current.has(key)) {
      setEvents(eventCache.current.get(key)!);
      return;
    }

    const monthStart = startOfMonth(date);
    const monthEnd = endOfMonth(date);
    // Pad by a week to cover partial weeks at edges
    const timeMin = startOfWeek(monthStart).toISOString();
    const timeMax = endOfWeek(monthEnd).toISOString();

    try {
      const evData = await getCalendarEvents(timeMin, timeMax);
      // Discard response if user has navigated to a different month
      if (activeFetchKey.current !== key) return;
      if (evData?.connected) {
        const parsed = toCalendarEvents(evData.events);
        eventCache.current.set(key, parsed);
        setEvents(parsed);
      }
    } catch (e) {
      console.error('Failed to fetch events for', key, e);
      if (activeFetchKey.current === key) {
        toast({
          title: 'Calendar fetch failed',
          description: 'Could not load events. Try refreshing.',
          variant: 'destructive',
        });
      }
    }
  }, [toast]);

  // Check connection on mount, then fetch current month
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUserId(user?.id ?? null);
      try {
        const data = await refreshCalendar();
        setConnected(Boolean(data?.connected));
        setCalendarEmail(data?.email ?? null);
        if (data?.connected) {
          await fetchEventsForMonth(currentDate);
        }
      } catch (e) {
        console.error("calendar-refresh threw:", e);
        setConnected(false);
        setCalendarEmail(null);
      } finally {
        setChecking(false);
      }
    })();
  }, []);

  // Re-fetch when navigating to a different month
  useEffect(() => {
    if (connected) {
      fetchEventsForMonth(currentDate);
    }
  }, [connected, currentDate, fetchEventsForMonth]);

  // Handle return from Google OAuth when Calendar starts the flow directly.
  useEffect(() => {
    const googleConnected = searchParams.get('google_connected');
    const googleError = searchParams.get('google_error');
    const googleMissing = searchParams.get('google_missing');
    const googleDetail = searchParams.get('google_detail');

    if (!googleError && googleConnected !== 'true') return;

    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('google_connected');
    nextParams.delete('google_error');
    nextParams.delete('google_missing');
    nextParams.delete('google_detail');
    nextParams.delete('scopes');
    setSearchParams(nextParams, { replace: true });

    if (googleError) {
      setConnected(false);
      setCalendarEmail(null);
      setChecking(false);
      toast({
        title: 'Google connection failed',
        description: describeGoogleOAuthError(googleError, googleMissing, null, googleDetail),
        variant: 'destructive',
      });
      return;
    }

    setConnected(true);
    setChecking(true);
    eventCache.current.clear();
    toast({
      title: 'Google Calendar connected',
      description: 'Loading your calendar events now.',
    });

    (async () => {
      try {
        const data = await refreshCalendar();
        const isConnected = Boolean(data?.connected);
        setConnected(isConnected);
        setCalendarEmail(data?.email ?? null);
        if (isConnected) {
          await fetchEventsForMonth(currentDate, true);
        }
      } catch (error) {
        console.error('calendar OAuth refresh failed:', error);
        setConnected(false);
        setCalendarEmail(null);
        toast({
          title: 'Calendar refresh failed',
          description: 'Google connected, but Koffey could not refresh the calendar status.',
          variant: 'destructive',
        });
      } finally {
        setChecking(false);
      }
    })();
  }, [currentDate, fetchEventsForMonth, searchParams, setSearchParams, toast]);

  // Listen for refresh-calendar events (e.g., after schedule action creates an event)
  useEffect(() => {
    const handler = () => fetchEventsForMonth(currentDate, true);
    window.addEventListener('refresh-calendar', handler);
    return () => window.removeEventListener('refresh-calendar', handler);
  }, [currentDate, fetchEventsForMonth]);

  const login = () => {
    // get the freshest user for safety
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const returnUrl = new URL(window.location.href);
        returnUrl.searchParams.set('view', 'calendar');
        returnUrl.searchParams.delete('google_connected');
        returnUrl.searchParams.delete('google_error');
        returnUrl.searchParams.delete('google_missing');
        returnUrl.searchParams.delete('google_detail');
        returnUrl.searchParams.delete('scopes');
        connectCalendar(user, returnUrl.toString()).catch((error) => {
          console.error('Error connecting calendar:', error);
          toast({
            title: 'Google connection failed',
            description: error instanceof Error ? error.message : 'Failed to start Google Calendar connection.',
            variant: 'destructive',
          });
        });
      }
    });
  };

  async function logout() {
    try {
      const { error } = await supabase.functions.invoke("calendar-disconnect");
      if (error) console.error("calendar-disconnect error:", error);
    } finally {
      setConnected(false);
      setCalendarEmail(null);
      setEvents([]);
      localStorage.removeItem("googleEvents");
    }
  }

  const handleRefresh = async () => {
    await fetchEventsForMonth(currentDate, true);
  };

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const days = eachDayOfInterval({ start: startDate, end: endDate });

  const navigateNext = () => {
    if (viewMode === 'month') setCurrentDate(addMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(addWeeks(currentDate, 1));
    else setCurrentDate(addDays(currentDate, 1));
  };
  const navigatePrev = () => {
    if (viewMode === 'month') setCurrentDate(subMonths(currentDate, 1));
    else if (viewMode === 'week') setCurrentDate(subWeeks(currentDate, 1));
    else setCurrentDate(subDays(currentDate, 1));
  };
  const goToToday = () => setCurrentDate(new Date());
  const getEventsForDate = (date: Date) => events.filter(event => isSameDay(event.date, date));
  const getEventsForHour = (date: Date, hour: number) => events.filter(event => isSameDay(event.date, date) && getHours(event.date) === hour);

  const headerLabel = viewMode === 'month'
    ? format(currentDate, 'MMMM yyyy')
    : viewMode === 'week'
    ? `${format(startOfWeek(currentDate), 'MMM d')} – ${format(endOfWeek(currentDate), 'MMM d, yyyy')}`
    : format(currentDate, 'EEEE, MMMM d, yyyy');

  const rows: React.ReactNode[] = [];
  for (let i = 0; i < days.length; i += 7) {
    rows.push(
      <div key={i} className="grid grid-cols-7 border-b border-border">
        {days.slice(i, i + 7).map((day, dayIdx) => {
          const dayEvents = getEventsForDate(day);
          const isCurrentMonth = isSameMonth(day, monthStart);
          const isDayToday = isToday(day);
          return (
            <div
              key={dayIdx}
              className={`min-h-[120px] border-r border-border p-2 bg-background cursor-pointer hover:bg-muted/50 transition-colors ${!isCurrentMonth ? 'text-muted-foreground bg-muted/30' : ''}`}
              onClick={() => {
                setCurrentDate(day);
                setViewMode('day');
              }}
            >
              <div className="flex justify-between items-start mb-1">
                <span className={`text-sm font-medium ${isDayToday ? 'bg-primary text-primary-foreground rounded-full w-6 h-6 flex items-center justify-center' : ''}`}>
                  {format(day, 'd')}
                </span>
              </div>
              <div className="space-y-1">
                {dayEvents.slice(0, 3).map(event => (
                  <div key={event.id} className={`text-xs px-1 py-0.5 rounded text-white truncate ${getEventTypeColor(event.type)}`} title={`${event.time} ${event.title}`}>
                    {event.title}
                  </div>
                ))}
                {dayEvents.length > 3 && (
                  <div className="text-xs text-muted-foreground">
                    +{dayEvents.length - 3} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="h-full p-6 bg-background">
      {/* Toolbar: stays spaced but invisible until checking completes */}
      <div className={`mb-4 flex gap-2 items-center ${checking ? 'invisible' : ''}`}>
        {!connected ? (
          <>
            <Button variant="outline" className="gap-2" onClick={login} disabled={!userId}>
              <GoogleG />
              Connect Google Calendar
            </Button>
          </>
        ) : (
          <>
            <Badge className="gap-2 rounded-full px-3 py-1" variant="default">
              <GoogleG />
              Connected{calendarEmail ? ` to ${calendarEmail}` : ''}
            </Badge>
            <Button variant="outline" className="gap-2" onClick={logout}>
              🚪 Sign out
            </Button>
            <Button variant="default" className="gap-2" onClick={handleRefresh}>
              🔄 Refresh Calendar
            </Button>
          </>
        )}
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" size="sm" onClick={goToToday} className="rounded-full px-6">
              Today
            </Button>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm" onClick={navigatePrev}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="ghost" size="sm" onClick={navigateNext}><ChevronRight className="h-4 w-4" /></Button>
            </div>
            <h1 className="text-2xl font-semibold">{headerLabel}</h1>
          </div>
          <div className="flex items-center space-x-2">
            <Select value={viewMode} onValueChange={(v) => setViewMode(v as 'month' | 'week' | 'day')}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="week">Week</SelectItem>
                <SelectItem value="day">Day</SelectItem>
              </SelectContent>
            </Select>
            <Button size="sm" className="bg-primary" onClick={() => {
              useChatPanelStore.getState().openPanel('Log a new meeting or activity', { type: 'activity' });
            }}>
              <Plus className="h-4 w-4 mr-1" /> Create
            </Button>
          </div>
        </div>
      </div>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          {viewMode === 'month' && (
            <>
              <div className="grid grid-cols-7 border-b border-border bg-muted/50">
                {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map((day) => (
                  <div key={day} className="p-3 text-center text-sm font-medium text-muted-foreground border-r border-border last:border-r-0">
                    {day}
                  </div>
                ))}
              </div>
              <div>{rows}</div>
            </>
          )}

          {viewMode === 'week' && (() => {
            const weekStart = startOfWeek(currentDate);
            const weekDays = eachDayOfInterval({ start: weekStart, end: endOfWeek(currentDate) });
            const hours = Array.from({ length: 14 }, (_, i) => i + 7); // 7am to 8pm
            return (
              <>
                <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border bg-muted/50">
                  <div className="p-2 text-center text-xs text-muted-foreground border-r">Time</div>
                  {weekDays.map((day) => (
                    <div key={day.toISOString()} className={`p-2 text-center text-sm font-medium border-r border-border last:border-r-0 ${isToday(day) ? 'bg-primary/10 text-primary' : 'text-muted-foreground'}`}>
                      <div>{format(day, 'EEE')}</div>
                      <div className={`text-lg ${isToday(day) ? 'font-bold' : ''}`}>{format(day, 'd')}</div>
                    </div>
                  ))}
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {hours.map((hour) => (
                    <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-border">
                      <div className="p-1 text-right pr-2 text-xs text-muted-foreground border-r">{`${hour}:00`}</div>
                      {weekDays.map((day) => {
                        const hourEvents = getEventsForHour(day, hour);
                        return (
                          <div key={day.toISOString()} className="min-h-[48px] border-r border-border last:border-r-0 p-0.5">
                            {hourEvents.map(ev => (
                              <div key={ev.id} className="text-xs px-1 py-0.5 rounded bg-blue-500 text-white truncate mb-0.5" title={`${ev.time} ${ev.title}`}>
                                {ev.title}
                              </div>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </div>
              </>
            );
          })()}

          {viewMode === 'day' && (() => {
            const hours = Array.from({ length: 16 }, (_, i) => i + 6); // 6am to 9pm
            const dayEvents = getEventsForDate(currentDate);
            return (
              <>
                <div className="p-3 bg-muted/50 border-b border-border text-center">
                  <div className={`text-lg font-semibold ${isToday(currentDate) ? 'text-primary' : ''}`}>
                    {format(currentDate, 'EEEE, MMMM d')}
                  </div>
                  {dayEvents.length > 0 && (
                    <div className="text-sm text-muted-foreground">{dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}</div>
                  )}
                </div>
                <div className="max-h-[600px] overflow-y-auto">
                  {hours.map((hour) => {
                    const hourEvents = getEventsForHour(currentDate, hour);
                    return (
                      <div key={hour} className="grid grid-cols-[80px_1fr] border-b border-border">
                        <div className="p-2 text-right pr-3 text-sm text-muted-foreground border-r">
                          {format(new Date(2026, 0, 1, hour), 'h:mm a')}
                        </div>
                        <div className="min-h-[56px] p-1">
                          {hourEvents.map(ev => (
                            <div key={ev.id} className="text-sm px-3 py-2 rounded-lg bg-blue-500 text-white mb-1">
                              <div className="font-medium">{ev.title}</div>
                              <div className="text-xs opacity-80">{ev.time}{ev.location ? ` · ${ev.location}` : ''}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
