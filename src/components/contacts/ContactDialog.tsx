import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mail, Phone, Building, User, MapPin, Briefcase, FileText, AlertCircle, CheckCircle2, Linkedin } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface ContactFormData {
  id?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  company?: string;
  title?: string;
  address?: string;
  linkedin_url?: string;
  notes?: string;
  status?: string;
  account_id?: string;
}

interface ContactDialogProps {
  contact?: any;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (contact: Partial<ContactFormData>) => Promise<void>;
  showValidation?: boolean;
  /** Default status for new contacts — 'lead' from Leads view, 'prospect' from Contacts view */
  defaultStatus?: string;
}

export const ContactDialog: React.FC<ContactDialogProps> = ({
  contact,
  open,
  onOpenChange,
  onSave,
  showValidation = true,
  defaultStatus = 'lead',
}) => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState<Partial<ContactFormData>>({
    full_name: '',
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    company: '',
    title: '',
    address: '',
    linkedin_url: '',
    notes: '',
    status: defaultStatus
  });

  // Initialize form data when contact changes
  useEffect(() => {
    if (contact) {
      setFormData({
        full_name: contact.full_name || `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
        first_name: contact.first_name || '',
        last_name: contact.last_name || '',
        email: contact.email || '',
        phone: contact.phone || '',
        company: contact.company || '',
        title: contact.title || '',
        address: contact.address || '',
        linkedin_url: contact.linkedin_url || '',
        notes: contact.notes || '',
        status: contact.status || 'lead'
      });
    } else {
      setFormData({
        full_name: '',
        first_name: '',
        last_name: '',
        email: '',
        phone: '',
        company: '',
        title: '',
        address: '',
        linkedin_url: '',
        notes: '',
        status: defaultStatus
      });
    }
    setValidationErrors({});
  }, [contact, open, defaultStatus]);

  // Auto-generate full name from first and last name
  useEffect(() => {
    if (formData.first_name || formData.last_name) {
      const fullName = `${formData.first_name || ''} ${formData.last_name || ''}`.trim();
      setFormData(prev => ({ ...prev, full_name: fullName }));
    }
  }, [formData.first_name, formData.last_name]);

  // Enhanced validation
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!formData.email && !formData.phone && !formData.full_name && !formData.first_name && !formData.last_name) {
      errors.general = 'Please provide at least a name, email, or phone number.';
    }
    
    if (formData.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      errors.email = 'Please enter a valid email address.';
    }
    
    if (formData.phone && formData.phone.length > 0) {
      const cleanPhone = formData.phone.replace(/[\s\-\(\)]/g, '');
      if (cleanPhone.length < 10) {
        errors.phone = 'Phone number should be at least 10 digits.';
      }
    }
    
    if (formData.full_name && formData.full_name.length < 2) {
      errors.full_name = 'Name should be at least 2 characters long.';
    }

    if (formData.linkedin_url && formData.linkedin_url.trim().length > 0) {
      const url = formData.linkedin_url.trim();
      if (!url.startsWith('https://linkedin.com/') && !url.startsWith('https://www.linkedin.com/')) {
        errors.linkedin_url = 'Please enter a valid LinkedIn URL (https://linkedin.com/in/...)';
      }
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleInputChange = (field: keyof ContactFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    
    if (validationErrors[field]) {
      setValidationErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[field];
        return newErrors;
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (showValidation && !validateForm()) {
      toast({
        title: "Validation Error",
        description: "Please fix the form errors below.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    try {
      const contactData = {
        ...formData,
        full_name: formData.full_name || 
                  `${formData.first_name || ''} ${formData.last_name || ''}`.trim() ||
                  formData.email?.split('@')[0] ||
                  'Unknown Contact'
      };

      await onSave(contactData);
      
      toast({
        title: "Success",
        description: `Contact ${contact ? 'updated' : 'created'} successfully.`,
        variant: "default"
      });
      
      onOpenChange(false);
    } catch (error: any) {
      console.error('Contact save error:', error);
      toast({
        title: "Error",
        description: error.message || `Failed to ${contact ? 'update' : 'create'} contact.`,
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const formFields = [
    { id: 'full_name', label: 'Full Name', placeholder: 'Sarah Johnson', icon: User, required: true, type: 'text' },
    { id: 'email', label: 'Email Address', placeholder: 'sarah.johnson@techcorp.com', icon: Mail, required: false, type: 'email' },
    { id: 'phone', label: 'Phone Number', placeholder: '+1 (555) 123-4567', icon: Phone, required: false, type: 'tel' },
    { id: 'company', label: 'Company Name', placeholder: 'TechCorp Solutions', icon: Building, required: false, type: 'text' },
    { id: 'title', label: 'Job Title', placeholder: 'VP of Sales', icon: Briefcase, required: false, type: 'text' },
    { id: 'address', label: 'Address', placeholder: '123 Business Ave, San Francisco, CA 94105', icon: MapPin, required: false, type: 'text' }
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            {contact ? (
              <>
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                Edit Contact
              </>
            ) : (
              <>
                <User className="h-5 w-5 text-green-600" />
                Create Contact
              </>
            )}
          </DialogTitle>
        </DialogHeader>

        {validationErrors.general && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{validationErrors.general}</AlertDescription>
          </Alert>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground">Contact Information</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {formFields.slice(0, 2).map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id} className="flex items-center gap-2 text-sm font-medium">
                    <field.icon className="h-4 w-4" />
                    {field.label}
                    {field.required && <span className="text-destructive">*</span>}
                  </Label>
                  <Input
                    id={field.id}
                    type={field.type}
                    value={formData[field.id as keyof ContactFormData] as string || ''}
                    onChange={(e) => handleInputChange(field.id as keyof ContactFormData, e.target.value)}
                    placeholder={field.placeholder}
                    className={validationErrors[field.id] ? 'border-destructive' : ''}
                    required={field.required}
                  />
                  {validationErrors[field.id] && (
                    <p className="text-sm text-destructive">{validationErrors[field.id]}</p>
                  )}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name" className="text-sm font-medium text-muted-foreground">
                  First Name (Optional)
                </Label>
                <Input
                  id="first_name"
                  value={formData.first_name || ''}
                  onChange={(e) => handleInputChange('first_name', e.target.value)}
                  placeholder="Sarah"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name" className="text-sm font-medium text-muted-foreground">
                  Last Name (Optional)
                </Label>
                <Input
                  id="last_name"
                  value={formData.last_name || ''}
                  onChange={(e) => handleInputChange('last_name', e.target.value)}
                  placeholder="Johnson"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground">Professional Details</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {formFields.slice(2, 6).map((field) => (
                <div key={field.id} className="space-y-2">
                  <Label htmlFor={field.id} className="flex items-center gap-2 text-sm font-medium">
                    <field.icon className="h-4 w-4" />
                    {field.label}
                  </Label>
                  <Input
                    id={field.id}
                    type={field.type}
                    value={formData[field.id as keyof ContactFormData] as string || ''}
                    onChange={(e) => handleInputChange(field.id as keyof ContactFormData, e.target.value)}
                    placeholder={field.placeholder}
                    className={validationErrors[field.id] ? 'border-destructive' : ''}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground">Social & Online Presence</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="linkedin_url" className="flex items-center gap-2 text-sm font-medium">
                  <Linkedin className="h-4 w-4" />
                  LinkedIn URL
                </Label>
                <Input
                  id="linkedin_url"
                  type="url"
                  value={formData.linkedin_url || ''}
                  onChange={(e) => handleInputChange('linkedin_url', e.target.value)}
                  placeholder="https://linkedin.com/in/sarah-johnson"
                  className={validationErrors.linkedin_url ? 'border-destructive' : ''}
                />
                {validationErrors.linkedin_url && (
                  <p className="text-sm text-destructive">{validationErrors.linkedin_url}</p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-medium text-foreground">Additional Information</h3>
            
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="status" className="text-sm font-medium">Contact Status</Label>
                <Select
                  value={formData.status || defaultStatus}
                  onValueChange={(value) => handleInputChange('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="lead">Lead</SelectItem>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="contact">Contact</SelectItem>
                    <SelectItem value="customer">Customer</SelectItem>
                    <SelectItem value="inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Leads appear in the Leads view, Prospects and above appear in Contacts.
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="notes" className="flex items-center gap-2 text-sm font-medium">
                  <FileText className="h-4 w-4" />
                  Notes
                </Label>
                <Textarea
                  id="notes"
                  value={formData.notes || ''}
                  onChange={(e) => handleInputChange('notes', e.target.value)}
                  placeholder="Additional notes about this contact..."
                  rows={4}
                  className="resize-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button 
              type="submit" 
              disabled={loading}
              className="min-w-[120px]"
            >
              {loading ? (
                <div className="flex items-center gap-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-foreground"></div>
                  Saving...
                </div>
              ) : (
                contact ? 'Update Contact' : 'Create Contact'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
};
