import React, { useState, useMemo } from 'react';
import { User, Plus, X, Target, Info, ChevronDown, Search, AlertCircle, UserPlus, Linkedin } from 'lucide-react';
import { useDialogStore } from '@/stores/dialogStore';
import { useDealContacts, getQuadrantLabel, getQuadrantColor, DealContact } from '@/hooks/useDealContacts';
import { StakeholderQuadrant } from './StakeholderQuadrant';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { DeleteConfirmationDialog } from '@/components/common/DeleteConfirmationDialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { cn } from '@/lib/utils';

interface DealContactsManagerProps {
  dealId: string;
  accountId?: string;
  accountName?: string;
  className?: string;
}

const ROLE_OPTIONS = [
  { value: 'decision_maker', label: 'Decision Maker' },
  { value: 'economic_buyer', label: 'Economic Buyer' },
  { value: 'technical_buyer', label: 'Technical Buyer' },
  { value: 'influencer', label: 'Influencer' },
  { value: 'gatekeeper', label: 'Gatekeeper' },
  { value: 'user', label: 'End User' },
  { value: 'champion', label: 'Champion' },
  { value: 'blocker', label: 'Blocker' },
];

const getContactName = (dealContact: DealContact | null | undefined) => {
  const contact = dealContact?.contact;
  return contact?.full_name ||
    `${contact?.first_name || ''} ${contact?.last_name || ''}`.trim() ||
    'Unknown Contact';
};

