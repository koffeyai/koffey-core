import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';
import { useMessageRecovery } from '@/hooks/useMessageRecovery';

export const MessageRecoveryBanner: React.FC = () => {
  const { getPendingMessages, recoverMessage } = useMessageRecovery();
  const [visible, setVisible] = React.useState(true);
  const [messages, setMessages] = React.useState(getPendingMessages());
  
  React.useEffect(() => {
    const interval = setInterval(() => {
      setMessages(getPendingMessages());
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(interval);
  }, [getPendingMessages]);
  
  if (!visible || messages.length === 0) {
    return null;
  }
  
  const latestMessage = messages[messages.length - 1];
  
  return (
    <Alert className="mb-4 border-orange-200 bg-orange-50">
      <RefreshCw className="h-4 w-4" />
      <AlertDescription className="flex items-center justify-between">
        <span>
          Found unsent message: "{latestMessage.content.substring(0, 50)}
          {latestMessage.content.length > 50 ? '...' : ''}"
        </span>
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              recoverMessage(latestMessage.id);
              setVisible(false);
            }}
          >
            Process Now
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setVisible(false)}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
};