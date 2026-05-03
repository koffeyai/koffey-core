import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { GenerationPreview } from './GenerationPreview';
import { GenerationProgress } from './GenerationProgress';
import type { SlideTemplate } from '@/types/slides';

interface TemplateGenerationFlowProps {
  template: SlideTemplate;
  organizationId: string;
  userId: string;
  onClose: () => void;
}

interface Account {
  id: string;
  name: string;
}

interface Deal {
  id: string;
  name: string;
  amount: number | null;
  stage: string;
}

interface Contact {
  id: string;
  full_name: string;
  title: string | null;
}

type Step = 'context' | 'preview' | 'generate';

export function TemplateGenerationFlow({
  template,
  organizationId,
  userId,
  onClose
}: TemplateGenerationFlowProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>('context');
  
  // Context selection
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [deals, setDeals] = useState<Deal[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  
  const [selectedAccountId, setSelectedAccountId] = useState<string>('');
  const [includeDeal, setIncludeDeal] = useState(false);
  const [selectedDealId, setSelectedDealId] = useState<string>('');
  const [includeContact, setIncludeContact] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState<string>('');
  
  // Generation state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationResult, setGenerationResult] = useState<any>(null);
  const [generationError, setGenerationError] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, [organizationId]);

  useEffect(() => {
    if (selectedAccountId) {
      loadDealsAndContacts();
    }
  }, [selectedAccountId]);

  async function loadAccounts() {
    const { data } = await supabase
      .from('accounts')
      .select('id, name')
      .eq('organization_id', organizationId)
      .order('name');
    
    setAccounts(data || []);
  }

  async function loadDealsAndContacts() {
    // Load deals for account
    const { data: dealsData } = await supabase
      .from('deals')
      .select('id, name, amount, stage')
      .eq('account_id', selectedAccountId)
      .order('created_at', { ascending: false });
    
    setDeals(dealsData || []);

    // Load contacts for account
    const { data: contactsData } = await supabase
      .from('contacts')
      .select('id, full_name, title')
      .eq('account_id', selectedAccountId)
      .order('full_name');
    
    setContacts(contactsData || []);
  }

  async function handleGenerate() {
    if (!selectedAccountId) {
      toast.error('Please select an account');
      return;
    }

    setStep('generate');
    setIsGenerating(true);
    setGenerationError(null);
    setGenerationResult(null);

    try {
      const personalizationLevel = selectedContactId 
        ? 'contact' 
        : selectedDealId 
          ? 'deal' 
          : 'account';

      const { data, error } = await supabase.functions.invoke('generate-from-template', {
        body: {
          templateId: template.id,
          organizationId,
          userId,
          personalizationLevel,
          accountId: selectedAccountId,
          dealId: selectedDealId || null,
          contactId: selectedContactId || null
        }
      });

      if (error) throw error;

      setGenerationResult(data);
      toast.success('Presentation generated successfully!');
    } catch (error) {
      console.error('Generation error:', error);
      setGenerationError(error instanceof Error ? error.message : 'Generation failed');
      toast.error('Failed to generate presentation');
    } finally {
      setIsGenerating(false);
    }
  }

  function handleRegenerate() {
    setStep('preview');
    setGenerationResult(null);
    setGenerationError(null);
  }

  function handleViewHistory() {
    navigate('/slides/generated');
  }

  // Context selection step
  if (step === 'context') {
    return (
      <Card className="w-full max-w-lg mx-auto">
        <CardHeader>
          <CardTitle className="text-lg">Select Context</CardTitle>
          <p className="text-sm text-muted-foreground">
            Choose the account and optionally deal/contact to personalize for
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Account Selection */}
          <div className="space-y-2">
            <Label>Account *</Label>
            <Select value={selectedAccountId} onValueChange={setSelectedAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Select an account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map(account => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Deal Selection */}
          {selectedAccountId && deals.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="include-deal"
                  checked={includeDeal}
                  onCheckedChange={(checked) => {
                    setIncludeDeal(!!checked);
                    if (!checked) setSelectedDealId('');
                  }}
                />
                <Label htmlFor="include-deal" className="cursor-pointer">
                  Include deal context
                </Label>
              </div>
              {includeDeal && (
                <Select value={selectedDealId} onValueChange={setSelectedDealId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a deal" />
                  </SelectTrigger>
                  <SelectContent>
                    {deals.map(deal => (
                      <SelectItem key={deal.id} value={deal.id}>
                        {deal.name} - ${(deal.amount || 0).toLocaleString()} ({deal.stage})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Contact Selection */}
          {selectedAccountId && contacts.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Checkbox 
                  id="include-contact"
                  checked={includeContact}
                  onCheckedChange={(checked) => {
                    setIncludeContact(!!checked);
                    if (!checked) setSelectedContactId('');
                  }}
                />
                <Label htmlFor="include-contact" className="cursor-pointer">
                  Personalize for specific contact
                </Label>
              </div>
              {includeContact && (
                <Select value={selectedContactId} onValueChange={setSelectedContactId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a contact" />
                  </SelectTrigger>
                  <SelectContent>
                    {contacts.map(contact => (
                      <SelectItem key={contact.id} value={contact.id}>
                        {contact.full_name} {contact.title && `(${contact.title})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-between pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button 
              onClick={() => setStep('preview')}
              disabled={!selectedAccountId}
            >
              Preview
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Preview step
  if (step === 'preview') {
    return (
      <div className="max-w-2xl mx-auto">
        <GenerationPreview
          template={template}
          accountId={selectedAccountId}
          dealId={includeDeal ? selectedDealId : undefined}
          contactId={includeContact ? selectedContactId : undefined}
          organizationId={organizationId}
          onBack={() => setStep('context')}
          onGenerate={handleGenerate}
          isGenerating={isGenerating}
        />
      </div>
    );
  }

  // Generate step
  return (
    <div className="max-w-lg mx-auto">
      <GenerationProgress
        isGenerating={isGenerating}
        result={generationResult}
        error={generationError}
        onRegenerate={handleRegenerate}
        onViewHistory={handleViewHistory}
      />
    </div>
  );
}
