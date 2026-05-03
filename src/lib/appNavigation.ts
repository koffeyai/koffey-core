export type AppView =
  | 'command-center'
  | 'dashboard'
  | 'chat'
  | 'analytics'
  | 'revops'
  | 'slides'
  | 'calendar'
  | 'leads'
  | 'contacts'
  | 'accounts'
  | 'deals'
  | 'activities'
  | 'tasks'
  | 'activity-goals'
  | 'campaigns'
  | 'company-profile'
  | 'report-builder'
  | 'audit-log'
  | 'prompt-manager'
  | 'notifications'
  | 'settings'
  | 'admin-dashboard'
  | 'pipeline-config'
  | 'integration-health'
  | 'duplicates'
  | 'ai-audit'
  | 'bulk-import'
  | 'workflows';

export function navigateToAppView(view: AppView) {
  window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view } }));
}

export function openAccountView() {
  navigateToAppView('accounts');
}

export function openSlideStudio(payload: { dealId?: string; dealName?: string; accountId?: string | null }) {
  navigateToAppView('slides');

  window.setTimeout(() => {
    window.dispatchEvent(new CustomEvent('open-slide-studio', { detail: payload }));
  }, 0);
}

export function openChatPanelPrompt(message: string, context?: Record<string, unknown>) {
  window.dispatchEvent(new CustomEvent('navigate-to-chat', {
    detail: {
      initialMessage: message,
      contextInfo: context || null,
    },
  }));
}
