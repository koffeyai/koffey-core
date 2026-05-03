import React, { useState, useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Search, Filter, X, Calendar as CalendarIcon, SortAsc, SortDesc } from 'lucide-react';
import { format } from 'date-fns';

interface FilterOption {
  key: string;
  label: string;
  type: 'select' | 'date' | 'dateRange' | 'multiSelect';
  options?: { value: string; label: string }[];
}

interface SortOption {
  key: string;
  label: string;
}

interface ActiveFilter {
  key: string;
  value: any;
  label: string;
  display: string;
}

interface AdvancedFiltersProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  filterOptions: FilterOption[];
  sortOptions: SortOption[];
  onFiltersChange: (filters: Record<string, any>) => void;
  onSortChange: (sortBy: string, sortOrder: 'asc' | 'desc') => void;
  className?: string;
}

export const AdvancedFilters: React.FC<AdvancedFiltersProps> = ({
  searchValue,
  onSearchChange,
  filterOptions,
  sortOptions,
  onFiltersChange,
  onSortChange,
  className = ''
}) => {
  const [filters, setFilters] = useState<Record<string, any>>({});
  const [sortBy, setSortBy] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  const [showFilters, setShowFilters] = useState(false);

  const activeFilters: ActiveFilter[] = useMemo(() => {
    return Object.entries(filters)
      .filter(([_, value]) => value !== undefined && value !== null && value !== '')
      .map(([key, value]) => {
        const option = filterOptions.find(opt => opt.key === key);
        if (!option) return null;

        let display = '';
        let label = option.label;

        switch (option.type) {
          case 'select':
            const selectOption = option.options?.find(opt => opt.value === value);
            display = selectOption?.label || value;
            break;
          case 'multiSelect':
            const selectedOptions = option.options?.filter(opt => value.includes(opt.value));
            display = selectedOptions?.map(opt => opt.label).join(', ') || value.join(', ');
            break;
          case 'date':
            display = format(new Date(value), 'MMM dd, yyyy');
            break;
          case 'dateRange':
            if (value.from && value.to) {
              display = `${format(new Date(value.from), 'MMM dd')} - ${format(new Date(value.to), 'MMM dd, yyyy')}`;
            } else if (value.from) {
              display = `From ${format(new Date(value.from), 'MMM dd, yyyy')}`;
            } else if (value.to) {
              display = `Until ${format(new Date(value.to), 'MMM dd, yyyy')}`;
            }
            break;
          default:
            display = String(value);
        }

        return { key, value, label, display };
      })
      .filter(Boolean) as ActiveFilter[];
  }, [filters, filterOptions]);

  const updateFilter = (key: string, value: any) => {
    const newFilters = { ...filters, [key]: value };
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const removeFilter = (key: string) => {
    const newFilters = { ...filters };
    delete newFilters[key];
    setFilters(newFilters);
    onFiltersChange(newFilters);
  };

  const clearAllFilters = () => {
    setFilters({});
    onFiltersChange({});
    setSortBy('');
    setSortOrder('asc');
    onSortChange('', 'asc');
  };

  const handleSortChange = (newSortBy: string) => {
    const newOrder = newSortBy === sortBy && sortOrder === 'asc' ? 'desc' : 'asc';
    setSortBy(newSortBy);
    setSortOrder(newOrder);
    onSortChange(newSortBy, newOrder);
  };

  const renderFilterControl = (option: FilterOption) => {
    const value = filters[option.key];

    switch (option.type) {
      case 'select':
        return (
          <Select value={value || ''} onValueChange={(val) => updateFilter(option.key, val)}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder={`Select ${option.label.toLowerCase()}`} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All {option.label}</SelectItem>
              {option.options?.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );

      case 'date':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-48 justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value ? format(new Date(value), 'PPP') : `Select ${option.label.toLowerCase()}`}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={value ? new Date(value) : undefined}
                onSelect={(date) => updateFilter(option.key, date?.toISOString())}
                initialFocus
              />
            </PopoverContent>
          </Popover>
        );

      case 'dateRange':
        return (
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="w-48 justify-start text-left font-normal">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {value?.from ? (
                  value.to ? (
                    `${format(new Date(value.from), 'LLL dd')} - ${format(new Date(value.to), 'LLL dd, y')}`
                  ) : (
                    format(new Date(value.from), 'LLL dd, y')
                  )
                ) : (
                  `Select ${option.label.toLowerCase()}`
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={value}
                onSelect={(range) => updateFilter(option.key, range)}
                numberOfMonths={2}
              />
            </PopoverContent>
          </Popover>
        );

      default:
        return (
          <Input
            placeholder={`Enter ${option.label.toLowerCase()}`}
            value={value || ''}
            onChange={(e) => updateFilter(option.key, e.target.value)}
            className="w-48"
          />
        );
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Search and Quick Actions */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-64">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
          <Input
            placeholder="Search across all fields..."
            value={searchValue}
            onChange={(e) => onSearchChange(e.target.value)}
            className="pl-10"
          />
        </div>
        
        <Button
          variant="outline"
          onClick={() => setShowFilters(!showFilters)}
          className="flex items-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
          {activeFilters.length > 0 && (
            <Badge variant="secondary" className="ml-1">
              {activeFilters.length}
            </Badge>
          )}
        </Button>

        {sortOptions.length > 0 && (
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">No sorting</SelectItem>
              {sortOptions.map((option) => (
                <SelectItem key={option.key} value={option.key}>
                  <div className="flex items-center gap-2">
                    {sortBy === option.key && (
                      sortOrder === 'asc' ? <SortAsc className="h-3 w-3" /> : <SortDesc className="h-3 w-3" />
                    )}
                    {option.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {(activeFilters.length > 0 || sortBy) && (
          <Button variant="ghost" onClick={clearAllFilters} className="text-muted-foreground">
            <X className="h-4 w-4 mr-1" />
            Clear all
          </Button>
        )}
      </div>

      {/* Active Filters */}
      {activeFilters.length > 0 && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm text-muted-foreground">Active filters:</span>
          {activeFilters.map((filter) => (
            <Badge key={filter.key} variant="secondary" className="gap-1">
              <span className="font-medium">{filter.label}:</span>
              <span>{filter.display}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => removeFilter(filter.key)}
                className="h-auto p-0 ml-1 hover:bg-transparent"
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      )}

      {/* Filter Controls */}
      {showFilters && (
        <div className="p-4 border rounded-lg bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filterOptions.map((option) => (
              <div key={option.key} className="space-y-2">
                <label className="text-sm font-medium">{option.label}</label>
                {renderFilterControl(option)}
              </div>
            ))}
          </div>
          
          {filterOptions.length > 0 && (
            <>
              <Separator className="my-4" />
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setShowFilters(false)}>
                  Done
                </Button>
                <Button variant="ghost" onClick={clearAllFilters}>
                  Clear All
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};