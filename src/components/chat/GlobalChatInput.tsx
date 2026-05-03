import React, { forwardRef, useEffect, useState, useCallback } from 'react';
import { Send, Upload, Mic, Loader2, Square, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverAnchor, PopoverContent } from '@/components/ui/popover';
import { Command, CommandList, CommandItem, CommandGroup, CommandEmpty } from '@/components/ui/command';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { useVoiceInput } from '@/hooks/useVoiceInput';
import { useIsMobile } from '@/hooks/use-mobile';
import { VoiceFAB } from './VoiceFAB';
import { ChatFileDropZone } from './ChatFileDropZone';
import { cn } from '@/lib/utils';
import { toast } from '@/hooks/use-toast';
import { SLASH_COMMANDS, filterSlashCommands, findSlashCommand } from '@/config/slashCommands';
import { useActiveViewRoleStore } from '@/stores/activeViewRoleStore';
import { ROLE_MENU_MAP, canSwitchToRole } from '@/config/roleConfig';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { validateFile } from '@/utils/documentTextExtractor';

export interface QuickAction {
  icon: LucideIcon;
  label: string;
  action: () => void;
}

export interface GlobalChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (message: string) => void;
  onStop?: () => void;
  onInputModeChange?: (mode: 'text' | 'voice') => void;
  onFileUpload?: () => void;
  onFileDrop?: (file: File) => void | Promise<void>;
  placeholder?: string;
  isProcessing?: boolean;
  isUploading?: boolean;
  disabled?: boolean;
  showQuickActions?: boolean;
  quickActions?: QuickAction[];
  autoFocus?: boolean;
  className?: string;
}

