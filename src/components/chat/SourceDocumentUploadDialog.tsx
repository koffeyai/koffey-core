import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle,
  DialogDescription 
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Upload, 
  FileText, 
  Image, 
  File, 
  X, 
  Clipboard,
  Loader2,
  CheckCircle,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { validateFile, getFileTypeDescription } from '@/utils/documentTextExtractor';

interface SourceDocumentUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onFileSelect: (file: File) => void;
  onPasteSubmit: (text: string) => void;
  isUploading?: boolean;
  uploadProgress?: number;
}

const ACCEPTED_FILE_TYPES = {
  'text/plain': ['.txt'],
  'text/markdown': ['.md'],
  'text/html': ['.html'],
  'message/rfc822': ['.eml'],
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/msword': ['.doc'],
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/gif': ['.gif'],
  'image/webp': ['.webp'],
};

export const SourceDocumentUploadDialog: React.FC<SourceDocumentUploadDialogProps> = ({
  open,
  onOpenChange,
  onFileSelect,
  onPasteSubmit,
  isUploading = false,
  uploadProgress = 0,
}) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [pastedText, setPastedText] = useState('');
  const [activeTab, setActiveTab] = useState<'upload' | 'paste'>('upload');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setFileError(null);
    
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    const validation = validateFile(file);
    
    if (!validation.valid) {
      setFileError(validation.error || 'Invalid file');
      return;
    }
    
    setSelectedFile(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_FILE_TYPES,
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024, // 20MB
    disabled: isUploading,
    onDropRejected: (rejections) => {
      const rejection = rejections[0];
      if (rejection?.errors[0]?.code === 'file-too-large') {
        setFileError('File exceeds 20MB limit');
      } else if (rejection?.errors[0]?.code === 'file-invalid-type') {
        setFileError('Unsupported file type. Please use PDF, Word, text, or image files.');
      } else {
        setFileError('Could not accept this file');
      }
    },
  });

  const handleUpload = () => {
    if (selectedFile) {
      onFileSelect(selectedFile);
    }
  };

  const handlePasteSubmit = () => {
    if (pastedText.trim()) {
      onPasteSubmit(pastedText.trim());
      setPastedText('');
    }
  };

  const handleClose = () => {
    if (!isUploading) {
      setSelectedFile(null);
      setFileError(null);
      setPastedText('');
      onOpenChange(false);
    }
  };

  const clearSelectedFile = () => {
    setSelectedFile(null);
    setFileError(null);
  };

  const getFileIcon = (file: File) => {
    if (file.type.startsWith('image/')) return <Image className="h-8 w-8 text-blue-500" />;
    if (file.type === 'application/pdf') return <FileText className="h-8 w-8 text-red-500" />;
    return <File className="h-8 w-8 text-muted-foreground" />;
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import Document</DialogTitle>
          <DialogDescription>
            Upload a file or paste text from your notes app. We'll extract contacts, deals, and action items automatically.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'upload' | 'paste')}>
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="upload" disabled={isUploading}>
              <Upload className="h-4 w-4 mr-2" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="paste" disabled={isUploading}>
              <Clipboard className="h-4 w-4 mr-2" />
              Paste Text
            </TabsTrigger>
          </TabsList>

          <TabsContent value="upload" className="mt-4">
            {/* Upload State */}
            {isUploading ? (
              <div className="space-y-4 p-6">
                <div className="flex items-center gap-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm text-muted-foreground">Processing document...</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-xs text-muted-foreground text-center">
                  {uploadProgress < 30 && 'Uploading file...'}
                  {uploadProgress >= 30 && uploadProgress < 70 && 'Extracting text...'}
                  {uploadProgress >= 70 && 'Analyzing content...'}
                </p>
              </div>
            ) : selectedFile ? (
              /* File Selected State */
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-muted rounded-lg">
                  {getFileIcon(selectedFile)}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {getFileTypeDescription(selectedFile)} • {formatFileSize(selectedFile.size)}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={clearSelectedFile}
                    className="flex-shrink-0"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={clearSelectedFile} className="flex-1">
                    Choose Different
                  </Button>
                  <Button onClick={handleUpload} className="flex-1">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Process Document
                  </Button>
                </div>
              </div>
            ) : (
              /* Dropzone State */
              <div>
                <div
                  {...getRootProps()}
                  className={cn(
                    'border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors',
                    isDragActive 
                      ? 'border-primary bg-primary/5' 
                      : 'border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50',
                    fileError && 'border-destructive'
                  )}
                >
                  <input {...getInputProps()} />
                  <Upload className={cn(
                    'h-10 w-10 mx-auto mb-4',
                    isDragActive ? 'text-primary' : 'text-muted-foreground'
                  )} />
                  {isDragActive ? (
                    <p className="text-primary font-medium">Drop your file here</p>
                  ) : (
                    <>
                      <p className="font-medium">Drop a file here or click to browse</p>
                      <p className="text-sm text-muted-foreground mt-1">
                        PDF, Word, text, HTML, email, or images up to 20MB
                      </p>
                    </>
                  )}
                </div>

                {fileError && (
                  <div className="flex items-center gap-2 mt-3 text-destructive text-sm">
                    <AlertCircle className="h-4 w-4" />
                    {fileError}
                  </div>
                )}

                {/* Format hints */}
                <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                  <p className="text-xs font-medium mb-2">Import from:</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>• Apple Notes → Export as PDF</div>
                    <div>• Notion → Export as Markdown</div>
                    <div>• Evernote → Export as HTML</div>
                    <div>• Emails → Save as .eml</div>
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="paste" className="mt-4">
            <div className="space-y-4">
              <div className="relative">
                <Textarea
                  placeholder="Paste your meeting notes, email content, or any text here...

Example:
Met with John Smith from Acme Corp about their cloud migration project.
Budget: $150K, Timeline: Q2 2025
Next steps: Send proposal by Friday"
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  className="min-h-[200px] resize-none"
                  disabled={isUploading}
                />
                {pastedText && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="absolute top-2 right-2"
                    onClick={() => setPastedText('')}
                    disabled={isUploading}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>

              <div className="flex justify-between items-center">
                <p className="text-xs text-muted-foreground">
                  {pastedText.length > 0 && `${pastedText.length.toLocaleString()} characters`}
                </p>
                <Button 
                  onClick={handlePasteSubmit} 
                  disabled={!pastedText.trim() || isUploading}
                >
                  {isUploading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Extract Data
                    </>
                  )}
                </Button>
              </div>

              {/* Tips */}
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-xs font-medium mb-1">Quick paste from Apple Notes:</p>
                <p className="text-xs text-muted-foreground">
                  Open your note → Select All (⌘+A) → Copy (⌘+C) → Paste here
                </p>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};

export default SourceDocumentUploadDialog;
