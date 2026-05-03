/**
 * React hook for slide export functionality
 * Handles PPTX download and Google Drive upload
 */
import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import { useToast } from '@/hooks/use-toast';
import { 
  generatePptxBlob, 
  downloadPptx, 
  type PresentationContent,
  type GenerationProgress 
} from '@/services/pptxGenerator';
import { checkGoogleDriveConnection, connectGoogleDrive, describeGoogleOAuthError } from '@/components/auth/GoogleAuth';
import { useSearchParams } from 'react-router-dom';

export interface ExportResult {
  success: boolean;
  destination: 'download' | 'google-drive';
  fileName?: string;
  driveUrl?: string;
  error?: string;
}

const PENDING_EXPORT_KEY = 'pendingDriveExport';

/**
 * Transform AI-generated slide JSON to PresentationContent format for pptxGenerator.
 * AI format uses { metadata, slides: [{ index, type, layout, elements: [{ type, role, content, style }] }], speakerNotes }
 * pptxGenerator expects { id, title, aspectRatio, theme, slides: [{ id, order, elements: [{ id, type, content, fontSize, ... }], notes }] }
 */
function transformAIContentToPresentationContent(
  raw: Record<string, unknown>,
  presentationId: string,
  dbTitle?: string
): PresentationContent {
  // If it already has the correct format (id + slides with order), return as-is
  if (raw.id && Array.isArray(raw.slides) && raw.slides.length > 0 && typeof (raw.slides as any[])[0].order === 'number') {
    const content = raw as unknown as PresentationContent;
    if (!content.title && dbTitle) content.title = dbTitle;
    return content;
  }

  const metadata = (raw.metadata || {}) as Record<string, unknown>;
  const aiSlides = (raw.slides || []) as Array<Record<string, unknown>>;
  const speakerNotes = (raw.speakerNotes || {}) as Record<string, string>;
  const brandColors = (metadata.brandColors || {}) as Record<string, string>;
  const fontPrefs = (metadata.fontPreferences || {}) as Record<string, string>;

  // Map font style names to font sizes
  const styleFontSizes: Record<string, number> = {
    heading1: 36,
    heading2: 28,
    heading3: 20,
    subtitle: 18,
    body: 15,
    caption: 11,
    quote: 22,
    statistic: 32,
  };

  // Map role to bold
  const boldRoles = new Set(['title', 'subtitle', 'statistic']);

  return {
    id: presentationId,
    title: (metadata.accountName ? `${metadata.presentationType || 'Presentation'} for ${metadata.accountName}` : dbTitle) || 'Untitled Presentation',
    aspectRatio: '16:9',
    theme: {
      primaryColor: brandColors.primary || '#1a1a2e',
      secondaryColor: brandColors.secondary || '#16213e',
      accentColor: brandColors.accent || '#4472C4',
      backgroundColor: '#FFFFFF',
      textColor: '#333333',
      headingFont: fontPrefs.heading || 'Arial',
      bodyFont: fontPrefs.body || 'Arial',
      logoUrl: (metadata.logoUrl as string) || undefined,
    },
    slides: aiSlides.map((slide, idx) => {
      const elements = (slide.elements || []) as Array<Record<string, unknown>>;
      const slideIndex = (slide.index as number) ?? idx;

      return {
        id: `slide-${slideIndex}`,
        order: slideIndex,
        layout: (slide.layout as string) || undefined,
        elements: elements.map((el, elIdx) => {
          const role = (el.role as string) || 'body';
          const style = (el.style as string) || 'body';

          return {
            id: `slide-${slideIndex}-el-${elIdx}`,
            type: (el.type as 'text' | 'image' | 'shape') || 'text',
            x: 0, // No position data — auto-layout will handle placement
            y: 0,
            width: 0,
            height: 0,
            content: (el.content as string) || '',
            fontSize: styleFontSizes[style] || 14,
            bold: boldRoles.has(role),
            italic: role === 'quote',
            imageUrl: el.source as string | undefined,
          };
        }),
        notes: speakerNotes[String(slideIndex)] || undefined,
      };
    }),
  };
}

