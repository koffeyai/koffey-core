import React from 'react';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';

interface StyleOption {
  value: string;
  label: string;
  description: string;
}

interface StyleSelectorProps {
  options: readonly StyleOption[];
  value: string;
  onChange: (value: string) => void;
  columns?: 2 | 3;
  className?: string;
}

export const StyleSelector: React.FC<StyleSelectorProps> = ({
  options,
  value,
  onChange,
  columns = 2,
  className,
}) => {
  return (
    <RadioGroup
      value={value}
      onValueChange={onChange}
      className={`grid gap-3 ${columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'} ${className}`}
    >
      {options.map((option) => (
        <Label
          key={option.value}
          className={`flex items-start gap-3 p-4 border rounded-lg cursor-pointer transition-all ${
            value === option.value 
              ? 'border-primary bg-primary/5 ring-1 ring-primary' 
              : 'border-border hover:border-muted-foreground/50 hover:bg-muted/50'
          }`}
        >
          <RadioGroupItem value={option.value} className="mt-0.5" />
          <div className="flex-1">
            <div className="font-medium text-sm">{option.label}</div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {option.description}
            </div>
          </div>
        </Label>
      ))}
    </RadioGroup>
  );
};
