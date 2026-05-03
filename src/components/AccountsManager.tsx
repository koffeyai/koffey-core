import React, { useState, useCallback, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, Search, RefreshCw } from 'lucide-react';
import { useAccountsWithDeals, AccountWithDeals } from '@/hooks/useAccountsWithDeals';
import { AccountsTable } from '@/components/accounts/AccountsTable';
import { AccountDetailView } from '@/components/accounts/AccountDetailView';
import { AccountDialog } from '@/components/accounts/AccountDialog';
import { DeleteConfirmationDialog } from '@/components/common/DeleteConfirmationDialog';
import { FileUploadButton } from '@/components/crm/FileUploadButton';
import { BulkOperationsEnhanced } from '@/components/crm/BulkOperationsEnhanced';
import { useCRM } from '@/hooks/useCRM';
import { usePageContextSync } from '@/hooks/usePageContextSync';
import { useIntelligentErrorGuidance } from '@/hooks/useIntelligentErrorGuidance';
import { toast } from 'sonner';

/**
 * AccountsManager - Full accounts view with UID, opportunities column, and drill-down.
 */
export const AccountsManager: React.FC = () => {
  const { showGuidance, showSuccess } = useIntelligentErrorGuidance();
  const [searchFilter, setSearchFilter] = useState('');
  const [selectedAccount, setSelectedAccount] = useState<AccountWithDeals | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountWithDeals | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<AccountWithDeals | null>(null);
  const [selectedItems, setSelectedItems] = useState<string[]>([]);

  const { accounts, loading, refresh } = useAccountsWithDeals(searchFilter);
  const crm = useCRM('accounts', {});

  // Page context sync for AI awareness
  usePageContextSync({
    entityType: 'accounts',
    entities: accounts,
    getEntityName: (a) => a.name,
    searchTerm: searchFilter,
  });

  const handleCreate = () => {
    setEditingAccount(null);
    setDialogOpen(true);
  };

  const handleEdit = useCallback((account: AccountWithDeals) => {
    setEditingAccount(account);
    setDialogOpen(true);
  }, []);

  const handleDeleteClick = useCallback((account: AccountWithDeals) => {
    setAccountToDelete(account);
    setDeleteDialogOpen(true);
  }, []);

  const handleDeleteConfirm = async () => {
    if (!accountToDelete) return;
    try {
      await crm.deleteEntity(accountToDelete.id);
      showSuccess('delete', 'account');
      setDeleteDialogOpen(false);
      setAccountToDelete(null);
      refresh();
    } catch (error: any) {
      showGuidance({ operation: 'delete', entityType: 'account', error });
    }
  };

  const handleSave = async (data: any) => {
    try {
      if (editingAccount) {
        await crm.updateEntity(editingAccount.id, data);
        showSuccess('update', 'account');
      } else {
        await crm.createEntity(data);
        showSuccess('create', 'account');
      }
      setDialogOpen(false);
      setEditingAccount(null);
      refresh();
    } catch (error: any) {
      showGuidance({ operation: editingAccount ? 'update' : 'create', entityType: 'account', error, formData: data });
      throw error;
    }
  };

  const handleImportAccounts = async (file: File) => {
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Account import currently supports CSV files. Export spreadsheets to CSV before importing.');
      return;
    }

    try {
      const text = await file.text();
      const rows = text
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

      if (rows.length < 2) {
        toast.error('CSV import needs a header row and at least one account row.');
        return;
      }

      const headers = rows[0].split(',').map((header) => header.trim().toLowerCase().replace(/^["']|["']$/g, ''));
      const records = rows.slice(1).map((line) => {
        const values = line.split(',').map((value) => value.trim().replace(/^["']|["']$/g, ''));
        return headers.reduce<Record<string, string>>((record, header, index) => {
          if (header && values[index]) record[header] = values[index];
          return record;
        }, {});
      }).filter((record) => Object.keys(record).length > 0);

      if (records.length === 0) {
        toast.error('No importable account rows found.');
        return;
      }

      let imported = 0;
      for (const record of records) {
        const name = record.name || record.account || record.company;
        if (!name) continue;

        await crm.createEntity({
          name,
          industry: record.industry || null,
          website: record.website || record.url || null,
          domain: record.domain || null,
          phone: record.phone || null,
          address: record.address || null,
          description: record.description || record.notes || null,
        } as any);
        imported += 1;
      }

      if (imported === 0) {
        toast.error('No rows contained an account name, account, or company column.');
        return;
      }

      toast.success(`Imported ${imported} account${imported === 1 ? '' : 's'}.`);
      refresh();
    } catch (error: any) {
      showGuidance({ operation: 'create', entityType: 'account', error });
    }
  };

  const toggleItemSelection = useCallback((id: string) => {
    setSelectedItems(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const toggleAllSelection = useCallback(() => {
    setSelectedItems(prev =>
      prev.length === accounts.length ? [] : accounts.map(a => a.id)
    );
  }, [accounts]);

  // Drill-down view
  if (selectedAccount) {
    return (
      <AccountDetailView
        account={selectedAccount}
        onBack={() => setSelectedAccount(null)}
      />
    );
  }

  // Loading state
  if (loading && accounts.length === 0) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Accounts</h1>
          <p className="text-muted-foreground">
            Manage your customer accounts and organizations.
            {accounts.length > 0 && ` • ${accounts.length} total`}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search accounts..."
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="pl-9 w-64"
            />
          </div>

          <Button variant="outline" size="icon" onClick={refresh}>
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </Button>

          <FileUploadButton entityType="accounts" onFileSelect={handleImportAccounts} />

          <Button onClick={handleCreate}>
            <Plus className="h-4 w-4 mr-2" />
            Add Account
          </Button>
        </div>
      </div>

      {/* Bulk Actions */}
      {selectedItems.length > 0 && (
        <BulkOperationsEnhanced
          selectedItems={selectedItems}
          entityType="accounts"
          onBulkDelete={async (ids) => {
            await Promise.all(ids.map(id => crm.deleteEntity(id)));
            refresh();
          }}
          onClearSelection={() => setSelectedItems([])}
        />
      )}

      {/* Table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">{accounts.length} Accounts</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <AccountsTable
            accounts={accounts}
            selectedItems={selectedItems}
            onToggleSelection={toggleItemSelection}
            onToggleAll={toggleAllSelection}
            onRowClick={setSelectedAccount}
            onEdit={handleEdit}
            onDelete={handleDeleteClick}
            searchTerm={searchFilter}
          />
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AccountDialog
        account={editingAccount}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSave={handleSave}
      />

      <DeleteConfirmationDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onConfirm={handleDeleteConfirm}
        title="Delete Account"
        description="Are you sure you want to delete this account? This action cannot be undone."
        entityName={accountToDelete?.name || ''}
        entityType="account"
      />
    </div>
  );
};