export function useSlideExport() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<GenerationProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isGoogleDriveReady, setIsGoogleDriveReady] = useState(false);
  const [driveScopes, setDriveScopes] = useState<string[]>([]);

  // Check Google Drive connection on mount
  useEffect(() => {
    checkGoogleDriveConnection().then(({ connected, scopes }) => {
      setIsGoogleDriveReady(connected);
      setDriveScopes(scopes);
    });
  }, []);

  // Handle OAuth return - resume pending export if any
  useEffect(() => {
    const googleConnected = searchParams.get('google_connected');
    const googleError = searchParams.get('google_error');
    const googleMissing = searchParams.get('google_missing');
    const googleDetail = searchParams.get('google_detail');
    
    if (googleError) {
      // Clean up URL
      searchParams.delete('google_error');
      searchParams.delete('google_missing');
      searchParams.delete('google_detail');
      setSearchParams(searchParams, { replace: true });
      
      toast({
        title: 'Google connection failed',
        description: describeGoogleOAuthError(googleError, googleMissing, null, googleDetail),
        variant: 'destructive',
      });
      return;
    }
    
    if (googleConnected === 'true') {
      // Clean up URL params
      searchParams.delete('google_connected');
      searchParams.delete('scopes');
      searchParams.delete('google_missing');
      searchParams.delete('google_detail');
      setSearchParams(searchParams, { replace: true });
      
      // Re-check connection status
      checkGoogleDriveConnection().then(({ connected, scopes }) => {
        setIsGoogleDriveReady(connected);
        setDriveScopes(scopes);
        
        if (connected) {
          // Check for pending export
          const pendingId = localStorage.getItem(PENDING_EXPORT_KEY);
          if (pendingId) {
            localStorage.removeItem(PENDING_EXPORT_KEY);
            toast({
              title: 'Google Drive connected!',
              description: 'Resuming your export...',
            });
            // Use setTimeout to allow state to settle
            setTimeout(() => {
              uploadToGoogleDriveInternal(pendingId, { openAfterUpload: true });
            }, 500);
          } else {
            toast({
              title: 'Google Drive connected',
              description: 'You can now export presentations to Google Slides.',
            });
          }
        }
      });
    }
  }, [searchParams]);

  /**
   * Fetch presentation content from storage
   */
  const fetchPresentationContent = useCallback(async (presentationId: string): Promise<PresentationContent | null> => {
    // First get the presentation record to find content path
    const { data: presentation, error: fetchError } = await supabase
      .from('generated_presentations')
      .select('content_path, title')
      .eq('id', presentationId)
      .single();

    if (fetchError || !presentation?.content_path) {
      throw new Error('Presentation not found or has no content');
    }

    // Download content from storage
    const { data: contentData, error: downloadError } = await supabase.storage
      .from('generated-slides')
      .download(presentation.content_path);

    if (downloadError) {
      throw new Error('Failed to download presentation content');
    }

    const raw = JSON.parse(await contentData.text());

    // Transform AI-generated format to PresentationContent format
    // AI format: { metadata, slides: [{ index, type, layout, elements: [{ type, role, content, style }] }], speakerNotes }
    // PresentationContent: { id, title, aspectRatio, theme, slides: [{ id, order, elements: [{ id, type, content, ... }], notes }] }
    const content = transformAIContentToPresentationContent(raw, presentationId, presentation.title);

    return content;
  }, []);

  /**
   * Download presentation as PPTX
   */
  const downloadAsPptx = useCallback(async (
    presentationId: string,
    fileName?: string
  ): Promise<ExportResult> => {
    setIsExporting(true);
    setError(null);
    setProgress({ stage: 'init', stageLabel: 'Loading presentation...', progress: 0 });

    try {
      const content = await fetchPresentationContent(presentationId);
      if (!content) {
        throw new Error('Failed to load presentation content');
      }

      await downloadPptx(content, fileName, setProgress);

      toast({
        title: 'Download started',
        description: `${fileName || content.title || 'Presentation'}.pptx`,
      });

      return {
        success: true,
        destination: 'download',
        fileName: `${fileName || content.title || 'presentation'}.pptx`,
      };
    } catch (err: any) {
      const errorMsg = err.message || 'Export failed';
      setError(errorMsg);
      toast({
        title: 'Export failed',
        description: errorMsg,
        variant: 'destructive',
      });
      return {
        success: false,
        destination: 'download',
        error: errorMsg,
      };
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  }, [fetchPresentationContent, toast]);

  /**
   * Internal upload function (used by both direct calls and OAuth resume)
   */
  const uploadToGoogleDriveInternal = async (
    presentationId: string,
    options?: { openAfterUpload?: boolean }
  ): Promise<ExportResult> => {
    setIsExporting(true);
    setError(null);
    setProgress({ stage: 'init', stageLabel: 'Loading presentation...', progress: 0 });

    try {
      // Fetch content
      const content = await fetchPresentationContent(presentationId);
      if (!content) {
        throw new Error('Failed to load presentation content');
      }

      // Generate PPTX blob
      setProgress({ stage: 'slides', stageLabel: 'Generating PowerPoint...', progress: 20 });
      const blob = await generatePptxBlob(content, (p) => {
        setProgress({
          ...p,
          progress: 20 + (p.progress * 0.5), // Scale to 20-70%
        });
      });

      const fileName = `${content.title || 'presentation'}.pptx`;

      // Convert blob to base64 for direct upload to edge function
      setProgress({ stage: 'finalizing', stageLabel: 'Preparing upload...', progress: 70 });
      const arrayBuffer = await blob.arrayBuffer();
      const uint8Array = new Uint8Array(arrayBuffer);
      let binaryStr = '';
      // Process in chunks to avoid call stack limits
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.subarray(i, Math.min(i + chunkSize, uint8Array.length));
        binaryStr += String.fromCharCode(...chunk);
      }
      const fileBase64 = btoa(binaryStr);

      // Send directly to edge function (bypasses storage RLS)
      setProgress({ stage: 'finalizing', stageLabel: 'Uploading to Google Drive...', progress: 85 });
      
      const { data, error: driveError } = await supabase.functions.invoke('upload-to-drive', {
        body: {
          fileBase64,
          fileName,
          presentationId,
        },
      });

      if (driveError) {
        throw new Error(driveError.message || 'Failed to upload to Google Drive');
      }

      if (!data?.success) {
        if (data?.errorCode === 'GOOGLE_NOT_CONNECTED' || data?.errorCode === 'GOOGLE_SCOPE_MISSING') {
          setIsGoogleDriveReady(false);
          throw new Error('Google Drive access needed. Please connect Google Drive to continue.');
        }
        throw new Error(data?.error || 'Upload failed');
      }

      setProgress({ stage: 'finalizing', stageLabel: 'Complete!', progress: 100 });

      if (options?.openAfterUpload && data.driveUrl) {
        window.open(data.driveUrl, '_blank');
      }

      toast({
        title: 'Uploaded to Google Drive',
        description: options?.openAfterUpload 
          ? 'Opening in Google Slides...' 
          : 'Presentation saved to your Drive',
      });

      return {
        success: true,
        destination: 'google-drive',
        fileName,
        driveUrl: data.driveUrl,
      };
    } catch (err: any) {
      const errorMsg = err.message || 'Upload failed';
      setError(errorMsg);
      toast({
        title: 'Upload failed',
        description: errorMsg,
        variant: 'destructive',
      });
      return {
        success: false,
        destination: 'google-drive',
        error: errorMsg,
      };
    } finally {
      setIsExporting(false);
      setProgress(null);
    }
  };

  /**
   * Upload presentation to Google Drive (wrapped with connection check)
   */
  const uploadToGoogleDrive = useCallback(async (
    presentationId: string,
    options?: { openAfterUpload?: boolean }
  ): Promise<ExportResult> => {
    // If not connected, save pending export and redirect to OAuth
    if (!isGoogleDriveReady) {
      localStorage.setItem(PENDING_EXPORT_KEY, presentationId);
      toast({
        title: 'Connecting to Google Drive',
        description: 'Please authorize access to save presentations to your Drive.',
      });
      if (user) {
        try {
          await connectGoogleDrive(user);
        } catch (connectError) {
          localStorage.removeItem(PENDING_EXPORT_KEY);
          const errorMsg = connectError instanceof Error ? connectError.message : 'Failed to start Google Drive connection.';
          toast({
            title: 'Google connection failed',
            description: errorMsg,
            variant: 'destructive',
          });
          return {
            success: false,
            destination: 'google-drive',
            error: errorMsg,
          };
        }
      }
      return {
        success: false,
        destination: 'google-drive',
        error: 'Redirecting to Google authorization...',
      };
    }
    
    return uploadToGoogleDriveInternal(presentationId, options);
  }, [isGoogleDriveReady, user, toast]);

  /**
   * Connect Google Drive
   */
  const handleConnectGoogleDrive = useCallback(() => {
    if (user) {
      connectGoogleDrive(user).catch((connectError) => {
        toast({
          title: 'Google connection failed',
          description: connectError instanceof Error ? connectError.message : 'Failed to start Google Drive connection.',
          variant: 'destructive',
        });
      });
    }
  }, [user, toast]);

  return {
    // State
    isExporting,
    progress,
    error,
    isGoogleDriveReady,
    
    // Actions
    downloadAsPptx,
    uploadToGoogleDrive,
    connectGoogleDrive: handleConnectGoogleDrive,
    
    // Utilities
    fetchPresentationContent,
  };
}
