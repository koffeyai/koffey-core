import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Skeleton } from '@/components/ui/skeleton';
import { TagInput } from '@/components/settings/TagInput';
import { ProductServiceEditor } from './ProductServiceEditor';
import { ProofPointEditor } from './ProofPointEditor';
import { TargetPersonaEditor } from './TargetPersonaEditor';
import { useCompanyProfile } from '@/hooks/useCompanyProfile';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { 
  Building2, 
  ChevronDown, 
  Plus, 
  Save, 
  Loader2, 
  MessageSquare, 
  Package, 
  Target, 
  Award,
  ShieldAlert
} from 'lucide-react';
import type { CompanyProfile, ProductService, ProofPoint, TargetPersona, INDUSTRIES } from '@/types/company-profile';

const INDUSTRY_OPTIONS: readonly string[] = [
  'Technology / SaaS',
  'Financial Services',
  'Healthcare',
  'Manufacturing',
  'Retail / E-commerce',
  'Professional Services',
  'Media / Entertainment',
  'Education',
  'Real Estate',
  'Other'
];

interface CharCounterProps {
  current: number;
  max: number;
}

const CharCounter: React.FC<CharCounterProps> = ({ current, max }) => (
  <p className={`text-xs mt-1 ${current > max ? 'text-destructive' : 'text-muted-foreground'}`}>
    {current} / {max} characters
  </p>
);

