import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Calendar as CalendarIcon } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { useCRM, EntityValidator } from '@/hooks/useCRM';
import { toast } from '@/hooks/use-toast';

const AddContact: React.FC = () => {
  const navigate = useNavigate();
  const { createEntity, isCreating, config } = useCRM('contacts');
  const validator = useMemo(() => new EntityValidator(config), [config]);

  const [formData, setFormData] = useState<Record<string, any>>(() => {
    const defaults: Record<string, any> = {};
    config.formFields.forEach((f) => {
      defaults[f.field] = '';
    });
    return defaults;
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    document.title = 'Add Contact | Leads';
    const metaDesc = document.querySelector('meta[name="description"]');
    if (metaDesc) {
      metaDesc.setAttribute('content', 'Add a new contact to your leads using the standard contact categories.');
    } else {
      const m = document.createElement('meta');
      m.name = 'description';
      m.content = 'Add a new contact to your leads using the standard contact categories.';
      document.head.appendChild(m);
    }

    // Canonical tag
    const linkRel = document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    const href = `${window.location.origin}/app/contacts/new`;
    if (linkRel) linkRel.href = href; else {
      const l = document.createElement('link');
      l.rel = 'canonical';
      l.href = href;
      document.head.appendChild(l);
    }
  }, []);

  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors((prev) => ({ ...prev, [field]: '' }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const result = validator.validate(formData);
    if (!result.isValid) {
      setErrors(result.errors);
      return;
    }

    try {
      await createEntity(formData);
      toast({ title: 'Contact created', description: 'Your lead was added successfully.' });
      navigate('/app');
    } catch (err: any) {
      // Errors are toasted in the hook
    }
  };

  const renderField = (fieldCfg: any) => {
    const { field, label, type, placeholder, options } = fieldCfg;
    const value = formData[field] ?? '';
    const error = errors[field];

    const commonProps = {
      value,
      onChange: (e: any) => handleFieldChange(field, e.target.value),
      className: error ? 'border-destructive' : ''
    } as any;

    let control: React.ReactNode = null;
    switch (type) {
      case 'textarea':
        control = <Textarea {...commonProps} placeholder={placeholder} rows={3} />;
        break;
      case 'select':
        control = (
          <Select value={value} onValueChange={(val) => handleFieldChange(field, val)}>
            <SelectTrigger className={error ? 'border-destructive' : ''}>
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options?.map((opt: any) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;
      case 'date':
        control = (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                type="button"
                variant="outline"
                className={cn(
                  'w-full justify-start text-left font-normal',
                  !value && 'text-muted-foreground',
                  error && 'border-destructive'
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(new Date(value), 'PPP') : <span>Pick a date</span>}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(date) => handleFieldChange(field, date?.toISOString())}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );
        break;
      case 'email':
        control = <Input {...commonProps} type="email" placeholder={placeholder} />;
        break;
      case 'phone':
        control = <Input {...commonProps} type="tel" placeholder={placeholder} />;
        break;
      case 'number':
        control = <Input {...commonProps} type="number" placeholder={placeholder} />;
        break;
      default:
        control = <Input {...commonProps} type="text" placeholder={placeholder} />;
    }

    return (
      <div key={field} className="space-y-2">
        <Label htmlFor={field}>
          {label}
          {config.requiredFields.includes(field) && (
            <span className="text-destructive ml-1">*</span>
          )}
        </Label>
        {control}
        {error && (
          <p className="text-sm text-destructive flex items-center gap-1">
            <AlertCircle className="h-3 w-3" />
            {error}
          </p>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <h1 className="text-2xl font-bold">Add Contact</h1>
          <p className="text-muted-foreground">Create a new lead using the standard contact categories.</p>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Contact Details</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {config.formFields.map(renderField)}
            </CardContent>
          </Card>

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => navigate(-1)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isCreating}>
              {isCreating ? 'Saving...' : 'Create Contact'}
            </Button>
          </div>
        </form>
      </main>
    </div>
  );
};

export default AddContact;
