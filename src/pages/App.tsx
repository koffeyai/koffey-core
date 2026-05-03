
import React, { useState, useEffect, Suspense, lazy, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useUnifiedChatStore } from '@/stores/unifiedChatStore';
import { useChatPanelStore } from '@/stores/chatPanelStore';
import { useAuth } from '@/components/auth/AuthProvider';
import { useActivityTracker } from '@/hooks/useActivityTracker';
import { useGlobalCRMSync } from '@/hooks/useGlobalCRMSync';
import { supabase } from '@/integrations/supabase/client';
import { AppShell } from '@/components/layout/AppShell';
import { ChatSlidePanel } from '@/components/chat/ChatSlidePanel';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { NoOrgAccess } from '@/components/auth/NoOrgAccess';
import { OrganizationSelectorModal } from '@/components/organization/OrganizationSelectorModal';
import { Button } from '@/components/ui/button';
import { CRMLayoutWithChat } from '@/components/layout/CRMLayoutWithChat';
import { CelebrationProvider } from '@/components/engagement/CelebrationToast';
import { GlobalDialogs } from '@/components/common/GlobalDialogs';
import { CommandPalette } from '@/components/navigation/CommandPalette';
import { KeyboardShortcuts } from '@/components/navigation/KeyboardShortcuts';
import { canAccessView, canSwitchToRole } from '@/config/roleConfig';
import { useActiveViewRoleStore } from '@/stores/activeViewRoleStore';
import { toast } from 'sonner';
import {
  PENDING_DEAL_DETAIL_KEY,
  buildDealLookupCandidates,
  queueDealDetailOpen,
} from '@/lib/dealDetailNavigation';
import {
  SESSION_LAST_ACTIVE_KEY,
  markAppActivity,
  markAppHidden,
  markAppVisible,
} from '@/lib/appSessionFreshness';

const AnalyticsDashboard = lazy(() => import('@/components/AnalyticsDashboard').then((m) => ({ default: m.AnalyticsDashboard })));
const PromptManager = lazy(() => import('@/components/PromptManager').then((m) => ({ default: m.PromptManager })));
const UnifiedChatInterface = lazy(() => import('@/components/chat/UnifiedChatInterface'));
const ContactsManager = lazy(() => import('@/components/ContactsManager').then((m) => ({ default: m.ContactsManager })));
const LeadsManager = lazy(() => import('@/components/LeadsManager').then((m) => ({ default: m.LeadsManager })));
const AccountsManager = lazy(() => import('@/components/AccountsManager').then((m) => ({ default: m.AccountsManager })));
const DealsManager = lazy(() => import('@/components/DealsManager').then((m) => ({ default: m.DealsManager })));
const ActivitiesManager = lazy(() => import('@/components/ActivitiesManager').then((m) => ({ default: m.ActivitiesManager })));
const TasksManager = lazy(() => import('@/components/TasksManager').then((m) => ({ default: m.TasksManager })));
const CalendarManager = lazy(() => import('@/components/CalendarManager').then((m) => ({ default: m.CalendarManager })));
const SettingsInterface = lazy(() => import('@/components/settings/SettingsInterface').then((m) => ({ default: m.SettingsInterface })));
const DashboardLanding = lazy(() => import('@/components/dashboard/DashboardLanding').then((m) => ({ default: m.DashboardLanding })));
const RevenueVelocityDashboard = lazy(() => import('@/components/revops/RevenueVelocityDashboard').then((m) => ({ default: m.RevenueVelocityDashboard })));
const SlideStudio = lazy(() => import('@/pages/SlideStudio').then((m) => ({ default: m.SlideStudio })));
const AuditLogDashboard = lazy(() => import('@/components/admin/AuditLogDashboard'));
const CompanyProfileEditor = lazy(() => import('@/components/admin/CompanyProfileEditor').then((m) => ({ default: m.CompanyProfileEditor })));
const AdminDashboard = lazy(() => import('@/pages/AdminDashboard').then((m) => ({ default: m.AdminDashboard })));
const CommandCenter = lazy(() => import('@/components/command-center').then((m) => ({ default: m.CommandCenter })));

