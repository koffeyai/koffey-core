import { useState, useEffect, useCallback, useRef } from 'react';
import { useDebounce } from './useDebounce';

interface AutoSaveOptions {
  key: string;
  debounceMs?: number;
  expirationMs?: number;
}

interface SavedDraft<T> {
  data: T;
  savedAt: number;
}

export function useAutoSave<T extends object>(
  data: T,
  options: AutoSaveOptions
) {
  const { key, debounceMs = 1500, expirationMs = 24 * 60 * 60 * 1000 } = options;
  
  const [hasSavedDraft, setHasSavedDraft] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  const isInitialMount = useRef(true);
  const hasUserInteracted = useRef(false);
  
  const debouncedData = useDebounce(data, debounceMs);
  
  // Check for existing draft on mount
  useEffect(() => {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed: SavedDraft<T> = JSON.parse(stored);
        const age = Date.now() - parsed.savedAt;
        
        if (age < expirationMs) {
          setHasSavedDraft(true);
          setSavedAt(new Date(parsed.savedAt));
        } else {
          // Draft expired, clear it
          localStorage.removeItem(key);
        }
      } catch {
        localStorage.removeItem(key);
      }
    }
  }, [key, expirationMs]);
  
  // Auto-save when debounced data changes (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    // Only save if user has interacted and there's meaningful content
    if (!hasUserInteracted.current) return;
    
    const hasContent = Object.values(debouncedData).some(value => {
      if (typeof value === 'string') return value.trim().length > 0;
      if (Array.isArray(value)) return value.length > 0;
      return value !== null && value !== undefined;
    });
    
    if (hasContent) {
      const draft: SavedDraft<T> = {
        data: debouncedData,
        savedAt: Date.now()
      };
      localStorage.setItem(key, JSON.stringify(draft));
      setLastAutoSaved(new Date());
    }
  }, [debouncedData, key]);
  
  const markAsInteracted = useCallback(() => {
    hasUserInteracted.current = true;
  }, []);
  
  const loadDraft = useCallback((): T | null => {
    const stored = localStorage.getItem(key);
    if (stored) {
      try {
        const parsed: SavedDraft<T> = JSON.parse(stored);
        return parsed.data;
      } catch {
        return null;
      }
    }
    return null;
  }, [key]);
  
  const clearDraft = useCallback(() => {
    localStorage.removeItem(key);
    setHasSavedDraft(false);
    setSavedAt(null);
    setLastAutoSaved(null);
    hasUserInteracted.current = false;
  }, [key]);
  
  const getTimeSinceSave = useCallback(() => {
    if (!lastAutoSaved) return null;
    const seconds = Math.floor((Date.now() - lastAutoSaved.getTime()) / 1000);
    if (seconds < 5) return 'just now';
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  }, [lastAutoSaved]);
  
  return {
    hasSavedDraft,
    savedAt,
    lastAutoSaved,
    loadDraft,
    clearDraft,
    markAsInteracted,
    getTimeSinceSave
  };
}
