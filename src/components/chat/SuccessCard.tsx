import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, X, ExternalLink, Plus, User, Building2, DollarSign } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SuccessCardProps {
  entity: 'contact' | 'deal' | 'account';
  data: Record<string, any>;
  recordId?: string;
  onDismiss: () => void;
  onViewRecord?: () => void;
  suggestedActions?: Array<{
    label: string;
    action: () => void;
    icon?: React.ReactNode;
  }>;
}

const entityConfig = {
  contact: {
    icon: User,
    color: 'hsl(var(--primary))',
    label: 'Contact',
    gradient: 'from-green-500/20 to-emerald-500/20'
  },
  deal: {
    icon: DollarSign,
    color: 'hsl(var(--chart-2))',
    label: 'Deal',
    gradient: 'from-blue-500/20 to-cyan-500/20'
  },
  account: {
    icon: Building2,
    color: 'hsl(var(--chart-3))',
    label: 'Account',
    gradient: 'from-purple-500/20 to-pink-500/20'
  }
};

const getInitials = (firstName?: string, lastName?: string, name?: string): string => {
  if (firstName && lastName) {
    return `${firstName[0]}${lastName[0]}`.toUpperCase();
  }
  if (name) {
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  return '??';
};

export const SuccessCard: React.FC<SuccessCardProps> = ({
  entity,
  data,
  recordId,
  onDismiss,
  onViewRecord,
  suggestedActions = []
}) => {
  const config = entityConfig[entity];
  const EntityIcon = config.icon;

  const renderEntityPreview = () => {
    switch (entity) {
      case 'contact':
        const initials = getInitials(data.firstName, data.lastName, data.fullName);
        return (
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center text-primary font-semibold">
              {initials}
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">
                {data.firstName && data.lastName 
                  ? `${data.firstName} ${data.lastName}`
                  : data.fullName || 'New Contact'}
              </p>
              {data.email && (
                <p className="text-sm text-muted-foreground">{data.email}</p>
              )}
              {data.company && (
                <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                  <Building2 className="h-3 w-3" />
                  {data.company}
                </p>
              )}
            </div>
          </div>
        );

      case 'deal':
        return (
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-cyan-500/10 flex items-center justify-center">
              <DollarSign className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">{data.name || 'New Deal'}</p>
              {data.amount && (
                <p className="text-lg font-bold text-blue-600 dark:text-blue-400">
                  ${Number(data.amount).toLocaleString()}
                </p>
              )}
              {data.stage && (
                <Badge variant="secondary" className="mt-1">
                  {data.stage}
                </Badge>
              )}
            </div>
          </div>
        );

      case 'account':
        return (
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-lg bg-gradient-to-br from-purple-500/20 to-pink-500/10 flex items-center justify-center">
              <Building2 className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">{data.name || 'New Account'}</p>
              {data.industry && (
                <p className="text-sm text-muted-foreground">{data.industry}</p>
              )}
              {data.website && (
                <a 
                  href={data.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline flex items-center gap-1 mt-0.5"
                >
                  {data.website}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        );
    }
  };

  return (
    <Card className={cn(
      "border-2 border-green-500/50 bg-gradient-to-br",
      config.gradient,
      "animate-in slide-in-from-bottom-5 duration-500"
    )}>
      <CardContent className="p-4">
        {/* Header with dismiss button */}
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
            <p className="font-semibold text-green-700 dark:text-green-300">
              {config.label} Created Successfully!
            </p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 -mt-1 -mr-1"
            onClick={onDismiss}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Entity preview */}
        <div className="mb-4">
          {renderEntityPreview()}
        </div>

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2">
          {onViewRecord && (
            <Button
              variant="outline"
              size="sm"
              onClick={onViewRecord}
              className="flex-1 min-w-[100px]"
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              View {config.label}
            </Button>
          )}

          {suggestedActions.map((action, index) => (
            <Button
              key={index}
              variant="outline"
              size="sm"
              onClick={action.action}
              className="flex-1 min-w-[100px]"
            >
              {action.icon || <Plus className="h-4 w-4 mr-2" />}
              {action.label}
            </Button>
          ))}

          <Button
            variant="ghost"
            size="sm"
            onClick={onDismiss}
          >
            Continue Chat
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};
