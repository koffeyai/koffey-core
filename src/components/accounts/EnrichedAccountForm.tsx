import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Globe, Sparkles, Building2, CheckCircle } from 'lucide-react';
import { useCompanyEnrichment } from '@/hooks/useCompanyEnrichment';
import { useToast } from '@/hooks/use-toast';

interface AccountFormData {
  name: string;
  domain: string;
  industry: string;
  size: string;
  description: string;
  phone: string;
  email: string;
  linkedin: string;
  twitter: string;
  headquarters: string;
  revenue: string;
  employees: string;
}

interface EnrichedAccountFormProps {
  onSubmit: (data: AccountFormData) => Promise<void>;
  onCancel: () => void;
  initialData?: Partial<AccountFormData>;
}

export const EnrichedAccountForm: React.FC<EnrichedAccountFormProps> = ({
  onSubmit,
  onCancel,
  initialData
}) => {
  const { enrichCompany, enrichedData, isEnriching } = useCompanyEnrichment();
  const { toast } = useToast();
  const [formData, setFormData] = useState<AccountFormData>({
    name: '',
    domain: '',
    industry: '',
    size: '',
    description: '',
    phone: '',
    email: '',
    linkedin: '',
    twitter: '',
    headquarters: '',
    revenue: '',
    employees: '',
    ...initialData
  });
  const [enrichmentTriggered, setEnrichmentTriggered] = useState(false);

  // Handle domain input with auto-enrichment
  const handleDomainChange = async (value: string) => {
    setFormData(prev => ({ ...prev, domain: value }));
    
    // Trigger enrichment when user enters a valid domain
    if (value && (value.includes('.com') || value.includes('.org') || value.includes('.net'))) {
      if (!enrichmentTriggered) {
        setEnrichmentTriggered(true);
        const enriched = await enrichCompany(value);
        
        if (enriched) {
          // Auto-populate fields with enriched data
          setFormData(prev => ({
            ...prev,
            name: enriched.name || prev.name,
            industry: enriched.industry || prev.industry,
            description: enriched.description || prev.description,
            phone: enriched.phone || prev.phone,
            email: enriched.email || prev.email,
            linkedin: enriched.linkedin || prev.linkedin,
            twitter: enriched.twitter || prev.twitter,
            headquarters: enriched.headquarters || prev.headquarters,
            revenue: enriched.revenue || prev.revenue,
            employees: enriched.employees || prev.employees,
          }));
        }
      }
    } else {
      setEnrichmentTriggered(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await onSubmit(formData);
  };

  const enrichedFields = enrichedData ? Object.keys(enrichedData).filter(k => 
    enrichedData[k as keyof typeof enrichedData] && k !== 'domain'
  ) : [];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Company Information
            {enrichedFields.length > 0 && (
              <Badge variant="secondary" className="ml-auto">
                <Sparkles className="h-3 w-3 mr-1" />
                {enrichedFields.length} fields auto-filled
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Domain/Website Field - Primary enrichment trigger */}
          <div className="space-y-2">
            <Label htmlFor="domain" className="flex items-center gap-2">
              Website/Domain
              {isEnriching && <Loader2 className="h-3 w-3 animate-spin" />}
              {enrichedData && <CheckCircle className="h-3 w-3 text-green-500" />}
            </Label>
            <div className="relative">
              <Globe className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="domain"
                placeholder="www.company.com or company.com"
                value={formData.domain}
                onChange={(e) => handleDomainChange(e.target.value)}
                className="pl-10"
                required
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Enter a domain to automatically retrieve company information
            </p>
          </div>

          {/* Company Name */}
          <div className="space-y-2">
            <Label htmlFor="name">
              Company Name
              {enrichedData?.name && (
                <Badge variant="outline" className="ml-2 text-xs">Auto-filled</Badge>
              )}
            </Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
              placeholder="Enter company name"
              required
            />
          </div>

          {/* Industry */}
          <div className="space-y-2">
            <Label htmlFor="industry">
              Industry
              {enrichedData?.industry && (
                <Badge variant="outline" className="ml-2 text-xs">Auto-filled</Badge>
              )}
            </Label>
            <Select 
              value={formData.industry} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, industry: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select industry" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="Technology">Technology</SelectItem>
                <SelectItem value="Healthcare">Healthcare</SelectItem>
                <SelectItem value="Financial Services">Financial Services</SelectItem>
                <SelectItem value="Retail">Retail</SelectItem>
                <SelectItem value="Manufacturing">Manufacturing</SelectItem>
                <SelectItem value="Education">Education</SelectItem>
                <SelectItem value="Other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Description */}
          <div className="space-y-2">
            <Label htmlFor="description">
              Description
              {enrichedData?.description && (
                <Badge variant="outline" className="ml-2 text-xs">Auto-filled</Badge>
              )}
            </Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
              placeholder="Company description"
              rows={3}
            />
          </div>

          {/* Contact Information */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">
                Phone
                {enrichedData?.phone && (
                  <Badge variant="outline" className="ml-2 text-xs">Auto-filled</Badge>
                )}
              </Label>
              <Input
                id="phone"
                type="tel"
                value={formData.phone}
                onChange={(e) => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+1 (555) 123-4567"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">
                Email
                {enrichedData?.email && (
                  <Badge variant="outline" className="ml-2 text-xs">Auto-filled</Badge>
                )}
              </Label>
              <Input
                id="email"
                type="email"
                value={formData.email}
                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                placeholder="contact@company.com"
              />
            </div>
          </div>

          {/* Social Media */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="linkedin">
                LinkedIn
                {enrichedData?.linkedin && (
                  <Badge variant="outline" className="ml-2 text-xs">Auto-filled</Badge>
                )}
              </Label>
              <Input
                id="linkedin"
                value={formData.linkedin}
                onChange={(e) => setFormData(prev => ({ ...prev, linkedin: e.target.value }))}
                placeholder="linkedin.com/company/..."
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="twitter">
                Twitter
                {enrichedData?.twitter && (
                  <Badge variant="outline" className="ml-2 text-xs">Auto-filled</Badge>
                )}
              </Label>
              <Input
                id="twitter"
                value={formData.twitter}
                onChange={(e) => setFormData(prev => ({ ...prev, twitter: e.target.value }))}
                placeholder="@company"
              />
            </div>
          </div>

          {/* Company Size */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="employees">Employees</Label>
              <Select 
                value={formData.employees} 
                onValueChange={(value) => setFormData(prev => ({ ...prev, employees: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1-10">1-10</SelectItem>
                  <SelectItem value="11-50">11-50</SelectItem>
                  <SelectItem value="51-200">51-200</SelectItem>
                  <SelectItem value="201-500">201-500</SelectItem>
                  <SelectItem value="501-1000">501-1000</SelectItem>
                  <SelectItem value="1000+">1000+</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="revenue">Annual Revenue</Label>
              <Input
                id="revenue"
                value={formData.revenue}
                onChange={(e) => setFormData(prev => ({ ...prev, revenue: e.target.value }))}
                placeholder="$10M - $50M"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end space-x-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          Create Account
        </Button>
      </div>
    </form>
  );
};