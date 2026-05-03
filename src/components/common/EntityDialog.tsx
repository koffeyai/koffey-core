import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CalendarIcon, AlertCircle } from 'lucide-react';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CRMEntity as CRMEntityType, EntityConfig, EntityValidator } from '@/hooks/useCRM';

interface EntityDialogProps {
  entityType: CRMEntityType;
  config: EntityConfig<any>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entity?: any;
  onSave: (data: any) => Promise<void>;
}

export const EntityDialog: React.FC<EntityDialogProps> = ({
  entityType,
  config,
  open,
  onOpenChange,
  entity,
  onSave
}) => {
  const [formData, setFormData] = useState<any>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  
  const validator = new EntityValidator(config);
  const isEditing = !!entity;

  // INITIALIZE FORM DATA
  useEffect(() => {
    if (open) {
      if (entity) {
        // Editing - populate with entity data
        setFormData(entity);
      } else {
        // Creating - initialize with defaults
        const defaultData: any = {};
        config.formFields.forEach(field => {
          if (field.type === 'select' && field.options?.length) {
            defaultData[field.field] = '';
          } else {
            defaultData[field.field] = '';
          }
        });
        setFormData(defaultData);
      }
      setErrors({});
    }
  }, [open, entity, config]);

  // HANDLE FIELD CHANGE
  const handleFieldChange = (field: string, value: any) => {
    setFormData((prev: any) => ({ ...prev, [field]: value }));
    
    // Clear field error when user starts typing
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: '' }));
    }
  };

  // VALIDATE AND SAVE
  const handleSave = async () => {
    const validation = validator.validate(formData);
    
    if (!validation.isValid) {
      // Import and use FormValidationService for chat-driven completion
      const { FormValidationService } = await import('@/services/enhancedFormValidationService');
      FormValidationService.handleFormValidationFailure(
        entityType,
        config,
        formData,
        { 
          isValid: false, 
          errors: Object.entries(validation.errors).map(([field, message]) => ({ field, message, type: 'required' as const })), 
          missingRequiredFields: [], 
          invalidFields: [] 
        }
      );
      setErrors(validation.errors);
      return;
    }

    setLoading(true);
    try {
      await onSave(formData);
      onOpenChange(false);
    } catch (error) {
      // Error handling is done in parent component
    } finally {
      setLoading(false);
    }
  };

  // RENDER FORM FIELD
  const renderFormField = (fieldConfig: any) => {
    const { field, label, type, placeholder, options } = fieldConfig;
    const value = formData[field] || '';
    const error = errors[field];

    const commonProps = {
      value,
      onChange: (e: any) => handleFieldChange(field, e.target.value),
      className: error ? 'border-destructive' : ''
    };

    let fieldComponent;

    switch (type) {
      case 'textarea':
        fieldComponent = (
          <Textarea
            {...commonProps}
            placeholder={placeholder}
            rows={3}
          />
        );
        break;

      case 'select':
        fieldComponent = (
          <Select value={value} onValueChange={(val) => handleFieldChange(field, val)}>
            <SelectTrigger className={error ? 'border-destructive' : ''}>
              <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              {options?.map((option: any) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
        break;

      case 'date':
        fieldComponent = (
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !value && "text-muted-foreground",
                  error && "border-destructive"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(new Date(value), "PPP") : <span>Pick a date</span>}
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

      case 'number':
        fieldComponent = (
          <Input
            {...commonProps}
            type="number"
            placeholder={placeholder}
          />
        );
        break;

      case 'email':
        fieldComponent = (
          <Input
            {...commonProps}
            type="email"
            placeholder={placeholder}
          />
        );
        break;

      case 'phone':
        fieldComponent = (
          <Input
            {...commonProps}
            type="tel"
            placeholder={placeholder}
          />
        );
        break;

      default:
        fieldComponent = (
          <Input
            {...commonProps}
            type="text"
            placeholder={placeholder}
          />
        );
    }

    return (
      <div key={field} className="space-y-2">
        <Label htmlFor={field}>
          {label}
          {config.requiredFields.includes(field) && (
            <span className="text-destructive ml-1">*</span>
          )}
        </Label>
        {fieldComponent}
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? `Edit ${config.displayName}` : `Create ${config.displayName}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* FORM FIELDS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {config.formFields.map(renderFormField)}
          </div>

          {/* VALIDATION SUMMARY */}
          {Object.keys(errors).length > 0 && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                Please fix the validation errors above before saving.
              </AlertDescription>
            </Alert>
          )}

          {/* ACTION BUTTONS */}
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={loading}
            >
              {loading ? 'Saving...' : (isEditing ? 'Update' : 'Create')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};