import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { toast } from '@/hooks/use-toast';
import { getUserDisplayName } from '@/lib/userDisplayName';

interface CollaborationUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  status: 'online' | 'away' | 'offline';
  lastSeen: Date;
  currentPage?: string;
  isTyping?: boolean;
}

interface CollaborationState {
  users: CollaborationUser[];
  currentUser: CollaborationUser | null;
  activeUsers: CollaborationUser[];
  notifications: CollaborationNotification[];
}

interface CollaborationNotification {
  id: string;
  type: 'user_joined' | 'user_left' | 'data_updated' | 'conflict_detected';
  message: string;
  userId?: string;
  timestamp: Date;
  read: boolean;
}

// Global collaboration channel manager to prevent duplicates
class CollaborationChannelManager {
  private static instance: CollaborationChannelManager;
  private activeChannels = new Map<string, any>();
  //fix july 26
  // add a list for subscribed channels so that we can check if we have subscribed before subscribing
  private subscribedChannels = new Set<string>();
  
  static getInstance(): CollaborationChannelManager {
    if (!CollaborationChannelManager.instance) {
      CollaborationChannelManager.instance = new CollaborationChannelManager();
    }
    return CollaborationChannelManager.instance;
  }

  getOrCreateChannel(roomId: string, onSetup: (channel: any) => void): any {
    if (this.activeChannels.has(roomId)) {
      console.log('🤝 CollaborationChannelManager: Reusing existing channel:', roomId);
      return this.activeChannels.get(roomId);
    }

    console.log('🤝 CollaborationChannelManager: Creating new channel:', roomId);
    const channel = supabase.channel(roomId);
    onSetup(channel);
    this.activeChannels.set(roomId, channel);

    return channel;
  }

  //two functions to check subscription status july 26
  isAlreadySubscribed(roomId: string): boolean {
    return this.subscribedChannels.has(roomId);
  }

  markAsSubscribed(roomId: string) {
    this.subscribedChannels.add(roomId);
  }

  removeChannel(roomId: string) {
    const channel = this.activeChannels.get(roomId);
    if (channel) {
      console.log('🤝 CollaborationChannelManager: Removing channel:', roomId);
      supabase.removeChannel(channel);
      this.activeChannels.delete(roomId);
    }
  }

  cleanup() {
    console.log('🤝 CollaborationChannelManager: Cleaning up all channels');
    for (const [roomId, channel] of this.activeChannels.entries()) {
      supabase.removeChannel(channel);
    }
    this.activeChannels.clear();
  }
}