export function DealContactsManager({ dealId, accountId, accountName, className }: DealContactsManagerProps) {
  const { organizationId } = useOrganizationAccess();
  const { openContactDialog } = useDialogStore();
  const {
    contacts,
    stats,
    isLoading,
    addContact,
    updateRanking,
    removeContactAsync,
    isAdding,
    isUpdating,
    isRemoving,
  } = useDealContacts(dealId);

  const [addPopoverOpen, setAddPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('');
  const [rankingContact, setRankingContact] = useState<DealContact | null>(null);
  const [contactToRemove, setContactToRemove] = useState<DealContact | null>(null);

  // Fetch available contacts (not already linked to this deal)
  // Two-step search: find matching accounts first, then contacts by name/email/company OR account_id
  const { data: matchingAccountIds = [] } = useQuery({
    queryKey: ['matching-accounts', organizationId, searchQuery],
    queryFn: async () => {
      if (!organizationId || !searchQuery) return [];
      const { data, error } = await supabase
        .from('accounts')
        .select('id')
        .eq('organization_id', organizationId)
        .ilike('name', `%${searchQuery}%`)
        .limit(50);
      if (error) throw error;
      return (data || []).map(a => a.id);
    },
    enabled: !!organizationId && addPopoverOpen && !!searchQuery,
    staleTime: 10000,
  });

  const { data: availableContacts = [] } = useQuery({
    queryKey: ['available-contacts', dealId, organizationId, searchQuery, matchingAccountIds, accountId],
    queryFn: async () => {
      if (!organizationId) return [];

      let query = supabase
        .from('contacts')
        .select('id, first_name, last_name, full_name, email, title, company, account_id, accounts(name)')
        .eq('organization_id', organizationId)
        .order('full_name', { ascending: true })
        .limit(20);

      if (searchQuery) {
        const filters = [
          `full_name.ilike.%${searchQuery}%`,
          `email.ilike.%${searchQuery}%`,
          `company.ilike.%${searchQuery}%`,
        ];
        // Include contacts linked to matching accounts
        if (matchingAccountIds.length > 0) {
          filters.push(`account_id.in.(${matchingAccountIds.join(',')})`);
        }
        query = query.or(filters.join(','));
      } else if (accountId) {
        // No search query — default to showing contacts linked to this deal's account
        query = query.eq('account_id', accountId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Filter out already linked contacts
      const linkedIds = new Set(contacts.map(c => c.contact_id));
      return (data || []).filter(c => !linkedIds.has(c.id));
    },
    enabled: !!organizationId && addPopoverOpen,
    staleTime: 10000,
  });

  const handleAddContact = (contactId: string) => {
    addContact({
      dealId,
      contactId,
      roleInDeal: selectedRole || undefined,
    });
    setAddPopoverOpen(false);
    setSearchQuery('');
    setSelectedRole('');
  };

  const handleSaveRanking = (support: number, influence: number) => {
    if (!rankingContact) return;
    updateRanking({
      dealContactId: rankingContact.id,
      supportAxis: support,
      influenceAxis: influence,
    });
    setRankingContact(null);
  };

  const handleRemoveContact = async () => {
    if (!contactToRemove) return;
    await removeContactAsync({ dealContactId: contactToRemove.id });
    setContactToRemove(null);
  };

  const handleCreateNewContact = () => {
    setAddPopoverOpen(false); // Close the stakeholder popover
    
    // Open ContactDialog with prefill data and callback to auto-add as stakeholder
    openContactDialog(
      undefined, // No existing contact
      { 
        full_name: searchQuery.trim() || undefined, // Pre-fill with search text
        company: accountName || undefined // Pre-fill company if deal has an account
      },
      (newContactId: string) => {
        // Callback: automatically add the new contact as a stakeholder
        addContact({
          dealId,
          contactId: newContactId,
          roleInDeal: selectedRole || undefined,
        });
        // Reset state
        setSearchQuery('');
        setSelectedRole('');
      }
    );
  };

  // Mini quadrant distribution chart
  const QuadrantMiniChart = () => {
    const total = stats.ranked || 1;
    const segments = [
      { key: 'champion_influential', count: stats.byQuadrant.champion_influential, color: 'bg-green-500' },
      { key: 'champion_peripheral', count: stats.byQuadrant.champion_peripheral, color: 'bg-emerald-400' },
      { key: 'adversarial_influential', count: stats.byQuadrant.adversarial_influential, color: 'bg-red-500' },
      { key: 'adversarial_peripheral', count: stats.byQuadrant.adversarial_peripheral, color: 'bg-yellow-500' },
    ];

    return (
      <div className="flex gap-0.5 h-2 rounded-full overflow-hidden bg-muted">
        {segments.map(seg => (
          seg.count > 0 && (
            <div
              key={seg.key}
              className={cn(seg.color)}
              style={{ width: `${(seg.count / total) * 100}%` }}
            />
          )
        ))}
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className={cn("space-y-4 animate-pulse", className)}>
        <div className="h-4 bg-muted rounded w-24" />
        <div className="h-16 bg-muted rounded" />
      </div>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Label className="text-sm text-muted-foreground">Stakeholders</Label>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Info className="h-4 w-4 text-muted-foreground cursor-help" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-sm">
                  Track key stakeholders involved in this deal and rank their influence and support level.
                  This helps SCOUTPAD provide more accurate coaching on deal strength.
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        <Popover open={addPopoverOpen} onOpenChange={setAddPopoverOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-7 text-xs">
              <Plus className="h-3 w-3 mr-1" />
              Add
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-80 p-0" align="end">
            <Command>
              <CommandInput
                placeholder="Search by name, email, or company..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <div className="p-2 border-b">
                <Select value={selectedRole} onValueChange={setSelectedRole}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue placeholder="Select role (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map(role => (
                      <SelectItem key={role.value} value={role.value}>
                        {role.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <CommandList className="max-h-[200px] overflow-y-auto">
                <CommandEmpty>
                  <div className="py-2 text-center">
                    <p className="text-sm text-muted-foreground mb-2">No contacts found</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleCreateNewContact}
                      className="w-full"
                    >
                      <UserPlus className="h-4 w-4 mr-2" />
                      Create {searchQuery ? `"${searchQuery}"` : 'new contact'}
                    </Button>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  {availableContacts.map(contact => {
                    const accountLabel = (contact as any).accounts?.name || contact.company;
                    return (
                      <CommandItem
                        key={contact.id}
                        onSelect={() => handleAddContact(contact.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <div className="h-6 w-6 rounded-full bg-muted flex items-center justify-center">
                            <User className="h-3 w-3 text-muted-foreground" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">
                              {contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim() || 'Unknown'}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {[contact.title, accountLabel].filter(Boolean).join(' · ') || contact.email || 'No details'}
                            </p>
                          </div>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
              {/* Always visible create option */}
              <div className="p-2 border-t">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleCreateNewContact}
                  className="w-full justify-start text-muted-foreground hover:text-foreground"
                >
                  <UserPlus className="h-4 w-4 mr-2" />
                  Create new contact
                </Button>
              </div>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {/* Stats Summary */}
      {stats.total > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">
              {stats.ranked} of {stats.total} ranked
            </span>
            {stats.unranked > 0 && (
              <span className="text-yellow-500 flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                {stats.unranked} unranked
              </span>
            )}
          </div>
          {stats.ranked > 0 && <QuadrantMiniChart />}
        </div>
      )}

      {/* Contact List */}
      <div className="space-y-2">
        {contacts.length === 0 ? (
          <p className="text-sm text-muted-foreground/70 py-3 text-center border border-dashed rounded-lg">
            No stakeholders linked yet
          </p>
        ) : (
          contacts.map(dealContact => {
            const contact = dealContact.contact;
            const contactName = getContactName(dealContact);

            return (
              <div
                key={dealContact.id}
                className="flex items-center gap-3 p-2.5 border border-border rounded-lg hover:bg-accent/50 transition-colors group"
              >
                {/* Avatar */}
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                  <User className="h-4 w-4 text-muted-foreground" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-foreground truncate">
                      {contactName}
                    </p>
                    {contact?.linkedin_url && (
                      <a
                        href={contact.linkedin_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-blue-600 transition-colors shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Linkedin className="h-3 w-3" />
                      </a>
                    )}
                    {dealContact.role_in_deal && (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {ROLE_OPTIONS.find(r => r.value === dealContact.role_in_deal)?.label || dealContact.role_in_deal}
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground truncate">
                    {contact?.title || contact?.company || contact?.email || 'No details'}
                  </p>
                </div>

                {/* Ranking Button */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                    className={cn(
                      "h-7 px-2 text-xs justify-center hover:opacity-80 transition-opacity",
                      getQuadrantColor(dealContact.quadrant)
                    )}
                    onClick={(event) => {
                      event.stopPropagation();
                      setRankingContact(dealContact);
                    }}
                    aria-label={`Rank ${contactName} on the stakeholder power map`}
                  >
                    {dealContact.quadrant ? (
                      <>
                        <Target className="h-3 w-3 mr-1" />
                        {getQuadrantLabel(dealContact.quadrant).replace(/\s*\(.+?\)\s*$/, '')}
                      </>
                    ) : (
                      'Rank'
                    )}
                  </Button>

                {/* Remove Button */}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-destructive"
                  onClick={(event) => {
                    event.stopPropagation();
                    setContactToRemove(dealContact);
                  }}
                  aria-label={`Remove ${contactName} from this deal`}
                  title={`Remove ${contactName}`}
                >
                  <X className="h-3 w-3 text-muted-foreground" />
                </Button>
              </div>
            );
          })
        )}
      </div>

      {/* Ranking Modal */}
      {rankingContact && (
        <StakeholderQuadrant
          open={!!rankingContact}
          onOpenChange={(open) => !open && setRankingContact(null)}
          contactName={
            rankingContact.contact?.full_name ||
            `${rankingContact.contact?.first_name || ''} ${rankingContact.contact?.last_name || ''}`.trim() ||
            'Unknown'
          }
          initialSupport={rankingContact.support_axis}
          initialInfluence={rankingContact.influence_axis}
          onSave={handleSaveRanking}
          isSaving={isUpdating}
        />
      )}

      <DeleteConfirmationDialog
        open={!!contactToRemove}
        onOpenChange={(open) => !open && setContactToRemove(null)}
        onConfirm={handleRemoveContact}
        title="Remove stakeholder?"
        description="This removes the contact from this deal's stakeholder map. The contact record itself will remain in the CRM."
        entityName={getContactName(contactToRemove)}
        entityType="contact"
        loading={isRemoving}
      />
    </div>
  );
}
