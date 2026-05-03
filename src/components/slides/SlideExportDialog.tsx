/**
 * Slide Export Dialog
 * Provides UI for downloading PPTX or uploading to Google Drive
 */
import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Download, 
  ExternalLink, 
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { useSlideExport, type ExportResult } from '@/hooks/useSlideExport';
import { GoogleDriveIcon } from '@/components/icons/GoogleDriveIcon';
import { cn } from '@/lib/utils';

interface SlideExportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  presentationId: string;
  presentationTitle?: string;
  onExportComplete?: (result: ExportResult) => void;
}

export const SlideExportDialog: React.FC<SlideExportDialogProps> = ({
  open,
  onOpenChange,
  presentationId,
  presentationTitle,
  onExportComplete,
}) => {
  const {
    isExporting,
    progress,
    error,
    isGoogleDriveReady,
    downloadAsPptx,
    uploadToGoogleDrive,
    connectGoogleDrive,
  } = useSlideExport();

  const handleDownload = async () => {
    const result = await downloadAsPptx(presentationId, presentationTitle);
    if (result.success) {
      onExportComplete?.(result);
      onOpenChange(false);
    }
  };

  const handleDriveUpload = async () => {
    const result = await uploadToGoogleDrive(presentationId, { openAfterUpload: true });
    if (result.success) {
      onExportComplete?.(result);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export Presentation</DialogTitle>
          <DialogDescription>
            {presentationTitle || 'Choose how to export your presentation'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Progress indicator */}
          {isExporting && progress && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{progress.stageLabel}</span>
                <span className="font-medium">{Math.round(progress.progress)}%</span>
              </div>
              <Progress value={progress.progress} className="h-2" />
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Export options */}
          {!isExporting && (
            <div className="space-y-3">
              {/* Download as PowerPoint */}
              <Button
                variant="outline"
                className="w-full justify-start h-auto py-4"
                onClick={handleDownload}
              >
                <Download className="h-5 w-5 mr-3 text-primary" />
                <div className="text-left">
                  <div className="font-medium">Download as PowerPoint</div>
                  <div className="text-xs text-muted-foreground">
                    Save .pptx file to your device
                  </div>
                </div>
              </Button>

              {/* Google Drive option */}
              {isGoogleDriveReady ? (
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={handleDriveUpload}
                >
                  <GoogleDriveIcon className="h-5 w-5 mr-3" />
                  <div className="text-left flex-1">
                    <div className="font-medium">Open in Google Slides</div>
                    <div className="text-xs text-muted-foreground">
                      Upload to Drive and open for editing
                    </div>
                  </div>
                  <ExternalLink className="h-4 w-4 text-muted-foreground" />
                </Button>
              ) : (
                <Button
                  variant="outline"
                  className="w-full justify-start h-auto py-4"
                  onClick={connectGoogleDrive}
                >
                  <GoogleDriveIcon className="h-5 w-5 mr-3 opacity-50" />
                  <div className="text-left">
                    <div className="font-medium">Connect Google Drive</div>
                    <div className="text-xs text-muted-foreground">
                      Sign in to save presentations to Drive
                    </div>
                  </div>
                </Button>
              )}
            </div>
          )}

          {/* Loading state */}
          {isExporting && (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
