import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Users, Eye, MessageCircle, Clock, X, Check, AlertCircle } from 'lucide-react';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';

interface CollaborationPanelProps {
  roomId?: string;
  className?: string;
}

export const CollaborationPanel: React.FC<CollaborationPanelProps> = ({ 
  roomId = 'crm_workspace',
  className = '' 
}) => {
  const { hasOrganization, loading: orgLoading } = useOrganizationAccess();
  
  // Only enable collaboration if user has organization and loading is complete
  const collaborationEnabled = hasOrganization && !orgLoading;
  
  const {
    activeUsers,
    currentUser,
    notifications,
    isConnected,
    unreadNotifications,
    markNotificationAsRead,
    clearNotifications
  } = useRealtimeCollaboration(roomId, collaborationEnabled);

  // Show loading state while checking organization
  if (orgLoading) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-gray-400 animate-pulse" />
              Collaboration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Show disabled state if no organization
  if (!hasOrganization) {
    return (
      <div className={`space-y-4 ${className}`}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-orange-500" />
              Collaboration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Join an organization to enable real-time collaboration features.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'online': return 'bg-green-500';
      case 'away': return 'bg-yellow-500';
      case 'offline': return 'bg-gray-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'online': return 'Online';
      case 'away': return 'Away';
      case 'offline': return 'Offline';
      default: return 'Unknown';
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    
    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            Collaboration
            {unreadNotifications > 0 && (
              <Badge variant="destructive" className="text-xs">
                {unreadNotifications}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Active Users */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">
                Active Users ({activeUsers.length + (currentUser ? 1 : 0)})
              </span>
            </div>
            
            <div className="space-y-2">
              {/* Current User */}
              {currentUser && (
                <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg">
                  <Avatar className="h-6 w-6">
                    <AvatarImage src={currentUser.avatar} />
                    <AvatarFallback className="text-xs">
                      {getInitials(currentUser.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate">
                      {currentUser.name} (You)
                    </p>
                    {currentUser.currentPage && (
                      <p className="text-xs text-muted-foreground truncate">
                        <Eye className="h-3 w-3 inline mr-1" />
                        {currentUser.currentPage}
                      </p>
                    )}
                  </div>
                  <div className={`w-2 h-2 rounded-full ${getStatusColor(currentUser.status)}`} />
                </div>
              )}

              {/* Other Active Users */}
              {activeUsers.map((user) => (
                <TooltipProvider key={user.id}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 p-2 hover:bg-muted/50 rounded-lg">
                        <Avatar className="h-6 w-6">
                          <AvatarImage src={user.avatar} />
                          <AvatarFallback className="text-xs">
                            {getInitials(user.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-medium truncate">{user.name}</p>
                          {user.isTyping && (
                            <p className="text-xs text-blue-500 flex items-center">
                              <MessageCircle className="h-3 w-3 mr-1" />
                              typing...
                            </p>
                          )}
                          {user.currentPage && !user.isTyping && (
                            <p className="text-xs text-muted-foreground truncate">
                              <Eye className="h-3 w-3 inline mr-1" />
                              {user.currentPage}
                            </p>
                          )}
                        </div>
                        <div className={`w-2 h-2 rounded-full ${getStatusColor(user.status)}`} />
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <div className="text-xs">
                        <p className="font-medium">{user.name}</p>
                        <p>{user.email}</p>
                        <p>{getStatusText(user.status)}</p>
                        <p>Last seen: {formatTimeAgo(user.lastSeen)}</p>
                      </div>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              ))}

              {activeUsers.length === 0 && (
                <p className="text-xs text-muted-foreground py-2">
                  No other users online
                </p>
              )}
            </div>
          </div>

          {/* Recent Notifications */}
          {notifications.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">Recent Activity</span>
                </div>
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={clearNotifications}
                    className="h-6 px-2 text-xs"
                  >
                    Clear
                  </Button>
                )}
              </div>
              
              <ScrollArea className="h-32">
                <div className="space-y-1">
                  {notifications.slice(0, 5).map((notification) => (
                    <div
                      key={notification.id}
                      className={`flex items-start gap-2 p-2 rounded text-xs ${
                        notification.read ? 'bg-muted/30' : 'bg-blue-50 border border-blue-200'
                      }`}
                    >
                      <div className="flex-1">
                        <p className={notification.read ? 'text-muted-foreground' : 'text-blue-900'}>
                          {notification.message}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatTimeAgo(notification.timestamp)}
                        </p>
                      </div>
                      {!notification.read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markNotificationAsRead(notification.id)}
                          className="h-4 w-4 p-0"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
