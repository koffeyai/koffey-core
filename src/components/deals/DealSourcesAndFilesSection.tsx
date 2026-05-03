import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Upload, FileText, File, Mail, Mic, Image, FileSpreadsheet, FileImage,
  Eye, Download, ExternalLink, Trash2, Loader2, Archive, Paperclip,
  ChevronDown, ChevronUp, ThumbsUp, Info, Sparkles
} from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSourceDocuments, SourceDocument } from '@/hooks/useSourceDocuments';
import { useDealAttachments, DealAttachment } from '@/hooks/useDealAttachments';
import { SourceDocumentViewer } from './SourceDocumentViewer';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface DealSourcesAndFilesSectionProps {
  dealId: string;
}

// ── Source document icons & labels ──────────────────────────────────

const SOURCE_TYPE_ICONS: Record<string, React.ElementType> = {
  chat_note: FileText,
  pdf: File,
  email: Mail,
  voice_transcript: Mic,
  image: Image,
  csv: FileSpreadsheet,
  document: File,
  meeting_recording: Mic,
};

const SOURCE_TYPE_LABELS: Record<string, string> = {
  chat_note: 'Chat Notes',
  pdf: 'PDF',
  email: 'Email',
  voice_transcript: 'Transcript',
  image: 'Image',
  csv: 'CSV',
  document: 'Document',
  meeting_recording: 'Recording',
};

// ── File attachment helpers ─────────────────────────────────────────

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

// ── Extraction info ─────────────────────────────────────────────────

interface ExtractionInfo {
  id: string;
  confidence_overall: number | null;
  review_status: string;
  entities_created: any;
  user_modifications: any;
  created_at: string;
}

type ConfidenceFeedback = 'worse' | 'accurate' | 'better';

// ── Main component ──────────────────────────────────────────────────

