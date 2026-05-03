import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Globe, CheckCircle, Search, Building2, Plus, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { WebsiteEnrichmentService } from '@/services/websiteEnrichmentService';
import { useCRM } from '@/hooks/useCRM';

interface Account {
  id?: string;
  name: string;
  industry?: string;
  website?: string;
  phone?: string;
  address?: string;
  description?: string;
}

interface AccountDialogProps {
  account?: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (accountData: Partial<Account>) => Promise<void>;
  onSelectExisting?: (accountId: string, accountName: string) => void;
  prefillName?: string | null;
}

export const AccountDialog: React.FC<AccountDialogProps> = ({
  account,
  open,
  onOpenChange,
  onSave,
  onSelectExisting,
  prefillName
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [enrichmentLoading, setEnrichmentLoading] = useState(false);
  const [enrichmentResult, setEnrichmentResult] = useState<{ applied: string[]; source?: string } | null>(null);
  const [rawEnrichmentData, setRawEnrichmentData] = useState<Record<string, any> | null>(null);
  const [mode, setMode] = useState<'search' | 'create'>('search');
  const [searchTerm, setSearchTerm] = useState('');
  const [formData, setFormData] = useState({
    name: '',
    industry: '',
    website: '',
    phone: '',
    address: '',
    description: ''
  });

  const { entities: accounts, loading: accountsLoading } = useCRM('accounts');

  // Filter accounts based on search term
  const filteredAccounts = useMemo(() => {
    if (!accounts) return [];
    if (!searchTerm) return accounts.slice(0, 8);
    const lowerSearch = searchTerm.toLowerCase();
    return accounts
      .filter((a: any) =>
        a.name?.toLowerCase().includes(lowerSearch) ||
        a.industry?.toLowerCase().includes(lowerSearch)
      )
      .slice(0, 8);
  }, [accounts, searchTerm]);

  // Reset state when dialog opens/closes
  useEffect(() => {
    if (open) {
      if (account) {
        // Edit mode — go straight to form
        setMode('create');
        setFormData({
          name: account.name || '',
          industry: account.industry || '',
          website: account.website || '',
          phone: account.phone || '',
          address: account.address || '',
          description: account.description || ''
        });
      } else {
        // New account — start in search mode
        setMode('search');
        setSearchTerm(prefillName || '');
        setFormData({
          name: prefillName || '',
          industry: '',
          website: '',
          phone: '',
          address: '',
          description: ''
        });
      }
      setEnrichmentResult(null);
    }
  }, [account, open, prefillName]);

  const handleSelectExisting = (selectedAccount: any) => {
    if (onSelectExisting) {
      onSelectExisting(selectedAccount.id, selectedAccount.name);
      onOpenChange(false);
    }
  };

  const handleSwitchToCreate = (name?: string) => {
    setMode('create');
    if (name) {
      setFormData(prev => ({ ...prev, name }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.name.trim()) {
      toast({
        title: "Account name required",
        description: "Please enter a name for this account",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);

    try {
      // Build save payload including enrichment data if available
      const savePayload: Record<string, any> = { ...formData };
      if (rawEnrichmentData) {
        const { companyName, industry, description, phone, address, ...richData } = rawEnrichmentData;
        if (Object.keys(richData).length > 0) {
          savePayload.scraped_data = richData;
        }
        savePayload.enriched_at = new Date().toISOString();
        savePayload.data_sources = ['enrich-website'];
      }
      await onSave(savePayload);

      setFormData({
        name: '',
        industry: '',
        website: '',
        phone: '',
        address: '',
        description: ''
      });
      setRawEnrichmentData(null);
    } catch (error: any) {
      console.error('Error saving account:', error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${account ? 'update' : 'create'} account.`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formatWebsiteURL = (url: string) => {
    if (!url || url.trim() === '') return '';
    let cleanUrl = url.trim();
    cleanUrl = cleanUrl.replace(/^(https?:\/\/)?(www\.)?/, '');
    if (cleanUrl.includes('.') && !cleanUrl.includes(' ')) {
      return cleanUrl;
    }
    return cleanUrl;
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleWebsiteEnrichment = async (website: string) => {
    if (!website || !WebsiteEnrichmentService.isValidWebsiteUrl(website)) return;

    setEnrichmentLoading(true);
    setEnrichmentResult(null);

    try {
      const result = await WebsiteEnrichmentService.enrichFromWebsite(website);

      if (result.success && Object.keys(result.data).length > 0) {
        const { merged, applied } = WebsiteEnrichmentService.mergeWithFormData(formData, result.data);
        // Capture full enrichment data for scraped_data column
        setRawEnrichmentData(result.data);

        if (applied.length > 0) {
          setFormData(merged);
          setEnrichmentResult({ applied, source: result.source });

          toast({
            title: "Website Data Retrieved",
            description: `Auto-filled ${applied.join(', ')} from website data.`,
            duration: 4000,
          });
        } else {
          toast({
            title: "No Additional Data",
            description: "Website was accessed but no new information was found.",
            duration: 3000,
          });
        }
      } else {
        toast({
          title: "Website Enrichment Failed",
          description: result.error || "Unable to retrieve data from the website.",
          variant: "destructive",
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('Website enrichment error:', error);
      toast({
        title: "Enrichment Error",
        description: "Failed to retrieve website data. Please continue manually.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setEnrichmentLoading(false);
    }
  };

  const isEditMode = !!account;
  const showSearch = !isEditMode && mode === 'search' && !!onSelectExisting;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEditMode ? 'Edit Account' : showSearch ? 'Link Account' : 'Create New Account'}
          </DialogTitle>
        </DialogHeader>

        {showSearch ? (
          /* ====== SEARCH MODE: find existing or create new ====== */
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search existing accounts..."
                className="pl-9"
                autoFocus
              />
            </div>

            <div className="max-h-64 overflow-y-auto space-y-1">
              {accountsLoading ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading accounts...</span>
                </div>
              ) : filteredAccounts.length > 0 ? (
                filteredAccounts.map((a: any) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => handleSelectExisting(a)}
                    className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-md text-left hover:bg-accent transition-colors"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium truncate">{a.name}</span>
                    </div>
                    {a.industry && (
                      <Badge variant="secondary" className="text-xs shrink-0">
                        {a.industry}
                      </Badge>
                    )}
                  </button>
                ))
              ) : searchTerm ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No accounts match "{searchTerm}"
                </p>
              ) : (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No accounts yet
                </p>
              )}
            </div>

            <div className="border-t pt-3">
              <Button
                type="button"
                variant="outline"
                className="w-full text-primary"
                onClick={() => handleSwitchToCreate(searchTerm)}
              >
                <Plus className="h-4 w-4 mr-2" />
                {searchTerm ? `Create "${searchTerm}" as new account` : 'Create new account'}
              </Button>
            </div>
          </div>
        ) : (
          /* ====== CREATE/EDIT MODE: full form ====== */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Back to search link (only when creating, not editing) */}
            {!isEditMode && onSelectExisting && (
              <button
                type="button"
                onClick={() => setMode('search')}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to search
              </button>
            )}

            <div>
              <Label htmlFor="name">Account Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange('name', e.target.value)}
                placeholder="Enter account name"
                required
                autoFocus
              />
            </div>

            <div>
              <Label htmlFor="industry">Industry</Label>
              <Input
                id="industry"
                value={formData.industry}
                onChange={(e) => handleInputChange('industry', e.target.value)}
                placeholder="e.g., Technology, Healthcare"
              />
            </div>

            <div>
              <Label htmlFor="website">Website</Label>
              <div className="flex gap-2">
                <Input
                  id="website"
                  type="text"
                  value={formData.website}
                  onChange={(e) => setFormData(prev => ({ ...prev, website: e.target.value }))}
                  onBlur={(e) => {
                    const formatted = formatWebsiteURL(e.target.value);
                    setFormData(prev => ({ ...prev, website: formatted }));

                    if (formatted && WebsiteEnrichmentService.isValidWebsiteUrl(formatted)) {
                      handleWebsiteEnrichment(formatted);
                    }
                  }}
                  placeholder="example.com or https://example.com"
                  disabled={enrichmentLoading}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => formData.website && handleWebsiteEnrichment(formData.website)}
                  disabled={!formData.website || enrichmentLoading || !WebsiteEnrichmentService.isValidWebsiteUrl(formData.website)}
                  className="shrink-0"
                >
                  {enrichmentLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Globe className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Enter website URL to auto-fill company information
              </p>

              {enrichmentResult && (
                <Alert className="mt-2 border-green-200 bg-green-50">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <AlertDescription className="text-green-800">
                    Auto-filled {enrichmentResult.applied.join(', ')} from {enrichmentResult.source}
                  </AlertDescription>
                </Alert>
              )}
            </div>

            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => handleInputChange('phone', e.target.value)}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div>
              <Label htmlFor="address">Address</Label>
              <Textarea
                id="address"
                value={formData.address}
                onChange={(e) => handleInputChange('address', e.target.value)}
                placeholder="Enter address"
                rows={2}
              />
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => handleInputChange('description', e.target.value)}
                placeholder="Additional notes about this account"
                rows={3}
              />
            </div>

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {account ? 'Update Account' : 'Create Account'}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
};
