import React, { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  Send,
  Sparkles,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useUnifiedChatStore } from '@/stores/unifiedChatStore';
import { useMessageRecovery } from '@/hooks/useMessageRecovery';

interface SmartInputBarProps {
  className?: string;
  placeholder?: string;
  onSubmit?: (value: string, route: any) => void;
  location?: 'dashboard' | 'chat' | 'bottom';
}

export const SmartInputBar: React.FC<SmartInputBarProps> = ({
  className,
  placeholder = "Tell me what you need...",
  onSubmit,
  location = 'bottom'
}) => {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [feedback, setFeedback] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { setPendingMessage } = useUnifiedChatStore();
  const { saveBeforeNavigate } = useMessageRecovery();

  // Auto-focus for reduced cognitive load
  useEffect(() => {
    if (location === 'dashboard' && inputRef.current) {
      inputRef.current.focus();
    }
  }, [location]);

  const handleSubmit = async () => {
    if (!value.trim() || status === 'processing') return;

    const input = value.trim();

    setStatus('processing');
    setFeedback('Understanding your request...');

    const messageId = saveBeforeNavigate(input, { location });

    try {
      // Send all input directly through chat — no regex routing
      setPendingMessage(input, { type: 'general', timestamp: Date.now() }, true);
      navigate('/app?view=chat');

      setStatus('success');
      setFeedback('Processing your request!');
      setValue('');

      if (onSubmit) {
        onSubmit(input, { messageId });
      }

      setTimeout(() => {
        setStatus('idle');
        setFeedback('');
      }, 2000);

    } catch (error) {
      setStatus('error');
      setFeedback('Let me try a different approach...');

      setTimeout(() => {
        setStatus('idle');
        setFeedback('');
      }, 3000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'processing':
        return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
      case 'success':
        return <CheckCircle className="w-4 h-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <Sparkles className="w-4 h-4 text-muted-foreground" />;
    }
  };

  return (
    <div className={cn("relative", className)}>
      <div className={cn(
        "relative flex items-center gap-2 transition-all duration-300",
        "bg-background border rounded-full px-4 py-2 shadow-sm",
        status === 'processing' && "shadow-lg ring-2 ring-primary/20 animate-pulse",
        status === 'success' && "shadow-lg ring-2 ring-green-500/20",
        status === 'error' && "shadow-md ring-2 ring-red-500/20",
        "hover:shadow-md focus-within:shadow-lg focus-within:ring-2 focus-within:ring-primary/30"
      )}>
        <div className="flex items-center justify-center w-5 h-5">
          {getStatusIcon()}
        </div>

        <Input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={status === 'processing' ? 'Processing...' : placeholder}
          disabled={status === 'processing'}
          className={cn(
            "flex-1 border-0 bg-transparent",
            "placeholder:text-muted-foreground/60",
            "focus-visible:ring-0 focus-visible:ring-offset-0",
            "text-sm md:text-base"
          )}
        />

        <Button
          onClick={handleSubmit}
          disabled={!value.trim() || status === 'processing'}
          size="sm"
          className={cn(
            "h-8 w-8 p-0 rounded-full transition-all duration-200",
            "hover:scale-110 active:scale-95",
            value.trim() && status === 'idle' && "bg-primary hover:bg-primary/90",
            status === 'success' && "bg-green-500 hover:bg-green-600"
          )}
        >
          {status === 'processing' ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Send className="w-4 h-4" />
          )}
        </Button>
      </div>

      {feedback && (
        <div className={cn(
          "absolute top-full mt-2 left-0 text-sm",
          status === 'success' && "text-green-600",
          status === 'error' && "text-red-600",
          status === 'processing' && "text-primary"
        )}>
          {feedback}
        </div>
      )}
    </div>
  );
};
