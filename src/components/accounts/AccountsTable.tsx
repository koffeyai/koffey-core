import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, ExternalLink, Phone } from 'lucide-react';
import { AccountWithDeals } from '@/hooks/useAccountsWithDeals';

interface AccountsTableProps {
  accounts: AccountWithDeals[];
  selectedItems: string[];
  onToggleSelection: (id: string) => void;
  onToggleAll: () => void;
  onRowClick: (account: AccountWithDeals) => void;
  onEdit: (account: AccountWithDeals) => void;
  onDelete: (account: AccountWithDeals) => void;
  searchTerm: string;
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
  }).format(value);

export const AccountsTable: React.FC<AccountsTableProps> = ({
  accounts,
  selectedItems,
  onToggleSelection,
  onToggleAll,
  onRowClick,
  onEdit,
  onDelete,
  searchTerm,
}) => {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <input
              type="checkbox"
              checked={selectedItems.length === accounts.length && accounts.length > 0}
              onChange={onToggleAll}
              className="rounded border-border"
            />
          </TableHead>
          <TableHead className="w-[80px]">UID</TableHead>
          <TableHead>Name</TableHead>
          <TableHead className="hidden md:table-cell">Industry</TableHead>
          <TableHead className="hidden lg:table-cell">Website</TableHead>
          <TableHead className="hidden xl:table-cell">Phone</TableHead>
          <TableHead className="text-center">Opportunities</TableHead>
          <TableHead className="hidden lg:table-cell text-right">Pipeline Value</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.length > 0 ? (
          accounts.map((account) => (
            <TableRow
              key={account.id}
              className="hover:bg-muted/50 cursor-pointer"
              onClick={() => onRowClick(account)}
            >
              <TableCell onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={selectedItems.includes(account.id)}
                  onChange={() => onToggleSelection(account.id)}
                  className="rounded border-border"
                />
              </TableCell>
              <TableCell>
                <Badge variant="outline" className="font-mono text-xs">
                  {account.account_number}
                </Badge>
              </TableCell>
              <TableCell className="font-medium">{account.name}</TableCell>
              <TableCell className="text-muted-foreground hidden md:table-cell">
                {account.industry || '—'}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {account.website ? (
                  <a
                    href={account.website.startsWith('http') ? account.website : `https://${account.website}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline flex items-center gap-1 truncate max-w-[180px]"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    {account.website.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </TableCell>
              <TableCell className="text-muted-foreground hidden xl:table-cell">
                {account.phone ? (
                  <a
                    href={`tel:${account.phone}`}
                    className="flex items-center gap-1 hover:text-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Phone className="h-3 w-3" />
                    {account.phone}
                  </a>
                ) : '—'}
              </TableCell>
              <TableCell className="text-center">
                <Badge
                  variant={account.deal_count > 0 ? 'default' : 'secondary'}
                  className="min-w-[28px] justify-center"
                >
                  {account.deal_count}
                </Badge>
              </TableCell>
              <TableCell className="text-right hidden lg:table-cell text-muted-foreground">
                {account.total_deal_value > 0 ? formatCurrency(account.total_deal_value) : '—'}
              </TableCell>
              <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                <div className="flex justify-end gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(account)}>
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => onDelete(account)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))
        ) : (
          <TableRow>
            <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
              {searchTerm
                ? `No accounts match "${searchTerm}"`
                : 'No accounts yet. Create your first one!'}
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
};
