import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Users, Building, DollarSign, Calendar, Settings, LogOut, User, BarChart2 } from 'lucide-react';
import { useAuth } from '@/components/auth/AuthProvider';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { useOrganizationAccess } from '@/hooks/useOrganizationAccess';
import { useNavigate } from 'react-router-dom';
import { GlobalChatInput, QuickAction } from '@/components/chat/GlobalChatInput';
import { SourceDocumentUploadDialog } from '@/components/chat/SourceDocumentUploadDialog';
import { useDialogStore } from '@/stores/dialogStore';
import { SuggestedActionsPanel } from '@/components/suggestions/SuggestedActionsPanel';
import { extractTextFromFile } from '@/utils/documentTextExtractor';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getUserDisplayName, getUserInitials } from '@/lib/userDisplayName';
interface DashboardLandingProps {
  onNavigate: (view: string) => void;
  onChatToggle: (message?: string, context?: any) => void;
}


export const DashboardLanding: React.FC<DashboardLandingProps> = ({ onNavigate, onChatToggle }) => {
  const { user, profile, signOut } = useAuth();
  const displayName = getUserDisplayName(user, profile, 'User');
  const { currentOrganization } = useOrganizationAccess();
  const navigate = useNavigate();
  const [inputValue, setInputValue] = useState('');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  const { openContactDialog, openDealDialog } = useDialogStore();

  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(',')[1]);
      };
      reader.onerror = reject;
    });
  };

  const handleFileSelect = async (file: File) => {
    setIsUploading(true);
    setUploadProgress(10);

    try {
      const clientText = await extractTextFromFile(file);
      setUploadProgress(40);

      if (clientText) {
        setUploadDialogOpen(false);
        onChatToggle(`Please analyze this document:\n\n${clientText}`, {
          source: 'file_upload',
          fileName: file.name,
          timestamp: new Date().toISOString(),
        });
      } else {
        setUploadProgress(50);
        const { data, error } = await supabase.functions.invoke('process-document', {
          body: { 
            fileName: file.name,
            fileType: file.type,
            fileData: await fileToBase64(file)
          }
        });

        setUploadProgress(90);

        if (error) throw error;
        if (!data?.text) throw new Error('No text extracted from document');

        setUploadDialogOpen(false);
        onChatToggle(`Please analyze this document:\n\n${data.text}`, {
          source: 'file_upload',
          fileName: file.name,
          extractionMethod: data.method,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('File processing error:', error);
      toast.error('Failed to process document. Try exporting as text or PDF.');
    } finally {
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  const handlePasteSubmit = (text: string) => {
    setUploadDialogOpen(false);
    onChatToggle(`Please analyze this document:\n\n${text}`, {
      source: 'paste_upload',
      timestamp: new Date().toISOString(),
    });
  };

  const handleSettingsClick = () => {
    navigate('/settings');
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleQuickAction = (actionMessage: string) => {
    onChatToggle(actionMessage, {
      source: 'dashboard',
      timestamp: new Date().toISOString(),
    });
  };

  const quickActions: QuickAction[] = [
    { icon: User, label: 'Add Contact', action: () => openContactDialog() },
    { icon: BarChart2, label: 'Reports', action: () => handleQuickAction('Generate a report') },
    { icon: DollarSign, label: 'Add Deal', action: () => openDealDialog() }
  ];

  return (
    <div className="flex flex-col min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between p-4 bg-card border-b border-border">
        <div className="flex items-center gap-4" />
        <div className="flex items-center gap-4">
          <NotificationCenter />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-primary/10 text-primary font-medium">
                    {getUserInitials(user, profile)}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56" align="end" forceMount>
              <DropdownMenuItem onClick={handleSettingsClick}>
                <Settings className="mr-2 h-4 w-4" />
                <span>Settings</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleSignOut}>
                <LogOut className="mr-2 h-4 w-4" />
                <span>Sign out</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex-1 flex flex-col p-8">
        {/* Status Bar */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <Badge className="bg-accent text-accent-foreground">CRM Active</Badge>
            <span className="text-muted-foreground text-sm">
              Logged in as {displayName}
            </span>
          </div>
          <div className="text-muted-foreground">
            <span className="text-sm">Org: {currentOrganization?.organization?.name || 'Default'}</span>
          </div>
        </div>


        {/* Suggested Actions from AI Analysis */}
        <div className="max-w-4xl mx-auto w-full mb-8">
          <SuggestedActionsPanel limit={5} />
        </div>

        {/* Fixed Bottom Chat Bar - matches CRM pages */}
        <div className="fixed bottom-0 left-0 right-0 z-30 bg-background/95 backdrop-blur-sm border-t p-4">
          <div className="max-w-6xl mx-auto">
            <GlobalChatInput
              value={inputValue}
              onChange={setInputValue}
              onSend={(message) => {
                if (message.trim()) {
                  onChatToggle(message, {
                    source: 'dashboard',
                    timestamp: new Date().toISOString(),
                  });
                  setInputValue('');
                }
              }}
              isProcessing={false}
              placeholder="Create contacts, log activities, or ask about your sales data..."
              showQuickActions
              quickActions={quickActions}
              onFileUpload={() => setUploadDialogOpen(true)}
              onFileDrop={handleFileSelect}
            />
          </div>
        </div>
        
        {/* Bottom Padding for Fixed Bar */}
        <div className="h-20" />
      </div>


      {/* Upload Dialog */}
      <SourceDocumentUploadDialog
        open={uploadDialogOpen}
        onOpenChange={setUploadDialogOpen}
        onFileSelect={handleFileSelect}
        onPasteSubmit={handlePasteSubmit}
        isUploading={isUploading}
        uploadProgress={uploadProgress}
      />
    </div>
  );
};
