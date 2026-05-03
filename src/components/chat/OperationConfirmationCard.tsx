import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, AlertTriangle, User, Briefcase, DollarSign, Mail, Phone, Building2, Calendar, Edit3 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface OperationPreview {
  type: 'create' | 'update';
  entity: 'contact' | 'deal' | 'account';
  data: Record<string, any>;
  confidence: number;
  missingFields?: string[];
}

interface OperationConfirmationCardProps {
  preview: OperationPreview;
  onConfirm: () => void;
  onEdit: () => void;
  onCancel: () => void;
}

const entityConfig = {
  contact: {
    icon: User,
    color: 'hsl(var(--primary))',
    label: 'Contact',
    requiredFields: ['firstName', 'lastName', 'email']
  },
  deal: {
    icon: DollarSign,
    color: 'hsl(var(--chart-2))',
    label: 'Deal',
    requiredFields: ['name', 'amount', 'stage']
  },
  account: {
    icon: Building2,
    color: 'hsl(var(--chart-3))',
    label: 'Account',
    requiredFields: ['name', 'industry']
  }
};

const fieldIcons: Record<string, any> = {
  email: Mail,
  phone: Phone,
  company: Building2,
  amount: DollarSign,
  closeDate: Calendar,
  firstName: User,
  lastName: User
};

export const OperationConfirmationCard: React.FC<OperationConfirmationCardProps> = ({
  preview,
  onConfirm,
  onEdit,
  onCancel
}) => {
  const config = entityConfig[preview.entity];
  const EntityIcon = config.icon;
  const isHighConfidence = preview.confidence > 0.8;
  const isMediumConfidence = preview.confidence >= 0.5 && preview.confidence <= 0.8;

  const formatFieldLabel = (key: string): string => {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, str => str.toUpperCase())
      .trim();
  };

  const formatFieldValue = (value: any): string => {
    if (value === null || value === undefined) return 'Not provided';
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    if (typeof value === 'number') return value.toLocaleString();
    if (value instanceof Date) return value.toLocaleDateString();
    return String(value);
  };

  const hasMissingRequired = preview.missingFields && preview.missingFields.length > 0;

  return (
    <Card className={cn(
      "border-2 transition-all duration-200",
      isHighConfidence && "border-green-500/50 bg-green-500/5",
      isMediumConfidence && "border-amber-500/50 bg-amber-500/5",
      !isHighConfidence && !isMediumConfidence && "border-muted"
    )}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div 
              className={cn(
                "p-2 rounded-lg",
                isHighConfidence && "bg-green-500/10",
                isMediumConfidence && "bg-amber-500/10",
                !isHighConfidence && !isMediumConfidence && "bg-muted"
              )}
            >
              <EntityIcon 
                className="h-5 w-5" 
                style={{ color: config.color }}
              />
            </div>
            <div>
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                {preview.type === 'create' ? 'Create' : 'Update'} {config.label}
                {isHighConfidence && (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                )}
                {isMediumConfidence && (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Confidence: {Math.round(preview.confidence * 100)}%
              </p>
            </div>
          </div>
          <Badge 
            variant={isHighConfidence ? "default" : isMediumConfidence ? "secondary" : "outline"}
            className="ml-2"
          >
            {preview.type}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-3 pb-4">
        {/* Display extracted fields */}
        <div className="grid grid-cols-1 gap-2">
          {Object.entries(preview.data).map(([key, value]) => {
            const FieldIcon = fieldIcons[key];
            const isMissing = preview.missingFields?.includes(key);
            
            return (
              <div 
                key={key}
                className={cn(
                  "flex items-start gap-2 text-sm p-2 rounded-md transition-colors",
                  isMissing ? "bg-amber-500/10 border border-amber-500/20" : "bg-muted/50"
                )}
              >
                {FieldIcon && (
                  <FieldIcon className="h-4 w-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <span className="font-medium text-foreground">
                    {formatFieldLabel(key)}:
                  </span>
                  <span className={cn(
                    "ml-2",
                    isMissing ? "text-amber-600 dark:text-amber-400 italic" : "text-muted-foreground"
                  )}>
                    {formatFieldValue(value) || 'Missing'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Missing required fields warning */}
        {hasMissingRequired && (
          <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
            <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
            <div className="flex-1 text-sm">
              <p className="font-medium text-amber-800 dark:text-amber-300">
                Missing Required Fields
              </p>
              <p className="text-amber-700 dark:text-amber-400 mt-1">
                {preview.missingFields!.map(formatFieldLabel).join(', ')}
              </p>
            </div>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button 
            onClick={onConfirm}
            className="flex-1 min-w-[100px]"
            disabled={!isHighConfidence && hasMissingRequired}
          >
            <CheckCircle2 className="h-4 w-4 mr-2" />
            {hasMissingRequired ? 'Create Anyway' : 'Confirm'}
          </Button>
          
          <Button 
            onClick={onEdit}
            variant="outline"
            className="flex-1 min-w-[100px]"
          >
            <Edit3 className="h-4 w-4 mr-2" />
            {hasMissingRequired ? 'Add Details' : 'Edit'}
          </Button>
          
          <Button 
            onClick={onCancel}
            variant="ghost"
            size="sm"
          >
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