// Lazy-load new feature views
const ActivityGoalDashboard = lazy(() => import('@/components/sdr/ActivityGoalDashboard'));
const MarketingDashboard = lazy(() => import('@/components/marketing/MarketingDashboard'));
const PipelineStageConfig = lazy(() => import('@/components/admin/PipelineStageConfig'));
const IntegrationHealth = lazy(() => import('@/components/admin/IntegrationHealth'));
const DuplicateMerge = lazy(() => import('@/components/admin/DuplicateMerge'));
const AIDecisionAudit = lazy(() => import('@/components/admin/AIDecisionAudit'));
const BulkImport = lazy(() => import('@/components/admin/BulkImport'));
const WorkflowBuilder = lazy(() => import('@/components/admin/WorkflowBuilder'));
const ReportBuilder = lazy(() => import('@/components/admin/ReportBuilder'));
const NotificationPreferences = lazy(() => import('@/components/settings/NotificationPreferences'));
// Lazy-load ProactiveCoachCard to reduce render loop surface area
const ProactiveCoachCard = lazy(() => 
  import('@/components/intelligence/ProactiveCoachCard').then(m => ({ 
    default: m.ProactiveCoachCard 
  }))
);

const INACTIVITY_MS = 90 * 60 * 1000; // 1.5 hours
const SESSION_VIEW_KEY = 'koffey_session_view';
const VIEW_FALLBACK = <div className="animate-pulse h-64 bg-muted rounded-lg m-6" />;

