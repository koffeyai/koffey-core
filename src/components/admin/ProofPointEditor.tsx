import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Trash2, BarChart3, Quote, Image } from 'lucide-react';
import type { ProofPoint } from '@/types/company-profile';

interface ProofPointEditorProps {
  proofPoint: ProofPoint;
  onChange: (proofPoint: ProofPoint) => void;
  onRemove: () => void;
}

export const ProofPointEditor: React.FC<ProofPointEditorProps> = ({
  proofPoint,
  onChange,
  onRemove
}) => {
  const handleChange = (field: keyof ProofPoint, value: string) => {
    onChange({ ...proofPoint, [field]: value });
  };

  const typeIcons = {
    stat: <BarChart3 className="h-4 w-4" />,
    quote: <Quote className="h-4 w-4" />,
    logo: <Image className="h-4 w-4" />
  };

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <RadioGroup
            value={proofPoint.type}
            onValueChange={(value) => handleChange('type', value)}
            className="flex gap-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="stat" id={`type-stat-${proofPoint.id}`} />
              <Label htmlFor={`type-stat-${proofPoint.id}`} className="flex items-center gap-1 cursor-pointer">
                {typeIcons.stat} Stat
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="quote" id={`type-quote-${proofPoint.id}`} />
              <Label htmlFor={`type-quote-${proofPoint.id}`} className="flex items-center gap-1 cursor-pointer">
                {typeIcons.quote} Quote
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="logo" id={`type-logo-${proofPoint.id}`} />
              <Label htmlFor={`type-logo-${proofPoint.id}`} className="flex items-center gap-1 cursor-pointer">
                {typeIcons.logo} Logo
              </Label>
            </div>
          </RadioGroup>
          
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        {proofPoint.type === 'stat' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`stat-value-${proofPoint.id}`}>Statistic</Label>
              <Input
                id={`stat-value-${proofPoint.id}`}
                value={proofPoint.value}
                onChange={(e) => handleChange('value', e.target.value)}
                placeholder="e.g., 25% higher win rates"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`stat-source-${proofPoint.id}`}>Source</Label>
              <Input
                id={`stat-source-${proofPoint.id}`}
                value={proofPoint.source || ''}
                onChange={(e) => handleChange('source', e.target.value)}
                placeholder="e.g., Internal study, 2024"
              />
            </div>
          </div>
        )}

        {proofPoint.type === 'quote' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor={`quote-value-${proofPoint.id}`}>Quote</Label>
              <Textarea
                id={`quote-value-${proofPoint.id}`}
                value={proofPoint.value}
                onChange={(e) => handleChange('value', e.target.value)}
                placeholder="e.g., Scout saved me 5 hours per week"
                rows={2}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`quote-source-${proofPoint.id}`}>Attribution</Label>
              <Input
                id={`quote-source-${proofPoint.id}`}
                value={proofPoint.source || ''}
                onChange={(e) => handleChange('source', e.target.value)}
                placeholder="e.g., Sarah Chen, VP Sales @ TechCorp"
              />
            </div>
          </div>
        )}

        {proofPoint.type === 'logo' && (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={`logo-name-${proofPoint.id}`}>Company Name</Label>
              <Input
                id={`logo-name-${proofPoint.id}`}
                value={proofPoint.value}
                onChange={(e) => handleChange('value', e.target.value)}
                placeholder="e.g., Acme Corp"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor={`logo-url-${proofPoint.id}`}>Logo URL (optional)</Label>
              <Input
                id={`logo-url-${proofPoint.id}`}
                value={proofPoint.logo_url || ''}
                onChange={(e) => handleChange('logo_url', e.target.value)}
                placeholder="https://..."
              />
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
