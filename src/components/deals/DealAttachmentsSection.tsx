import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Upload, FileText, FileImage, FileSpreadsheet, File, Trash2, Loader2, ExternalLink, Paperclip } from 'lucide-react';
import { useDealAttachments } from '@/hooks/useDealAttachments';
import { format } from 'date-fns';

interface DealAttachmentsSectionProps {
  dealId: string;
}

const FILE_ICONS: Record<string, React.ElementType> = {
  'application/pdf': FileText,
  'image/': FileImage,
  'application/vnd.ms-excel': FileSpreadsheet,
  'application/vnd.openxmlformats-officedocument.spreadsheetml': FileSpreadsheet,
  'text/csv': FileSpreadsheet,
};

function getFileIcon(fileType?: string): React.ElementType {
  if (!fileType) return File;
  for (const [key, Icon] of Object.entries(FILE_ICONS)) {
    if (fileType.startsWith(key)) return Icon;
  }
  return File;
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DealAttachmentsSection({ dealId }: DealAttachmentsSectionProps) {
  const { attachments, loading, uploading, uploadAttachment, deleteAttachment, getDownloadUrl } = useDealAttachments(dealId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadAttachment(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleOpenFile = async (filePath: string) => {
    const url = await getDownloadUrl(filePath);
    if (url) {
      window.open(url, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Attachments {attachments.length > 0 && `(${attachments.length})`}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="h-8"
        >
          {uploading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1" />
          )}
          Upload
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      <div className="space-y-2">
        {attachments.length === 0 && (
          <div className="text-center py-6 border border-dashed border-border rounded-lg">
            <Paperclip className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No attachments yet
            </p>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="h-4 w-4 mr-1" />
              Upload a file
            </Button>
          </div>
        )}
        
        {attachments.map((attachment) => {
          const FileIcon = getFileIcon(attachment.file_type);
          
          return (
            <div 
              key={attachment.id} 
              className="flex items-center gap-3 p-3 border border-border rounded-lg hover:bg-muted/30 transition-colors group"
            >
              <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                <FileIcon className="h-5 w-5 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {attachment.file_name}
                </p>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatFileSize(attachment.file_size)}</span>
                  <span>·</span>
                  <span>{format(new Date(attachment.created_at), 'MMM d, yyyy')}</span>
                </div>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleOpenFile(attachment.file_path)}
                >
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => deleteAttachment(attachment.id, attachment.file_path)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground" />
                </Button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
