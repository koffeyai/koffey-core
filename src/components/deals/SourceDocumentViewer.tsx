import React from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, FileText, Mail, Mic, File } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { SourceDocument } from '@/hooks/useSourceDocuments';

interface SourceDocumentViewerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: SourceDocument | null;
}

const SOURCE_TYPE_CONFIG: Record<string, { icon: React.ElementType; label: string; fontClass: string }> = {
  chat_note: { icon: FileText, label: 'Chat Notes', fontClass: 'font-mono' },
  email: { icon: Mail, label: 'Email', fontClass: 'font-sans' },
  voice_transcript: { icon: Mic, label: 'Voice Transcript', fontClass: 'font-mono' },
  pdf: { icon: File, label: 'PDF', fontClass: 'font-sans' },
  document: { icon: File, label: 'Document', fontClass: 'font-sans' },
  image: { icon: File, label: 'Image', fontClass: 'font-sans' },
  csv: { icon: File, label: 'CSV', fontClass: 'font-mono' },
  meeting_recording: { icon: Mic, label: 'Meeting Recording', fontClass: 'font-sans' },
};

export function SourceDocumentViewer({ open, onOpenChange, document }: SourceDocumentViewerProps) {
  if (!document) return null;

  const config = SOURCE_TYPE_CONFIG[document.source_type] || SOURCE_TYPE_CONFIG.document;
  const Icon = config.icon;

  const handleCopyToClipboard = async () => {
    if (document.raw_content) {
      await navigator.clipboard.writeText(document.raw_content);
      toast.success('Copied to clipboard');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-xl">
        <SheetHeader className="pb-4 border-b border-border">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-lg truncate">
                {document.title || 'Source Document'}
              </SheetTitle>
              <SheetDescription className="flex items-center gap-2 mt-1">
                <Badge variant="secondary" className="text-xs">
                  {config.label}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {format(new Date(document.created_at), 'MMM d, yyyy · h:mm a')}
                </span>
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="h-[calc(100vh-220px)] mt-4">
          <div 
            className={`p-4 rounded-lg bg-muted/30 border border-border ${config.fontClass}`}
          >
            <pre className="whitespace-pre-wrap text-sm text-foreground break-words">
              {document.raw_content || '(No content available)'}
            </pre>
          </div>
        </ScrollArea>

        <div className="pt-4 border-t border-border mt-4">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleCopyToClipboard}
            disabled={!document.raw_content}
          >
            <Copy className="h-4 w-4 mr-2" />
            Copy to Clipboard
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
