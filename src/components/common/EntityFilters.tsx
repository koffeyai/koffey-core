import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { CalendarIcon, X } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { CRMEntity as CRMEntityType, EntityConfig, CRMFilters } from '@/hooks/useCRM';

interface EntityFiltersProps {
  entityType: CRMEntityType;
  config: EntityConfig;
  filters: CRMFilters;
  onChange: (filters: CRMFilters) => void;
}

export const EntityFilters: React.FC<EntityFiltersProps> = ({
  entityType,
  config,
  filters,
  onChange
}) => {
  // FILTER HELPERS
  const updateFilter = (field: string, value: any) => {
    onChange({
      ...filters,
      [field]: value
    });
  };

  const removeFilter = (field: string) => {
    const newFilters = { ...filters };
    delete newFilters[field];
    onChange(newFilters);
  };

  const clearAllFilters = () => {
    onChange({ search: filters.search || '' });
  };

  // COUNT ACTIVE FILTERS
  const activeFilterCount = Object.keys(filters).filter(
    key => key !== 'search' && filters[key] !== undefined && filters[key] !== ''
  ).length;

  return (
    <div className="space-y-4">
      {/* FILTER CONTROLS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* STATUS FILTER */}
        {config.statusOptions && (
          <div>
            <Label htmlFor="status-filter">Status</Label>
            <Select
              value={filters.status || ''}
              onValueChange={(value) => updateFilter('status', value || undefined)}
            >
              <SelectTrigger>
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">All statuses</SelectItem>
                {config.statusOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    <div className="flex items-center gap-2">
                      <div 
                        className={`w-2 h-2 rounded-full bg-${option.color}-500`}
                      />
                      {option.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* DATE RANGE FILTERS */}
        <div>
          <Label>Created After</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !filters.createdAfter && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.createdAfter 
                  ? format(new Date(filters.createdAfter), "PPP")
                  : "Pick a date"
                }
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.createdAfter ? new Date(filters.createdAfter) : undefined}
                onSelect={(date) => updateFilter('createdAfter', date?.toISOString())}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        <div>
          <Label>Created Before</Label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !filters.createdBefore && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {filters.createdBefore 
                  ? format(new Date(filters.createdBefore), "PPP")
                  : "Pick a date"
                }
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={filters.createdBefore ? new Date(filters.createdBefore) : undefined}
                onSelect={(date) => updateFilter('createdBefore', date?.toISOString())}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* CUSTOM FILTERS BASED ON ENTITY TYPE */}
        {entityType === 'deals' && (
          <div>
            <Label htmlFor="value-range">Value Range</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                placeholder="Min"
                value={filters.minValue || ''}
                onChange={(e) => updateFilter('minValue', e.target.value || undefined)}
                className="w-1/2"
              />
              <Input
                type="number"
                placeholder="Max"
                value={filters.maxValue || ''}
                onChange={(e) => updateFilter('maxValue', e.target.value || undefined)}
                className="w-1/2"
              />
            </div>
          </div>
        )}

        {entityType === 'contacts' && (
          <div>
            <Label htmlFor="company-filter">Company</Label>
            <Input
              id="company-filter"
              placeholder="Filter by company"
              value={filters.company || ''}
              onChange={(e) => updateFilter('company', e.target.value || undefined)}
            />
          </div>
        )}
      </div>

      {/* ACTIVE FILTERS DISPLAY */}
      {activeFilterCount > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          
          {filters.status && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Status: {config.statusOptions?.find(opt => opt.value === filters.status)?.label || filters.status}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1"
                onClick={() => removeFilter('status')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}

          {filters.createdAfter && (
            <Badge variant="secondary" className="flex items-center gap-1">
              After: {format(new Date(filters.createdAfter), 'MMM dd, yyyy')}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1"
                onClick={() => removeFilter('createdAfter')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}

          {filters.createdBefore && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Before: {format(new Date(filters.createdBefore), 'MMM dd, yyyy')}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1"
                onClick={() => removeFilter('createdBefore')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}

          {filters.company && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Company: {filters.company}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1"
                onClick={() => removeFilter('company')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}

          {filters.minValue && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Min Value: ${filters.minValue}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1"
                onClick={() => removeFilter('minValue')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}

          {filters.maxValue && (
            <Badge variant="secondary" className="flex items-center gap-1">
              Max Value: ${filters.maxValue}
              <Button
                variant="ghost"
                size="sm"
                className="h-auto p-0 ml-1"
                onClick={() => removeFilter('maxValue')}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          )}

          <Button
            variant="ghost"
            size="sm"
            onClick={clearAllFilters}
            className="text-destructive hover:text-destructive"
          >
            Clear all filters
          </Button>
        </div>
      )}

      {/* FILTER SUMMARY */}
      {activeFilterCount > 0 && (
        <div className="text-xs text-muted-foreground">
          {activeFilterCount} filter{activeFilterCount !== 1 ? 's' : ''} applied
        </div>
      )}
    </div>
  );
};