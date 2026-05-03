import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save, X } from 'lucide-react';

interface InlineEditFormProps {
  entity: 'contact' | 'deal' | 'account';
  initialData: Record<string, any>;
  onSave: (updatedData: Record<string, any>) => void;
  onCancel: () => void;
}

const fieldConfig: Record<string, Record<string, { label: string; type: string; required?: boolean }>> = {
  contact: {
    firstName: { label: 'First Name', type: 'text', required: true },
    lastName: { label: 'Last Name', type: 'text', required: true },
    email: { label: 'Email', type: 'email', required: true },
    phone: { label: 'Phone', type: 'tel' },
    company: { label: 'Company', type: 'text' },
    title: { label: 'Job Title', type: 'text' }
  },
  deal: {
    name: { label: 'Deal Name', type: 'text', required: true },
    amount: { label: 'Amount', type: 'number', required: true },
    stage: { label: 'Stage', type: 'text', required: true },
    closeDate: { label: 'Close Date', type: 'date' },
    description: { label: 'Description', type: 'text' }
  },
  account: {
    name: { label: 'Company Name', type: 'text', required: true },
    industry: { label: 'Industry', type: 'text' },
    website: { label: 'Website', type: 'url' },
    phone: { label: 'Phone', type: 'tel' },
    address: { label: 'Address', type: 'text' }
  }
};

export const InlineEditForm: React.FC<InlineEditFormProps> = ({
  entity,
  initialData,
  onSave,
  onCancel
}) => {
  const [formData, setFormData] = useState(initialData);
  const fields = fieldConfig[entity];

  const handleChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <Card className="border-2 border-primary/50 bg-primary/5 animate-in slide-in-from-top-3 duration-300">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Edit {entity.charAt(0).toUpperCase() + entity.slice(1)}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
            onClick={onCancel}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pb-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          {Object.entries(fields).map(([key, config]) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="text-sm font-medium">
                {config.label}
                {config.required && <span className="text-destructive ml-1">*</span>}
              </Label>
              <Input
                id={key}
                type={config.type}
                value={formData[key] || ''}
                onChange={(e) => handleChange(key, e.target.value)}
                required={config.required}
                className="h-9"
                placeholder={`Enter ${config.label.toLowerCase()}`}
              />
            </div>
          ))}

          <div className="flex gap-2 pt-2">
            <Button type="submit" className="flex-1">
              <Save className="h-4 w-4 mr-2" />
              Save Changes
            </Button>
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};