export const CompanyProfileEditor: React.FC = () => {
  const { currentOrganization, isAdmin, salesRole } = useOrganizationAccess();
  const canEditProfile = isAdmin || salesRole === 'revops' || salesRole === 'marketing';
  const { profile, isLoading, save, isSaving } = useCompanyProfile();
  
  // Form state
  const [formData, setFormData] = useState<Partial<CompanyProfile>>({
    company_name: '',
    tagline: '',
    industry: '',
    website_url: '',
    value_proposition: '',
    elevator_pitch: '',
    boilerplate_about: '',
    products_services: [],
    differentiators: [],
    target_personas: [],
    proof_points: []
  });

  // Section open states
  const [openSections, setOpenSections] = useState({
    identity: true,
    messaging: false,
    products: false,
    differentiators: false,
    personas: false,
    proofPoints: false
  });

  // Sync form with loaded profile
  useEffect(() => {
    if (profile) {
      setFormData({
        company_name: profile.company_name || '',
        tagline: profile.tagline || '',
        industry: profile.industry || '',
        website_url: profile.website_url || '',
        value_proposition: profile.value_proposition || '',
        elevator_pitch: profile.elevator_pitch || '',
        boilerplate_about: profile.boilerplate_about || '',
        products_services: profile.products_services || [],
        differentiators: profile.differentiators || [],
        target_personas: profile.target_personas || [],
        proof_points: profile.proof_points || []
      });
    }
  }, [profile]);

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const handleChange = (field: keyof CompanyProfile, value: unknown) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSave = () => {
    if (!formData.company_name?.trim()) {
      return;
    }
    save(formData);
  };

  // Product handlers
  const addProduct = () => {
    const newProduct: ProductService = {
      id: crypto.randomUUID(),
      name: '',
      description: '',
      features: []
    };
    handleChange('products_services', [...(formData.products_services || []), newProduct]);
  };

  const updateProduct = (index: number, product: ProductService) => {
    const updated = [...(formData.products_services || [])];
    updated[index] = product;
    handleChange('products_services', updated);
  };

  const removeProduct = (index: number) => {
    const updated = (formData.products_services || []).filter((_, i) => i !== index);
    handleChange('products_services', updated);
  };

  // Proof point handlers
  const addProofPoint = () => {
    const newProofPoint: ProofPoint = {
      id: crypto.randomUUID(),
      type: 'stat',
      value: ''
    };
    handleChange('proof_points', [...(formData.proof_points || []), newProofPoint]);
  };

  const updateProofPoint = (index: number, proofPoint: ProofPoint) => {
    const updated = [...(formData.proof_points || [])];
    updated[index] = proofPoint;
    handleChange('proof_points', updated);
  };

  const removeProofPoint = (index: number) => {
    const updated = (formData.proof_points || []).filter((_, i) => i !== index);
    handleChange('proof_points', updated);
  };

  // Persona handlers
  const addPersona = () => {
    const newPersona: TargetPersona = {
      id: crypto.randomUUID(),
      title: '',
      description: '',
      pain_points: []
    };
    handleChange('target_personas', [...(formData.target_personas || []), newPersona]);
  };

  const updatePersona = (index: number, persona: TargetPersona) => {
    const updated = [...(formData.target_personas || [])];
    updated[index] = persona;
    handleChange('target_personas', updated);
  };

  const removePersona = (index: number) => {
    const updated = (formData.target_personas || []).filter((_, i) => i !== index);
    handleChange('target_personas', updated);
  };

  // Restrict to admin, revops, and marketing
  if (!canEditProfile) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <ShieldAlert className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">Admin Access Required</h3>
          <p className="text-muted-foreground">
            You must be an organization admin to manage the company profile.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <Skeleton className="h-8 w-48 mb-2" />
            <Skeleton className="h-4 w-96" />
          </div>
          <Skeleton className="h-10 w-24" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6" />
            Company Profile
          </h2>
          <p className="text-muted-foreground">
            Define your company's identity and messaging for AI-generated content
          </p>
        </div>
        <Button onClick={handleSave} disabled={isSaving || !formData.company_name?.trim()}>
          {isSaving ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Save className="h-4 w-4 mr-2" />
          )}
          Save Profile
        </Button>
      </div>

      {/* Company Identity Section */}
      <Collapsible open={openSections.identity} onOpenChange={() => toggleSection('identity')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Company Identity
                  </CardTitle>
                  <CardDescription>Basic information about your company</CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${openSections.identity ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="company_name">Company Name *</Label>
                  <Input
                    id="company_name"
                    value={formData.company_name || ''}
                    onChange={(e) => handleChange('company_name', e.target.value)}
                    placeholder="Acme Inc."
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="industry">Industry</Label>
                  <Select
                    value={formData.industry || ''}
                    onValueChange={(value) => handleChange('industry', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select industry" />
                    </SelectTrigger>
                    <SelectContent>
                      {INDUSTRY_OPTIONS.map((ind) => (
                        <SelectItem key={ind} value={ind}>{ind}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="tagline">Tagline</Label>
                <Input
                  id="tagline"
                  value={formData.tagline || ''}
                  onChange={(e) => handleChange('tagline', e.target.value)}
                  placeholder="Your one-liner value proposition"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="website_url">Website URL</Label>
                <Input
                  id="website_url"
                  type="url"
                  value={formData.website_url || ''}
                  onChange={(e) => handleChange('website_url', e.target.value)}
                  placeholder="https://www.example.com"
                />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Messaging Section */}
      <Collapsible open={openSections.messaging} onOpenChange={() => toggleSection('messaging')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Messaging
                  </CardTitle>
                  <CardDescription>Value proposition and pitch content</CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${openSections.messaging ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="value_proposition">Value Proposition</Label>
                <Textarea
                  id="value_proposition"
                  value={formData.value_proposition || ''}
                  onChange={(e) => handleChange('value_proposition', e.target.value)}
                  placeholder="2-3 sentences explaining your core value..."
                  rows={3}
                />
                <CharCounter current={formData.value_proposition?.length || 0} max={500} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="elevator_pitch">Elevator Pitch</Label>
                <Textarea
                  id="elevator_pitch"
                  value={formData.elevator_pitch || ''}
                  onChange={(e) => handleChange('elevator_pitch', e.target.value)}
                  placeholder="30-second version for quick intros..."
                  rows={2}
                />
                <CharCounter current={formData.elevator_pitch?.length || 0} max={200} />
              </div>

              <div className="space-y-2">
                <Label htmlFor="boilerplate_about">About Us Boilerplate</Label>
                <Textarea
                  id="boilerplate_about"
                  value={formData.boilerplate_about || ''}
                  onChange={(e) => handleChange('boilerplate_about', e.target.value)}
                  placeholder="Standard paragraph for presentations and proposals..."
                  rows={4}
                />
                <CharCounter current={formData.boilerplate_about?.length || 0} max={1000} />
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Products & Services Section */}
      <Collapsible open={openSections.products} onOpenChange={() => toggleSection('products')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Products & Services
                  </CardTitle>
                  <CardDescription>
                    {(formData.products_services?.length || 0)} product{(formData.products_services?.length || 0) !== 1 ? 's' : ''} configured
                  </CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${openSections.products ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {(formData.products_services || []).map((product, index) => (
                <ProductServiceEditor
                  key={product.id}
                  product={product}
                  onChange={(p) => updateProduct(index, p)}
                  onRemove={() => removeProduct(index)}
                />
              ))}
              <Button variant="outline" onClick={addProduct} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Product / Service
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Differentiators Section */}
      <Collapsible open={openSections.differentiators} onOpenChange={() => toggleSection('differentiators')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Differentiators
                  </CardTitle>
                  <CardDescription>Competitive advantages that set you apart</CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${openSections.differentiators ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <TagInput
                value={formData.differentiators || []}
                onChange={(tags) => handleChange('differentiators', tags)}
                placeholder="e.g., AI-native, No-code setup, 24/7 support"
                maxTags={10}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Target Personas Section */}
      <Collapsible open={openSections.personas} onOpenChange={() => toggleSection('personas')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    Target Personas
                  </CardTitle>
                  <CardDescription>
                    {(formData.target_personas?.length || 0)} persona{(formData.target_personas?.length || 0) !== 1 ? 's' : ''} defined
                  </CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${openSections.personas ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {(formData.target_personas || []).map((persona, index) => (
                <TargetPersonaEditor
                  key={persona.id}
                  persona={persona}
                  onChange={(p) => updatePersona(index, p)}
                  onRemove={() => removePersona(index)}
                />
              ))}
              <Button variant="outline" onClick={addPersona} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Target Persona
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Proof Points Section */}
      <Collapsible open={openSections.proofPoints} onOpenChange={() => toggleSection('proofPoints')}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Award className="h-5 w-5" />
                    Proof Points
                  </CardTitle>
                  <CardDescription>Social proof: stats, quotes, and logos</CardDescription>
                </div>
                <ChevronDown className={`h-5 w-5 transition-transform ${openSections.proofPoints ? 'rotate-180' : ''}`} />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              {(formData.proof_points || []).map((proofPoint, index) => (
                <ProofPointEditor
                  key={proofPoint.id}
                  proofPoint={proofPoint}
                  onChange={(p) => updateProofPoint(index, p)}
                  onRemove={() => removeProofPoint(index)}
                />
              ))}
              <Button variant="outline" onClick={addProofPoint} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add Proof Point
              </Button>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* Footer */}
      {profile?.updated_at && (
        <p className="text-sm text-muted-foreground text-center">
          Last updated: {new Date(profile.updated_at).toLocaleString()}
        </p>
      )}
    </div>
  );
};
