import { useState, useEffect, useRef } from 'react';

export const useDebounce = <T>(value: T, delay: number): T => {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);
  const previousValueRef = useRef<string>('');

  useEffect(() => {
    // Stringify for deep comparison of objects
    const stringifiedValue = JSON.stringify(value);
    
    // Skip if value hasn't actually changed
    if (stringifiedValue === previousValueRef.current) {
      return;
    }
    
    const handler = setTimeout(() => {
      previousValueRef.current = stringifiedValue;
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
};
