import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Upload, FileText, File, Mail, Mic, Image, FileSpreadsheet,
  Eye, Download, Trash2, Loader2, Archive, ChevronDown, Sparkles 
} from 'lucide-react';
import { useSourceDocuments, SourceDocument } from '@/hooks/useSourceDocuments';
import { SourceDocumentViewer } from './SourceDocumentViewer';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface SourceDocumentsSectionProps {
  dealId: string;
}

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

interface ExtractionInfo {
  id: string;
  confidence_overall: number | null;
  review_status: string;
  entities_created: any;
  created_at: string;
}

export function SourceDocumentsSection({ dealId }: SourceDocumentsSectionProps) {
  const { 
    documents, 
    loading, 
    uploading, 
    uploadFileDocument, 
    archiveDocument, 
    getDownloadUrl,
    refresh 
  } = useSourceDocuments({ dealId });
  
  const [viewerOpen, setViewerOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<SourceDocument | null>(null);
  const [extractionMap, setExtractionMap] = useState<Record<string, ExtractionInfo[]>>({});
  const [expandedDocs, setExpandedDocs] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fetch extraction records for visible documents
  useEffect(() => {
    const fetchExtractions = async () => {
      if (documents.length === 0) return;
      
      const docIds = documents.map(d => d.id);
      const { data } = await supabase
        .from('extraction_records')
        .select('id, source_document_id, confidence_overall, review_status, entities_created, created_at')
        .in('source_document_id', docIds);
      
      if (data) {
        const map: Record<string, ExtractionInfo[]> = {};
        data.forEach(rec => {
          if (!map[rec.source_document_id]) {
            map[rec.source_document_id] = [];
          }
          map[rec.source_document_id].push(rec as ExtractionInfo);
        });
        setExtractionMap(map);
      }
    };
    
    fetchExtractions();
  }, [documents]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await uploadFileDocument({ file });
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleView = async (doc: SourceDocument) => {
    if (doc.raw_content) {
      // Text-based document
      setSelectedDocument(doc);
      setViewerOpen(true);
    } else if (doc.storage_path) {
      // File-based document
      const url = await getDownloadUrl(doc.storage_path);
      if (url) {
        window.open(url, '_blank');
      }
    }
  };

  const handleDownload = async (doc: SourceDocument) => {
    if (doc.storage_path) {
      const url = await getDownloadUrl(doc.storage_path);
      if (url) {
        window.open(url, '_blank');
      }
    }
  };

  const toggleExpanded = (docId: string) => {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      if (next.has(docId)) {
        next.delete(docId);
      } else {
        next.add(docId);
      }
      return next;
    });
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
          Source Documents {documents.length > 0 && `(${documents.length})`}
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
        {documents.length === 0 && (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <Archive className="h-8 w-8 text-muted-foreground/50 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">
              No source documents yet
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Original notes and files will appear here when uploaded via chat or directly
            </p>
          </div>
        )}

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
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => handleView(doc)}
                  >
                    <Eye className="h-4 w-4 text-muted-foreground" />
                  </Button>
                  {doc.storage_path && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleDownload(doc)}
                    >
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
                      {extractionMap[doc.id]?.map((extraction) => (
                        <div key={extraction.id} className="text-xs space-y-1">
                          <div className="flex items-center gap-2">
                            <Badge 
                              variant="outline" 
                              className={`text-xs ${getConfidenceBadgeClass(extraction.confidence_overall)}`}
                            >
                              {extraction.confidence_overall ? `${extraction.confidence_overall}% confidence` : 'No confidence score'}
                            </Badge>
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
                      ))}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              )}
            </div>
          );
        })}
      </div>

      <SourceDocumentViewer
        open={viewerOpen}
        onOpenChange={setViewerOpen}
        document={selectedDocument}
      />
    </div>
  );
}