export const useRealtimeCollaboration = (roomId: string = 'crm_workspace', enabled: boolean = true) => {
  const { user, profile } = useAuth();
  const [collaborationState, setCollaborationState] = useState<CollaborationState>({
    users: [],
    currentUser: null,
    activeUsers: [],
    notifications: []
  });
  const [isConnected, setIsConnected] = useState(false);
  const [channel, setChannel] = useState<any>(null);

  const getCurrentUser = useCallback((): CollaborationUser | null => {
    if (!user) return null;
    
    return {
      id: user.id,
      name: getUserDisplayName(user, profile, 'Unknown User'),
      email: user.email || '',
      avatar: user.user_metadata?.avatar_url,
      status: 'online',
      lastSeen: new Date(),
      currentPage: window.location.pathname
    };
  }, [user, profile]);

  const addNotification = useCallback((notification: Omit<CollaborationNotification, 'id' | 'timestamp' | 'read'>) => {
    const newNotification: CollaborationNotification = {
      ...notification,
      id: crypto.randomUUID(),
      timestamp: new Date(),
      read: false
    };

    setCollaborationState(prev => ({
      ...prev,
      notifications: [newNotification, ...prev.notifications.slice(0, 9)] // Keep only last 10
    }));

    // Show toast for important notifications
    if (notification.type !== 'data_updated') {
      toast({
        title: 'Collaboration Update',
        description: notification.message
      });
    }
  }, []);

  const markNotificationAsRead = useCallback((notificationId: string) => {
    setCollaborationState(prev => ({
      ...prev,
      notifications: prev.notifications.map(n => 
        n.id === notificationId ? { ...n, read: true } : n
      )
    }));
  }, []);

  const clearNotifications = useCallback(() => {
    setCollaborationState(prev => ({
      ...prev,
      notifications: []
    }));
  }, []);

  const updateUserStatus = useCallback(async (status: 'online' | 'away' | 'offline', currentPage?: string) => {
    if (!channel || !user) return;

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const updatedUser = {
      ...currentUser,
      status,
      currentPage,
      lastSeen: new Date()
    };

    try {
      await channel.track(updatedUser);
      setCollaborationState(prev => ({
        ...prev,
        currentUser: updatedUser
      }));
    } catch (error) {
      console.error('Error updating user status:', error);
    }
  }, [channel, user, getCurrentUser]);

  const broadcastDataUpdate = useCallback(async (entityType: string, entityId: string, action: 'create' | 'update' | 'delete') => {
    if (!channel || !user) return;

    try {
      await channel.send({
        type: 'broadcast',
        event: 'data_update',
        payload: {
          entityType,
          entityId,
          action,
          userId: user.id,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error broadcasting data update:', error);
    }
  }, [channel, user]);

  const indicateTyping = useCallback(async (isTyping: boolean, context?: string) => {
    if (!channel || !user) return;

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    try {
      await channel.track({
        ...currentUser,
        isTyping,
        typingContext: context,
        lastSeen: new Date()
      });
    } catch (error) {
      console.error('Error indicating typing status:', error);
    }
  }, [channel, user, getCurrentUser]);

  // Initialize collaboration with organization validation
  useEffect(() => {
    if (!user || !enabled) return;

    const currentUser = getCurrentUser();
    if (!currentUser) return;

    const channelManager = CollaborationChannelManager.getInstance();
    
    const collaborationChannel = channelManager.getOrCreateChannel(roomId, (channel) => {
      // Setup channel handlers
      channel
        .on('presence', { event: 'sync' }, () => {
          const state = channel.presenceState();
          const users: CollaborationUser[] = [];
          
          Object.keys(state).forEach(key => {
            const presences = state[key] as any[];
            presences.forEach(presence => {
              users.push({
                ...presence,
                lastSeen: new Date(presence.lastSeen)
              });
            });
          });

          setCollaborationState(prev => ({
            ...prev,
            users,
            activeUsers: users.filter(u => u.status === 'online' && u.id !== user.id)
          }));
          setIsConnected(true);
        })
        .on('presence', { event: 'join' }, ({ key, newPresences }) => {
          const joinedUsers = (newPresences as any[]).map(presence => ({
            ...presence,
            lastSeen: new Date(presence.lastSeen)
          })) as CollaborationUser[];
          joinedUsers.forEach(joinedUser => {
            if (joinedUser.id !== user.id) {
              addNotification({
                type: 'user_joined',
                message: `${joinedUser.name} joined the workspace`,
                userId: joinedUser.id
              });
            }
          });
        })
        .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
          const leftUsers = (leftPresences as any[]).map(presence => ({
            ...presence,
            lastSeen: new Date(presence.lastSeen)
          })) as CollaborationUser[];
          leftUsers.forEach(leftUser => {
            if (leftUser.id !== user.id) {
              addNotification({
                type: 'user_left',
                message: `${leftUser.name} left the workspace`,
                userId: leftUser.id
              });
            }
          });
        })
        .on('broadcast', { event: 'data_update' }, ({ payload }) => {
          if (payload.userId !== user.id) {
            const userName = collaborationState.users.find(u => u.id === payload.userId)?.name || 'Someone';
            addNotification({
              type: 'data_updated',
              message: `${userName} ${payload.action}d a ${payload.entityType}`,
              userId: payload.userId
            });
          }
        });
    });

    setChannel(collaborationChannel);

    // Subscribe and track presence
    //Check for subscription status fix implemented july 26
    if (!channelManager.isAlreadySubscribed(roomId)) {
      collaborationChannel.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await collaborationChannel.track(currentUser);
          setCollaborationState(prev => ({
            ...prev,
            currentUser
          }));
        }
        channelManager.markAsSubscribed(roomId);
      });
    }

    // Update status on page visibility change
    const handleVisibilityChange = () => {
      const newStatus = document.hidden ? 'away' : 'online';
      updateUserStatus(newStatus, window.location.pathname);
    };

    // Update status on page navigation
    const handlePageChange = () => {
      updateUserStatus('online', window.location.pathname);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('popstate', handlePageChange);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('popstate', handlePageChange);
      
      // Note: Channel cleanup is managed by the global manager
      setChannel(null);
      setIsConnected(false);
    };
  }, [user, roomId, enabled]);

  // Auto-remove old notifications
  useEffect(() => {
    const interval = setInterval(() => {
      setCollaborationState(prev => ({
        ...prev,
        notifications: prev.notifications.filter(n => 
          Date.now() - n.timestamp.getTime() < 5 * 60 * 1000 // Remove after 5 minutes
        )
      }));
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  // Return disabled state if not enabled
  if (!enabled) {
    return {
      ...collaborationState,
      isConnected: false,
      updateUserStatus: () => {},
      broadcastDataUpdate: () => {},
      indicateTyping: () => {},
      markNotificationAsRead,
      clearNotifications,
      unreadNotifications: 0
    };
  }

  return {
    ...collaborationState,
    isConnected,
    updateUserStatus,
    broadcastDataUpdate,
    indicateTyping,
    markNotificationAsRead,
    clearNotifications,
    unreadNotifications: collaborationState.notifications.filter(n => !n.read).length
  };
};