export const GlobalChatInput = forwardRef<HTMLInputElement, GlobalChatInputProps>(({
  value,
  onChange,
  onSend,
  onStop,
  onInputModeChange,
  onFileUpload,
  onFileDrop,
  placeholder = "Type your message...",
  isProcessing = false,
  isUploading = false,
  disabled = false,
  showQuickActions = false,
  quickActions = [],
  autoFocus = false,
  className
}, ref) => {
  const isMobile = useIsMobile();
  const { activeViewRole } = useActiveViewRoleStore();
  const { currentOrganization } = useOrganizationAccess();
  const assignedSalesRole = (currentOrganization?.sales_role || 'ae') as import('@/stores/activeViewRoleStore').SalesRole;
  const isOrgAdmin = currentOrganization?.role === 'admin';
  const allowedViews = ROLE_MENU_MAP[activeViewRole] || ROLE_MENU_MAP.ae;
  const showAdminSection = isOrgAdmin || assignedSalesRole === 'revops';
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Combine refs
  React.useImperativeHandle(ref, () => inputRef.current!);

  // Voice input hook
  const {
    transcript,
    isRecording,
    isSupported: voiceSupported,
    browserWarning,
    startRecording,
    stopRecording,
    clearTranscript
  } = useVoiceInput({
    onTranscript: (text) => {
      onChange(text);
    },
    onError: (error) => {
      toast({
        title: "Voice Input",
        description: error,
        variant: "destructive"
      });
    }
  });

  // Update input with interim transcript while recording
  useEffect(() => {
    if (isRecording && transcript) {
      onChange(transcript);
    }
  }, [transcript, isRecording, onChange]);

  // Auto-focus on mount if requested
  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Compute filtered slash commands based on current input, then filter by role
  const filteredCommands = React.useMemo(() => {
    if (!value.startsWith('/') || value.includes(' ')) return [];
    const matched = filterSlashCommands(value);
    return matched.filter(cmd => {
      // Role-switching commands: enforce hierarchy (org admins bypass)
      if (cmd.targetRole) {
        return canSwitchToRole(assignedSalesRole, cmd.targetRole, currentOrganization?.role);
      }
      // Utility & palette commands always show
      if (!cmd.targetView) return true;
      // Org admins see all pages
      if (isOrgAdmin) return true;
      // Admin pages require admin or revops access
      if (cmd.targetView === 'admin-dashboard') return showAdminSection;
      // Page commands only show if the view is in the user's allowed items
      return allowedViews.includes(cmd.targetView);
    });
  }, [value, allowedViews, showAdminSection, assignedSalesRole, isOrgAdmin]);

  // Update menu visibility and reset selection when input changes
  useEffect(() => {
    if (value.startsWith('/') && !value.includes(' ') && filteredCommands.length > 0) {
      setShowSlashMenu(true);
      setSelectedIndex(0);
    } else {
      setShowSlashMenu(false);
    }
  }, [value, filteredCommands.length]);

  // Auto-scroll the selected item into view when navigating with arrow keys
  useEffect(() => {
    if (showSlashMenu) {
      // Use requestAnimationFrame to let React render the updated data-selected first
      requestAnimationFrame(() => {
        const el = document.querySelector('[data-slash-selected="true"]');
        el?.scrollIntoView({ block: 'nearest' });
      });
    }
  }, [selectedIndex, showSlashMenu]);

  const handleSlashCommandSelect = useCallback((command: string) => {
    setShowSlashMenu(false);

    // /options just reopens the full menu
    if (command === '/options' || command === '/help' || command === '/commands') {
      onChange('/');
      // Re-open with full list on next tick
      setTimeout(() => setShowSlashMenu(true), 0);
      return;
    }

    const matched = findSlashCommand(command);

    // Palette commands: open the command palette popup
    if (matched?.action === 'open-palette') {
      onChange('');
      window.dispatchEvent(new Event('open-command-palette'));
      return;
    }

    // Page navigation commands: dispatch navigation event
    if (matched?.targetView) {
      onChange('');
      window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: matched.targetView } }));
      return;
    }

    // Role commands and others: send to parent handler
    onChange('');
    onSend(command);
  }, [onChange, onSend]);

  const handleSend = () => {
    const message = value.trim();
    if (!message || disabled) return;

    // Intercept /options before sending
    const lower = message.toLowerCase();
    if (lower === '/options' || lower === '/help' || lower === '/commands') {
      onChange('/');
      setTimeout(() => setShowSlashMenu(true), 0);
      return;
    }

    // Intercept palette and page commands before sending
    if (lower.startsWith('/')) {
      const matched = findSlashCommand(message);
      if (matched?.action === 'open-palette') {
        onChange('');
        window.dispatchEvent(new Event('open-command-palette'));
        return;
      }
      if (matched?.targetView) {
        onChange('');
        window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: matched.targetView } }));
        return;
      }
    }

    clearTranscript();
    onSend(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (showSlashMenu && filteredCommands.length > 0) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setShowSlashMenu(false);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < filteredCommands.length - 1 ? prev + 1 : 0
        );
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : filteredCommands.length - 1
        );
        return;
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        const selected = filteredCommands[selectedIndex];
        if (selected) {
          handleSlashCommandSelect(selected.command);
        }
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onInputModeChange?.('text');
      handleSend();
    }
  };

  const handleVoiceStart = () => {
    if (!voiceSupported && browserWarning) {
      toast({
        title: "Voice Not Supported",
        description: browserWarning,
      });
      return;
    }
    onInputModeChange?.('voice');
    startRecording();
  };

  const handleVoiceStop = () => {
    stopRecording();
    // Auto-send after a short delay to allow final transcript
    setTimeout(() => {
      if (value.trim()) {
        handleSend();
      }
    }, 300);
  };

  const handleMicClick = () => {
    if (isRecording) {
      handleVoiceStop();
    } else {
      handleVoiceStart();
    }
  };

  const handleDroppedFiles = useCallback((files: File[]) => {
    const file = files[0];
    if (!file || !onFileDrop) return;

    if (files.length > 1) {
      toast({
        title: 'One file at a time',
        description: 'Only the first dropped file will be imported.',
      });
    }

    const validation = validateFile(file);
    if (!validation.valid) {
      toast({
        title: 'Unsupported file',
        description: validation.error || 'Use PDF, Word, text, email, or image files.',
        variant: 'destructive',
      });
      return;
    }

    void onFileDrop(file);
  }, [onFileDrop]);

  return (
    <>
      <ChatFileDropZone
        className={cn("flex flex-col gap-2", className)}
        onFilesDrop={onFileDrop ? handleDroppedFiles : undefined}
        disabled={disabled || isProcessing || isUploading}
      >
        <Popover open={showSlashMenu} onOpenChange={setShowSlashMenu}>
          <PopoverAnchor asChild>
            <div className={cn(
              "flex items-center gap-1.5 sm:gap-2 bg-background border rounded-full px-2 sm:px-4 py-2 shadow-sm",
              "focus-within:ring-2 focus-within:ring-primary/20 transition-all",
              showQuickActions && "py-3 shadow-lg hover:shadow-xl"
            )}>
              {/* Quick Actions */}
              {showQuickActions && quickActions.length > 0 && (
                <div className="flex items-center gap-1">
                  {quickActions.map((action) => (
                    <Button
                      key={action.label}
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        action.action();
                      }}
                      className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-full hover:bg-muted"
                      disabled={isProcessing || disabled}
                      title={action.label}
                    >
                      <action.icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </Button>
                  ))}
                </div>
              )}

              {/* Input Field */}
              <Input
                ref={inputRef}
                value={value}
                onChange={(e) => {
                  onChange(e.target.value);
                  onInputModeChange?.('text');
                }}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? 'Listening...' : isProcessing ? 'AI is processing... (type to queue)' : placeholder}
                disabled={disabled}
                aria-label="Chat message input"
                className="flex-1 border-0 bg-transparent focus-visible:ring-0 focus-visible:ring-offset-0"
              />

              {/* Action Buttons */}
              <div className="flex items-center gap-1">
                {/* Upload button */}
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0 rounded-full hover:bg-muted",
                    isUploading
                      ? "text-primary animate-pulse"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  disabled={isProcessing || disabled || isUploading}
                  onClick={(e) => {
                    e.stopPropagation();
                    onFileUpload?.();
                  }}
                  title={isUploading ? "Uploading..." : "Upload document"}
                >
                  <Upload className="w-4 h-4" />
                </Button>

                {/* Mic button - Desktop inline only */}
                {!isMobile && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className={cn(
                      "h-8 w-8 p-0 rounded-full hover:bg-muted",
                      isRecording
                        ? "text-destructive animate-pulse"
                        : "text-muted-foreground hover:text-foreground",
                      !voiceSupported && "opacity-50"
                    )}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleMicClick();
                    }}
                    disabled={isProcessing || disabled}
                    title={voiceSupported ? (isRecording ? "Stop recording" : "Start voice input") : browserWarning || "Voice not supported"}
                  >
                    <Mic className="w-4 h-4" />
                  </Button>
                )}

                {/* Send / Stop button */}
                {isProcessing && onStop ? (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onStop();
                    }}
                    size="sm"
                    variant="destructive"
                    className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-full"
                    title="Stop generating"
                  >
                    <Square className="h-3 w-3 fill-current" />
                  </Button>
                ) : (
                  <Button
                    onClick={(e) => {
                      e.stopPropagation();
                      onInputModeChange?.('text');
                      handleSend();
                    }}
                    disabled={!value.trim() || isProcessing || disabled}
                    size="sm"
                    className="h-7 w-7 sm:h-8 sm:w-8 p-0 rounded-full"
                  >
                    {isProcessing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                  </Button>
                )}
              </div>
            </div>
          </PopoverAnchor>

          <PopoverContent
            side="top"
            align="start"
            className="w-72 p-0"
            onOpenAutoFocus={(e) => e.preventDefault()}
            onCloseAutoFocus={(e) => e.preventDefault()}
          >
            <Command
              filter={(value, search) => {
                // We handle filtering ourselves via filteredCommands
                return 1;
              }}
            >
              <CommandList className="max-h-72">
                <TooltipProvider delayDuration={300}>
                  {(() => {
                    // Group filtered commands by type
                    const pagesCmds = filteredCommands.filter(c => c.group === 'pages');
                    const rolesCmds = filteredCommands.filter(c => c.group === 'roles');
                    const utilityCmds = filteredCommands.filter(c => c.group === 'utility');
                    const otherCmds = filteredCommands.filter(c => !c.group);
                    let globalIndex = 0;

                    const renderItem = (cmd: typeof filteredCommands[0]) => {
                      const idx = globalIndex++;
                      return (
                        <Tooltip key={cmd.command}>
                          <TooltipTrigger asChild>
                            <CommandItem
                              value={cmd.command}
                              onSelect={() => handleSlashCommandSelect(cmd.command)}
                              onMouseEnter={() => setSelectedIndex(idx)}
                              className={cn(
                                "flex items-center gap-2 cursor-pointer",
                                idx === selectedIndex && "bg-accent text-accent-foreground"
                              )}
                              data-slash-selected={idx === selectedIndex}
                            >
                              <cmd.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                              <div className="flex flex-col min-w-0">
                                <span className="font-medium text-sm">{cmd.command}</span>
                                <span className="text-xs text-muted-foreground truncate">
                                  {cmd.description}
                                </span>
                              </div>
                            </CommandItem>
                          </TooltipTrigger>
                          <TooltipContent side="right" className="max-w-xs">
                            <p className="font-medium">{cmd.command}</p>
                            <p className="text-xs">{cmd.description}</p>
                            {cmd.aliases.length > 0 && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Aliases: {cmd.aliases.join(', ')}
                              </p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      );
                    };

                    return (
                      <>
                        {pagesCmds.length > 0 && (
                          <CommandGroup heading="Pages">
                            {pagesCmds.map(renderItem)}
                          </CommandGroup>
                        )}
                        {rolesCmds.length > 0 && (
                          <CommandGroup heading="Role Views">
                            {rolesCmds.map(renderItem)}
                          </CommandGroup>
                        )}
                        {utilityCmds.length > 0 && (
                          <CommandGroup heading="Utility">
                            {utilityCmds.map(renderItem)}
                          </CommandGroup>
                        )}
                        {otherCmds.length > 0 && (
                          <CommandGroup heading="Commands">
                            {otherCmds.map(renderItem)}
                          </CommandGroup>
                        )}
                      </>
                    );
                  })()}
                </TooltipProvider>
                <CommandEmpty>No matching commands</CommandEmpty>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Recording indicator */}
        {isRecording && (
          <div className="text-center text-sm text-destructive animate-pulse">
            🎤 Listening... Release to send
          </div>
        )}
      </ChatFileDropZone>

      {/* Mobile Voice FAB */}
      {isMobile && (
        <VoiceFAB
          isRecording={isRecording}
          isSupported={voiceSupported}
          onPress={handleVoiceStart}
          onRelease={handleVoiceStop}
          disabled={isProcessing || disabled}
        />
      )}
    </>
  );
});

GlobalChatInput.displayName = 'GlobalChatInput';

export default GlobalChatInput;