export function DealSourcesAndFilesSection({ dealId }: DealSourcesAndFilesSectionProps) {
  // Source documents
  const {
    documents,
    loading: sourcesLoading,
    uploading: sourcesUploading,
    uploadFileDocument,
    archiveDocument,
    getDownloadUrl: getSourceDownloadUrl,
  } = useSourceDocuments({ dealId });

  // File attachments
  const {
    attachments,
    loading: attachmentsLoading,
    uploading: attachmentsUploading,
    uploadAttachment,
    deleteAttachment,
    getDownloadUrl: getAttachmentDownloadUrl,
  } = useDealAttachments(dealId);

  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<SourceDocument | null>(null);
  const [extractionMap, setExtractionMap] = useState<Record<string, ExtractionInfo[]>>({});
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const [feedbackMap, setFeedbackMap] = useState<Record<string, ConfidenceFeedback>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loading = sourcesLoading || attachmentsLoading;
  const totalCount = documents.length + attachments.length;

  // Fetch extraction records for source documents
  useEffect(() => {
    const fetchExtractions = async () => {
      if (documents.length === 0) return;

      const docIds = documents.map(d => d.id);
      const { data } = await supabase
        .from('extraction_records')
        .select('id, source_document_id, confidence_overall, review_status, entities_created, user_modifications, created_at')
        .in('source_document_id', docIds);

      if (data) {
        const map: Record<string, ExtractionInfo[]> = {};
        const fbMap: Record<string, ConfidenceFeedback> = {};
        data.forEach(rec => {
          if (!map[rec.source_document_id]) {
            map[rec.source_document_id] = [];
          }
          map[rec.source_document_id].push(rec as ExtractionInfo);
          // Initialize feedback from existing user_modifications
          const mods = rec.user_modifications as any;
          if (mods?.confidence_feedback) {
            fbMap[rec.id] = mods.confidence_feedback as ConfidenceFeedback;
          }
        });
        setExtractionMap(map);
        setFeedbackMap(fbMap);
      }
    };
    fetchExtractions();
  }, [documents]);

  // ── Handlers ────────────────────────────────────────────────────

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadAttachment(file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleViewSource = async (doc: SourceDocument) => {
    if (doc.raw_content) {
      setSelectedDocument(doc);
      setViewerOpen(true);
    } else if (doc.storage_path) {
      const url = await getSourceDownloadUrl(doc.storage_path);
      if (url) window.open(url, '_blank');
    }
  };

  const handleDownloadSource = async (doc: SourceDocument) => {
    if (doc.storage_path) {
      const url = await getSourceDownloadUrl(doc.storage_path);
      if (url) window.open(url, '_blank');
    }
  };

  const handleOpenAttachment = async (filePath: string) => {
    const url = await getAttachmentDownloadUrl(filePath);
    if (url) window.open(url, '_blank');
  };

  const toggleExpanded = (docId: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  const handleConfidenceFeedback = async (extractionId: string, feedback: ConfidenceFeedback) => {
    // Toggle off if already selected
    const current = feedbackMap[extractionId];
    const newFeedback = current === feedback ? undefined : feedback;

    // Optimistic update
    setFeedbackMap(prev => {
      const next = { ...prev };
      if (newFeedback) {
        next[extractionId] = newFeedback;
      } else {
        delete next[extractionId];
      }
      return next;
    });

    await supabase
      .from('extraction_records')
      .update({
        user_modifications: newFeedback
          ? { confidence_feedback: newFeedback, feedback_at: new Date().toISOString() }
          : null,
      })
      .eq('id', extractionId);
  };

  const formatEntitiesCreated = (entities: any) => {
    if (!entities) return '';
    const parts: string[] = [];
    if (entities.contacts?.length) parts.push(`${entities.contacts.length} contact${entities.contacts.length > 1 ? 's' : ''}`);
    if (entities.deals?.length) parts.push(`${entities.deals.length} deal${entities.deals.length > 1 ? 's' : ''}`);
    if (entities.accounts?.length) parts.push(`${entities.accounts.length} account${entities.accounts.length > 1 ? 's' : ''}`);
    if (entities.tasks?.length) parts.push(`${entities.tasks.length} task${entities.tasks.length > 1 ? 's' : ''}`);
    return parts.length > 0 ? `Created: ${parts.join(', ')}` : '';
  };

  const getConfidenceBadgeClass = (confidence: number | null) => {
    if (!confidence) return 'bg-muted text-muted-foreground';
    if (confidence >= 80) return 'bg-green-500/10 text-green-600 dark:text-green-400';
    if (confidence >= 50) return 'bg-yellow-500/10 text-yellow-600 dark:text-yellow-400';
    return 'bg-red-500/10 text-red-600 dark:text-red-400';
  };

  // ── Render ──────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const hasSourceDocs = documents.length > 0;
  const hasAttachments = attachments.length > 0;
  const isEmpty = !hasSourceDocs && !hasAttachments;

  return (
    <div className="space-y-6">
      {/* Header with upload */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">
          Sources & Files {totalCount > 0 && `(${totalCount})`}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={attachmentsUploading}
          className="h-8"
        >
          {attachmentsUploading ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Upload className="h-4 w-4 mr-1" />
          )}
          Upload File
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {/* Empty state */}
      {isEmpty && (
        <div className="text-center py-8 border border-dashed border-border rounded-lg">
          <Archive className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            No sources or files yet
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Original notes appear here from chat extraction. Upload files directly above.
          </p>
        </div>
      )}

      {/* ── Source Documents Section ──────────────────────────────── */}
      {hasSourceDocs && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Archive className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Sources ({documents.length})
            </span>
          </div>

          {documents.map((doc) => {
            const Icon = SOURCE_TYPE_ICONS[doc.source_type] || File;
            const hasExtractions = extractionMap[doc.id]?.length > 0;
            const isExpanded = expandedDocs.has(doc.id);

            return (
              <div key={doc.id} className="border border-border rounded-lg overflow-hidden">
                <div className="flex items-center gap-3 p-3 hover:bg-muted/30 transition-colors group">
                  <div className="h-10 w-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {doc.title || doc.file_name || `${SOURCE_TYPE_LABELS[doc.source_type]} - ${format(new Date(doc.created_at), 'MMM d, yyyy')}`}
                      </p>
                      {hasExtractions && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-gradient-to-r from-purple-500/10 to-blue-500/10 text-purple-600 dark:text-purple-400">
                          <Sparkles className="h-3 w-3" />
                          AI Extracted
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                      <Badge variant="secondary" className="text-xs px-1.5 py-0">
                        {SOURCE_TYPE_LABELS[doc.source_type] || doc.source_type}
                      </Badge>
                      <span>{format(new Date(doc.created_at), 'MMM d, yyyy · h:mm a')}</span>
                    </div>
                  </div>

                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleViewSource(doc)}>
                      <Eye className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    {doc.storage_path && (
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDownloadSource(doc)}>
                        <Download className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => archiveDocument(doc.id)}
                    >
                      <Trash2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                  </div>
                </div>

                {hasExtractions && (
                  <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(doc.id)}>
                    <CollapsibleTrigger asChild>
                      <button className="w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors flex items-center gap-1 border-t border-border">
                        <ChevronDown className={`h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                        View extraction details
                      </button>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-1 space-y-2 bg-muted/10">
                        {extractionMap[doc.id]?.map((extraction) => {
                          const currentFeedback = feedbackMap[extraction.id];
                          return (
                            <div key={extraction.id} className="text-xs space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${getConfidenceBadgeClass(extraction.confidence_overall)}`}
                                >
                                  {extraction.confidence_overall ? `${extraction.confidence_overall}% confidence` : 'No confidence score'}
                                </Badge>

                                {/* Info tooltip */}
                                <TooltipProvider>
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help shrink-0" />
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-xs">
                                      <p className="text-sm">
                                        How confident the AI is that it correctly extracted structured data from the raw notes. Higher = more complete source material.
                                      </p>
                                    </TooltipContent>
                                  </Tooltip>
                                </TooltipProvider>

                                {/* Feedback buttons */}
                                <div className="inline-flex items-center gap-0.5 border border-border rounded-md px-0.5 py-0.5">
                                  <button
                                    onClick={() => handleConfidenceFeedback(extraction.id, 'worse')}
                                    className={`p-1 rounded transition-colors ${
                                      currentFeedback === 'worse'
                                        ? 'bg-red-500/15 text-red-600 dark:text-red-400'
                                        : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
                                    }`}
                                    title="Extraction was worse than this score"
                                  >
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleConfidenceFeedback(extraction.id, 'accurate')}
                                    className={`p-1 rounded transition-colors ${
                                      currentFeedback === 'accurate'
                                        ? 'bg-green-500/15 text-green-600 dark:text-green-400'
                                        : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
                                    }`}
                                    title="Score is about right"
                                  >
                                    <ThumbsUp className="h-3.5 w-3.5" />
                                  </button>
                                  <button
                                    onClick={() => handleConfidenceFeedback(extraction.id, 'better')}
                                    className={`p-1 rounded transition-colors ${
                                      currentFeedback === 'better'
                                        ? 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                                        : 'text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/50'
                                    }`}
                                    title="Extraction was better than this score"
                                  >
                                    <ChevronUp className="h-3.5 w-3.5" />
                                  </button>
                                </div>

                                <Badge variant="secondary" className="text-xs">
                                  {extraction.review_status.replace('_', ' ')}
                                </Badge>
                              </div>
                              {extraction.entities_created && (
                                <p className="text-muted-foreground">
                                  {formatEntitiesCreated(extraction.entities_created)}
                                </p>
                              )}
                              <p className="text-muted-foreground">
                                Extracted {format(new Date(extraction.created_at), 'MMM d, yyyy · h:mm a')}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── File Attachments Section ─────────────────────────────── */}
      {hasAttachments && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Paperclip className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              Files ({attachments.length})
            </span>
          </div>

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
                    onClick={() => handleOpenAttachment(attachment.file_path)}
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
      )}

      {/* Source document viewer sheet */}
      <SourceDocumentViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        document={selectedDocument}
      />
    </div>
  );
}
