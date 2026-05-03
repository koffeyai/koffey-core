import React, { useState, useCallback, KeyboardEvent } from 'react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  placeholder?: string;
  maxTags?: number;
  className?: string;
}

export const TagInput: React.FC<TagInputProps> = ({
  value = [],
  onChange,
  placeholder = 'Type and press Enter...',
  maxTags = 10,
  className,
}) => {
  const [inputValue, setInputValue] = useState('');

  const addTag = useCallback((tag: string) => {
    const trimmed = tag.trim();
    if (!trimmed) return;
    if (value.includes(trimmed)) return;
    if (value.length >= maxTags) return;
    
    onChange([...value, trimmed]);
    setInputValue('');
  }, [value, onChange, maxTags]);

  const removeTag = useCallback((indexToRemove: number) => {
    onChange(value.filter((_, index) => index !== indexToRemove));
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(inputValue);
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      removeTag(value.length - 1);
    }
  }, [inputValue, addTag, removeTag, value.length]);

  const handleBlur = useCallback(() => {
    if (inputValue.trim()) {
      addTag(inputValue);
    }
  }, [inputValue, addTag]);

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((tag, index) => (
          <Badge
            key={index}
            variant="secondary"
            className="gap-1 pr-1 text-sm"
          >
            {tag}
            <button
              type="button"
              onClick={() => removeTag(index)}
              className="ml-1 rounded-full hover:bg-muted-foreground/20 p-0.5"
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
      </div>
      
      <Input
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        placeholder={value.length >= maxTags ? `Max ${maxTags} tags` : placeholder}
        disabled={value.length >= maxTags}
        className="w-full"
      />
      
      <p className="text-xs text-muted-foreground mt-1">
        Press Enter or comma to add. {value.length}/{maxTags} tags.
      </p>
    </div>
  );
};
