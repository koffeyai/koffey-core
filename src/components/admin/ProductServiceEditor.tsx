import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { TagInput } from '@/components/settings/TagInput';
import { Trash2, Package } from 'lucide-react';
import type { ProductService } from '@/types/company-profile';

interface ProductServiceEditorProps {
  product: ProductService;
  onChange: (product: ProductService) => void;
  onRemove: () => void;
}

export const ProductServiceEditor: React.FC<ProductServiceEditorProps> = ({
  product,
  onChange,
  onRemove
}) => {
  const handleChange = (field: keyof ProductService, value: string | string[]) => {
    onChange({ ...product, [field]: value });
  };

  return (
    <Card className="border-dashed">
      <CardContent className="pt-4 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-2 text-muted-foreground">
            <Package className="h-4 w-4" />
            <span className="text-sm font-medium">Product / Service</span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemove}
            className="text-destructive hover:text-destructive hover:bg-destructive/10"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`product-name-${product.id}`}>Name</Label>
            <Input
              id={`product-name-${product.id}`}
              value={product.name}
              onChange={(e) => handleChange('name', e.target.value)}
              placeholder="e.g., Scout AI"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`product-icon-${product.id}`}>Icon (emoji)</Label>
            <Input
              id={`product-icon-${product.id}`}
              value={product.icon || ''}
              onChange={(e) => handleChange('icon', e.target.value)}
              placeholder="e.g., 🚀"
              className="w-24"
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label htmlFor={`product-desc-${product.id}`}>Description</Label>
          <Textarea
            id={`product-desc-${product.id}`}
            value={product.description}
            onChange={(e) => handleChange('description', e.target.value)}
            placeholder="Brief description of this product or service..."
            rows={2}
          />
        </div>

        <div className="space-y-2">
          <Label>Features</Label>
          <TagInput
            value={product.features || []}
            onChange={(features) => handleChange('features', features)}
            placeholder="Add feature and press Enter..."
            maxTags={8}
          />
        </div>
      </CardContent>
    </Card>
  );
};
