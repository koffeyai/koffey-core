import React, { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileUp, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { 
  SlideTemplate, 
  SlideTemplateType, 
  TEMPLATE_TYPE_LABELS,
  DEAL_STAGES,
  getTemplateStoragePath 
} from '@/types/slides';

interface TemplateUploaderProps {
  onUploadComplete: (template: SlideTemplate) => void;
  organizationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type UploadState = 'idle' | 'uploading' | 'extracting' | 'success' | 'error';

export const TemplateUploader: React.FC<TemplateUploaderProps> = ({
  onUploadComplete,
  organizationId,
  open,
  onOpenChange,
}) => {
  const { toast } = useToast();
  const [uploadState, setUploadState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  
  // Form state
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState<SlideTemplateType>('custom');
  const [stageAlignment, setStageAlignment] = useState<string[]>([]);

  const resetForm = () => {
    setFile(null);
    setName('');
    setDescription('');
    setTemplateType('custom');
    setStageAlignment([]);
    setUploadState('idle');
    setProgress(0);
    setProgressMessage('');
    setErrorMessage('');
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const pptxFile = acceptedFiles.find(f => 
      f.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
      f.name.endsWith('.pptx')
    );
    
    if (pptxFile) {
      setFile(pptxFile);
      // Auto-populate name from filename
      if (!name) {
        setName(pptxFile.name.replace('.pptx', '').replace(/[-_]/g, ' '));
      }
      setErrorMessage('');
    } else {
      setErrorMessage('Please upload a .pptx file');
    }
  }, [name]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx']
    },
    maxFiles: 1,
    maxSize: 50 * 1024 * 1024, // 50MB
    disabled: uploadState !== 'idle',
  });

  const toggleStageAlignment = (stage: string) => {
    setStageAlignment(prev => 
      prev.includes(stage) 
        ? prev.filter(s => s !== stage)
        : [...prev, stage]
    );
  };

  const handleUpload = async () => {
    if (!file || !name.trim()) {
      toast({
        title: 'Missing required fields',
        description: 'Please provide a file and template name.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setUploadState('uploading');
      setProgress(10);
      setProgressMessage('Preparing upload...');

      // Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error('Authentication required');
      }

      // Create template record first to get ID
      setProgress(20);
      setProgressMessage('Creating template record...');

      const templateId = crypto.randomUUID();
      const storagePath = getTemplateStoragePath(organizationId, templateId);

      // Upload file to storage
      setProgress(30);
      setProgressMessage('Uploading file...');

      const { error: uploadError } = await supabase.storage
        .from('slide-templates')
        .upload(storagePath, file, {
          contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          upsert: false,
        });

      if (uploadError) {
        throw new Error(`Upload failed: ${uploadError.message}`);
      }

      setProgress(50);
      setProgressMessage('Saving template metadata...');

      // Insert template record
      const { data: templateData, error: insertError } = await supabase
        .from('slide_templates')
        .insert({
          id: templateId,
          organization_id: organizationId,
          name: name.trim(),
          description: description.trim() || null,
          template_type: templateType,
          stage_alignment: stageAlignment,
          storage_path: storagePath,
          created_by: user.id,
          is_active: true,
          is_default: false,
          is_ai_base_template: false,
        })
        .select()
        .single();

      if (insertError) {
        // Clean up uploaded file
        await supabase.storage.from('slide-templates').remove([storagePath]);
        throw new Error(`Failed to create template: ${insertError.message}`);
      }

      // Extract template structure
      setUploadState('extracting');
      setProgress(60);
      setProgressMessage('Analyzing slide structure...');

      const { data: extractData, error: extractError } = await supabase.functions.invoke(
        'extract-template-structure',
        {
          body: {
            templateId,
            storagePath,
            organizationId,
          },
        }
      );

      if (extractError) {
        console.error('Extraction error:', extractError);
        // Don't fail the whole upload if extraction fails
        toast({
          title: 'Template uploaded',
          description: 'Template was uploaded but structure extraction failed. You can retry later.',
          variant: 'default',
        });
      } else {
        setProgress(90);
        setProgressMessage(`Found ${extractData?.slideCount || 0} slides...`);
      }

      setProgress(100);
      setProgressMessage('Complete!');
      setUploadState('success');

      // Fetch the updated template with extracted structure
      const { data: updatedTemplate } = await supabase
        .from('slide_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      toast({
        title: 'Template uploaded successfully',
        description: `${name} has been added with ${extractData?.slideCount || 0} slides.`,
      });

      // Call completion handler
      if (updatedTemplate) {
        onUploadComplete(updatedTemplate as unknown as SlideTemplate);
      }

      // Reset and close after short delay
      setTimeout(() => {
        resetForm();
        onOpenChange(false);
      }, 1500);

    } catch (err) {
      console.error('Upload error:', err);
      setUploadState('error');
      setErrorMessage(err instanceof Error ? err.message : 'Upload failed');
      toast({
        title: 'Upload failed',
        description: err instanceof Error ? err.message : 'An error occurred',
        variant: 'destructive',
      });
    }
  };

  const isUploading = uploadState === 'uploading' || uploadState === 'extracting';

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!isUploading) {
        if (!o) resetForm();
        onOpenChange(o);
      }
    }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Template</DialogTitle>
          <DialogDescription>
            Upload a PowerPoint template to use for generating personalized presentations.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* File Drop Zone */}
          <div
            {...getRootProps()}
            className={`
              border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors
              ${isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'}
              ${file ? 'border-green-500 bg-green-500/5' : ''}
              ${isUploading ? 'pointer-events-none opacity-60' : ''}
            `}
          >
            <input {...getInputProps()} />
            
            {file ? (
              <div className="flex items-center justify-center gap-3">
                <FileUp className="h-8 w-8 text-green-500" />
                <div className="text-left">
                  <p className="font-medium">{file.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                {!isUploading && (
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ) : (
              <>
                <Upload className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
                <p className="text-sm text-muted-foreground">
                  {isDragActive ? 'Drop your template here...' : 'Drag & drop a .pptx file, or click to browse'}
                </p>
                <p className="text-xs text-muted-foreground mt-1">Maximum file size: 50MB</p>
              </>
            )}
          </div>

          {errorMessage && uploadState === 'idle' && (
            <p className="text-sm text-destructive flex items-center gap-2">
              <AlertCircle className="h-4 w-4" />
              {errorMessage}
            </p>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="template-name">Template Name *</Label>
              <Input
                id="template-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g., Enterprise Proposal Deck"
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-desc">Description</Label>
              <Textarea
                id="template-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Optional description of when to use this template..."
                rows={2}
                disabled={isUploading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="template-type">Template Type</Label>
              <Select 
                value={templateType} 
                onValueChange={(v) => setTemplateType(v as SlideTemplateType)}
                disabled={isUploading}
              >
                <SelectTrigger id="template-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover">
                  {Object.entries(TEMPLATE_TYPE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Stage Alignment</Label>
              <div className="flex flex-wrap gap-2">
                {DEAL_STAGES.map((stage) => (
                  <Badge
                    key={stage}
                    variant={stageAlignment.includes(stage) ? 'default' : 'outline'}
                    className="cursor-pointer transition-colors"
                    onClick={() => !isUploading && toggleStageAlignment(stage)}
                  >
                    {stage.replace('_', ' ')}
                  </Badge>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                Select which deal stages this template is suitable for
              </p>
            </div>
          </div>

          {/* Progress Indicator */}
          {isUploading && (
            <Card className="border-primary/20 bg-primary/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3 mb-3">
                  <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  <span className="text-sm font-medium">{progressMessage}</span>
                </div>
                <Progress value={progress} className="h-2" />
              </CardContent>
            </Card>
          )}

          {/* Success State */}
          {uploadState === 'success' && (
            <Card className="border-green-500/20 bg-green-500/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  <span className="text-sm font-medium text-green-700 dark:text-green-400">
                    Template uploaded successfully!
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Error State */}
          {uploadState === 'error' && (
            <Card className="border-destructive/20 bg-destructive/5">
              <CardContent className="pt-4">
                <div className="flex items-center gap-3">
                  <AlertCircle className="h-5 w-5 text-destructive" />
                  <span className="text-sm font-medium text-destructive">
                    {errorMessage}
                  </span>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3">
            <Button
              variant="outline"
              onClick={() => {
                resetForm();
                onOpenChange(false);
              }}
              disabled={isUploading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpload}
              disabled={!file || !name.trim() || isUploading}
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Template
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