const CRMApp = () => {
  useActivityTracker();
  useGlobalCRMSync();

  const { user, loading: authLoading } = useAuth();
  const { 
    memberships, 
    currentOrganization, 
    showSelector, 
    loading: orgLoading, 
    error: orgError,
    selectOrganization,
    closeSelector 
  } = useOrganizationAccess();
  const { isPanelOpen, closePanel } = useChatPanelStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [currentView, setCurrentView] = useState('dashboard');
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [analyticsQuery, setAnalyticsQuery] = useState('');
  const [chatContext, setChatContext] = useState<any>(null);
  const [initialChatMessage, setInitialChatMessage] = useState<any>(null);
  const {
    activeViewRole,
    assignedRole,
    resetToAssigned,
  } = useActiveViewRoleStore();

  const navigateToView = useCallback((view: string, options?: { silent?: boolean }) => {
    if (!currentOrganization) return false;

    if (!canAccessView(view, activeViewRole, currentOrganization.role)) {
      if (!options?.silent) {
        toast.error('Access denied', {
          description: `Your current role cannot access the ${view.replace(/-/g, ' ')} view.`,
        });
      }
      setCurrentView('dashboard');
      sessionStorage.setItem(SESSION_VIEW_KEY, 'dashboard');
      return false;
    }

    setCurrentView(view);
    return true;
  }, [activeViewRole, currentOrganization]);

  useEffect(() => {
    if (!currentOrganization) return;

    if (!canSwitchToRole(assignedRole, activeViewRole, currentOrganization.role)) {
      resetToAssigned();
      setCurrentView('dashboard');
      return;
    }

    if (!canAccessView(currentView, activeViewRole, currentOrganization.role)) {
      navigateToView('dashboard', { silent: true });
    }
  }, [
    activeViewRole,
    assignedRole,
    currentOrganization,
    currentView,
    navigateToView,
    resetToAssigned,
  ]);

  // Track user activity for session freshness (same-tab restore only)
  useEffect(() => {
    const markActive = () => {
      markAppActivity();
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        markAppVisible();
        markActive();
      } else if (document.visibilityState === 'hidden') {
        markAppHidden();
      }
    };

    markActive();

    const activityEvents: Array<keyof WindowEventMap> = [
      'focus',
      'click',
      'keydown',
      'mousemove',
      'touchstart'
    ];

    activityEvents.forEach((eventName) => window.addEventListener(eventName, markActive, { passive: true }));
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const idleCheck = window.setInterval(() => {
      const lastActive = Number(sessionStorage.getItem(SESSION_LAST_ACTIVE_KEY) || 0);
      if (!lastActive) return;

      if (Date.now() - lastActive >= INACTIVITY_MS) {
        setCurrentView('dashboard');
        sessionStorage.setItem(SESSION_VIEW_KEY, 'dashboard');
      }
    }, 60_000);

    return () => {
      activityEvents.forEach((eventName) => window.removeEventListener(eventName, markActive));
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.clearInterval(idleCheck);
    };
  }, []);

  // Persist current view only for this tab/session
  useEffect(() => {
    sessionStorage.setItem(SESSION_VIEW_KEY, currentView);
  }, [currentView]);

  useEffect(() => {
    if (!authLoading && !user && location.pathname !== '/admin') {
      navigate('/auth');
    }
  }, [user, authLoading, navigate, location.pathname]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const view = params.get("view");
    if (view) {
      navigateToView(view);
    }
  }, [location.search, navigateToView]);

  const handleShowAnalytics = (show: boolean, query?: string) => {
    setShowAnalytics(show);
    setAnalyticsQuery(query || '');
  };

  const handleCRMOperation = (operation: any) => {
    console.log('CRM Operation:', operation);
  };

  // Wire the open-deal-dialog event to actually open the deal dialog
  useEffect(() => {
    const handleOpenDealDialog = async (e: Event) => {
      const dealId = (e as CustomEvent).detail?.dealId;
      const dealName = (e as CustomEvent).detail?.dealName;
      if (!dealId && !dealName) return;
      try {
        let hydratedDeal: any = null;

        if (dealId) {
          const { data, error } = await supabase
            .from('deals')
            .select('*, accounts(id, name, domain)')
            .eq('id', dealId)
            .maybeSingle();
          if (!error && data) {
            hydratedDeal = data;
          }
        }

        // Fallback for cases where link payload has stale/non-id values or
        // dashboard action text like "Advance Example Labs - $35K this week".
        if (!hydratedDeal && dealName) {
          const candidates = buildDealLookupCandidates(dealName);
          for (const candidate of candidates) {
            const { data, error } = await supabase
              .from('deals')
              .select('*, accounts(id, name, domain)')
              .ilike('name', `%${candidate}%`)
              .order('updated_at', { ascending: false })
              .limit(1);
            if (!error && Array.isArray(data) && data.length > 0) {
              hydratedDeal = data[0];
              break;
            }
          }
        }

        if (!hydratedDeal) {
          console.warn('No matching deal found for hotlink', { dealId, dealName });
          return;
        }

        const normalizedDeal = {
          ...hydratedDeal,
          close_date: hydratedDeal.close_date || hydratedDeal.expected_close_date || '',
          account_name: hydratedDeal.account_name || hydratedDeal.accounts?.name || '',
        };

        // Persist a short-lived pending payload so the deals view can open reliably
        // even when it mounts after this event is handled.
        // SECURITY: store only identifiers, not full CRM payloads.
        sessionStorage.setItem(PENDING_DEAL_DETAIL_KEY, JSON.stringify({
          ts: Date.now(),
          dealId: normalizedDeal.id,
          dealName: normalizedDeal.name || normalizedDeal.dealName || null,
        }));

        navigateToView('deals');

        queueDealDetailOpen({ deal: normalizedDeal });
      } catch (err) {
        console.error('Failed to open deal dialog:', err);
      }
    };
    window.addEventListener('open-deal-dialog', handleOpenDealDialog);
    return () => window.removeEventListener('open-deal-dialog', handleOpenDealDialog);
  }, [navigateToView]);

  useEffect(() => {
    const handleChatLaunch = () => {
      const { isPanelOpen } = useChatPanelStore.getState();
      if (!isPanelOpen) {
        navigateToView('chat');
      }
    };
    const handleChatNavigation = (event: CustomEvent) => {
      const { isPanelOpen } = useChatPanelStore.getState();
      if (!isPanelOpen) {
        navigateToView('chat');
        setChatContext(event.detail?.contextInfo || null);
        const incomingMessage = event.detail?.initialMessage;
        setInitialChatMessage(incomingMessage
          ? {
              id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
              message: typeof incomingMessage === 'string' ? incomingMessage : incomingMessage.message,
              autoSend: typeof incomingMessage === 'string' ? true : incomingMessage.autoSend !== false,
            }
          : null);
      }
    };
    const handleNavigateToView = (event: CustomEvent) => {
      const view = event.detail?.view;
      if (view) {
        navigateToView(view);
      }
    };

    window.addEventListener('launch-chat', handleChatLaunch as any);
    window.addEventListener('navigate-to-chat', handleChatNavigation as any);
    window.addEventListener('navigate-to-view', handleNavigateToView as any);

    return () => {
      window.removeEventListener('launch-chat', handleChatLaunch as any);
      window.removeEventListener('navigate-to-chat', handleChatNavigation as any);
      window.removeEventListener('navigate-to-view', handleNavigateToView as any);
    };
  }, [navigateToView]);

  if (authLoading || orgLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <h2 className="text-xl font-semibold text-foreground">Loading...</h2>
          <p className="text-muted-foreground mt-2">Setting up your workspace</p>
        </div>
      </div>
    );
  }

  if (!user) {
    navigate('/auth');
    return null;
  }

  if (showSelector) {
    return (
      <div className="min-h-screen bg-background">
        <OrganizationSelectorModal
          open={showSelector}
          memberships={memberships}
          onSelect={selectOrganization}
          onClose={memberships.length === 1 ? closeSelector : undefined}
        />
      </div>
    );
  }

  if (!currentOrganization) {
    if (orgError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <div className="text-center">
            <h2 className="text-xl font-semibold text-destructive">Organization Access Error</h2>
            <p className="text-muted-foreground mt-2">{orgError || 'Failed to load organization'}</p>
            <Button 
              onClick={() => window.location.reload()} 
              className="mt-4"
            >
              Try Again
            </Button>
          </div>
        </div>
      );
    }

    return <NoOrgAccess />;
  }

  const renderView = () => {
    const renderContent = () => {
      switch (currentView) {
        case 'command-center':
        case 'dashboard':
          return <Suspense fallback={VIEW_FALLBACK}><CommandCenter /></Suspense>;
        
        case 'chat':
          return (
            <Suspense fallback={VIEW_FALLBACK}>
              <UnifiedChatInterface 
                onShowAnalytics={handleShowAnalytics}
                onShowPromptManager={() => navigateToView('prompt-manager')}
                onBackToPrevious={() => {
                  navigateToView('dashboard');
                  setChatContext(null);
                  setInitialChatMessage(null);
                }}
                contextInfo={chatContext}
                initialMessage={initialChatMessage}
              />
            </Suspense>
          );
        
        default:
          return (
            <CRMLayoutWithChat currentTab={currentView}>
              {renderCurrentView()}
            </CRMLayoutWithChat>
          );
      }
    };

    return (
      <AppShell
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        setCurrentView={setCurrentView}
        currentView={currentView}
      >
        {renderContent()}
        {/* Slide-out Chat Panel - always available */}
        <ChatSlidePanel
          isOpen={isPanelOpen}
          onClose={closePanel}
          pageContext={{ currentPage: currentView }}
        />
      </AppShell>
    );
  };

  const renderCurrentView = () => {
    switch (currentView) {
      case 'analytics':
        return <Suspense fallback={VIEW_FALLBACK}><AnalyticsDashboard query={analyticsQuery} /></Suspense>;
      case 'command-center':
        return <Suspense fallback={VIEW_FALLBACK}><CommandCenter /></Suspense>;
      case 'revops':
        return <Suspense fallback={VIEW_FALLBACK}><RevenueVelocityDashboard /></Suspense>;
      case 'slides':
        return <Suspense fallback={VIEW_FALLBACK}><SlideStudio /></Suspense>;
      case 'calendar':
        return <Suspense fallback={VIEW_FALLBACK}><CalendarManager /></Suspense>;
      case 'leads':
        return <Suspense fallback={VIEW_FALLBACK}><LeadsManager /></Suspense>;
      case 'contacts':
        return <Suspense fallback={VIEW_FALLBACK}><ContactsManager /></Suspense>;
      case 'accounts':
        return <Suspense fallback={VIEW_FALLBACK}><AccountsManager /></Suspense>;
      case 'deals':
        return <Suspense fallback={VIEW_FALLBACK}><DealsManager /></Suspense>;
      case 'activities':
        return <Suspense fallback={VIEW_FALLBACK}><ActivitiesManager /></Suspense>;
      case 'tasks':
        return <Suspense fallback={VIEW_FALLBACK}><TasksManager /></Suspense>;
      case 'settings':
        return <Suspense fallback={VIEW_FALLBACK}><SettingsInterface onBackToChat={() => setCurrentView('dashboard')} /></Suspense>;
      case 'prompt-manager':
        return <Suspense fallback={VIEW_FALLBACK}><PromptManager /></Suspense>;
      case 'audit-log':
        return <Suspense fallback={VIEW_FALLBACK}><AuditLogDashboard /></Suspense>;
      case 'admin-dashboard':
        return <Suspense fallback={VIEW_FALLBACK}><AdminDashboard /></Suspense>;
      case 'activity-goals':
        return <Suspense fallback={VIEW_FALLBACK}><ActivityGoalDashboard /></Suspense>;
      case 'campaigns':
        return <Suspense fallback={VIEW_FALLBACK}><MarketingDashboard /></Suspense>;
      case 'pipeline-config':
        return <Suspense fallback={VIEW_FALLBACK}><PipelineStageConfig /></Suspense>;
      case 'integration-health':
        return <Suspense fallback={VIEW_FALLBACK}><IntegrationHealth /></Suspense>;
      case 'duplicates':
        return <Suspense fallback={VIEW_FALLBACK}><DuplicateMerge /></Suspense>;
      case 'ai-audit':
        return <Suspense fallback={VIEW_FALLBACK}><AIDecisionAudit /></Suspense>;
      case 'bulk-import':
        return <Suspense fallback={VIEW_FALLBACK}><BulkImport /></Suspense>;
      case 'workflows':
        return <Suspense fallback={VIEW_FALLBACK}><WorkflowBuilder /></Suspense>;
      case 'report-builder':
        return <Suspense fallback={VIEW_FALLBACK}><ReportBuilder /></Suspense>;
      case 'notifications':
        return <Suspense fallback={VIEW_FALLBACK}><NotificationPreferences /></Suspense>;
      case 'company-profile':
        return (
          <Suspense fallback={VIEW_FALLBACK}>
            <div className="container mx-auto px-4 py-8">
              <div className="mb-8">
                <h1 className="text-4xl font-bold tracking-tight">Company Profile</h1>
                <p className="text-muted-foreground mt-2">
                  Manage your company identity, messaging, and target personas
                </p>
              </div>
              <CompanyProfileEditor />
            </div>
          </Suspense>
        );
      default:
        return (
          <Suspense fallback={VIEW_FALLBACK}>
            <DashboardLanding 
              onNavigate={navigateToView}
              onChatToggle={(message?: string, context?: any) => {
                navigateToView('chat');
                setChatContext({
                  fromPage: 'dashboard',
                  title: 'Chat from dashboard',
                  description: 'Continue working with your dashboard data in the AI assistant.'
                });
                if (message) {
                  useUnifiedChatStore.getState().setPendingMessage(message, context, true);
                }
              }}
            />
          </Suspense>
        );
    }
  };

  return (
    <CelebrationProvider>
      {renderView()}
      <CommandPalette setCurrentView={navigateToView} />
      <KeyboardShortcuts setCurrentView={navigateToView} />
      <Suspense fallback={<div className="animate-pulse h-32 bg-muted rounded-lg fixed bottom-4 right-4 w-80" />}>
        <ProactiveCoachCard position="floating" />
      </Suspense>
      <GlobalDialogs />
    </CelebrationProvider>
  );
};

export default CRMApp;
