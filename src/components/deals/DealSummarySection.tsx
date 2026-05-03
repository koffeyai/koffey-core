import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Info, X } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

interface DealSummarySectionProps {
  keyUseCase: string;
  productsPositioned: string[];
  onKeyUseCaseChange: (value: string) => void;
  onProductsChange: (products: string[]) => void;
}

export function DealSummarySection({
  keyUseCase,
  productsPositioned,
  onKeyUseCaseChange,
  onProductsChange,
}: DealSummarySectionProps) {
  const [newProduct, setNewProduct] = React.useState('');

  const handleAddProduct = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && newProduct.trim()) {
      e.preventDefault();
      if (!productsPositioned.includes(newProduct.trim())) {
        onProductsChange([...productsPositioned, newProduct.trim()]);
      }
      setNewProduct('');
    }
  };

  const handleRemoveProduct = (product: string) => {
    onProductsChange(productsPositioned.filter(p => p !== product));
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-medium text-foreground">Deal Summary</h3>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-4 w-4 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <p className="text-sm">
                This summary captures the strategic context of your deal. 
                Keep it updated as conversations progress and requirements evolve.
              </p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      <div className="space-y-4">
        <div>
          <Label htmlFor="keyUseCase" className="text-sm text-muted-foreground">
            Key Use Case
          </Label>
          <Textarea
            id="keyUseCase"
            value={keyUseCase}
            onChange={(e) => onKeyUseCaseChange(e.target.value)}
            placeholder="What problem are they trying to solve? What's driving this initiative?"
            rows={3}
            className="mt-1.5"
          />
        </div>

        <div>
          <Label className="text-sm text-muted-foreground">
            Products Being Positioned
          </Label>
          <div className="mt-1.5 space-y-2">
            <div className="flex flex-wrap gap-2">
              {productsPositioned.map((product) => (
                <Badge 
                  key={product} 
                  variant="secondary" 
                  className="pl-2 pr-1 py-1 flex items-center gap-1"
                >
                  {product}
                  <button
                    onClick={() => handleRemoveProduct(product)}
                    className="ml-1 hover:bg-muted rounded p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              placeholder="Add product and press Enter..."
              value={newProduct}
              onChange={(e) => setNewProduct(e.target.value)}
              onKeyDown={handleAddProduct}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
