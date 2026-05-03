/**
 * Centralized test IDs for E2E testing
 * All interactive elements must have a data-testid attribute
 */

export const TEST_IDS = {
  // Authentication
  AUTH: {
    SIGN_IN_BUTTON: 'auth-sign-in-button',
    SIGN_UP_BUTTON: 'auth-sign-up-button',
    EMAIL_INPUT: 'auth-email-input',
    PASSWORD_INPUT: 'auth-password-input',
    SUBMIT_BUTTON: 'auth-submit-button',
    SIGN_OUT_BUTTON: 'auth-sign-out-button',
    FORGOT_PASSWORD_LINK: 'auth-forgot-password-link'
  },
  
  // Navigation
  NAV: {
    DASHBOARD: 'nav-dashboard',
    CHAT: 'nav-chat',
    ANALYTICS: 'nav-analytics',
    REVOPS: 'nav-revops',
    CALENDAR: 'nav-calendar',
    LEADS: 'nav-leads',
    ACCOUNTS: 'nav-accounts',
    OPPORTUNITIES: 'nav-opportunities',
    ACTIVITIES: 'nav-activities',
    TASKS: 'nav-tasks',
    PROMPTS: 'nav-prompts'
  },
  
  // Chat Interface
  CHAT: {
    INPUT: 'chat-input',
    SEND_BUTTON: 'chat-send-button',
    MESSAGE_LIST: 'chat-message-list',
    MESSAGE_ITEM: 'chat-message-item',
    START_ASSISTANT_BUTTON: 'chat-start-assistant',
    ERROR_MESSAGE: 'chat-error-message',
    LOADING_INDICATOR: 'chat-loading'
  },
  
  // Contacts/Leads
  CONTACTS: {
    ADD_BUTTON: 'contacts-add-button',
    IMPORT_BUTTON: 'contacts-import-button',
    REFRESH_BUTTON: 'contacts-refresh-button',
    SEARCH_INPUT: 'contacts-search-input',
    LIST_CONTAINER: 'contacts-list',
    LIST_ITEM: 'contacts-list-item',
    EDIT_BUTTON: 'contacts-edit-button',
    DELETE_BUTTON: 'contacts-delete-button',
    
    // Add/Edit Form
    FORM: {
      CONTAINER: 'contacts-form-container',
      NAME_INPUT: 'contacts-form-name',
      EMAIL_INPUT: 'contacts-form-email',
      PHONE_INPUT: 'contacts-form-phone',
      COMPANY_INPUT: 'contacts-form-company',
      TITLE_INPUT: 'contacts-form-title',
      ADDRESS_INPUT: 'contacts-form-address',
      STATUS_SELECT: 'contacts-form-status',
      NOTES_TEXTAREA: 'contacts-form-notes',
      SUBMIT_BUTTON: 'contacts-form-submit',
      CANCEL_BUTTON: 'contacts-form-cancel'
    }
  },
  
  // Opportunities
  OPPORTUNITIES: {
    ADD_BUTTON: 'opportunities-add-button',
    LIST_CONTAINER: 'opportunities-list',
    LIST_ITEM: 'opportunities-list-item',
    PIPELINE_VIEW: 'opportunities-pipeline',
    STAGE_COLUMN: 'opportunities-stage-column',
    DEAL_CARD: 'opportunities-deal-card',
    
    FORM: {
      NAME_INPUT: 'opportunities-form-name',
      AMOUNT_INPUT: 'opportunities-form-amount',
      STAGE_SELECT: 'opportunities-form-stage',
      CLOSE_DATE_INPUT: 'opportunities-form-close-date',
      PROBABILITY_INPUT: 'opportunities-form-probability',
      SUBMIT_BUTTON: 'opportunities-form-submit'
    }
  },
  
  // Tasks
  TASKS: {
    ADD_BUTTON: 'tasks-add-button',
    LIST_CONTAINER: 'tasks-list',
    LIST_ITEM: 'tasks-list-item',
    COMPLETE_CHECKBOX: 'tasks-complete-checkbox',
    DUE_DATE_BADGE: 'tasks-due-date',
    PRIORITY_BADGE: 'tasks-priority'
  },
  
  // Analytics
  ANALYTICS: {
    DATE_RANGE_PICKER: 'analytics-date-range',
    METRIC_CARD: 'analytics-metric-card',
    CHART_CONTAINER: 'analytics-chart',
    EXPORT_BUTTON: 'analytics-export'
  },
  
  // Health Status
  HEALTH: {
    STATUS_BANNER: 'health-status-banner',
    STATUS_TEXT: 'health-status-text',
    DETAILS_BUTTON: 'health-details-button',
    SERVICE_STATUS: 'health-service-status'
  },
  
  // Common
  COMMON: {
    APP_ROOT: 'app-root',
    LOADING_SPINNER: 'loading-spinner',
    ERROR_BOUNDARY: 'error-boundary',
    TOAST_CONTAINER: 'toast-container',
    TOAST_MESSAGE: 'toast-message',
    MODAL_CONTAINER: 'modal-container',
    MODAL_CLOSE_BUTTON: 'modal-close',
    CONFIRM_BUTTON: 'confirm-button',
    CANCEL_BUTTON: 'cancel-button',
    SEARCH_BAR: 'global-search-bar',
    USER_MENU: 'user-menu',
    USER_AVATAR: 'user-avatar',
    ORGANIZATION_SELECTOR: 'org-selector'
  }
} as const;

// Type-safe test ID getter
export function getTestId(path: string): string {
  const keys = path.split('.');
  let current: any = TEST_IDS;
  
  for (const key of keys) {
    if (current[key] === undefined) {
      console.warn(`Test ID not found: ${path}`);
      return path.toLowerCase().replace(/\./g, '-');
    }
    current = current[key];
  }
  
  return current;
}

// Helper to add test IDs to components
export function withTestId<T extends { 'data-testid'?: string }>(
  testId: string,
  props?: T
): T & { 'data-testid': string } {
  return {
    ...props,
    'data-testid': testId
  } as T & { 'data-testid': string };
}