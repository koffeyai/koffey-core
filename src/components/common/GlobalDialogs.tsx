import React from 'react';
import { useDialogStore } from '@/stores/dialogStore';
import { ContactDialog } from '@/components/contacts/ContactDialog';
import { DealDialog } from '@/components/deals/DealDialog';
import { AccountDialog } from '@/components/accounts/AccountDialog';
import { DealCloseDialog } from '@/components/deals/DealCloseDialog';
import { SimplifiedCoachingPanel } from '@/components/deals/SimplifiedCoachingPanel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useCRM } from '@/hooks/useCRM';
import { toast } from 'sonner';
import { Sparkles } from 'lucide-react';
import { DealData } from '@/services/dealCoachingService';

// Convert store CoachingDeal to DealData format for SimplifiedCoachingPanel
const convertToDealData = (deal: any): DealData => ({
  id: deal.id,
  organizationId: deal.organization_id || deal.organizationId,
  dealSize: deal.amount || 0,
  closeDate: deal.expected_close_date || deal.close_date || deal.closeDate || '',
  stage: deal.stage || 'prospecting',
  probability: deal.probability || undefined,
  stakeholders: deal.stakeholders || undefined,
  lastActivity: deal.last_activity || undefined,
  notes: deal.notes || deal.description || undefined,
  competitorInfo: deal.competitor_info || undefined,
  timeline: deal.timeline || undefined,
  name: deal.name || deal.dealName || undefined,
  description: deal.description || undefined,
  accountName: deal.account_name || deal.accounts?.name || undefined,
});

export const GlobalDialogs: React.FC = () => {
  const {
    contactDialogOpen,
    editingContact,
    prefillContactData,
    pendingContactCallback,
    closeContactDialog,
    dealDialogOpen,
    editingDeal,
    closeDealDialog,
    accountDialogOpen,
    editingAccount,
    prefillAccountName,
    pendingDealAccountCallback,
    closeAccountDialog,
    coachingDialogOpen,
    coachingDeal,
    closeCoachingDialog,
  } = useDialogStore();

  const { createEntity, updateEntity } = useCRM('contacts');
  const { createEntity: createDeal, updateEntity: updateDeal } = useCRM('deals');
  const { createEntity: createAccount, updateEntity: updateAccount } = useCRM('accounts');

  const handleSaveContact = async (contactData: any) => {
    try {
      if (editingContact?.id) {
        await updateEntity(editingContact.id, contactData);
        toast.success('Contact updated successfully');
      } else {
        // Create the contact and get the result
        const newContact = await createEntity(contactData) as { id: string; full_name?: string } | undefined;
        toast.success('Contact created successfully');
        
        // If there's a pending callback (from DealContactsManager), call it with the new contact
        if (pendingContactCallback && newContact?.id) {
          pendingContactCallback(newContact.id, newContact.full_name || contactData.full_name || 'New Contact');
        }
      }
      closeContactDialog();
    } catch (error) {
      console.error('Failed to save contact:', error);
      toast.error('Failed to save contact');
    }
  };

  const handleSaveDeal = async (dealData: any) => {
    try {
      if (editingDeal?.id) {
        // Intercept: if stage is changing TO closed-won or closed-lost, open close dialog
        const newStage = dealData.stage;
        const oldStage = editingDeal.stage;
        const isClosing = (newStage === 'closed-won' || newStage === 'closed-lost') && oldStage !== newStage;

        if (isClosing) {
          const { openCloseDialog } = useDialogStore.getState();
          openCloseDialog(
            {
              id: editingDeal.id,
              name: editingDeal.name || dealData.name || 'Deal',
              amount: dealData.amount ?? editingDeal.amount ?? 0,
              stage: oldStage || 'prospecting',
              user_id: (editingDeal as any).user_id || '',
              organization_id: (editingDeal as any).organization_id || '',
              account_name: (editingDeal as any).account_name,
            },
            newStage as 'closed-won' | 'closed-lost',
            dealData
          );
          closeDealDialog();
          return;
        }

        await updateDeal(editingDeal.id, dealData);
        toast.success('Deal updated successfully');
      } else {
        await createDeal(dealData);
        toast.success('Deal created successfully');
      }
      closeDealDialog();
    } catch (error) {
      console.error('Failed to save deal:', error);
      toast.error('Failed to save deal');
    }
  };

  const handleSaveAccount = async (accountData: any) => {
    try {
      if (editingAccount?.id) {
        await updateAccount(editingAccount.id, accountData);
        toast.success('Account updated successfully');
        closeAccountDialog();
      } else {
        // Create the account and get the result
        const newAccount = await createAccount(accountData) as { id: string; name: string } | undefined;
        toast.success('Account created successfully');
        
        // If there's a pending callback (from DealDialog), call it with the new account
        if (pendingDealAccountCallback && newAccount?.id) {
          pendingDealAccountCallback(newAccount.id, newAccount.name || accountData.name);
        }
        
        closeAccountDialog();
      }
    } catch (error) {
      console.error('Failed to save account:', error);
      toast.error('Failed to save account');
    }
  };

  return (
    <>
      <ContactDialog
        contact={editingContact ? { ...editingContact, ...prefillContactData } as any : prefillContactData as any}
        open={contactDialogOpen}
        onOpenChange={(open) => !open && closeContactDialog()}
        onSave={handleSaveContact}
      />
      <DealDialog
        deal={editingDeal as any}
        open={dealDialogOpen}
        onOpenChange={(open) => !open && closeDealDialog()}
        onSave={handleSaveDeal}
      />
      <AccountDialog
        account={editingAccount as any}
        open={accountDialogOpen}
        onOpenChange={(open) => !open && closeAccountDialog()}
        onSave={handleSaveAccount}
        onSelectExisting={(accountId, accountName) => {
          // Link existing account to the deal via the pending callback
          if (pendingDealAccountCallback) {
            pendingDealAccountCallback(accountId, accountName);
            toast.success(`Linked to ${accountName}`);
          }
          closeAccountDialog();
        }}
        prefillName={prefillAccountName}
      />
      
      {/* Global Coaching Dialog - can be triggered from chat or deal cards */}
      <Dialog open={coachingDialogOpen} onOpenChange={(open) => !open && closeCoachingDialog()}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto z-[60]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-purple-500" />
              {coachingDeal?.name || coachingDeal?.dealName || 'Deal'} - SCOUTPAD Analysis
            </DialogTitle>
          </DialogHeader>
          {coachingDeal && (
            <SimplifiedCoachingPanel
              deal={convertToDealData(coachingDeal)}
              dealId={coachingDeal.id}
              onCoachingUpdate={(coaching) => {
                console.log('Coaching updated:', coaching);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      
      {/* Global Deal Close Dialog */}
      <DealCloseDialog />
    </>
  );
};
