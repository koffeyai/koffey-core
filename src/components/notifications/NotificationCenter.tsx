import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Bell, X, CheckCircle2, MessageCircle, UserCheck,
  Calendar, AlertTriangle, Lightbulb, Sparkles, Check, Target, RefreshCw, ClipboardList
} from 'lucide-react';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import type { ActionType, ActionPriority } from '@/hooks/useSuggestedActions';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { getSuggestedActionPlay } from '@/lib/suggestedActionPlaybook';

const PRIORITY_COLORS: Record<ActionPriority, string> = {
  critical: 'bg-red-100 text-red-800 border-red-200',
  high: 'bg-orange-100 text-orange-800 border-orange-200',
  medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
  low: 'bg-gray-100 text-gray-800 border-gray-200',
};

const ACTION_ICONS: Record<ActionType, React.ElementType> = {
  follow_up: MessageCircle,
  re_engage: UserCheck,
  date_reminder: Calendar,
  relationship_nurture: Sparkles,
  deal_risk: AlertTriangle,
  memory_insight: Lightbulb,
  compaction_summary: Sparkles,
  renewal_outreach: RefreshCw,
  schedule_qbr: Calendar,
  meeting_prep: Target,
  post_meeting_followup: ClipboardList,
  workflow_alert: AlertTriangle,
  email_engagement_drop: MessageCircle,
};

interface NotificationCenterProps {
  className?: string;
}

export const NotificationCenter: React.FC<NotificationCenterProps> = ({ className = '' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const {
    notifications,
    unreadCount,
    criticalCount,
    isLoading,
    dismiss,
    isDismissing,
    markActedOn,
    isActing,
  } = useNotifications();
  const { openPanel } = useChatPanelStore();

  // Close panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleNotificationClick = (notification: any) => {
    if (notification.deal_id) {
      navigate(`/deals?id=${notification.deal_id}`);
      setIsOpen(false);
    } else if (notification.contact_id) {
      navigate(`/contacts?id=${notification.contact_id}`);
      setIsOpen(false);
    }
  };

  const handleTakeAction = (notification: any) => {
    const play = getSuggestedActionPlay(notification);
    openPanel(play.prompt, play.context);
    markActedOn(notification);
    setIsOpen(false);
  };

  const formatTimeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className={`relative ${className}`} ref={panelRef}>
      {/* Bell Icon with Badge */}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className="relative text-muted-foreground hover:text-foreground"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <Badge
            variant="destructive"
            className={cn(
              "absolute -top-1 -right-1 h-4 min-w-[16px] p-0 text-[10px] flex items-center justify-center",
              criticalCount > 0 && "animate-pulse"
            )}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </Button>

      {/* Notification Panel */}
      {isOpen && (
        <Card className="absolute right-0 top-12 w-96 shadow-lg border z-50">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg flex items-center gap-2">
                Notifications
                {unreadCount > 0 && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {unreadCount} active
                  </Badge>
                )}
              </CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsOpen(false)}
                className="h-7 w-7 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-4 text-center text-sm text-muted-foreground">
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-center px-4">
                <CheckCircle2 className="h-8 w-8 text-muted-foreground/40 mb-3" />
                <p className="text-sm font-medium text-foreground">All caught up</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-[220px]">
                  Your notifications will appear here as deals progress and tasks come due.
                </p>
              </div>
            ) : (
              <div className="max-h-96 overflow-y-auto">
                {notifications.map((notification) => {
                  const Icon = ACTION_ICONS[notification.action_type] || Lightbulb;
                  return (
                    <div
                      key={notification.id}
                      className="border-b last:border-b-0 p-3 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex items-start gap-3">
                        <Icon className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap mb-1">
                            <Badge className={`text-[10px] px-1.5 py-0 ${PRIORITY_COLORS[notification.priority]}`}>
                              {notification.priority}
                            </Badge>
                            <span className="text-[10px] text-muted-foreground">
                              {formatTimeAgo(notification.created_at)}
                            </span>
                          </div>
                          <p className="text-sm font-medium leading-snug">{notification.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {notification.description}
                          </p>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleTakeAction(notification);
                            }}
                            disabled={isActing}
                            title={getSuggestedActionPlay(notification).label}
                          >
                            <Check className="h-3 w-3 text-green-600" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              dismiss({ actionId: notification.id });
                            }}
                            disabled={isDismissing}
                            title="Dismiss"
                          >
                            <X className="h-3 w-3 text-muted-foreground" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
};
