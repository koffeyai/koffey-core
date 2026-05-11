import { create } from 'zustand';

interface Contact {
  id?: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  position?: string;
  address?: string;
  linkedin_url?: string;
  notes?: string;
  status?: string;
}

interface Deal {
  id?: string;
  name?: string;
  amount?: number;
  currency?: string;
  stage?: string;
  probability?: number;
  expected_close_date?: string;
  description?: string;
  account_id?: string;
  account_name?: string;
}

interface Account {
  id?: string;
  name?: string;
  industry?: string;
  website?: string;
  phone?: string;
  address?: string;
  description?: string;
}

// Deal data for coaching panel (matches DealData from dealCoachingService)
interface CoachingDeal {
  id?: string;
  organization_id?: string;
  name?: string;
  dealName?: string;
  amount?: number;
  stage?: string;
  probability?: number;
  expected_close_date?: string;
  close_date?: string;
  closeDate?: string;
  description?: string;
  notes?: string;
  account_id?: string;
  account_name?: string;
  stakeholders?: string;
  last_activity?: string;
  competitor_info?: string;
  timeline?: string;
}

interface DialogStore {
  // Contact dialog
  contactDialogOpen: boolean;
  editingContact: Contact | null;
  prefillContactData: Partial<Contact> | null;
  pendingContactCallback: ((contactId: string, contactName: string) => void) | null;
  openContactDialog: (
    contact?: Contact, 
    prefillData?: Partial<Contact>,
    onContactCreated?: (contactId: string, contactName: string) => void
  ) => void;
  closeContactDialog: () => void;

  // Deal dialog
  dealDialogOpen: boolean;
  editingDeal: Deal | null;
  openDealDialog: (deal?: Deal) => void;
  closeDealDialog: () => void;

  // Account dialog
  accountDialogOpen: boolean;
  editingAccount: Account | null;
  prefillAccountName: string | null;
  pendingDealAccountCallback: ((accountId: string, accountName: string) => void) | null;
  openAccountDialog: (account?: Account, prefillName?: string, onAccountCreated?: (accountId: string, accountName: string) => void) => void;
  closeAccountDialog: () => void;

  // Coaching dialog (for AI deal analysis)
  coachingDialogOpen: boolean;
  coachingDeal: CoachingDeal | null;
  openCoachingDialog: (deal: CoachingDeal) => void;
  closeCoachingDialog: () => void;

  // Close dialog (deal close workflow)
  closeDialogOpen: boolean;
  closingDeal: {
    id: string;
    name: string;
    amount: number;
    stage: string;
    user_id: string;
    organization_id: string;
    account_name?: string;
  } | null;
  closeTargetStage: 'closed-won' | 'closed-lost' | null;
  pendingDealUpdates: any;
  openCloseDialog: (
    deal: { id: string; name: string; amount: number; stage: string; user_id: string; organization_id: string; account_name?: string },
    targetStage: 'closed-won' | 'closed-lost',
    pendingUpdates: any
  ) => void;
  closeCloseDialog: () => void;
}

export const useDialogStore = create<DialogStore>((set) => ({
  // Contact dialog state
  contactDialogOpen: false,
  editingContact: null,
  prefillContactData: null,
  pendingContactCallback: null,
  openContactDialog: (contact, prefillData, onContactCreated) => set({ 
    contactDialogOpen: true, 
    editingContact: contact || null,
    prefillContactData: prefillData || null,
    pendingContactCallback: onContactCreated || null
  }),
  closeContactDialog: () => set({ 
    contactDialogOpen: false, 
    editingContact: null,
    prefillContactData: null,
    pendingContactCallback: null
  }),

  // Deal dialog state
  dealDialogOpen: false,
  editingDeal: null,
  openDealDialog: (deal) => set({ dealDialogOpen: true, editingDeal: deal || null }),
  closeDealDialog: () => set({ dealDialogOpen: false, editingDeal: null }),

  // Account dialog state
  accountDialogOpen: false,
  editingAccount: null,
  prefillAccountName: null,
  pendingDealAccountCallback: null,
  openAccountDialog: (account, prefillName, onAccountCreated) => set({ 
    accountDialogOpen: true, 
    editingAccount: account || null,
    prefillAccountName: prefillName || null,
    pendingDealAccountCallback: onAccountCreated || null
  }),
  closeAccountDialog: () => set({ 
    accountDialogOpen: false, 
    editingAccount: null, 
    prefillAccountName: null,
    pendingDealAccountCallback: null
  }),

  // Coaching dialog state
  coachingDialogOpen: false,
  coachingDeal: null,
  openCoachingDialog: (deal) => set({ 
    coachingDialogOpen: true, 
    coachingDeal: deal 
  }),
  closeCoachingDialog: () => set({ 
    coachingDialogOpen: false, 
    coachingDeal: null 
  }),

  // Close dialog state
  closeDialogOpen: false,
  closingDeal: null,
  closeTargetStage: null,
  pendingDealUpdates: null,
  openCloseDialog: (deal, targetStage, pendingUpdates) => set({
    closeDialogOpen: true,
    closingDeal: deal,
    closeTargetStage: targetStage,
    pendingDealUpdates: pendingUpdates,
  }),
  closeCloseDialog: () => set({
    closeDialogOpen: false,
    closingDeal: null,
    closeTargetStage: null,
    pendingDealUpdates: null,
  }),
}));
