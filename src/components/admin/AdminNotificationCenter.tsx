import React from 'react';
import { Bell, CheckCircle, AlertCircle, Info, AlertTriangle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useAdminJobs, AdminNotification } from '@/hooks/useAdminJobs';
import { formatRelativeTime } from '@/lib/utils';

const NotificationItem: React.FC<{
  notification: AdminNotification;
  onRead: (id: string) => void;
  onAction?: (notification: AdminNotification) => void;
}> = ({ notification, onRead, onAction }) => {
  const getIcon = () => {
    switch (notification.type) {
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      case 'warning':
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      case 'info':
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  const getBgColor = () => {
    switch (notification.type) {
      case 'success':
        return 'bg-green-50 border-green-200';
      case 'error':
        return 'bg-red-50 border-red-200';
      case 'warning':
        return 'bg-yellow-50 border-yellow-200';
      case 'info':
      default:
        return 'bg-blue-50 border-blue-200';
    }
  };

  return (
    <Card className={`${getBgColor()} transition-colors`}>
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0 mt-0.5">
            {getIcon()}
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <h4 className="text-sm font-medium text-foreground">
                {notification.title}
              </h4>
              {!notification.is_read && (
                <div className="w-2 h-2 bg-blue-500 rounded-full" />
              )}
            </div>
            
            <p className="text-xs text-muted-foreground mb-2">
              {notification.message}
            </p>
            
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {formatRelativeTime(new Date(notification.created_at))}
              </span>
              
              <div className="flex items-center gap-1">
                {notification.action_label && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 px-2 text-xs"
                    onClick={() => onAction?.(notification)}
                  >
                    {notification.action_label}
                  </Button>
                )}
                
                {!notification.is_read && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 w-6 p-0"
                    onClick={() => onRead(notification.id)}
                  >
                    <X className="w-3 h-3" />
                  </Button>
                )}
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export const AdminNotificationCenter: React.FC = () => {
  const { notifications, markNotificationRead } = useAdminJobs();
  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleNotificationAction = (notification: AdminNotification) => {
    // Handle different action types based on action_data
    if (notification.action_data.type === 'view_job_results') {
      // Navigate to job results
    } else if (notification.action_data.type === 'retry_job') {
      // Retry failed job
    } else if (notification.action_data.type === 'view_suggestions') {
      // View AI suggestions
    }
    
    // Mark as read after action
    markNotificationRead(notification.id);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="relative">
          <Bell className="w-4 h-4" />
          {unreadCount > 0 && (
            <Badge 
              variant="destructive" 
              className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs flex items-center justify-center"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </Badge>
          )}
        </Button>
      </PopoverTrigger>
      
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <div className="flex items-center justify-between">
            <h3 className="font-medium text-sm">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {unreadCount} new
              </Badge>
            )}
          </div>
        </div>
        
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              No notifications
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {notifications.map(notification => (
                <NotificationItem
                  key={notification.id}
                  notification={notification}
                  onRead={markNotificationRead}
                  onAction={handleNotificationAction}
                />
              ))}
            </div>
          )}
        </div>
        
        {notifications.length > 0 && (
          <div className="p-2 border-t">
            <Button 
              variant="ghost" 
              size="sm" 
              className="w-full text-xs"
              onClick={() => {
                notifications.filter(n => !n.is_read).forEach(n => {
                  markNotificationRead(n.id);
                });
              }}
            >
              Mark all as read
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
};