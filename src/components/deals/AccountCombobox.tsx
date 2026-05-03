import React, { useState, useEffect, useMemo } from 'react';
import { Check, ChevronsUpDown, Plus, Building2, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { useCRM } from '@/hooks/useCRM';

interface Account {
  id: string;
  name: string;
  industry?: string;
  website?: string;
}

interface AccountComboboxProps {
  value: string | null;
  displayValue: string;
  onChange: (accountId: string, accountName: string) => void;
  onCreateNew: (searchTerm: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

export const AccountCombobox: React.FC<AccountComboboxProps> = ({
  value,
  displayValue,
  onChange,
  onCreateNew,
  error,
  required = false,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  const { entities: accounts, loading } = useCRM('accounts');

  // Filter accounts based on search term
  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    if (!searchTerm) return accounts.slice(0, 10); // Show first 10 by default
    
    const lowerSearch = searchTerm.toLowerCase();
    return accounts
      .filter((account: Account) => 
        account.name?.toLowerCase().includes(lowerSearch) ||
        account.industry?.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 10);
  }, [accounts, searchTerm]);

  // Check if exact match exists
  const exactMatchExists = useMemo(() => {
    if (!searchTerm || !accounts) return false;
    const lowerSearch = searchTerm.toLowerCase().trim();
    return accounts.some((account: Account) => 
      account.name?.toLowerCase().trim() === lowerSearch
    );
  }, [accounts, searchTerm]);

  const handleSelect = (account: Account) => {
    onChange(account.id, account.name);
    setOpen(false);
    setSearchTerm('');
  };

  const handleCreateNew = () => {
    onCreateNew(searchTerm || '');
    setOpen(false);
    setSearchTerm('');
  };

  return (
    <div className="space-y-1">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              "w-full justify-between font-normal",
              !value && "text-muted-foreground",
              error && "border-destructive"
            )}
          >
            <span className="flex items-center gap-2 truncate">
              <Building2 className="h-4 w-4 shrink-0" />
              {displayValue || "Search or create account..."}
            </span>
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput 
              placeholder="Search accounts..." 
              value={searchTerm}
              onValueChange={setSearchTerm}
            />
            <CommandList>
              {loading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading accounts...</span>
                </div>
              ) : (
                <>
                  <CommandEmpty>
                    <div className="py-2 text-sm text-muted-foreground">
                      No accounts found.
                    </div>
                  </CommandEmpty>
                  
                  {filteredAccounts.length > 0 && (
                    <CommandGroup heading="Accounts">
                      {filteredAccounts.map((account: Account) => (
                        <CommandItem
                          key={account.id}
                          value={account.id}
                          onSelect={() => handleSelect(account)}
                          className="flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <Check
                              className={cn(
                                "h-4 w-4",
                                value === account.id ? "opacity-100" : "opacity-0"
                              )}
                            />
                            <span className="truncate">{account.name}</span>
                          </div>
                          {account.industry && (
                            <Badge variant="secondary" className="ml-2 text-xs">
                              {account.industry}
                            </Badge>
                          )}
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  )}
                  
                  <CommandSeparator />
                  
                  <CommandGroup>
                    <CommandItem
                      onSelect={handleCreateNew}
                      className="text-primary cursor-pointer"
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      {searchTerm && !exactMatchExists ? (
                        <span>Create "{searchTerm}" as new account</span>
                      ) : (
                        <span>Create new account</span>
                      )}
                    </CommandItem>
                  </CommandGroup>
                </>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      
      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}
    </div>
  );
};
