import React, { useEffect, useCallback } from 'react';

interface KeyboardShortcutsProps {
  setCurrentView: (view: string) => void;
}

const SHORTCUTS: Record<string, { key: string; mod: boolean; view: string; label: string }> = {
  'd': { key: 'd', mod: true, view: 'command-center', label: 'Dashboard' },
  'c': { key: 'c', mod: true, view: 'chat', label: 'Chat' },
  'p': { key: 'p', mod: true, view: 'deals', label: 'Pipeline / Deals' },
  'a': { key: 'a', mod: true, view: 'activities', label: 'Activities' },
  't': { key: 't', mod: true, view: 'tasks', label: 'Tasks' },
  'l': { key: 'l', mod: true, view: 'leads', label: 'Leads' },
  'n': { key: 'n', mod: true, view: 'contacts', label: 'Contacts' },
};

export const KeyboardShortcuts: React.FC<KeyboardShortcutsProps> = ({ setCurrentView }) => {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Only trigger with Ctrl/Cmd + Shift + key
    if (!(e.metaKey || e.ctrlKey) || !e.shiftKey) return;
    // Don't trigger if user is typing in an input
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;

    const shortcut = SHORTCUTS[e.key.toLowerCase()];
    if (shortcut) {
      e.preventDefault();
      setCurrentView(shortcut.view);
    }
  }, [setCurrentView]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // This component doesn't render anything visible
  return null;
};

export const SHORTCUT_LIST = Object.entries(SHORTCUTS).map(([, s]) => ({
  keys: `${navigator.platform.includes('Mac') ? 'Cmd' : 'Ctrl'}+Shift+${s.key.toUpperCase()}`,
  action: s.label,
}));
